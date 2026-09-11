# Fit Kid Hooper — Product Analytics

Lightweight instrumentation for learning from the first ~100 users. Uses the same Supabase project as the leaderboard — no third-party analytics SDK.

## Goals

| Question | Events / views |
|----------|----------------|
| Are kids returning? | `session_start`, `analytics_dau`, `analytics_wau`, `analytics_retention` |
| What features do they use? | `screen_view`, `analytics_top_screens` |
| What drives improvement? | `exercise_complete`, `shot_session`, `program_session_complete` |
| What builds habits? | `mission_claim`, `workout_complete`, `analytics_training_days_per_week` |
| Parent / kid feedback? | `feedback` table, Settings → Feedback Center |

## Setup

1. Run `supabase/schema.sql` (leaderboard) if not already applied.
2. Run `supabase/analytics.sql` in the Supabase SQL editor.
3. Run `supabase/storage.sql` for the `fkh-videos` bucket.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same as leaderboard).
4. Optional: `VITE_APP_VERSION` for release tagging; `VITE_ADMIN_DASHBOARD_KEY` for dashboard access.

## Privacy (COPPA-conscious)

- **No names, DOB, or avatars** are sent in events or feedback.
- **Device UUID** (`fkh-athlete-id`) links events on one device only.
- **Age group** bracket (`u10` / `u12` / `u14` / `u17` / `adult` / `unknown`) is optional segmentation — same as leaderboard. `adult` is 18+; the app is youth-first but coaches, parents and older siblings train in it too. Guarded by a `CHECK` constraint on `events`, `athlete_analytics`, `leaderboard_stats` and `athlete_profiles` — a bracket the client emits but the constraint rejects loses the write silently, so `npm run verify:consent-age` asserts the two stay in step.
- Feedback messages are optional free text — avoid entering real names.

Before a broader launch, tighten RLS `SELECT` policies on `events` and `feedback` (currently open for small-team MVP).

## Client API

```js
import { track, trackScreen, trackExerciseComplete, initAnalytics } from "./lib/analytics.js";
import { ANALYTICS_EVENTS } from "./lib/analyticsTypes.js";
```

| Function | Purpose |
|----------|---------|
| `initAnalytics({ ageGroup, isStandalone })` | Session start, flush timer, offline queue |
| `track(name, props)` | Queue event for batched upload |
| `trackScreen(screen)` | `screen_view` |
| `trackExerciseComplete(id, source)` | `exercise_complete` + first-time activation |
| `submitFeedback({ rating, sentiment, category, message })` | Direct insert to `feedback` |

Events are queued in `localStorage` (`fkh-analytics-queue`) and flushed every 30s, on background, or when the queue reaches 40 items.

## Tracked events

| Event | When |
|-------|------|
| `session_start` | App load / return from background |
| `session_end` | Tab hidden / page unload |
| `screen_view` | Tab or major view change |
| `onboarding_complete` | First-run name flow finished |
| `onboarding_tour_complete` | Guided app tour finished or skipped through last step |
| `first_exercise_complete` | First drill ever checked off |
| `exercise_complete` | Any drill marked done |
| `mission_claim` | Daily mission auto-claimed |
| `program_enroll` | Start Program tapped |
| `program_session_complete` | All exercises in a program session done |
| `challenge_complete` | Challenge threshold met (once per challenge) |
| `badge_earn` | New badge unlocked |
| `workout_complete` | Quick workout template fully done for the day |
| `shot_session` | Shot batch logged |
| `video_play` | Exercise video played |
| `level_up` | XP rank increased |
| `leaderboard_push` | Opt-in stats push to Ranks |

## Sprint funnel (product decisions → behavior)

Five lightweight events to validate whether home UX changes actually move kids through practice. All use the same offline queue as everything else — no new SDK.

| Step | Event | When | Key properties |
|------|-------|------|----------------|
| 1 | `home_viewed` | Today tab opened | — |
| 2 | `cta_clicked` | Primary home CTA tapped | `cta_id`, `location` (always `home` for now) |
| 3 | `practice_started` | Multi-drill session opened | `source`, `exercise_count`, `program_id?` |
| 4 | `practice_finished` | All drills in that session marked done | `source`, `exercise_count`, `duration_sec` |
| 5 | `mission_completed` | All required mission tasks done (auto-claim) | `mission_day`, `bonus_xp`, `title` |

`mission_claim` still fires alongside `mission_completed` for backward compatibility with existing views.

### `cta_id` values (home)

| `cta_id` | Button |
|----------|--------|
| `start_practice` | Orange "Start Today's Practice" / "Continue session" hero CTA |
| `coach_fkh` | Coach FKH bar |
| `squad_activity` | Squad updates banner |
| `mission_start_session` | Mission card → Start session |
| `program_start_session` | My Programs → Start session |
| `start_workout` | Quick Workout → Start Workout |
| `try_workout_template` | Challenge nudge → Try X workout |
| `bonus_workout` | Post-mission Keep Going → Bonus Workout |

### `source` values (practice)

| `source` | Entry point |
|----------|-------------|
| `mission` | Hero CTA → mission drill list |
| `mission_task` | Mission task chip |
| `program` | Program session (mission or My Programs) |
| `workout` | Quick Workout template |
| `schedule` | Today's Training day plan (non-program) |

### Example funnel query (Supabase SQL)

```sql
-- Unique athletes per funnel step, last 7 days
select
  count(distinct athlete_id) filter (where event_name = 'home_viewed') as home,
  count(distinct athlete_id) filter (where event_name = 'cta_clicked') as cta,
  count(distinct athlete_id) filter (where event_name = 'practice_started') as practice_start,
  count(distinct athlete_id) filter (where event_name = 'practice_finished') as practice_finish,
  count(distinct athlete_id) filter (where event_name = 'mission_completed') as mission
from public.events
where created_at > now() - interval '7 days'
  and event_name in ('home_viewed','cta_clicked','practice_started','practice_finished','mission_completed');
```

```js
import { trackCtaClicked, trackHomeViewed, trackPracticeStarted } from "./lib/analytics.js";
```

## SQL views (Supabase SQL editor)

| View | Metric |
|------|--------|
| `analytics_dau` | Daily active users |
| `analytics_wau` | Weekly active users |
| `analytics_mau` | Monthly active users |
| `analytics_retention` | D1 / D7 / D30 by cohort |
| `analytics_sessions_per_week` | Avg sessions per athlete |
| `analytics_training_days_per_week` | Avg training days per athlete |
| `analytics_top_screens` | Feature usage |
| `analytics_top_exercises` | Most completed drills |
| `analytics_top_programs` | Program session completions |
| `analytics_mission_completion` | Mission claim rate |
| `analytics_challenge_completion` | Per-challenge completions |
| `analytics_badge_distribution` | Badge earn counts |
| `analytics_onboarding_daily` | Profile setup vs tour completion by day |
| `analytics_onboarding_funnel` | Tour completion rate among onboarded athletes |
| `analytics_athlete_summary` | Active / new / total athletes |
| `feedback_summary` | Ratings and sentiment (+ open bug/feature counts) |
| `feedback_backlog` | Actionable bugs, features, and substantive general |
| `feedback_open_bugs` | Open / triaged / in-progress bugs |
| `feedback_open_features` | Open / triaged / in-progress feature ideas |
| `feedback_feature_requests` | Feature ideas |
| `feedback_bugs` | Bug reports |
| `feedback_general` | General feedback |

### Example queries

```sql
-- Last 7 days DAU
select * from analytics_dau limit 7;

-- Retention for recent cohorts
select cohort_day, cohort_size, d1_pct, d7_pct, d30_pct
from analytics_retention
order by cohort_day desc
limit 14;

-- Top exercises this month
select * from analytics_top_exercises limit 20;

-- Onboarding funnel (profile setup → guided tour)
select * from analytics_onboarding_funnel;

-- Daily onboarding events
select * from analytics_onboarding_daily limit 14;
```

## In-app surfaces

- **Feedback Center** — Me → Send feedback, Help → Send feedback, or Settings → Open Feedback Center (thumbs, 1–5 stars, category, message).
- **Admin dashboard** — `https://app.legendsyba.com/?admin=YOUR_KEY` (key in GitHub secrets / `.env.local`). Click any stat card or table row to drill down; nested drill opens athlete event timelines. **Live event feed** in the header shows the latest 100 events.

## Telegram alerts (founder)

Get a phone ping when someone submits a **bug**, **feature idea**, or substantive general feedback (message or 👎).

### One-time setup

1. **Reuse your Sentinel FX bot** (or create one via [@BotFather](https://t.me/BotFather)) — note the bot token.
2. **Chat ID** — message the bot from your phone, then open:
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id`.
3. **Deploy the edge function** (from repo root, Supabase CLI linked):
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=your_token TELEGRAM_CHAT_ID=your_chat_id
   supabase functions deploy notify-telegram --no-verify-jwt
   ```
4. **Apply the DB trigger** — run `supabase/feedback_telegram.sql` in the Supabase SQL editor.

### What you receive

Example Telegram message:

```
🐛 Bug report
App 1.0.0 · ★ 2/5 · 👎

Week 2 drills don't show after I tapped Update
```

Silent skips: empty general feedback with only a thumbs-up and no message.

Bot credentials are read from Sentinel FX `scripts/.outage_secrets` (`OUTAGE_ALERT_WEBHOOK`) — same @RyhansBot, stored as Supabase edge secrets (never in git).

### Triage dataset (bugs & feature backlog)

Run `supabase/feedback_triage.sql` (applied on prod). Each submission gets:

| Field | Purpose |
|-------|---------|
| `status` | `open` → `triaged` → `in_progress` → `done` / `wont_fix` |
| `admin_notes` | Your notes (SQL or RPC) |
| `message`, `category`, `app_version`, `athlete_id` | From the athlete |

**Export for Cursor / planning:**

```sql
-- Full actionable backlog (bugs + features + substantive general)
select * from feedback_backlog;

-- Open bugs only
select * from feedback_open_bugs;

-- Open feature ideas
select * from feedback_open_features;

-- Mark done after you ship a fix
select update_feedback_triage(
  'feedback-uuid-here'::uuid,
  'done',
  'Fixed in commit abc123'
);
```

Admin dashboard shows **Open backlog**, **Open bugs**, **Open features**, and a backlog table with status.

### Triage workflow

1. Telegram ping on your phone
2. Full list in **admin dashboard** → Bugs / Feature requests cards
3. Paste into Cursor for fixes, or query:
   ```sql
   select * from feedback_bugs order by created_at desc limit 20;
   ```

## Integration map

| Location | Tracking |
|----------|----------|
| `SummerTrainingApp` mount | `initAnalytics`, `screen_view` |
| `toggle()` / program exercise | `exercise_complete` |
| Mission auto-claim effect | `mission_claim` |
| `enrollProg()` | `program_enroll` |
| Program progress effect | `program_session_complete` |
| Challenge effect | `challenge_complete` |
| Badge celebration effect | `badge_earn` |
| Quick workout complete effect | `workout_complete` |
| Onboarding button | `onboarding_complete` |
| Tour finish / skip | `onboarding_tour_complete` |
| `ShotTracker.logBatch` | `shot_session` |
