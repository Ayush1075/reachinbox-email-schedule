# Demo video script (~5 minutes)

## Before recording — terminals and tabs to have open

1. **Terminal A** — repo root: `docker compose up -d` already run; keep it free for
   `docker compose ps` / Redis flush later.
2. **Terminal B** — `backend/`: `npm run dev:api` (API only, not the combined `dev`, so the
   worker can be killed independently on camera).
3. **Terminal C** — `backend/`: `npm run dev:worker`.
4. **Terminal D** — `backend/`: free, for `npm run load:seed -- ...`.
5. **Browser tab 1** — `http://localhost:3000` (the app).
6. **Browser tab 2** — `http://localhost:4000/admin/queues` (Bull Board, logged in with basic
   auth beforehand so the prompt doesn't interrupt the recording).
7. **Browser tab 3** — the connected Slack channel.
8. Have a `.csv` of a few hundred throwaway addresses ready on disk for the upload step.

Seed at least one Google-linked user with 2 Ethereal senders beforehand
(`npm run db:seed -- you@gmail.com 2`) so sign-in has something to land on.

## Shot list

**0:00–0:30 — Google login**
Open tab 1, show the login page, sign in with Google. Call out: real OAuth, httpOnly session
cookie, no mock auth path.

**0:30–1:00 — Dashboard tour**
Point out the stat cards (Total Scheduled / Sent Today / Failed / current-hour quota meter —
note it's reading the *same Redis keys the rate limiter itself increments*, not a separate
estimate), the Scheduled/Sent tabs (URL-synced — refresh the page to show the tab survives it),
and the Slack pill in the header.

**1:00–2:00 — Compose with CSV upload**
Click "Compose New Email." Drag in the prepared CSV. Call out the live "N valid email addresses
detected" count plus any invalid-row count. Fill in subject/body, pick both Ethereal senders, set
start time ~1 minute out, set a delay and hourly limit that will force at least one sender into a
second hour window. Point at the live schedule preview line ("X emails · N senders · ... →
completes in ~Y, finishing around HH:MM"). Submit.

**2:00–2:45 — Watch it work**
Back on the dashboard, show rows in the Scheduled tab, then — as the start time arrives — watch
rows move to the Sent tab (5s poll). Click a **Preview** link on a sent row; it opens the actual
rendered email in Ethereal's viewer in a new tab. This is the single most convincing "it's real"
moment — don't rush it.

**2:45–3:15 — Bull Board**
Switch to tab 2. Show delayed jobs waiting, one active, completed count climbing. This is the
same queue the dashboard is driven by, viewed directly.

**3:15–4:15 — Kill the worker, show restart safety**
In Terminal C, `Ctrl+C` the worker *only* (API in Terminal B stays up — the dashboard keeps
responding). Point at a campaign still mid-flight: show jobs sitting in
Scheduled/Bull Board's "delayed," not advancing. Restart the worker (`npm run dev:worker`). Show
sending resumes exactly where it left off — no gaps, no duplicate rows in Sent. Say out loud:
*nothing was lost, nothing was sent twice.*

**4:15–4:45 — Load script + rate-limit deferral + live Slack alert**
In Terminal D:
```bash
npm run load:seed -- --email you@gmail.com --count 1000 --limit 50 --parallel 2
```
`--parallel 2` deliberately overbooks the current hour (two campaigns planned independently,
together exceeding the 50/hour cap per sender). Watch emails flip to `RATE_LIMITED` in the
dashboard/Bull Board, then get rescheduled into the next hour window. Switch to tab 3 (Slack) and
show the alert arriving — one message per sender for the whole window, not one per deferred job.

**4:45–5:00 — Close**
Say what's not shown (see README → "What I'd build next"), and where the README covers anything
skipped for time (architecture, API reference, env vars).

## Lines worth saying out loud

- "This is BullMQ delayed jobs, not cron — the schedule lives in Redis as data, not as a process
  that has to keep running."
- "The quota meter on the dashboard and the limiter that's actually enforcing the cap read the
  exact same Redis keys — it's not a separate guess."
- "I just killed the worker process, not the whole app — the API and the schedule are still
  fine. That's on purpose: it's how this scales horizontally."
- "Nothing got dropped for hitting the limit — it got rescheduled into the next hour, in order,
  and Slack told me about it exactly once."
