# Telegram Feedback Alerts — Operations

**Status:** Live. `notify-telegram` ACTIVE, `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` set.
**Function:** `supabase/functions/notify-telegram/`
**Trigger:** `supabase/feedback_telegram.sql` → `feedback_telegram_notify` on `public.feedback`
**Project:** FKH Supabase `jjwaspyuldkwasfyrqbw`
**Setup instructions:** `docs/ANALYTICS.md` → "Telegram alerts (founder)"

---

## What it does

An athlete submits feedback in the app. An `after insert` trigger on `public.feedback`
calls `net.http_post` to the `notify-telegram` edge function, which posts to the
Telegram Bot API. The founder gets a phone ping carrying category, app version, star
rating, sentiment, the message text, and the first 8 characters of the feedback id.

It fires for `bug` and `feature_request` always, and for `general` only when there is
a 👎 or actual message text — so a bare 5-star tap stays quiet.

---

## Deferred work

### 1. The shared secret is a literal in a public repo

`notify-telegram` runs with `--no-verify-jwt`, so the only thing authenticating a
caller is a hardcoded string compared in the function body. That same string, and the
project's anon key, sit in `supabase/feedback_telegram.sql`, which is committed to a
public repo under `legendsyba`.

Anyone who reads the repo can post arbitrary feedback alerts to the founder's phone.
No data is exposed and nothing is written to the database — the blast radius is spam
to one chat — which is why this is deferred rather than urgent.

The fix, roughly 20 minutes:

1. `supabase secrets set FKH_NOTIFY_SECRET=<new random value>`
2. In `notify-telegram/index.ts`, replace the `NOTIFY_SECRET` constant with
   `Deno.env.get("FKH_NOTIFY_SECRET")`, and fail closed (503) when it is unset
   rather than comparing against `undefined`.
3. `supabase functions deploy notify-telegram --no-verify-jwt`
4. In `feedback_telegram.sql`, stop inlining the secret and the anon key. Read both
   from a Postgres setting or Vault entry so the SQL can stay in the repo without
   carrying credentials, then re-run it in the SQL editor to replace the function.
5. Verify by submitting feedback in the app and confirming the ping still arrives.

Steps 3 and 4 must land together — the function will reject the old secret the moment
it is redeployed, so the trigger goes deaf until the SQL is re-run.

### 2. The bot and chat are personally owned

The bot token is the founder's personal bot (shared with Sentinel FX) and
`TELEGRAM_CHAT_ID` points at the founder's own chat. This is the last FKH service
still on a personal account rather than a Legends one.

Moving it does not require a code change: create a Telegram group, add the bot, and
re-set `TELEGRAM_CHAT_ID` to the group's id. Worth doing whenever someone other than
the founder needs to see incoming feedback. A Legends-owned bot would be cleaner
still, but means a new token and a redeploy.
