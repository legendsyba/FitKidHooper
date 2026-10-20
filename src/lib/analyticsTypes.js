/** Canonical analytics event names — keep in sync with supabase/analytics.sql */
export const ANALYTICS_EVENTS = {
  SESSION_START: "session_start",
  SESSION_END: "session_end",
  /* Returning to the foreground used to re-fire session_start, so 1,499 of
     1,810 "sessions" were really app switches and every session metric was
     inflated about six-fold. It is its own event now. */
  APP_FOREGROUNDED: "app_foregrounded",
  /* Programs hub: which of the four sections and which Plans segment. The hub
     was a single "programs" screen_view, so nothing distinguished the sixteen
     states behind those two chip rows. */
  PROGRAMS_SECTION_VIEW: "programs_section_view",
  SCREEN_VIEW: "screen_view",
  /* Which onboarding screen a new kid reached ({ step }). Most genuine first
     visits ended inside onboarding with nothing recorded, so there was no way
     to tell which screen lost them. */
  ONBOARDING_STEP: "onboarding_step",
  ONBOARDING_COMPLETE: "onboarding_complete",
  ONBOARDING_TOUR_COMPLETE: "onboarding_tour_complete",
  FIRST_EXERCISE_COMPLETE: "first_exercise_complete",
  EXERCISE_COMPLETE: "exercise_complete",
  MISSION_CLAIM: "mission_claim",
  PROGRAM_ENROLL: "program_enroll",
  PROGRAM_SESSION_COMPLETE: "program_session_complete",
  CHALLENGE_COMPLETE: "challenge_complete",
  BADGE_EARN: "badge_earn",
  EXERCISE_FAVORITE: "exercise_favorite",
  WORKOUT_COMPLETE: "workout_complete",
  SHOT_SESSION: "shot_session",
  VIDEO_PLAY: "video_play",
  LEVEL_UP: "level_up",
  LEADERBOARD_PUSH: "leaderboard_push",
  PROGRAM_SHARE: "program_share",
  // Sprint funnel — Home → CTA → Practice → Mission (see docs/ANALYTICS.md)
  HOME_VIEWED: "home_viewed",
  CTA_CLICKED: "cta_clicked",
  PRACTICE_STARTED: "practice_started",
  PRACTICE_FINISHED: "practice_finished",
  MISSION_COMPLETED: "mission_completed",
};

export const FEEDBACK_CATEGORIES = {
  GENERAL: "general",
  BUG: "bug",
  FEATURE: "feature_request",
};

export const FEEDBACK_SENTIMENTS = {
  UP: "thumbs_up",
  DOWN: "thumbs_down",
};
