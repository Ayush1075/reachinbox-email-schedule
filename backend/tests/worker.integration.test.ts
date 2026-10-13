import { randomUUID } from 'node:crypto';
import { EmailStatus } from '@prisma/client';
import type { Worker } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { encrypt } from '../src/lib/crypto';
import { HOUR_MS, hourWindowStart } from '../src/lib/time';
import { redis } from '../src/queue/connection';
import { emailQueue } from '../src/queue/emailQueue';
import { claimEmailJob, sentMarkerKey, writeSentMarker } from '../src/services/delivery';
import { closeAllTransports } from '../src/services/mailer';
import { lastSendKey, windowKey } from '../src/services/rateLimiter';
import { createEmailWorker } from '../src/workers/emailWorker';
import { startSmtpSink, type SmtpSink } from './helpers/smtpSink';

/**
 * End-to-end worker behaviour against the docker-compose Postgres + Redis,
 * an isolated BullMQ queue (QUEUE_NAME=email-send-test) and an in-process
 * SMTP sink standing in for Ethereal.
 */

let sink: SmtpSink;
let worker: Worker;
let userId: string;
let senderId: string;
let campaignId: string;

async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (done(value)) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out; last value: ${JSON.stringify(value)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function createEmail(overrides: Partial<{ recipient: string; status: EmailStatus; sequenceIndex: number }> = {}) {
  const id = randomUUID();
  const sequenceIndex = overrides.sequenceIndex ?? Math.floor(Math.random() * 1e6);
  return prisma.emailJob.create({
    data: {
      id,
      campaignId,
      senderId,
      recipient: overrides.recipient ?? `${id.slice(0, 8)}@example.com`,
      subject: 'Test subject',
      body: 'Test body',
      scheduledAt: new Date(),
      sequenceIndex,
      status: overrides.status ?? EmailStatus.QUEUED,
      bullJobId: id,
      idempotencyKey: `${campaignId}:${sequenceIndex}`,
    },
  });
}

const enqueue = (emailJobId: string, jobId = emailJobId) =>
  emailQueue.add('send-email', { emailJobId, campaignId, senderId }, { jobId });

const status = (id: string) => prisma.emailJob.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  sink = await startSmtpSink();
  const user = await prisma.user.create({
    data: { googleId: `test:${randomUUID()}`, email: `${randomUUID()}@test.local`, name: 'Worker Test' },
  });
  userId = user.id;
  await emailQueue.obliterate({ force: true });
  worker = createEmailWorker();
  await worker.waitUntilReady();
});

beforeEach(async () => {
  sink.messages.length = 0;
  sink.rejectWith = null;
  // Fresh sender per test so rate-limit counters never bleed between tests.
  const sender = await prisma.sender.create({
    data: {
      userId,
      label: 'Sink',
      smtpHost: '127.0.0.1',
      smtpPort: sink.port,
      smtpUser: 'user',
      smtpPass: encrypt('pass'),
      fromAddress: `${randomUUID().slice(0, 8)}@sink.test`,
    },
  });
  senderId = sender.id;
  const campaign = await prisma.campaign.create({
    data: { userId, subject: 's', body: 'b', startAt: new Date(), delayBetweenMs: 0, totalRecipients: 0 },
  });
  campaignId = campaign.id;
});

afterAll(async () => {
  await worker?.close();
  await emailQueue.obliterate({ force: true });
  await emailQueue.close();
  await prisma.emailJob.deleteMany({ where: { campaign: { userId } } });
  await prisma.user.delete({ where: { id: userId } });
  await closeAllTransports();
  await sink.close();
  await redis.quit();
  await prisma.$disconnect();
});

describe('email worker', () => {
  it('sends a queued email exactly once and records the result', async () => {
    const email = await createEmail();
    await enqueue(email.id);
    const row = await waitFor(() => status(email.id), (r) => r.status === EmailStatus.SENT);

    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0]!.data).toContain(`Message-ID: <${email.id}@`);
    expect(row.sentAt).not.toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.claimToken).toBeNull();
    expect(await redis.exists(sentMarkerKey(email.id))).toBe(1);
  });

  it('ignores a duplicate enqueue with the same jobId (layer 1)', async () => {
    const email = await createEmail();
    await Promise.all([enqueue(email.id), enqueue(email.id), enqueue(email.id)]);
    await waitFor(() => status(email.id), (r) => r.status === EmailStatus.SENT);
    await new Promise((r) => setTimeout(r, 500));
    expect(sink.messages).toHaveLength(1);
  });

  it('sends once even when many distinct jobs race for the same email (layer 2)', async () => {
    const email = await createEmail();
    // Simulates duplicates that slipped past jobId dedupe (e.g. Redis wiped mid-flight).
    await Promise.all(Array.from({ length: 10 }, () => enqueue(email.id, randomUUID())));
    await waitFor(() => status(email.id), (r) => r.status === EmailStatus.SENT);
    // Losers that saw a fresh claim were deferred, not dropped or sent. Run them now:
    // they must all resolve as idempotent no-ops.
    await waitFor(() => emailQueue.getJobCounts('active', 'waiting'), (c) => (c.active ?? 0) + (c.waiting ?? 0) === 0);
    for (const job of await emailQueue.getDelayed()) await job.promote();
    const completedForEmail = async () => (await emailQueue.getCompleted(0, -1)).filter((j) => j.data.emailJobId === email.id).length;
    await waitFor(completedForEmail, (n) => n === 10);
    expect(sink.messages).toHaveLength(1);
  });

  it('finalises from the Redis sent marker without re-sending (layer 3)', async () => {
    const email = await createEmail();
    await writeSentMarker(email.id, { messageId: '<prior@x>', previewUrl: 'https://ethereal.email/message/prior', sentAt: new Date().toISOString() });
    await enqueue(email.id);
    const row = await waitFor(() => status(email.id), (r) => r.status === EmailStatus.SENT);
    expect(row.previewUrl).toBe('https://ethereal.email/message/prior');
    expect(sink.messages).toHaveLength(0);
  });

  it('skips cancelled emails', async () => {
    const email = await createEmail({ status: EmailStatus.CANCELLED });
    const job = await enqueue(email.id);
    await waitFor(() => job.getState(), (s) => s === 'completed');
    expect(sink.messages).toHaveLength(0);
    expect((await status(email.id)).status).toBe(EmailStatus.CANCELLED);
  });

  it('defers emails over the hourly cap to the next window instead of dropping them', async () => {
    await prisma.sender.update({ where: { id: senderId }, data: { hourlyLimit: 2 } });
    const emails = await Promise.all([0, 1, 2, 3].map((i) => createEmail({ sequenceIndex: i })));
    for (const e of emails) await enqueue(e.id);

    const rows = await waitFor(
      () => prisma.emailJob.findMany({ where: { id: { in: emails.map((e) => e.id) } } }),
      (rs) => rs.filter((r) => r.status === EmailStatus.SENT).length === 2 && rs.filter((r) => r.status === EmailStatus.RATE_LIMITED).length === 2,
    );
    expect(sink.messages).toHaveLength(2);

    const nextWindow = hourWindowStart(Date.now()) + HOUR_MS;
    for (const r of rows.filter((r) => r.status === EmailStatus.RATE_LIMITED)) {
      expect(r.rescheduleCount).toBe(1);
      expect(hourWindowStart(r.scheduledAt.getTime())).toBe(nextWindow);
      expect(await emailQueue.getJobState(r.id)).toBe('delayed');
    }
    await redis.del(windowKey(senderId, Date.now()), lastSendKey(senderId));
  });

  it('marks permanent SMTP rejections FAILED without retrying', async () => {
    sink.rejectWith = 550;
    const email = await createEmail();
    await enqueue(email.id);
    const row = await waitFor(() => status(email.id), (r) => r.status === EmailStatus.FAILED);
    expect(row.lastError).toMatch(/550/);
    expect(row.attempts).toBe(1);
    expect(sink.messages).toHaveLength(0);
  });
});

describe('claimEmailJob (idempotency guard)', () => {
  it('lets exactly one of many concurrent claimers win', async () => {
    const email = await createEmail();
    const results = await Promise.all(Array.from({ length: 20 }, () => claimEmailJob(email.id, randomUUID())));
    expect(results.filter((r) => r.kind === 'claimed')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'busy')).toHaveLength(19);
  });

  it('reports terminal rows as done', async () => {
    const email = await createEmail({ status: EmailStatus.SENT });
    expect(await claimEmailJob(email.id, 't')).toEqual({ kind: 'done', status: EmailStatus.SENT });
  });

  it('reclaims an abandoned claim that never reached SMTP', async () => {
    const email = await createEmail({ status: EmailStatus.PROCESSING });
    await prisma.emailJob.update({ where: { id: email.id }, data: { claimToken: 'dead', claimedAt: new Date(Date.now() - 10 * 60_000) } });
    expect((await claimEmailJob(email.id, 'new', 60_000)).kind).toBe('claimed');
  });

  it('refuses to retry a claim that crashed mid-send (outcome unknown)', async () => {
    const email = await createEmail({ status: EmailStatus.PROCESSING });
    const old = new Date(Date.now() - 10 * 60_000);
    await prisma.emailJob.update({ where: { id: email.id }, data: { claimToken: 'dead', claimedAt: old, sendStartedAt: old } });
    expect((await claimEmailJob(email.id, 'new', 60_000)).kind).toBe('ambiguous');
  });

  it('returns not-found for unknown ids', async () => {
    expect((await claimEmailJob(randomUUID(), 't')).kind).toBe('not-found');
  });
});
