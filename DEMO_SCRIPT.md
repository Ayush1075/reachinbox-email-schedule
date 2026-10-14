# Demo video: what to run, what to do, what to say (~7 minutes)

Live site: https://onb-scheduler.duckdns.org

The point of the video: **an email is sent exactly once, at about the right time, even when the
worker dies, Redis is wiped, or the hourly limit is hit.** Every segment below proves one part of
that. Read the "Say" lines in your own words; they are a guide, not a teleprompter.

---

## Part 1: Slack setup (do this once, before recording)

Slack needs an HTTPS redirect URL, and your site already has one, so no tunnel is needed.

1. In Slack, create a channel for alerts, e.g. `#onb-alerts`.
2. Go to https://api.slack.com/apps -> **Create New App** -> **From scratch**. Name it
   `ONB Scheduler`, pick your workspace.
3. **Basic Information** -> copy the **Client ID** and **Client Secret**.
4. **OAuth & Permissions** -> **Redirect URLs** -> **Add New Redirect URL**:
   `https://onb-scheduler.duckdns.org/api/slack/callback` -> **Add** -> **Save URLs**.
5. **Features -> Incoming Webhooks** -> switch **Activate Incoming Webhooks** to **On**.
   (That is what grants the `incoming-webhook` scope the app asks for.)
6. Put the credentials on the server (PowerShell on your PC):

   ```powershell
   cd C:\Users\admin\source\reachinbox-email-scheduler
   $key = "C:\Users\admin\Downloads\ssh-key-2026-10-14 (1).key"
   $vm  = "ubuntu@129.225.107.142"
   ssh -i $key $vm
   ```
   Then on the server:
   ```bash
   cd ~/onb
   nano .env.prod
   ```
   Fill in these three lines (no spaces, no quotes), then **Ctrl+O, Enter, Ctrl+X**:
   ```
   SLACK_CLIENT_ID=<client id>
   SLACK_CLIENT_SECRET=<client secret>
   SLACK_REDIRECT_URI=https://onb-scheduler.duckdns.org/api/slack/callback
   ```
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build --force-recreate api worker
   exit
   ```
7. In the app: **Settings -> Slack alerts -> Connect Slack**. Slack asks which channel to post to
   (choose `#onb-alerts`) -> **Allow**. You land back on Settings showing "Posting to #onb-alerts".
8. Click **Send test notification** and confirm the message appears in Slack.

If Slack says "redirect_uri did not match", the URL in step 4 and `SLACK_REDIRECT_URI` must be
identical, character for character.

---

## Part 2: Preparation (10 minutes before recording)

### Files on your Desktop

Run in PowerShell. This creates a list with 18 good addresses, 1 duplicate and 2 invalid rows, so
the upload screen has something to show:

```powershell
$rows = @("Name,Email")
1..18 | ForEach-Object { $rows += "Lead $_,lead$_@acme-demo.com" }
$rows += "Duplicate,lead1@acme-demo.com"
$rows += "Broken,not-an-email"
$rows += "Also broken,missing@"
$rows | Set-Content -Encoding utf8 "$env:USERPROFILE\Desktop\leads.csv"

"A short attachment for the demo." | Set-Content "$env:USERPROFILE\Desktop\one-pager.txt"
```

### Windows to have open (arrange side by side)

| Window | What |
| --- | --- |
| Browser tab 1 | https://onb-scheduler.duckdns.org (signed out, so you show the login) |
| Browser tab 2 | https://onb-scheduler.duckdns.org/admin/queues (user `admin`, password from `.env.prod`, already signed in) |
| Browser tab 3 | Slack, with `#onb-alerts` open |
| PowerShell | In the repo folder, with the variables below already set |

In the PowerShell window, set these once so the commands are short:

```powershell
cd C:\Users\admin\source\reachinbox-email-scheduler
$key = "C:\Users\admin\Downloads\ssh-key-2026-10-14 (1).key"
$vm  = "ubuntu@129.225.107.142"
$dc  = "cd ~/onb && docker compose -f docker-compose.prod.yml --env-file .env.prod"
```

Check everything is healthy: `ssh -i $key $vm "$dc ps"` should list every service as Up.

### Recording tips
- 1080p, browser zoom 110 to 125 percent, close other tabs and notifications.
- Make the PowerShell font large. Pause 1 second after each command so viewers can read it.
- Do not run the rate-limit step in the last 2 minutes of an hour (the window rolls over).
- Do a full dry run once. Anything you create is harmless.

---

## Part 3: The video

### 0:00 - 0:30 Intro

**Do:** Show the login page. No clicking yet.

**Say:** "This is a scheduler for outbound email. You schedule an email or a whole campaign for a
future time, and it goes out exactly once, even if something crashes. It is built on BullMQ delayed
jobs, not cron, with Postgres as the source of truth and Redis holding the timers. I'll show the
product first, and then break it on purpose."

### 0:30 - 1:00 Sign in and tour

**Do:** Click **Login with Google** and sign in. You land on the Scheduled mailbox. Point at the
sidebar: Scheduled and Sent with live counts, then click **Overview** and back.

**Say:** "Real Google sign-in, with an httpOnly session cookie. There is email and password too.
The sidebar counts update live. The mailbox polls every few seconds, so you will see rows move on
their own."

### 1:00 - 2:30 Compose and schedule

**Do:**
1. Click **Senders** in the sidebar -> **Add Ethereal sender** (skip if you already have one).
   Say: "Ethereal is a fake SMTP inbox. The send path is real SMTP, but nothing reaches real people."
2. Click **Compose**.
3. Click **Upload List** and choose `leads.csv`.
   Point at "18 valid email addresses from leads.csv - 2 invalid skipped - 1 duplicate removed".
4. Type a subject. In the body, type a sentence and make part of it **bold** with the toolbar.
5. Click the **paperclip** and attach `one-pager.txt`.
6. Set **Delay between 2 emails** to `2` and **Hourly Limit** to `10`.
7. Point at the schedule preview line (it will turn amber: 18 emails against a cap of 10/hour
   moves some to the next hour).
8. Change **Hourly Limit** back to `200`. The preview turns neutral again.
9. Click the **clock** icon -> choose **Pick date & time** -> pick today, set the time about 1
   minute from now -> **Done**. The button now reads **Send Later**.
10. Click **Send Later**.

**Say:** "The upload is parsed in the browser: invalid rows and duplicates are reported before
anything is sent. The schedule preview is the same planner the server uses, so it tells me up front
when the hourly limit will spread a campaign across hours. Nothing is dropped; it is rescheduled."

### 2:30 - 3:30 Watch it send

**Do:** On **Scheduled**, show the 18 rows with their time pills. Wait for the start time. Rows
disappear from Scheduled and the Sent count goes up. Click **Sent**, then open one email. Click
**View delivered message in Ethereal** (new tab) and show the rendered email with the attachment.

**Say:** "Rows move from Scheduled to Sent by themselves. This link opens the real message as
delivered, with the bold text and the attachment, so you can see it is actually sent, not just a
status badge."

### 3:30 - 4:00 Overview and Bull Board

**Do:** Click **Overview**. Point at the stat cards, the **Hourly quota** panel and the throughput
chart. Switch to browser tab 2 (Bull Board) and show the `email-send` queue with completed jobs.

**Say:** "The quota panel reads the exact Redis counters the rate limiter increments, so it is the
limiter's real state, not an estimate. This is Bull Board, the live view of the queue."

### 4:00 - 5:15 Kill the worker (restart safety)

**Do:**
1. In PowerShell, stop only the worker:
   ```powershell
   ssh -i $key $vm "$dc stop worker"
   ```
2. In the app, **Compose** -> **Upload List** with `leads.csv` -> subject `Worker down test` ->
   body any text -> click **Send** (no Send Later).
3. Show **Scheduled**: all 18 emails are there and **not** sending. Show Bull Board: 18 jobs
   waiting.
4. Start the worker again:
   ```powershell
   ssh -i $key $vm "$dc start worker"
   ```
5. Watch Scheduled empty out into Sent. Open **Campaigns**: the campaign shows 18 / 18 delivered.

**Say:** "I just killed the worker, and the API is still up. The emails are not lost: they are
sitting in Postgres and in Redis. When the worker comes back it picks up exactly where it left
off. Eighteen in, eighteen out, no duplicates. Duplicate sends are blocked at three layers: a
deterministic job ID, a conditional database claim, and a Redis sent marker."

### 5:15 - 6:00 Wipe Redis (reconciler)

**Do:**
1. Compose a campaign for a couple of minutes ahead (use **Send Later** with a custom time about
   3 minutes out), with a few addresses from `leads.csv`.
2. Wipe Redis completely:
   ```powershell
   ssh -i $key $vm "$dc exec -T redis redis-cli FLUSHALL"
   ```
3. Show Bull Board: the queue is empty. Show **Scheduled** in the app: the emails are still
   listed.
4. Run the worker boot sweep by restarting the worker:
   ```powershell
   ssh -i $key $vm "$dc restart worker"
   ```
5. Refresh Bull Board: the delayed jobs are back. Wait for the time; they send.

**Say:** "Now I deleted every timer. Redis is empty. But Postgres still has the truth, and a
reconciler sweeps it on startup, finds jobs with no timer, and rebuilds them. The IDs are
deterministic, so rebuilding something that already exists is harmless. That is how it survives
losing Redis entirely. The sweep is a safety net; scheduling itself is still only BullMQ delayed
jobs, no cron."

### 6:00 - 7:00 Rate limit and the Slack alert

**Do:**
1. Make sure Slack tab 3 is visible. Run the load script (the only command for this part;
   replace the email with the account you are signed in as):
   ```powershell
   Get-Content .\deploy\demo-load.cjs -Raw | ssh -i $key $vm "$dc exec -T -e DEMO_EMAIL=you@gmail.com -e DEMO_COUNT=30 -e DEMO_LIMIT=20 api node -"
   ```
   It creates a fresh sender capped at 20/hour and two 30-email campaigns at the same instant.
2. Go to **Overview**. Watch the quota panel for the new sender climb to `20 / 20`, turn red, and
   show the "emails deferred to the next window" notice.
3. Go to **Scheduled**, open the filter and pick **Deferred by rate limit**. Hover a pill to show the
   tooltip with the next window.
4. Switch to Slack: show the single alert.

**Say:** "I just scheduled two campaigns at the same instant for one sender capped at 20 per hour.
Each was planned without knowing about the other, so together they overbook the hour. This is
exactly what the runtime limiter is for: an atomic Redis Lua script that lets exactly 20 through.
The rest are not failed and not dropped. They are rescheduled into the next hour in their original
order, and Slack gets one message, not forty. One alert per sender per hour window."

### 7:00 - 7:30 Wrap up

**Do:** Open the README on GitHub (or the repo in your editor) and scroll through the section
headings briefly.

**Say:** "To recap: delayed jobs not cron, three layers of idempotency, an atomic rate limiter, a
reconciler that survives losing Redis, and graceful degradation for Elasticsearch and Slack. It has
tests for the limiter, planner, worker and reconciler, and the README has the architecture, the
load walkthrough and the trade-offs. Thanks for watching."

---

## Part 4: After recording

- Delete test senders and campaigns if you want a clean account (Senders -> Deactivate;
  Campaigns -> cancel).
- Nothing needs stopping; the stack restarts on its own after a reboot.

## If something goes wrong on camera

| Symptom | Fix |
| --- | --- |
| Emails not sending after you start the worker | `ssh -i $key $vm "$dc logs worker --tail 30"` |
| Slack alert never arrives | Settings: is Slack connected? Click Send test notification. The alert only fires when a sender hits its cap. |
| Quota panel does not reach the cap | Run the script again; it creates a fresh sender each time. |
| Load script says "No user with email" | Sign in to the app with that account once, and use the same email. |
| Google login fails | The site URL must be in Authorized JavaScript origins; your Google account must be a test user. |
| Site unreachable | `ssh -i $key $vm "$dc ps"` and check Caddy: `$dc logs caddy --tail 20` |
