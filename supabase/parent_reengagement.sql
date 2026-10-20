-- parent_reengagement.sql — "your athlete hasn't trained in a while" emails to
-- consented parents. Applied live to jjwaspyuldkwasfyrqbw.
--
-- STATUS (2026-10-20): LIVE. Weekly pg_cron job fkh-parent-reengagement calls
-- the send-parent-email edge function Sundays 23:00 UTC (evening in the US).
--
-- The first version of this view joined athlete_analytics, which clients stopped
-- writing in July 2026 — every consented kid was missing from it, so even with a
-- schedule nobody would ever have been emailed (and there was no schedule).
-- Activity now comes from the event stream itself (av_events, which already
-- leaves out QA/test athletes):
--   * last training = most recent drill / workout / program session / shot log
--   * a kid who has never trained counts from the day the parent consented,
--     and gets the "first practice is waiting" version of the email
-- Rules: 7+ days without training, at most one email per 14 days per parent,
-- never to a parent who opted out (reengagement_opt_out_at — set it when a
-- parent replies "stop"). The sender also sets it itself when Resend reports
-- the previous email (last_reengagement_email_id) bounced or was marked spam:
-- the Resend account is shared with Legends YBA, so a dead or hostile address
-- costs legendsyba.com's sender reputation, not just ours.

alter table public.parental_consent
  add column if not exists reengagement_opt_out_at timestamptz;
alter table public.parental_consent
  add column if not exists last_reengagement_email_id text;

-- Frequency-cap column (set by the send-parent-email edge function after a send).
alter table public.parental_consent
  add column if not exists last_reengagement_email_at timestamptz;

-- Dropped, not replaced: the column list changed (ever_trained added).
drop view if exists public.parent_reengagement_queue;
create view public.parent_reengagement_queue as
with training as (
  select athlete_id, max(created_at) as last_trained_at
  from public.av_events
  where event_name in ('exercise_complete', 'workout_complete', 'program_session_complete', 'shot_session')
  group by athlete_id
), base as (
  select
    pc.athlete_id,
    pc.parent_email,
    coalesce(nullif(trim(ap.first_name), ''), ap.display_name) as athlete_name,
    t.last_trained_at,
    t.last_trained_at is not null                           as ever_trained,
    coalesce(t.last_trained_at, pc.consented_at)            as inactive_since,
    pc.consented_at,
    pc.last_reengagement_email_at,
    pc.last_reengagement_email_id
  from public.parental_consent pc
  join public.athlete_profiles ap on ap.id = pc.athlete_id
  left join training t on t.athlete_id = pc.athlete_id
  where pc.reengagement_opt_out_at is null
    -- QA/test athletes: av_events already hides their training, so exclude
    -- them outright rather than mail the founder's own family.
    and pc.athlete_id not in (select athlete_id from public.analytics_qa_athletes)
)
select
  athlete_id, parent_email, athlete_name, last_trained_at, ever_trained,
  extract(day from now() - inactive_since)::int as days_inactive,
  consented_at, last_reengagement_email_at, last_reengagement_email_id
from base
where inactive_since < now() - interval '7 days'
  and (last_reengagement_email_at is null
       or last_reengagement_email_at < now() - interval '14 days')
order by inactive_since asc;

-- Admin-gated: inherits the admin-only RLS on parental_consent / events. The
-- sender reads it with the service role.
alter view public.parent_reengagement_queue set (security_invoker = on);

-- Weekly send, Sunday 23:00 UTC. Same auth pattern as fkh-daily-reminder: the
-- shared secret is read from private.app_config, never written into source.
select cron.unschedule('fkh-parent-reengagement')
where exists (select 1 from cron.job where jobname = 'fkh-parent-reengagement');
select cron.schedule(
  'fkh-parent-reengagement',
  '0 23 * * 0',
  $$
  select net.http_post(
    url := 'https://jjwaspyuldkwasfyrqbw.supabase.co/functions/v1/send-parent-email',
    body := jsonb_build_object('secret', (select value from private.app_config where key = 'push_secret')),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);

notify pgrst, 'reload schema';
