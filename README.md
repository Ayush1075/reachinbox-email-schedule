# ReachInbox Email Scheduler

A full-stack email job scheduler: schedule a single email or a CSV-driven campaign to send at a
future time, with an hourly per-sender rate limit that nothing ever violates and nothing ever
gets dropped for hitting. Built on **BullMQ delayed jobs** (not cron), **PostgreSQL** as the
source of truth, and a **Next.js** dashboard. Sends go to **Ethereal Email** — nothing real is
delivered, but the send path (SMTP, retries, bounces-as-errors) is real.

The single property this system is built around: **an email is sent exactly once, at
approximately the right time — even across a crash, a restart, multiple workers, or a wiped
Redis.** Everything else (rate limiting, Slack alerts, search) is built on top of that guarantee,
never at the expense of it.

## Demo video

`<link to be added>`

## Screenshots

| Scheduled mailbox | Compose | Overview (quota panel) | Reading view |
| --- | --- | --- | --- |
| `<screenshot>` | `<screenshot>` | `<screenshot>` | `<screenshot>` |

| Overview (dark) | Senders | Bull Board | Slack alert |
| --- | --- | --- | --- |
| `<screenshot>` | `<screenshot>` | `<screenshot>` | `<screenshot>` |

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Scheduling | BullMQ (Redis-backed) | Delayed jobs are durable Redis sorted-set entries, not an in-process timer — they survive a process restart for free. The assignment explicitly rules out cron. |
| Queue backend | Redis (`ioredis`), AOF-enabled | BullMQ requires Redis; AOF persistence means the queue survives a *container* restart, not just a process restart. |
| Database | PostgreSQL + Prisma | Relational integrity for campaigns/jobs, transactional multi-row inserts, and a schema a reviewer can open and read. Prisma gives typed queries and migrations. |
| Email delivery | Nodemailer → Ethereal Email | A real SMTP send path with zero risk of mailing a real address; every send gets a clickable preview link. |
| Search | Elasticsearch, with Postgres fallback | Full-text search over recipient/subject/body across large campaigns; degrades to `ILIKE` instead of taking the app down if ES is unreachable. |
| Queue UI | `@bull-board/express` | A live, zero-effort view into delayed/active/failed jobs — useful for the demo and for debugging. |
| Validation | Zod | Same validation library on env config and every request body; parse errors are readable, not stack traces. |
| Logging | Pino | Structured JSON logs; every line in a job's lifecycle carries `emailJobId`/`campaignId`/`bullJobId`. |
| Tests | Vitest | Fast, native ESM/TS support, shared config style with the rest of the stack. |
| Frontend | Next.js (App Router) + TypeScript | File-based routing, server/client component split, fast dev loop. |
| Components | shadcn/ui on Radix UI | Owned, editable component source (no framework to fight) on Radix primitives, so dialogs, menus, popovers and tooltips get correct focus management, keyboard navigation and ARIA for free. |
| Styling | Tailwind CSS v4 + CSS variables | Semantic design tokens with a complete dark counterpart; no per-component colour values. |
| Server state | TanStack Query | Polling with `refetchInterval`, optimistic updates with rollback, pause-when-hidden — all built in. |
| Tables | TanStack Table | Headless sorting and column definitions behind one generic `DataTable`. |
| Forms | react-hook-form + Zod | Typed, validated forms; the same schema style as the API. |
| Rich text | Tiptap (ProseMirror) | A real editor with the toolbar from the design, emitting HTML the server then sanitizes. |
| Motion and charts | Framer Motion, Recharts | Restrained count-up on stat cards; one small throughput chart. |
| CSV parsing | PapaParse, react-dropzone | Robust delimiter/quote handling and drag-and-drop, all in the browser before anything is sent to the server. |

## Quick start

```bash
# 1. Infrastructure
docker compose up -d
docker compose ps   # wait for all three services to report healthy

# 2. Backend
cd backend
cp .env.example .env
# edit .env: set GOOGLE_CLIENT_ID (see "Google OAuth setup"), and generate secrets:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # -> JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> ENCRYPTION_KEY
npm install
npm run db:migrate      # applies prisma/migrations
npm run db:seed -- you@gmail.com   # creates 2 Ethereal senders for your Google account
npm run dev              # runs API (:4000) + worker, via concurrently

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local
# edit .env.local: set NEXT_PUBLIC_GOOGLE_CLIENT_ID (same client ID as backend)
npm install
npm run dev               # :3000
```

Open `http://localhost:3000`, sign in with the Google account you seeded, and compose a
campaign. Bull Board is at `http://localhost:4000/admin/queues` (basic auth from
`BULL_BOARD_USER`/`BULL_BOARD_PASSWORD`).

## Running the backend — and why API and worker are separate processes

```bash
npm run dev:api      # Express API only
npm run dev:worker   # BullMQ worker only
npm run dev          # both, via concurrently (what you normally want)
```

`src/index.ts` (API) and `src/worker.ts` (worker) are two independent Node processes sharing one
Postgres database and one Redis instance. This is not incidental:

- **Horizontal scaling.** Run more worker processes to raise throughput without touching the
  API. The Redis Lua rate limiter and the Postgres claim guard are what make that safe — workers
  never need to coordinate directly with each other.
- **Unambiguous restart demo.** Kill *only* the worker mid-campaign: the API keeps accepting
  requests, BullMQ keeps holding the delayed jobs in Redis, and nothing is lost. Restart the
  worker and sending resumes exactly where it left off, with no duplicates. If API and worker
  shared a process, "restart" would always restart scheduling too, which proves a weaker claim.
- **Independent failure domains.** A bug that crashes the worker (e.g. a bad SMTP config) doesn't
  take the API/dashboard down, and vice versa.

Both processes install `SIGTERM`/`SIGINT` handlers: the API stops accepting new connections and
lets in-flight requests finish; the worker calls `worker.close()`, which stops pulling new jobs
and waits for active ones to finish before exiting (`src/index.ts`, `src/worker.ts`).

## Running the frontend

```bash
cd frontend
npm run dev          # http://localhost:3000
npm run build && npm run start   # production build
npm run typecheck
npm run test
```

The frontend only needs the backend reachable at `NEXT_PUBLIC_API_URL` and the same Google OAuth
client ID as the backend.

## Frontend

The UI is built from the supplied Figma (Outbox Labs assignment): login, the Scheduled/Sent
mailbox, the reading view and the compose screen are reproduced from it. Screens the Figma does
not cover (Overview, Campaigns, Senders, Settings) reuse its tokens and components rather than
introducing a second visual language.

### Screens

| Route | What it is |
| --- | --- |
| `/` | Login: Google, or email and password (creates the account on first use). |
| `/dashboard/scheduled`, `/dashboard/sent` | The mailbox: search, filter (status, starred, archived), refresh, infinite scroll, 5-second polling. Rows show recipient, time pill, subject and body preview; star, archive, delete and cancel act optimistically. |
| `/dashboard/emails/[id]` | Reading view: sanitized HTML body, attachments, delivery details and the Ethereal preview link. |
| `/dashboard/compose` | Rich-text compose with recipient chips, CSV/TXT upload, attachments, Send Later, and a live schedule preview. |
| `/dashboard/overview` | Stat cards, live per-sender quota (read from the limiter's own Redis counters), throughput chart, recent activity. |
| `/dashboard/campaigns` | Campaign list with delivery progress and cancel. |
| `/dashboard/senders` | Sender cards with quota, SMTP test, edit, deactivate, and an add dialog. |
| `/dashboard/settings` | Slack connect/test/disconnect, server defaults, theme, account. |

### Design system

- **Tokens** live in `src/app/globals.css` as semantic CSS variables (`--background`,
  `--primary`, `--muted`, `--field`, ...). Each has a dark counterpart under `.dark`; light is the
  default because that is what the design is drawn in. Components use token classes only.
- **Typography:** Inter for UI, JetBrains Mono for addresses, times, counts and quota figures.
- **Status** is always rendered by one component, `StatusPill`, and carries an icon and text as
  well as colour.
- **Dark mode** via `next-themes` (Account menu or Settings → Appearance).

### Component architecture

- `src/components/ui/` is shadcn/ui source (owned, editable). Nothing else lives there.
- `src/components/common/` holds shared pieces (`DataTable`, `EmptyState`, `ConfirmDialog`).
- Feature folders (`email/`, `dashboard/`, `senders/`, `campaigns/`, `settings/`, `layout/`) hold
  presentational components; **containers fetch, presentational components take props**.
- All server state goes through hooks in `src/hooks/`, keyed from `src/lib/query-keys.ts`;
  there are no `fetch` calls outside `src/lib/api.ts`.

### Accessibility

Radix handles focus, keyboard and ARIA for dialogs, menus and popovers. In addition: a skip link,
icon-only buttons carry `aria-label`s, every form control has a label, live regions announce
list counts and schedule previews, status never relies on colour alone, and the toolbar and
rows are reachable by keyboard. `Ctrl/Cmd+K` focuses the mailbox search.

## Ethereal Email setup

[Ethereal](https://ethereal.email) is a fake SMTP service made for exactly this: it accepts and
stores mail without delivering it anywhere, and gives you a web inbox + a per-message preview
link. No account or signup is needed — the app creates mailboxes for you.

1. **Seed script (fastest):** `npm run db:seed -- you@gmail.com 2` creates 2 Ethereal mailboxes
   as senders for that user and prints each one's Ethereal web-inbox login to the terminal.
2. **From the dashboard:** the "Add sender" flow has a one-click **"Use Ethereal"** button
   (`POST /api/senders/ethereal`) that provisions a brand-new mailbox on the spot — no credentials
   to type in.
3. **Your own SMTP creds:** `POST /api/senders` also accepts any real SMTP host/port/user/pass
   (e.g. a real Ethereal account you created manually, or Mailtrap); the password is
   AES-256-GCM-encrypted before it touches Postgres (`src/lib/crypto.ts`) and verified with a live
   `transport.verify()` call before the sender is saved.
4. **Where previews show up:** every sent row in the dashboard's **Sent** table has a **Preview**
   link — `nodemailer.getTestMessageUrl()` from the send result, stored on `EmailJob.previewUrl`.
   Click it to open the actual rendered email in Ethereal's viewer.
5. Multiple senders rotate round-robin across a campaign's recipients (see Architecture →
   scheduling).

## Environment variables

### Backend (`backend/.env`, see `backend/.env.example`)

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | no | `development` \| `test` \| `production`. |
| `PORT` | `4000` | no | API port. |
| `LOG_LEVEL` | `info` | no | Pino level. |
| `DATABASE_URL` | — | **yes** | Postgres connection string. |
| `REDIS_URL` | `redis://localhost:6379` | no | Redis connection string (BullMQ + rate limiter + dedupe keys). |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | no | ES node URL. |
| `ELASTICSEARCH_INDEX` | `emails` | no | Index name. |
| `FRONTEND_URL` | `http://localhost:3000` | no | CORS origin + OAuth redirect base. |
| `API_PUBLIC_URL` | `http://localhost:4000` | no | This API's own externally reachable URL. |
| `JWT_SECRET` | — | **yes** (≥32 chars) | Signs session cookies and the Slack OAuth `state`. |
| `SESSION_TTL_HOURS` | `168` | no | Session cookie lifetime. |
| `ENCRYPTION_KEY` | — | **yes** (32 bytes, base64) | AES-256-GCM key for SMTP passwords + Slack webhook URLs at rest. |
| `GOOGLE_CLIENT_ID` | — | **yes** | Google OAuth 2.0 Web client ID; verifies the ID token from the frontend. |
| `SLACK_CLIENT_ID` | — | no | Blank ⇒ Slack integration reports "not configured" and no-ops. |
| `SLACK_CLIENT_SECRET` | — | no | ″ |
| `SLACK_REDIRECT_URI` | — | no | Must exactly match a Redirect URL registered in the Slack app. |
| `BULL_BOARD_USER` | `admin` | no | Basic-auth user for `/admin/queues`. |
| `BULL_BOARD_PASSWORD` | — | **yes** (≥8 chars) | Basic-auth password for `/admin/queues`. |
| `QUEUE_NAME` | `email-send` | no | BullMQ queue name. |
| `WORKER_CONCURRENCY` | `5` | no | Jobs processed in parallel, per worker process. |
| `QUEUE_GLOBAL_RATE_MAX` / `QUEUE_GLOBAL_RATE_DURATION_MS` | `50` / `1000` | no | Coarse BullMQ `limiter` shared by every worker process — a backstop above the per-sender Redis limiter. |
| `JOB_ATTEMPTS` | `3` | no | SMTP-failure retries, exponential backoff from `JOB_BACKOFF_MS`. |
| `JOB_BACKOFF_MS` | `5000` | no | Backoff base. |
| `REMOVE_ON_COMPLETE_AGE_S` / `REMOVE_ON_FAIL_AGE_S` | `86400` / `604800` | no | How long finished BullMQ jobs stay in Redis (Postgres keeps the permanent record regardless). |
| `ENQUEUE_CHUNK_SIZE` | `500` | no | Batch size for `queue.addBulk()` on large campaigns. |
| `MAX_EMAILS_PER_HOUR` | `200` | no | Global default hourly cap per sender (lowest precedence). |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | — | no | Overrides the above for all senders that don't set their own `hourlyLimit`. |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | `2000` | no | Minimum gap between two sends from the same sender. |
| `RECONCILE_INTERVAL_MS` | `300000` | no | How often the reconciliation sweep runs (safety net — see Architecture). |
| `STALE_CLAIM_MS` | `120000` | no | A worker's `PROCESSING` claim older than this with no live BullMQ job is treated as abandoned. |

### Frontend (`frontend/.env.local`, see `frontend/.env.example`)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | no (default `http://localhost:4000`) | Backend base URL. Public — embedded in the browser bundle. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | **yes** | Same OAuth client ID as the backend's `GOOGLE_CLIENT_ID`. |

## Google OAuth setup

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project →
   **APIs & Services → OAuth consent screen** → External, add your own email as a test user.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type
   **Web application**.
3. **Authorized JavaScript origins:** `http://localhost:3000`
4. **Authorized redirect URIs:** none needed — the Login with Google button uses Google's
   browser-side token client (a popup), not a server redirect.
5. Copy the **Client ID** into both `backend/.env` (`GOOGLE_CLIENT_ID`) and
   `frontend/.env.local` (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) — it is the same value in both places.
6. Sign in on `http://localhost:3000`. The frontend sends the Google access token to
   `POST /api/auth/google`; the backend checks its audience against `GOOGLE_CLIENT_ID` (a token
   issued to another app is rejected), upserts the `User` row, and sets an httpOnly session
   cookie. (The endpoint also accepts a Google ID token, verified with `google-auth-library`.)
   No mock auth path exists.
7. **Email and password** is also supported (`POST /api/auth/email`): scrypt-hashed, limited to 20
   attempts per IP per 15 minutes, and it never sets a password on an account that signs in with
   Google, so knowing someone's address is not enough to take their account over.

## Slack app setup

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From scratch**.
2. **OAuth & Permissions** → scroll to **Redirect URLs** → add
   `https://<your-tunnel-or-host>/api/slack/callback` (Slack requires HTTPS; use `ngrok`/a
   tunnel for local dev, or your real domain in production).
3. Still on **OAuth & Permissions**, under **Scopes**, no bot scopes are needed — this
   integration uses the legacy **`incoming-webhook`** scope ("Add to Slack" style), which lets a
   user pick a destination channel during install and hands back a single-channel webhook URL.
   Request it under **OAuth & Permissions → Scopes → Bot Token Scopes → `incoming-webhook`** (or
   enable **Incoming Webhooks** under **Features** and let the app request it on install).
4. Copy the app's **Client ID** and **Client Secret** from **Basic Information** into
   `backend/.env` as `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`, and set `SLACK_REDIRECT_URI` to
   the exact URL registered in step 2.
5. From **Settings → Slack alerts**, click **Connect Slack** → approve → you're redirected back
   to Settings with `?slack=connected`. A rate-limit alert now posts to the channel you picked, the moment any
   sender's hourly cap is hit.
6. Leaving the three `SLACK_*` variables blank is fully supported: `GET /api/slack/status`
   reports `configured: false`, the dashboard shows a disabled "Slack not configured" state, and
   every alert call silently no-ops — sending is never affected either way.

## Architecture overview

```mermaid
flowchart LR
  FE[Next.js Dashboard] -->|REST, JWT cookie| API[Express API]
  API -->|transaction: Campaign + EmailJob rows| PG[(PostgreSQL)]
  API -->|queue.addBulk, deterministic jobId| REDIS[(Redis / BullMQ)]
  API -->|best-effort index| ES[(Elasticsearch)]
  REDIS -->|delayed job fires| WORKER[Worker process]
  WORKER -->|claim + rate-limit check| PG
  WORKER -->|acquireSendSlot Lua script| REDIS
  WORKER -->|SMTP| SMTP[Ethereal / any SMTP]
  WORKER -->|re-index on status change| ES
  WORKER -->|alert on hourly cap hit| SLACK[Slack webhook]
  RECON[Reconciler sweep] -. repairs drift .-> PG
  RECON -. repairs drift .-> REDIS
```

### How scheduling works

1. `POST /api/campaigns` validates the request (Zod), normalises/dedupes/validates recipient
   addresses, and rejects a `startAt` in the past.
2. The **hour-window planner** (`src/queue/scheduler.ts`) decides *every* recipient's sender and
   `scheduledAt` up front, in one pass: senders are assigned round-robin, each recipient's
   earliest possible time is `startAt + k × delayBetweenMs`, and if a sender's UTC hour window is
   already full (accounting for load already committed by other campaigns on that sender), the
   slot is pushed to the next hour window — keeping the requested pacing instead of bunching up.
3. The `Campaign` row and all `EmailJob` rows (status `SCHEDULED`) are created in **one Postgres
   transaction**, so a crash mid-creation never leaves a half-created campaign.
4. After commit, every job is enqueued to BullMQ with `delay = scheduledAt - now` and a
   **deterministic `jobId = EmailJob.id`** (`src/queue/emailQueue.ts`), using `queue.addBulk()` in
   chunks of `ENQUEUE_CHUNK_SIZE` so a 1000+-recipient campaign doesn't block the event loop.
   BullMQ refuses a duplicate job ID — free, structural deduplication.
5. Jobs are indexed into Elasticsearch in the background.

**Why plan ahead instead of discovering the limit at send time:** if 1000 jobs were all scheduled
for `startAt` and only then checked against a 200/hour cap, 800 of them would wake up at the top
of the hour just to be told "not yet" and re-delayed — repeatedly, as the cap keeps being hit.
Planning the hour windows at creation time means the *common case* (one campaign, no contention)
produces a schedule that is already compliant, and jobs fire once, at the time they're actually
meant to send. The runtime Redis limiter below still runs on every send — it's the safety net for
the case the planner can't see (two campaigns created at the same instant, racing for the same
sender), not the primary mechanism.

### How restart persistence works — three layers

1. **Redis/BullMQ durability.** Delayed jobs live in a Redis sorted set keyed by their fire time;
   that data survives any API/worker process restart natively. `docker-compose.yml` additionally
   runs Redis with `--appendonly yes --appendfsync everysec`, so the *data* survives a Redis
   container restart too — not just the processes talking to it.
2. **Postgres as the source of truth.** Every `EmailJob`'s intended state (`status`,
   `scheduledAt`, `senderId`, …) is a durable row independent of whatever BullMQ currently thinks.
   Redis holds timers; Postgres holds truth.
3. **The reconciler — a safety net, never the scheduler** (`src/services/reconciler.ts`). On
   worker boot, and then every `RECONCILE_INTERVAL_MS`, it sweeps Postgres for every
   `SCHEDULED`/`QUEUED`/`RATE_LIMITED` row and checks whether a live BullMQ job exists for it. A
   missing one is re-enqueued (past-due ones fire immediately); because job IDs are deterministic,
   re-adding one that *does* exist is a harmless no-op. It also recovers `PROCESSING` rows
   abandoned by a worker that died mid-job: if the row never reached the SMTP handoff
   (`sendStartedAt` is null) it's safely returned to the queue; if it did reach SMTP, the outcome
   is genuinely unknown, so it is finalized from a Redis "sent marker" if one exists, or marked
   `FAILED` — **never blindly retried**, because retrying an ambiguous send risks a duplicate. This
   is what makes the system survive **total Redis data loss**, not just a process crash — demoed
   by flushing Redis entirely and watching the next sweep rebuild every pending job from Postgres
   alone. It runs on a `BullMQ` job scheduler with `setGlobalConcurrency(1)`, so N worker
   processes still run exactly one sweep per interval, not N.

The one `setInterval`-shaped thing in this codebase is that sweep, and it is explicitly not a
scheduling mechanism — no email's send time is ever decided by it; it only repairs drift between
two already-authoritative stores.

### How rate limiting and concurrency work

Enforced atomically in Redis via a single Lua script, because a naive `GET` → `if < limit` →
`INCR` from Node has a race window: with N workers polling concurrently, all N can read the same
"199" and all decide to send, overshooting the cap by up to N. Running the read-compare-increment
*inside* Redis means there is no interleaving — exactly `limit` callers can ever win.

```lua
-- KEYS[1] hour-window counter   KEYS[2] last-send timestamp
-- ARGV[1] limit  ARGV[2] now(ms)  ARGV[3] window end(ms)  ARGV[4] min spacing(ms)  ARGV[5] counter TTL(s)
local limit      = tonumber(ARGV[1])
local now        = tonumber(ARGV[2])
local windowEnd  = tonumber(ARGV[3])
local minSpacing = tonumber(ARGV[4])

local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= limit then
  return {0, windowEnd - now, count}            -- 0 = hourly limit reached
end

local last = tonumber(redis.call('GET', KEYS[2]) or '0')
local wait = last + minSpacing - now
if wait > 0 then
  return {2, wait, count}                        -- 2 = too soon after previous send
end

count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[5]))
end
redis.call('SET', KEYS[2], now, 'PX', math.max(minSpacing, 1000) * 2)
return {1, 0, count}                             -- 1 = allowed, slot reserved
```

Two rules, one atomic round-trip (`src/services/rateLimiter.ts`):

- **Hourly cap**, keyed `ratelimit:sender:{senderId}:{YYYY-MM-DDTHH}` (fixed UTC hour window).
  Cap precedence: `Sender.hourlyLimit` → `MAX_EMAILS_PER_HOUR_PER_SENDER` →
  `MAX_EMAILS_PER_HOUR`; a campaign's own `hourlyLimit` can additionally *tighten* (never raise)
  the effective cap for jobs from that campaign (`src/services/limits.ts`).
- **Minimum spacing** between two sends from the same sender, keyed
  `ratelimit:sender:{senderId}:last`.

**Never drop, always reschedule.** When the worker's `acquireSendSlot()` call returns "hourly
limit reached," the job is *not* failed — its `EmailJob` row moves to `RATE_LIMITED`, is
rescheduled to just after the next hour window opens (preserving relative order via a small
`sequenceIndex` offset), and the BullMQ job is re-delayed to that time (`DelayedError`, no retry
attempt consumed). Hitting "too soon after the last send" re-delays by the remaining gap, no
status change needed.

Concurrency has two independent layers: `WORKER_CONCURRENCY` jobs run in parallel *within* one
worker process, and BullMQ's own `limiter: { max, duration }` option is a coarse global throttle
*across every worker process* sharing the queue — a backstop above the per-sender Lua limiter,
not a replacement for it.

**Honest trade-off:** a fixed hour window is simpler than a sliding log or token bucket, but
allows a burst of up to ~2× the limit across two adjacent windows in the worst case (e.g. 200
sent in the last second of 2–3pm, another 200 in the first second of 3–4pm). A sliding-window or
token-bucket limiter would smooth this at the cost of more Redis state and a more complex Lua
script. Fixed windows were chosen because the assignment specifies an *hourly* cap, which maps
directly onto UTC clock-hour windows — and because the planner above schedules proactively around
those same windows, so in practice the burst scenario only arises from genuinely concurrent,
uncoordinated campaigns, which is exactly the case the Slack alert and `RATE_LIMITED` status exist
to surface.

### How idempotency is guaranteed — three independent layers

No single layer below is sufficient alone; together they cover every place a duplicate send could
otherwise sneak in.

1. **Deterministic BullMQ job ID** (`jobId = EmailJob.id`). If the same email is ever enqueued
   twice — a retried API request, the reconciler re-adding a job that already exists — BullMQ
   simply refuses the duplicate. This guards against *double scheduling*.
2. **Conditional SQL claim** (`src/services/delivery.ts`, used from
   `src/workers/emailWorker.ts`). Before doing anything, a worker runs
   `UPDATE email_jobs SET status='PROCESSING', claimToken=$token WHERE id=$1 AND status IN
   ('SCHEDULED','QUEUED','RATE_LIMITED')`. If zero rows are affected, another worker (or a
   stalled-job re-run of the *same* worker) already claimed or finished it — this attempt returns
   immediately without touching SMTP. This guards against *two workers racing the same job*, which
   job-ID dedup alone does not prevent once a job is already in the queue exactly once.
3. **Redis "sent marker"** (`writeSentMarker`/`readSentMarker` in `src/services/delivery.ts`).
   Written *immediately after* a successful SMTP send, before the Postgres row is updated. If the
   process crashes between the SMTP success and the Postgres write, the row is left `PROCESSING`
   — but the marker is already in Redis, so the next time this job is touched (a BullMQ stalled-
   job retry, or the reconciler recovering an abandoned claim) it is finalized as `SENT` from the
   marker instead of being re-sent. This guards against the single most dangerous window: *the
   email already left SMTP but our own bookkeeping doesn't know it yet.*

If the send fails or the process dies **before** reaching SMTP (`sendStartedAt` is still null),
the row is safe to return to `QUEUED`/retry — nothing was sent. If it dies **after** the SMTP
handoff with no marker recoverable, the outcome is genuinely unknown and the job is marked
`FAILED` with an explicit note rather than retried — guaranteeing no duplicate at the cost of, in
that one rare case, a possible non-delivery the user can see and re-send manually.

### Behavior under load — a concrete walk-through

Run `npm run load:seed -- --email you@gmail.com --count 1000 --limit 200` (2 active senders,
200/hour each ⇒ 400/hour combined):

- The planner round-robins the 1000 recipients across the 2 senders (500 each) and, since 500 >
  200, pushes each sender's overflow into later hour windows: sender A gets 200 in hour 0, 200 in
  hour 1, 100 in hour 2; sender B the same. `deferredByCap` in the campaign's plan reports exactly
  how many of the 1000 were pushed past their "naive" slot.
- As each hour window opens, the worker sends up to 200 per sender before the Lua limiter starts
  returning "hourly limit reached" for that sender — which does not happen here, because the plan
  already respects the cap. Nothing is deferred *again* at send time; the runtime limiter is
  idle overhead on the happy path.
- Run the same command with `--parallel 2` (two campaigns created at the same instant, each
  planned from an independent snapshot of sender load): the two plans *together* overbook the
  current window on purpose. The Lua limiter catches exactly the overflow the planner couldn't
  see — those jobs flip to `RATE_LIMITED`, get rescheduled into the next window, and exactly one
  Slack alert fires per sender per window (deduped via `slack:alerted:{senderId}:{window}`), even
  though hundreds of jobs were deferred.
- Throughout, `WORKER_CONCURRENCY=5` jobs are in flight at once per worker process, and
  `QUEUE_GLOBAL_RATE_MAX=50`/`QUEUE_GLOBAL_RATE_DURATION_MS=1000` caps total SMTP attempts across
  all workers to 50/second, regardless of how many senders or campaigns are active.

### Graceful degradation

- **Elasticsearch down:** `searchEmails()` catches the ES error and transparently falls back to
  a Postgres `ILIKE` query (`src/services/search.ts`); the API response shape is identical, with
  `source: 'postgres'` instead of `'elasticsearch'`. Indexing failures are logged and swallowed,
  never thrown into the send path.
- **Slack absent or erroring:** every alert call is wrapped in try/catch and fires
  fire-and-forget from the worker; a failure (timeout, 404'd webhook) is logged and the dedupe key
  is released so a later hit in the same window can retry — sending is never blocked or delayed by
  it.
- **SMTP failure:** BullMQ retries up to `JOB_ATTEMPTS` with exponential backoff
  (`JOB_BACKOFF_MS`); a permanent SMTP 5xx is detected and thrown as `UnrecoverableError` to skip
  pointless retries. Only after the final attempt is the row marked `FAILED`, with the exact SMTP
  error stored on `lastError`.
- **`/health`** checks Postgres, Redis, Elasticsearch and SMTP independently, each with its own
  latency and status; Postgres/Redis down ⇒ `503`, Elasticsearch/SMTP down ⇒ `200` with
  `status: "degraded"` — because the app keeps functioning (minus search quality / minus new
  sends) rather than being "down."

## Features implemented

### Backend

| Requirement | Status | How |
| --- | --- | --- |
| No cron scheduling | ✅ | BullMQ delayed jobs only; the reconciler sweep is a documented, explicit exception (safety net, not scheduler). |
| Survives restarts | ✅ | Redis AOF + Postgres source of truth + reconciler (`src/services/reconciler.ts`). |
| Idempotent delivery | ✅ | Deterministic job ID + conditional SQL claim + Redis sent-marker (`src/services/delivery.ts`, `src/workers/emailWorker.ts`). |
| Configurable limits, no hardcoding | ✅ | All limits/delays are env vars validated in `src/config/env.ts`. |
| Rate-limit state outside process memory | ✅ | Redis Lua script (`src/services/rateLimiter.ts`); correct across N worker processes. |
| Never drop on rate limit | ✅ | `RATE_LIMITED` status + reschedule into next window, order preserved (`src/workers/emailWorker.ts`). |
| Real Google OAuth | ✅ | `google-auth-library` ID token verification, httpOnly JWT session cookie (`src/services/auth.ts`, `src/routes/auth.ts`). |
| Real Slack OAuth + live alert | ✅ | OAuth v2 `incoming-webhook` flow + deduplicated Block Kit alert (`src/services/slack.ts`). |
| CSV/batch scheduling | ✅ | Transactional multi-row create + chunked `addBulk` (`src/services/campaigns.ts`, `src/queue/emailQueue.ts`). |
| Hour-window pre-planning | ✅ | `src/queue/scheduler.ts`, tested in `tests/scheduler.test.ts`. |
| Search | ✅ | Elasticsearch with Postgres fallback (`src/services/search.ts`). |
| Health check | ✅ | Per-dependency status + latency (`src/routes/health.ts`). |
| Load test script | ✅ | `backend/scripts/seed-load.ts`. |
| Tests | ✅ | Rate limiter concurrency, planner, idempotency/claim guard, reconciler, Slack dedupe (`backend/tests/`). |
| Structured logs with correlation IDs | ✅ | Pino child logger per job (`emailJobId`/`campaignId`/`bullJobId`), `pino-http` per request. |
| Graceful shutdown | ✅ | `SIGTERM`/`SIGINT` handlers in `src/index.ts` and `src/worker.ts`. |

### Frontend

| Requirement | Status | How |
| --- | --- | --- |
| Google and email sign-in | ✅ | Custom-styled Google button plus react-hook-form login (`src/app/page.tsx`, `src/hooks/useAuth.ts`). |
| Figma mailbox | ✅ | Sidebar with counts, search/filter/refresh, rows with time pills (`src/components/email/MailboxView.tsx`, `EmailRow.tsx`, `StatusPill.tsx`). |
| Reading view | ✅ | `src/components/email/EmailReader.tsx`. |
| Compose | ✅ | Tiptap editor, chips, Upload List, attachments, Send Later (`src/components/email/ComposeForm.tsx`). |
| Live schedule preview | ✅ | Client-side mirror of the server planner (`src/lib/schedulePreview.ts`); warns when the hourly cap defers emails. |
| Live quota panel | ✅ | `GET /api/senders/quotas` reads the limiter's own Redis keys (`src/components/dashboard/QuotaPanel.tsx`). |
| Search | ✅ | Debounced 300 ms, Elasticsearch with Postgres fallback, scoped to the mailbox. |
| Slack connect UI | ✅ | Settings page: connect, test notification, disconnect. |
| Bull Board link | ✅ | Account menu → Queue dashboard. |
| Optimistic actions | ✅ | Star, archive, delete and cancel update every cached view and roll back on failure (`src/hooks/useEmails.ts`). |
| Typed API client, no `any` | ✅ | `src/lib/api.ts`, `src/types/api.ts` mirrors backend response shapes. |

## API reference

Every response is `{ success, data? } | { success: false, error }`.

```
POST   /api/auth/google          { accessToken } | { credential } -> { user }
POST   /api/auth/email           { email, password } -> { user }  (signs in, or creates the account)
GET    /api/auth/me              -> { user }
POST   /api/auth/logout          -> { loggedOut }

GET    /api/senders              -> Sender[]
POST   /api/senders              { label, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromAddress, hourlyLimit? } -> Sender
POST   /api/senders/ethereal     { hourlyLimit? } -> Sender & { etherealLogin }
POST   /api/senders/verify       { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } -> { ok, latencyMs, error? }
POST   /api/senders/:id/verify   -> { ok, latencyMs, error? }
PATCH  /api/senders/:id          { label?, hourlyLimit?, isActive? } -> Sender
GET    /api/senders/quotas       -> { windowStart, windowEnd, senders: [{ used, limit, deferred, ... }] }

POST   /api/attachments          raw body, headers X-Filename (URI-encoded) and X-Content-Type -> { id, filename, contentType, size }
GET    /api/attachments/:id      -> the file (images inline, everything else as a download)
DELETE /api/attachments/:id      -> removes an upload not yet used by a campaign

POST   /api/campaigns            { subject, body, bodyFormat?, attachmentIds?, recipients[], startAt, delayBetweenMs, hourlyLimit?, senderIds[] } -> { campaign, plan }
GET    /api/campaigns            ?page&limit -> { items, page, limit, total }
GET    /api/campaigns/:id        -> Campaign & { counts }
DELETE /api/campaigns/:id        -> cancels every still-pending EmailJob

GET    /api/emails/scheduled     ?page&limit&status&sort&order&starred&archived -> { items, page, limit, total }
GET    /api/emails/sent          (same query) -> { items, page, limit, total }
GET    /api/emails/throughput    -> sent per 5-minute bucket over the last hour
GET    /api/emails/recent        ?limit -> latest state changes
GET    /api/emails/:id           -> full email: body, attachments, delivery details
PATCH  /api/emails/:id           { starred?, archived? } -> Email
DELETE /api/emails/:id           -> removes from the mailbox (cancels a pending send first)
POST   /api/emails/:id/cancel    -> cancels one EmailJob
GET    /api/emails/stats         ?since -> { scheduled, sentToday, failed, rateLimited, currentHour }

GET    /api/search               ?q&status&from&to&page&limit -> { items, page, limit, total, source }
GET    /api/config               -> { minDelayBetweenEmailsMs, defaultHourlyLimit, maxRecipients, bullBoardPath }

GET    /api/slack/install        -> 302 to Slack consent
GET    /api/slack/callback       -> 302 back to the dashboard
GET    /api/slack/status         -> { configured, connected, teamName, channelName, connectedAt }
POST   /api/slack/disconnect     -> { connected: false }
POST   /api/slack/test           -> posts a test message to the connected channel

GET    /health                   -> { status, uptimeS, checks: { postgres, redis, elasticsearch, smtp }, queue }
GET    /admin/queues             -> Bull Board (HTTP basic auth)
```

## Deployment (Oracle Cloud Always Free, 1 GB VM)

The production stack is : Postgres, Redis (AOF), a one-off migration job,
the API, the worker, the Next.js server and Caddy for automatic HTTPS. Everything sits behind one
hostname, so the dashboard and API share an origin (no CORS, simple cookies). It is sized for a
1 GB VM and measured at roughly 190 MB resident. Elasticsearch is left out there, and search
falls back to Postgres  as designed.

**One-time VM setup** (Ubuntu): open TCP 80/443 in the Oracle security list *and* the VM firewall
(, same for 443,
), install Docker, add a 2 GB swap file, and point a hostname
(e.g. DuckDNS) at the VM.

**Build and ship** (images are built on your machine, because the VM is too small to run
;  values are baked in at build time):

\#1 [internal] load local bake definitions
#1 reading from stdin 1.17kB done
#1 DONE 0.0s

#2 [web internal] load build definition from Dockerfile
#2 transferring dockerfile: 727B 0.0s done
#2 DONE 0.1s

#3 [migrate internal] load build definition from Dockerfile
#3 transferring dockerfile: 853B 0.0s done
#3 DONE 0.1s

#4 [migrate] resolve image config for docker-image://docker.io/docker/dockerfile:1
#4 DONE 1.2s

#5 [web] docker-image://docker.io/docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
#5 resolve docker.io/docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e 0.0s done
#5 CACHED

#6 [web internal] load metadata for docker.io/library/node:22-slim
#6 DONE 0.9s

#7 [web internal] load .dockerignore
#7 transferring context: 99B 0.0s done
#7 DONE 0.0s

#8 [migrate internal] load .dockerignore
#8 transferring context: 90B done
#8 DONE 0.0s

#9 [migrate internal] load build context
#9 transferring context: 2.62kB done
#9 DONE 0.0s

#10 [web build 1/6] FROM docker.io/library/node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
#10 resolve docker.io/library/node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 0.0s done
#10 DONE 0.0s

#11 [migrate stage-1 5/7] COPY --from=build /app/dist ./dist
#11 CACHED

#12 [migrate build 10/10] RUN npm run build
#12 CACHED

#13 [migrate stage-1 3/7] RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
#13 CACHED

#14 [migrate build  9/10] COPY src ./src
#14 CACHED

#15 [migrate build 2/6] WORKDIR /app
#15 CACHED

#16 [migrate stage-1 6/7] COPY --from=build /app/prisma ./prisma
#16 CACHED

#17 [migrate build  7/10] RUN npx prisma generate
#17 CACHED

#18 [migrate build  8/10] COPY tsconfig.json tsconfig.build.json ./
#18 CACHED

#19 [migrate build  3/10] RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
#19 CACHED

#20 [migrate build  6/10] COPY prisma ./prisma
#20 CACHED

#21 [migrate build  5/10] RUN npm ci
#21 CACHED

#22 [migrate stage-1 4/7] COPY --from=build /app/node_modules ./node_modules
#22 CACHED

#23 [migrate build  4/10] COPY package.json package-lock.json ./
#23 CACHED

#24 [migrate stage-1 7/7] COPY package.json ./
#24 CACHED

#25 [migrate] exporting to image
#25 exporting layers done
#25 exporting manifest sha256:5694a89f743772bfce9ff819e7aa2ab9d50b663d5fc8dd009e35ef89d4cea073 done
#25 exporting config sha256:46ec364c3a4633ed6d38c37d82371b38b2b0dcf5ccdaf94350cd7f9d576e8cc5 done
#25 exporting attestation manifest sha256:5f483381ee160a1625a40724d78e06df6fd29a65398b5152bb9a3e23804e5205 0.0s done
#25 exporting manifest list sha256:adad988e5f8a5c36f0e32f86a6f522cf2ca40bfc5d0e25558f469a4002779f6e 0.0s done
#25 naming to docker.io/library/onb-backend:latest done
#25 unpacking to docker.io/library/onb-backend:latest 0.0s done
#25 DONE 0.1s

#26 [web internal] load build context
#26 transferring context: 6.51kB 0.0s done
#26 DONE 0.0s

#27 [web build 4/6] RUN npm ci
#27 CACHED

#28 [web build 3/6] COPY package.json package-lock.json ./
#28 CACHED

#15 [web build 2/6] WORKDIR /app
#15 CACHED

#29 [web build 5/6] COPY . .
#29 CACHED

#30 [web build 6/6] RUN npm run build
#30 ...

#31 [migrate] resolving provenance for metadata file
#31 DONE 0.0s

#30 [web build 6/6] RUN npm run build
#30 0.365 
#30 0.365 > reachinbox-scheduler-frontend@0.1.0 build
#30 0.365 > next build
#30 0.365 
#30 0.804 ▲ Next.js 16.4.0 (Turbopack)
#30 0.898 ✓ Running next.config.ts took 93ms
#30 0.914 - Cache Components enabled
#30 0.914 - Partial Prefetching enabled
#30 0.914 - Experiments (use with caution):
#30 0.914   · instantInsights
#30 0.914 
#30 0.946   Creating an optimized production build ...
#30 7.545 ✓ Compiled successfully in 6.6s
#30 7.552   Running TypeScript ...
#30 12.73   Finished TypeScript in 5.1s ...
#30 12.73   Collecting page data using 11 workers ...
#30 14.02   Generating static pages using 11 workers (0/13) ...
#30 15.13   Generating static pages using 11 workers (3/13) 
#30 15.14   Generating static pages using 11 workers (6/13) 
#30 15.32   Generating static pages using 11 workers (9/13) 
#30 15.47 ✓ Generating static pages using 11 workers (13/13) in 1449ms
#30 15.48   Finalizing page optimization ...
#30 15.88 
#30 15.88 Route (app)
#30 15.88 ┌ ○ /
#30 15.88 ├ ○ /_not-found
#30 15.88 ├ ○ /dashboard
#30 15.88 ├ ○ /dashboard/campaigns
#30 15.88 ├ ○ /dashboard/compose
#30 15.88 ├   /dashboard/emails/[id]
#30 15.88 │ └ ◐ /dashboard/emails/[id]
#30 15.88 ├ ○ /dashboard/overview
#30 15.88 ├ ○ /dashboard/scheduled
#30 15.88 ├ ○ /dashboard/senders
#30 15.88 ├ ○ /dashboard/sent
#30 15.88 ├ ○ /dashboard/settings
#30 15.88 └ ○ /icon.svg
#30 15.88 
#30 15.88 
#30 15.88 ○  (Static)             prerendered as static content
#30 15.88 ◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
#30 15.88 
#30 DONE 16.0s

#15 [web build 2/6] WORKDIR /app
#15 CACHED

#32 [web stage-1 3/4] COPY --from=build /app/.next/standalone ./
#32 DONE 0.6s

#33 [web stage-1 4/4] COPY --from=build /app/.next/static ./.next/static
#33 DONE 0.1s

#34 [web] exporting to image
#34 exporting layers
#34 exporting layers 1.7s done
#34 exporting manifest sha256:88f167dece04df21812a66fc8b376a8db25041a720b43f6c77241aa6f4b1d6b5 0.0s done
#34 exporting config sha256:21669435a906c1d569d5f1893eb6e07b0e153eeaaa4c441fe9bb09a1e9ccc93c 0.0s done
#34 exporting attestation manifest sha256:749ec7bc75370fca6ad12da4da5e421ed392aeab7c4c7e44af0374886d3d1576
#34 exporting attestation manifest sha256:749ec7bc75370fca6ad12da4da5e421ed392aeab7c4c7e44af0374886d3d1576 0.0s done
#34 exporting manifest list sha256:d68b831b4f627d2c89b6e455aa5e9495286ed506e87cabd01eebb38c20c095f7 0.0s done
#34 naming to docker.io/library/onb-frontend:latest done
#34 unpacking to docker.io/library/onb-frontend:latest
#34 unpacking to docker.io/library/onb-frontend:latest 0.5s done
#34 DONE 2.3s

#35 [web] resolving provenance for metadata file
#35 DONE 0.0s
Add  to the Google OAuth client's authorized JavaScript origins, and use
 as the Slack redirect URL. Migrations run automatically
before the API and worker start.

## Testing

```bash
cd backend && npm run test        # vitest run
cd frontend && npm run test
```

Covered, deliberately kept small and targeted rather than broad and shallow:

- `tests/rateLimiter.test.ts` — the Lua limiter under concurrent access (N parallel callers never
  exceed the cap), min-spacing enforcement, window rollover.
- `tests/scheduler.test.ts` — the hour-window planner: round-robin assignment, overflow into the
  next window, respecting pre-existing load.
- `tests/worker.integration.test.ts` — the claim guard rejects a second concurrent claim, a
  `RATE_LIMITED` job is deferred not dropped, permanent vs. retryable SMTP failures.
- `tests/reconciler.integration.test.ts` — missing BullMQ jobs are rebuilt from Postgres, stale
  `PROCESSING` claims are recovered or correctly marked ambiguous.
- `tests/slack.integration.test.ts` — one alert per sender per hour window, not one per deferred
  job.
- `frontend/src/lib/recipients.test.ts` — CSV/TXT parsing: header detection, headerless
  single-column files, duplicate/invalid handling.

## Load testing

```bash
cd backend
npm run db:seed -- you@gmail.com 2      # if you haven't already
npm run load:seed -- --email you@gmail.com --count 1000 --limit 200
# overbook on purpose, across two campaigns created at the same instant:
npm run load:seed -- --email you@gmail.com --count 1000 --limit 200 --parallel 2
```

The script reports the planner's own numbers (how many were pushed to a later window, the planned
end time) and then the actual per-sender-per-hour distribution read straight back out of Postgres,
so you can see the plan and the result side by side. Recipients use the reserved `.test` TLD — see
`backend/scripts/seed-load.ts` for all flags.

## Assumptions, shortcuts and trade-offs

- **Fixed vs. sliding rate-limit window.** Documented above — a fixed UTC-hour window allows a
  worst-case ~2× burst across two adjacent windows. Chosen because the assignment's cap is
  explicitly hourly, and because the planner schedules proactively around the same windows, so the
  burst case only arises from genuinely concurrent, uncoordinated campaign creation.
- **Ethereal's own limits.** Ethereal is a throwaway test SMTP service with no published SLA or
  guaranteed throughput; large-scale sending (10k+/hour) was validated against the *scheduling and
  rate-limiting* pipeline (which doesn't care what's on the other end of the SMTP connection), not
  against Ethereal's actual mail-acceptance rate at that volume.
- **Secrets encrypted with a single symmetric key from the environment** (`ENCRYPTION_KEY`),
  not a KMS with envelope encryption and key rotation. Appropriate for a demo/assignment scope;
  a production deployment would want per-tenant keys and rotation.
- **Screens beyond the Figma.** The design covers login, the mailbox, the reading view and
  compose. Overview, Campaigns, Senders and Settings are not in it; they reuse its tokens and
  components, and are the part of the UI that is interpretation rather than reproduction.
- **Attachments live in Postgres** (`bytea`), capped at 5 MB each, 5 per campaign and 10 MB in
  total. That keeps a campaign's files transactional with the campaign and the restart story
  simple; an object store would be the next step for larger files.
- **Rich text is sanitized on the server** to the tags and styles the editor can produce, and
  sent with a plain-text alternative.
- **Email sign-up is open and unverified.** Anyone can create an account with an address; there
  is no confirmation email. Google accounts are protected from takeover by this path.
- **No multi-tenant isolation beyond per-user scoping.** Every query is scoped by `userId`, but
  there's no org/workspace concept, row-level security, or per-tenant resource quotas.
- **No template engine, no unsubscribe/bounce handling.** Out of scope for a scheduler whose job
  is proving exactly-once delivery under load, not building an ESP.
- **Slack `incoming-webhook` scope only**, not a full bot — simpler OAuth, no message history/
  threading, but also no over-broad permissions for what this needs (one outbound alert).

## What I'd build next with more time

1. **Sliding-window or token-bucket rate limiter** to remove the fixed-window boundary burst
   entirely, still in a single atomic Lua script.
2. **Bounce/webhook handling** — a provider webhook endpoint that moves `SENT` to a `BOUNCED`
   state, closing the loop that Ethereal (by design) can't exercise.
3. **Per-campaign analytics** — delivery-time histograms, per-sender success rate over time, not
   just point-in-time counts.
4. **Horizontal worker scaling in practice** — a `docker-compose` profile that runs N worker
   replicas behind the same Redis/Postgres, with a small script to demonstrate throughput scaling
   linearly with worker count.
