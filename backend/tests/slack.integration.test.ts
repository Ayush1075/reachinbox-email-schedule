import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { encrypt } from '../src/lib/crypto';
import { HOUR_MS, hourWindowStart } from '../src/lib/time';
import { redis } from '../src/queue/connection';
import { alertDedupeKey, notifyRateLimitHit } from '../src/services/slack';

/** A local HTTP server stands in for the Slack incoming webhook. */
let server: http.Server;
let received: { blocks?: unknown[]; text: string }[] = [];
let failNext = false;
let userId: string;

const sender = { id: randomUUID(), label: 'Ethereal 1', fromAddress: 'a@ethereal.email' };
const windowEndsAt = hourWindowStart(Date.now()) + HOUR_MS;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (failNext) {
        failNext = false;
        res.writeHead(500).end('boom');
        return;
      }
      received.push(JSON.parse(body));
      res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  const user = await prisma.user.create({
    data: {
      googleId: `test:${randomUUID()}`,
      email: `${randomUUID()}@test.local`,
      name: 'Slack Test',
      slackWebhookUrl: encrypt(`http://127.0.0.1:${port}/hook`),
      slackConnectedAt: new Date(),
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await redis.del(alertDedupeKey(sender.id, windowEndsAt - 1));
  await prisma.user.delete({ where: { id: userId } });
  await new Promise((r) => server.close(r));
  await redis.quit();
  await prisma.$disconnect();
});

describe('notifyRateLimitHit', () => {
  it('posts one Block Kit message per sender per window, however many jobs hit the cap', async () => {
    await Promise.all(Array.from({ length: 25 }, () => notifyRateLimitHit({ userId, sender, limit: 200, windowEndsAt })));
    expect(received).toHaveLength(1);
    expect(received[0]!.text).toContain('Hourly sending limit reached for Ethereal 1');
    expect(JSON.stringify(received[0]!.blocks)).toContain('200 emails / hour');
  });

  it('releases the dedupe key when Slack rejects, so a later hit can retry', async () => {
    const otherSender = { ...sender, id: randomUUID() };
    received = [];
    failNext = true;
    await notifyRateLimitHit({ userId, sender: otherSender, limit: 10, windowEndsAt });
    expect(received).toHaveLength(0);
    await notifyRateLimitHit({ userId, sender: otherSender, limit: 10, windowEndsAt });
    expect(received).toHaveLength(1);
    await redis.del(alertDedupeKey(otherSender.id, windowEndsAt - 1));
  });

  it('silently no-ops when the user has not connected Slack', async () => {
    const plain = await prisma.user.create({ data: { googleId: `test:${randomUUID()}`, email: `${randomUUID()}@test.local`, name: 'No Slack' } });
    await expect(notifyRateLimitHit({ userId: plain.id, sender, limit: 1, windowEndsAt })).resolves.toBeUndefined();
    await prisma.user.delete({ where: { id: plain.id } });
  });
});
