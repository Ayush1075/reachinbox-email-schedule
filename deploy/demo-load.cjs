/**
 * Rate-limit demo: creates two campaigns at the same instant for one sender
 * with a low hourly cap, so together they overbook the current hour.
 *
 * Each campaign is planned from the same snapshot of sender load, so the
 * planner cannot see the other one. The Redis limiter catches the overflow at
 * send time: emails flip to RATE_LIMITED, are rescheduled into the next hour,
 * and one Slack alert is posted (if Slack is connected).
 *
 * Run it inside the API container, which already has the app, its env and a
 * route to the database (the database is not exposed publicly):
 *
 *   docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T \
 *     -e DEMO_EMAIL=you@gmail.com -e DEMO_COUNT=30 -e DEMO_LIMIT=20 api node - < deploy/demo-load.cjs
 *
 *   DEMO_EMAIL  the account that owns the campaigns (and has Slack connected)
 *   DEMO_COUNT  recipients per campaign                       (default 30)
 *   DEMO_LIMIT  hourly cap for the new demo sender            (default 20)
 */
const root = process.env.APP_ROOT || '/app';
const apiUrl = process.env.API_URL || 'http://localhost:4000';

const { prisma } = require(`${root}/dist/db/prisma`);
const { issueSessionToken } = require(`${root}/dist/services/auth`);

const email = (process.env.DEMO_EMAIL || '').trim().toLowerCase();
const perCampaign = Number(process.env.DEMO_COUNT || 30);
const limit = Number(process.env.DEMO_LIMIT || 20);

async function main() {
  if (!email) throw new Error('Set DEMO_EMAIL to the account that should own the campaigns');
  if (!(perCampaign > 0) || !(limit > 0)) throw new Error('DEMO_COUNT and DEMO_LIMIT must be positive numbers');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}. Sign in to the app with that account once first.`);

  const token = issueSessionToken(user.id);
  const call = async (path, body) => {
    const res = await fetch(apiUrl + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.success) throw new Error(`${path}: ${json.error?.message ?? res.status}`);
    return json.data;
  };

  // A fresh sender, so its hourly counter starts at zero and its cap is exactly DEMO_LIMIT.
  const sender = await call('/api/senders/ethereal', { hourlyLimit: limit });
  console.log(`Created sender ${sender.label} <${sender.fromAddress}> capped at ${limit}/hour`);

  const run = Date.now().toString(36);
  const startAt = new Date(Date.now() + 10_000).toISOString();
  const create = (n) =>
    call('/api/campaigns', {
      subject: `Rate limit demo #${n}`,
      body: '<p>This email is part of the rate-limit demo.</p>',
      bodyFormat: 'html',
      recipients: Array.from({ length: perCampaign }, (_, i) => `demo-${run}-${n}-${i}@example.test`),
      startAt,
      delayBetweenMs: 0,
      hourlyLimit: limit,
      senderIds: [sender.id],
    });

  console.log(`Scheduling 2 x ${perCampaign} emails at the same instant (cap ${limit}/hour)...`);
  const results = await Promise.all([create(1), create(2)]);
  results.forEach((r, i) =>
    console.log(`  campaign ${i + 1}: ${r.campaign.totalRecipients} emails, planner pushed ${r.plan.deferredByCap} to a later hour`),
  );
  console.log(
    `\nTogether they ask for ${2 * perCampaign} sends against a cap of ${limit}/hour. ` +
      `Expect about ${Math.max(0, 2 * perCampaign - limit)} emails to show as Deferred (RATE_LIMITED) and one Slack alert.`,
  );
}

main()
  .catch((err) => {
    console.error(`\nFailed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
