/**
 * Load test: schedule a large campaign (or several at once) in one command.
 *
 *   npm run load:seed -- --email you@gmail.com [--count 1000] [--limit 50]
 *                        [--parallel 1] [--start-in 15] [--delay 0]
 *
 *   --email      Google account that owns the senders (see `npm run db:seed`)
 *   --count      recipients per campaign                      (default 1000)
 *   --limit      per-sender hourly cap for the campaign        (default: sender/env cap)
 *   --parallel   campaigns created at the same instant          (default 1)
 *   --start-in   seconds until the first send                   (default 15)
 *   --delay      ms between emails                              (default 0)
 *
 * With --parallel 1 the hour-window planner spreads the campaign across
 * windows up front, so nothing should hit the runtime limiter.
 *
 * With --parallel ≥ 2 the campaigns are planned concurrently from the same
 * snapshot of sender load, so together they overbook the current window. The
 * Redis Lua limiter catches the overflow at send time: watch emails flip to
 * RATE_LIMITED, get rescheduled to the next hour, and one Slack alert arrive
 * per sender. That is the safety net doing its job.
 *
 * Recipients use the reserved .test TLD; with Ethereal nothing is delivered.
 */
import { parseArgs } from 'node:util';
import { prisma } from '../src/db/prisma';
import { hourWindowStart } from '../src/lib/time';
import { redis } from '../src/queue/connection';
import { emailQueue } from '../src/queue/emailQueue';
import { createCampaign } from '../src/services/campaigns';
import { es, indexEmailJobsByCampaign } from '../src/services/search';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      count: { type: 'string', default: '1000' },
      limit: { type: 'string' },
      parallel: { type: 'string', default: '1' },
      'start-in': { type: 'string', default: '15' },
      delay: { type: 'string', default: '0' },
    },
  });
  if (!values.email) {
    console.error('Usage: npm run load:seed -- --email <your-google-email> [--count 1000] [--limit 50] [--parallel 2]');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: values.email.toLowerCase() },
    include: { senders: { where: { isActive: true } } },
  });
  if (!user || user.senders.length === 0) {
    console.error(`No active senders for ${values.email}. Run: npm run db:seed -- ${values.email}`);
    process.exit(1);
  }

  const count = Number(values.count);
  const parallel = Number(values.parallel);
  const startAt = new Date(Date.now() + Number(values['start-in']) * 1000);
  const hourlyLimit = values.limit ? Number(values.limit) : null;
  const runId = Date.now().toString(36);

  console.log(
    `Scheduling ${parallel} × ${count} emails across ${user.senders.length} sender(s), ` +
      `limit ${hourlyLimit ?? 'sender default'}/h, starting ${startAt.toISOString()}`,
  );

  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: parallel }, (_, c) =>
      createCampaign(user.id, {
        subject: `Load test ${runId} #${c + 1}`,
        body: `Load-test email from campaign ${c + 1} of run ${runId}.`,
        recipients: Array.from({ length: count }, (_, i) => `load-${runId}-${c}-${i}@example.test`),
        startAt,
        delayBetweenMs: Number(values.delay),
        hourlyLimit,
        senderIds: user.senders.map((s) => s.id),
      }),
    ),
  );
  const elapsed = Math.round(performance.now() - t0);

  for (const [i, r] of results.entries()) {
    console.log(
      `  campaign ${i + 1}: ${r.campaign.id}  planned end ${r.plan.endsAt.toISOString()}  ` +
        `pushed to later windows by planner: ${r.plan.deferredByCap}`,
    );
  }

  // Plan distribution by sender and hour window, straight from Postgres.
  const ids = results.map((r) => r.campaign.id);
  const jobs = await prisma.emailJob.findMany({ where: { campaignId: { in: ids } }, select: { senderId: true, scheduledAt: true } });
  const table = new Map<string, number>();
  for (const j of jobs) {
    const key = `${j.senderId.slice(0, 8)}  ${new Date(hourWindowStart(j.scheduledAt.getTime())).toISOString().slice(0, 13)}:00Z`;
    table.set(key, (table.get(key) ?? 0) + 1);
  }
  console.log('\nPlanned emails per sender per hour window:');
  for (const [k, v] of [...table.entries()].sort()) console.log(`  ${k}  ${v}`);

  const counts = await emailQueue.getJobCounts('delayed', 'waiting');
  console.log(`\nCreated ${jobs.length} emails in ${elapsed} ms. Queue now: ${JSON.stringify(counts)}`);
  // createCampaign indexes in the background; make sure it finishes before we exit.
  await Promise.all(ids.map((id) => indexEmailJobsByCampaign(id)));

  if (parallel > 1) console.log('Concurrent campaigns overbook the current window on purpose — watch for RATE_LIMITED deferrals and the Slack alert.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await emailQueue.close();
    await redis.quit();
    await es.close();
    await prisma.$disconnect();
  });
