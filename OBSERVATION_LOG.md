# FKH Fit Kid Hooper — Observation Log

**App:** https://app.legendsyba.com/  
**Backend:** [supabase.com](https://supabase.com) (one project for leaderboard + analytics + video hosting)  
**Goal:** Learn from real athlete behavior to drive product decisions for the first ~100 users.

---

## Observation Mode Rules

### Allowed
✅ Bug fixes  
✅ UX improvements (friction reduction)  
✅ Content additions (exercises, drills, coach tips, FKH videos)  
✅ Lightweight analytics and feedback (no enterprise stack)

### Still deferred (not RC2 scope unless data demands it)
❌ User accounts / login  
❌ Full cloud sync of local progress  
❌ Social features beyond opt-in leaderboard  
❌ Third-party analytics (Mixpanel, GA, PostHog)

---

## ✅ Supabase — LIVE (2026-06-17)

> **Project:** FTHFitKidHooper (`jjwaspyuldkwasfyrqbw`)  
> **Dashboard:** https://supabase.com/dashboard/project/jjwaspyuldkwasfyrqbw

Infrastructure is connected. The app sends events when athletes use it.

### Quick links

| Resource | URL |
|----------|-----|
| Production app | https://app.legendsyba.com/ |
| Admin dashboard | https://app.legendsyba.com/?admin=KEY *(key in your password manager / `.env.local`)* |
| Verify locally | `npm run verify:supabase` |

### Setup checklist (completed)

- [x] **A1–A4.** Supabase project, API keys, GitHub secrets, `.env.local`
- [x] **A5.** Admin dashboard key set (`VITE_ADMIN_DASHBOARD_KEY`)
- [x] **B1.** `supabase/schema.sql` — leaderboard
- [x] **B2.** `supabase/analytics.sql` — events, feedback, views
- [x] **B3.** `supabase/storage.sql` — `fkh-videos` bucket (public read)
- [x] **E1.** Production deploy with secrets

### Still on you (cannot be automated)

- [ ] **E2–E6.** Real athlete smoke test (browse, drill, feedback, check `events` table)
- [ ] **F1–F2.** Leaderboard push test (set name → Ranks → push stats)
- [ ] **G1–G2.** Tighten RLS before 100+ users (optional for now)
- [ ] **Observation window** — qualitative logs below (quotes, friction, parent context)
- [ ] **FKH videos** — film + upload to `fkh-videos` bucket (see `FKH_VIDEO_QUEUE.md`)
- [ ] **Calendar Tier 3** — only if product data demands it (`CALENDAR_ROADMAP.md`)

### SQL files (reference — already applied)

| File | Purpose |
|------|---------|
| `supabase/schema.sql` | Leaderboard tables |
| `supabase/analytics.sql` | Analytics + feedback + 17 views |
| `supabase/storage.sql` | FKH video bucket |

---

## What the app collects automatically (once Supabase is live)

### COPPA-conscious rules
- **No names, DOB, or avatars** in events or feedback payloads
- **Device UUID only** (`fkh-athlete-id` in localStorage) — same ID as leaderboard
- **Age bracket** (`u10` / `u12` / `u14` / `u17`) for segmentation — not exact age
- Feedback message is optional free text — remind athletes/parents not to include real names

### Events tracked (→ `events` table)

| Event | Product question it answers |
|-------|----------------------------|
| `session_start` / `session_end` | Are kids returning? How long are sessions? |
| `screen_view` | What features do they actually use? |
| `onboarding_complete` | Activation funnel |
| `first_exercise_complete` | Time-to-value |
| `exercise_complete` | Training volume, top drills, improvement signal |
| `mission_claim` | Habit formation (daily mission stickiness) |
| `program_enroll` | Program adoption |
| `program_session_complete` | Program completion funnel |
| `challenge_complete` | Challenge engagement |
| `badge_earn` | Milestone / progression |
| `workout_complete` | Quick workout completion |
| `shot_session` | Shooting practice volume |
| `video_play` | Exercise video opened (YouTube or FKH) |
| `level_up` | XP rank increased |
| `leaderboard_push` | Stats pushed to Ranks tab |

Events queue offline in `localStorage` (`fkh-analytics-queue`) and batch-upload every ~30s or on background.

### Feedback (→ `feedback` table)

**In-app:** Settings → **Open Feedback Center**

| Field | Options |
|-------|---------|
| Sentiment | 👍 thumbs up / 👎 thumbs down |
| Rating | 1–5 stars |
| Category | General / Bug / Feature idea |
| Message | Optional free text |

---

## Manual observation vs automated data

Use **both** during the first cohort. Automated data scales; sit-beside observation catches confusion the metrics miss.

| Manual log (below) | Automated replacement |
|--------------------|----------------------|
| Screen Visits tally | `analytics_top_screens` |
| Exercise Completions top 10 | `analytics_top_exercises` |
| Program session completed | `analytics_top_programs` + `program_session_complete` events |
| Retention Check tables | `analytics_retention`, `analytics_dau`, `analytics_wau` |
| Feature Requests (raw) | `feedback_feature_requests` + Feedback Center |
| Bug Reports | `feedback_bugs` + Feedback Center |
| Parent Feedback | `feedback` (any category) + Feedback Center |
| Average session length | `session_end` → `properties.duration_sec` |
| Daily Mission completed | `analytics_mission_completion` |

**Keep logging manually:** confusion, exact quotes, parent-present context, device-specific bugs.

---

## Per-Session Log (qualitative — still valuable)

> One row per athlete session. Automated metrics do not capture confusion or delight.

| Date | Athlete | Age | Opened First | Used Most | Ignored | Confusing | Liked | Feature Request | Parent Present |
|------|---------|-----|-------------|-----------|---------|-----------|-------|-----------------|---------------|
|      |         |     |             |           |         |           |       |                 |               |

---

## Direct Quotes

> Exact words from athletes and parents. Do not paraphrase.

| Date | Who (Athlete / Parent) | Quote |
|------|------------------------|-------|
|      |                        |       |

---

## Friction Points

> Things that slowed athletes down, caused hesitation, or required explanation.

| Date | Screen | What Happened | Severity (Low / Med / High) |
|------|--------|---------------|----------------------------|
|      |        |               |                            |

---

## Bug Reports

> Also encourage in-app Feedback Center → **Bug** category.

| Date | Device / OS | Screen | Description | Reproducible | Status |
|------|-------------|--------|-------------|--------------|--------|
|      |             |        |             |              | Open   |

---

## Feature Requests (raw — no filtering)

> Also logged automatically when submitted via Feedback Center → **Feature idea**.

| Date | Requested By | Request |
|------|-------------|---------|
|      |              |         |

---

## Parent Feedback

| Date | Parent | Feedback | Positive / Concern |
|------|--------|----------|--------------------|
|      |        |          |                    |

---

## Weekly review queries (run in Supabase SQL Editor)

After Supabase is live, use these instead of hand-counting tallies.

```sql
-- Health snapshot
select * from analytics_athlete_summary;
select * from analytics_dau limit 7;
select * from analytics_wau limit 4;

-- Retention
select cohort_day, cohort_size, d1_pct, d7_pct, d30_pct
from analytics_retention
order by cohort_day desc
limit 14;

-- Feature usage
select * from analytics_top_screens limit 15;
select * from analytics_top_exercises limit 15;
select * from analytics_top_programs;

-- Habits
select * from analytics_mission_completion limit 14;
select * from analytics_training_days_per_week limit 8;
select * from analytics_sessions_per_week limit 8;

-- Progression
select * from analytics_challenge_completion;
select * from analytics_badge_distribution;

-- Feedback
select * from feedback_summary;
select message, rating, created_at from feedback_feature_requests limit 20;
select message, created_at from feedback_bugs limit 20;
```

**Or** open the admin dashboard (use your key from `.env.local`):  
https://app.legendsyba.com/?admin=YOUR_KEY

---

## Retention Check — End of Week 1

| Metric | Count | SQL / source |
|--------|-------|--------------|
| Total athletes (devices) | | `analytics_athlete_summary.total_athletes` |
| Athletes active in last 7d | | `analytics_athlete_summary.active_athletes_7d` |
| New athletes in last 7d | | `analytics_athlete_summary.new_athletes_7d` |
| DAU (latest day) | | `analytics_dau` |
| WAU (latest week) | | `analytics_wau` |
| D1 retention (latest cohort) | | `analytics_retention.d1_pct` |
| Mission claim rate (avg) | | `analytics_mission_completion.mission_rate_pct` |
| Top screen | | `analytics_top_screens` row 1 |
| Top exercise | | `analytics_top_exercises` row 1 |
| Feedback submissions | | `feedback_summary.total` |

---

## Retention Check — End of Week 2

| Metric | Count | SQL / source |
|--------|-------|--------------|
| D7 retention (latest cohort) | | `analytics_retention.d7_pct` |
| Avg sessions per athlete / week | | `analytics_sessions_per_week` |
| Avg training days per athlete / week | | `analytics_training_days_per_week` |
| Program with most session completions | | `analytics_top_programs` row 1 |
| Most earned badge | | `analytics_badge_distribution` row 1 |
| Top feature request | | `feedback_feature_requests` |
| Biggest surprise (qualitative) | | Manual notes |

---

## End-of-Window Observations Summary

> Complete after cohort window closes. Pull numbers from SQL views; write insights here.

### Most Used Features
1. 
2. 
3. 

### Least Used Features
1. 
2. 
3. 

### Biggest Friction Points
1. 
2. 
3. 

### Parent Feedback Summary
> 

### Athlete Feedback Summary
> 

---

## Prioritized backlog (data-driven)

> If it does not appear in observation data **or** analytics, it does not enter the roadmap.

| Priority | Item | Signal | Source | Est. Effort |
|----------|------|--------|--------|-------------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Product baseline reference

| Metric | Value |
|--------|-------|
| Total exercises | ~220 |
| Workout templates | 6 |
| Training programs | 5 |
| Total badges | 27 |
| Shot zones | 9 court + 6 quick-tap |
| Tracked event types | 16 |
| Analytics SQL views | 17 |
| In-app feedback | Settings → Feedback Center |
| Admin dashboard | `https://app.legendsyba.com/?admin=YOUR_KEY` |

---

## Infrastructure status log

| Date | Item | Status |
|------|------|--------|
| 2026-06-17 | Supabase project linked + all SQL applied | ✅ Done |
| 2026-06-17 | GitHub secrets (URL, anon key, admin key) | ✅ Done |
| 2026-06-17 | `fkh-videos` storage bucket | ✅ Done |
| 2026-06-17 | `video_play`, `level_up`, `leaderboard_push` events | ✅ Shipped |
| 2026-06-17 | Admin dashboard key protected | ✅ `?admin=KEY` required on prod |
| 2026-06-17 | Real athlete usage + observation window | ⏳ Waiting on you |
| 2026-06-17 | FKH original videos (0 filmed) | ⏳ Content production |
| 2026-06-17 | Calendar Tier 3 | ⏳ Deferred |
| 2026-06-17 | RLS hardening before 100 users | ⏳ Before scale |

---

*Created: 2026-05-30*  
*Last updated: 2026-06-17*  
*Next action: Run first real athlete session; log qualitative notes below*
