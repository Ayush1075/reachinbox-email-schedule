import { randomUUID } from 'node:crypto';
import { EmailStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { encrypt } from '../src/lib/crypto';
import { redis } from '../src/queue/connection';
import { emailQueue } from '../src/queue/emailQueue';
import { writeSentMarker } from '../src/services/delivery';
import { reconcile } from '../src/services/reconciler';

/**
 * Simulates total Redis job loss: rows exist in Postgres, their BullMQ jobs
 * don't. No worker runs here, so we can inspect the rebuilt queue directly.
 */

let userId: string;
let senderId: string;
let campaignId: string;

async function createEmail(i: number, data: Partial<{ status: EmailStatus; scheduledAt: Date; claimedAt: Date; sendStartedAt: Date }> = {}) {
  const id = randomUUID();
  return prisma.emailJob.create({
    data: {
      id,
      campaignId,
      senderId,
      recipient: `r${i}@example.com`,
      subject: 's',
      body: 'b',
      sequenceIndex: i,
      bullJobId: id,
      idempotencyKey: `${campaignId}:${i}`,
      status: data.status ?? EmailStatus.QUEUED,
      scheduledAt: data.scheduledAt ?? new Date(Date.now() + 60 * 60_000),
      claimedAt: data.claimedAt ?? null,
      sendStartedAt: data.sendStartedAt ?? null,
      claimToken: data.claimedAt ? 'dead-worker' : null,
    },
  });
}

beforeAll(async () => {
  await emailQueue.obliterate({ force: true });
  const user = await prisma.user.create({ data: { googleId: `test:${randomUUID()}`, email: `${randomUUID()}@test.local`, name: 'Reconciler Test' } });
  userId = user.id;
  const sender = await prisma.sender.create({
    data: { userId, label: 'S', smtpHost: 'localhost', smtpPort: 25, smtpUser: 'u', smtpPass: encrypt('p'), fromAddress: 's@test.local' },
  });
  senderId = sender.id;
  const campaign = await prisma.campaign.create({
    data: { userId, subject: 's', body: 'b', startAt: new Date(), delayBetweenMs: 0, totalRecipients: 0 },
  });
  campaignId = campaign.id;
});

afterAll(async () => {
  await emailQueue.obliterate({ force: true });
  await emailQueue.close();
  await prisma.emailJob.deleteMany({ where: { campaignId } });
  await prisma.user.delete({ where: { id: userId } });
  await redis.quit();
  await prisma.$disconnect();
});

describe('reconcile', () => {
  it('rebuilds missing BullMQ jobs from Postgres, preserving fire time', async () => {
    const future = await createEmail(0, { status: EmailStatus.SCHEDULED });
    const pastDue = await createEmail(1, { scheduledAt: new Date(Date.now() - 5 * 60_000) });
    const deferred = await createEmail(2, { status: EmailStatus.RATE_LIMITED });

    const report = await reconcile({ campaignId });
    expect(report.reenqueued).toBe(3);

    expect(await emailQueue.getJobState(future.id)).toBe('delayed');
    expect(await emailQueue.getJobState(deferred.id)).toBe('delayed');
    expect(await emailQueue.getJobState(pastDue.id)).toBe('waiting'); // past-due fires immediately
    const job = await emailQueue.getJob(future.id);
    expect(Math.abs(job!.timestamp + job!.delay - future.scheduledAt.getTime())).toBeLessThan(1_000);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: future.id } })).status).toBe(EmailStatus.QUEUED);
  });

  it('is idempotent: a second sweep adds nothing', async () => {
    const before = await emailQueue.getJobCounts('delayed', 'waiting');
    const report = await reconcile({ campaignId });
    expect(report.reenqueued).toBe(0);
    expect(await emailQueue.getJobCounts('delayed', 'waiting')).toEqual(before);
  });

  it('returns an abandoned claim that never reached SMTP to the queue', async () => {
    const email = await createEmail(10, { status: EmailStatus.PROCESSING, claimedAt: new Date(Date.now() - 60 * 60_000) });
    const report = await reconcile({ campaignId });
    expect(report.recoveredClaims).toBe(1);
    const row = await prisma.emailJob.findUniqueOrThrow({ where: { id: email.id } });
    expect(row.status).toBe(EmailStatus.QUEUED);
    expect(row.claimToken).toBeNull();
    expect(['delayed', 'waiting']).toContain(await emailQueue.getJobState(email.id));
  });

  it('finalises a mid-send crash from the sent marker, or fails it if the outcome is unknown', async () => {
    const old = new Date(Date.now() - 60 * 60_000);
    const delivered = await createEmail(20, { status: EmailStatus.PROCESSING, claimedAt: old, sendStartedAt: old });
    const unknown = await createEmail(21, { status: EmailStatus.PROCESSING, claimedAt: old, sendStartedAt: old });
    await writeSentMarker(delivered.id, { messageId: '<m@x>', previewUrl: null, sentAt: old.toISOString() });

    const report = await reconcile({ campaignId });
    expect(report.failedAmbiguous).toBe(1);
    expect((await prisma.emailJob.findUniqueOrThrow({ where: { id: delivered.id } })).status).toBe(EmailStatus.SENT);
    const failed = await prisma.emailJob.findUniqueOrThrow({ where: { id: unknown.id } });
    expect(failed.status).toBe(EmailStatus.FAILED);
    expect(failed.lastError).toMatch(/outcome unknown/);
  });
});
