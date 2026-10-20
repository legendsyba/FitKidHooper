import { getDeviceAthleteId as getAthleteId, readStoredAuthSession } from "./auth.js";
import { FIRST_EXERCISE_KEY, announcePracticeDone } from "./athleteExperience.js";
import { getSupabaseClient, isSupabaseConfigured, getSupabaseRest } from "./supabaseClient.js";
import { ANALYTICS_EVENTS } from "./analyticsTypes.js";

const QUEUE_KEY = "fkh-analytics-queue";
const TRACKED_CHALLENGES_KEY = "fkh-analytics-challenges";
const TRACKED_PROGRAM_SESSIONS_KEY = "fkh-analytics-program-sessions";
const TRACKED_WORKOUT_DAYS_KEY = "fkh-analytics-workout-days";
const FIRST_SESSION_KEY = "fkh-analytics-first-session";

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_BATCH_SIZE = 40;
const MAX_QUEUE_SIZE = 500;

let sessionStartedAt = null;
let sessionId = null;
let flushTimer = null;
let flushing = false;
let context = { ageGroup: "unknown", isStandalone: false };

// When signed in, events are logged under the auth user id (set by the app on
// auth state change) so a kid's activity is unified across devices. Falls back
// to the per-device id for anonymous use.
let athleteIdOverride = null;

// Best-effort synchronous read of the signed-in user id from the Supabase
// session in localStorage. This avoids a startup race: initAnalytics fires
// session_start (the event DAU/WAU/retention count) before the async auth
// listener sets the override, so without this the first event of a signed-in
// session would log under the device id.
function authIdFromStorage() {
  return readStoredAuthSession()?.userId ?? null;
}

function activeAthleteId() {
  return athleteIdOverride || authIdFromStorage() || getAthleteId();
}

/** Point analytics at the auth user id (or null to revert to the device id). */
export function setAnalyticsAthleteId(id) {
  athleteIdOverride = id || null;
}

function getAppVersion() {
  return import.meta.env.VITE_APP_VERSION || "dev";
}

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
  } catch {
    /* localStorage unavailable */
  }
}

function readJsonSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function writeJsonSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* localStorage unavailable */
  }
}

function basePayload() {
  return {
    athlete_id: activeAthleteId(),
    app_version: getAppVersion(),
    age_group: context.ageGroup || "unknown",
    session_id: sessionId,
  };
}

/**
 * True for automated browser contexts (Playwright, Selenium, etc.), which
 * set this flag on navigator by spec. Every CI deploy's Playwright smoke
 * suite boots the real app against the production Supabase project (see
 * deploy.yml), so without this guard each run wrote a fresh random guest
 * athlete + session_start event into real analytics — this is why the
 * admin dashboard's athlete list included obvious bot/test entries.
 */
const QA_MODE_KEY = "fkh-qa-mode";

/**
 * Test traffic is kept out of the data at source rather than filtered after.
 *
 * The previous approach inferred it downstream: analytics_qa_athletes is a view
 * over "any athlete whose app_version is local or setup". That has two holes.
 * Testing against the deployed site carries a real version string, so it looks
 * like genuine use and lands in the numbers -- 386 events did exactly that. And
 * a real athlete who ever opens a dev build is silently excluded from reporting
 * forever. Neither is recoverable once the rows exist.
 *
 * Three things make a client a test client:
 *   - automation (Playwright sets navigator.webdriver)
 *   - a local dev server, by hostname
 *   - an explicit QA flag, for testing against production
 *
 * Turn the flag on with ?qa=1 and off with ?qa=0. It sticks in localStorage so
 * a whole testing session stays out, and it logs on every boot -- silently not
 * recording a real athlete would be a worse failure than the one this fixes.
 */
function isLocalHost() {
  try {
    const h = window.location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local");
  } catch { return false; }
}

function readQaFlag() {
  try {
    const param = new URLSearchParams(window.location.search).get("qa");
    if (param === "1") { localStorage.setItem(QA_MODE_KEY, "1"); return true; }
    if (param === "0") { localStorage.removeItem(QA_MODE_KEY); return false; }
    return localStorage.getItem(QA_MODE_KEY) === "1";
  } catch { return false; }
}

let announcedTestClient = false;

export function isTestClient() {
  // readQaFlag() is evaluated first and unconditionally: it is what persists
  // ?qa=1 and clears on ?qa=0. Behind a || it would be skipped on localhost,
  // so the flag could never be set from a dev server -- and never cleared.
  const flagged = readQaFlag();
  let automated = false;
  try { automated = Boolean(navigator.webdriver); } catch { /* ignore */ }
  const test = automated || isLocalHost() || flagged;
  if (test && !announcedTestClient) {
    announcedTestClient = true;
    try {
      console.info("[fkh] test client — analytics disabled. ?qa=0 to record normally.");
    } catch { /* ignore */ }
  }
  return test;
}

function isAutomatedBrowser() {
  return isTestClient();
}

/** Queue an event for batched upload. No-op when Supabase is not configured. */
export function track(eventName, properties = {}) {
  if (!isSupabaseConfigured()) return;
  if (isAutomatedBrowser()) return;
  if (!activeAthleteId()) return;

  const queue = readQueue();
  queue.push({
    ...basePayload(),
    event_name: eventName,
    properties,
    queued_at: Date.now(),
  });
  writeQueue(queue);

  if (queue.length >= FLUSH_BATCH_SIZE) {
    flushEvents();
  }
}

function toEventRow({ event_name, properties, athlete_id, app_version, age_group, session_id, queued_at }) {
  return {
    athlete_id,
    event_name,
    properties: properties || {},
    app_version,
    age_group,
    session_id: session_id || null,
    client_ts: queued_at ? new Date(queued_at).toISOString() : null,
  };
}

/**
 * Flush on the way out.
 *
 * flushEvents() starts an ordinary async insert, which the browser cancels as
 * the page tears down. initAnalytics happens to queue session_start and flush
 * immediately, so that one event always landed while everything queued after
 * it -- screen_view included -- only arrived if the session lasted past the
 * 30s timer or the athlete came back later. That is why 81 athletes had a
 * session_start and nothing else. keepalive lets the request outlive the page.
 */
function flushEventsOnExit() {
  const rest = getSupabaseRest();
  if (!rest) return;
  const queue = readQueue();
  if (queue.length === 0) return;
  const batch = queue.slice(0, FLUSH_BATCH_SIZE);
  try {
    fetch(`${rest.url}/rest/v1/events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: rest.key,
        Authorization: `Bearer ${rest.key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch.map(toEventRow)),
    }).catch(() => { /* the page is going away; nothing to retry into */ });
    writeQueue(queue.slice(batch.length));
  } catch { /* ignore */ }
}

export async function flushEvents() {
  if (!isSupabaseConfigured() || flushing) return;
  const sb = getSupabaseClient();
  if (!sb) return;

  const queue = readQueue();
  if (queue.length === 0) return;

  flushing = true;
  const batch = queue.slice(0, FLUSH_BATCH_SIZE);
  const remaining = queue.slice(batch.length);

  // client_ts (when the event actually happened, client-side) is distinct
  // from the DB's created_at (when the batch was inserted) — events queue
  // locally and flush together every 30s, so several events in one batch
  // would otherwise share the same server insert time and make any
  // duration/ordering math between them collapse to zero.
  const rows = batch.map(toEventRow);

  const { error } = await sb.from("events").insert(rows);
  if (!error) {
    writeQueue(remaining);
  }
  flushing = false;
}

async function upsertAthleteAnalytics({ isFirstSession = false } = {}) {
  if (isAutomatedBrowser()) return;
  const sb = getSupabaseClient();
  const athleteId = activeAthleteId();
  if (!sb || !athleteId) return;

  const now = new Date().toISOString();
  const row = {
    athlete_id: athleteId,
    last_session_at: now,
    age_group: context.ageGroup || "unknown",
    app_version: getAppVersion(),
    updated_at: now,
  };

  if (isFirstSession) {
    row.first_session_at = now;
  }

  await sb.from("athlete_analytics").upsert(row, { onConflict: "athlete_id" });
}

/** Programs hub section + Plans segment — the states screen_view flattened. */
export function trackProgramsSection(section, segment) {
  track(ANALYTICS_EVENTS.PROGRAMS_SECTION_VIEW, { section, segment: segment || null });
}

export function trackScreen(screen, extra = {}) {
  track(ANALYTICS_EVENTS.SCREEN_VIEW, { screen, ...extra });
}

/** Today / home tab opened — sprint funnel step 1. */
export function trackHomeViewed() {
  track(ANALYTICS_EVENTS.HOME_VIEWED);
}

/** Primary home CTA tapped — sprint funnel step 2. `ctaId` is a stable slug (e.g. start_practice). */
export function trackCtaClicked(ctaId, extra = {}) {
  if (!ctaId) return;
  track(ANALYTICS_EVENTS.CTA_CLICKED, { cta_id: ctaId, location: "home", ...extra });
}

/** Multi-drill session opened — sprint funnel step 3. */
export function trackPracticeStarted(source, { exerciseCount = 0, programId = null } = {}) {
  track(ANALYTICS_EVENTS.PRACTICE_STARTED, {
    source: source || "unknown",
    exercise_count: exerciseCount,
    program_id: programId,
  });
}

/** All drills in a started session marked done — sprint funnel step 4. */
export function trackPracticeFinished(source, { exerciseCount = 0, durationSec = null } = {}) {
  track(ANALYTICS_EVENTS.PRACTICE_FINISHED, {
    source: source || "unknown",
    exercise_count: exerciseCount,
    duration_sec: durationSec,
  });
}

/** All required mission tasks done for the day — sprint funnel step 5. */
export function trackMissionCompleted({ missionDay, bonusXp, title } = {}) {
  track(ANALYTICS_EVENTS.MISSION_COMPLETED, {
    mission_day: missionDay,
    bonus_xp: bonusXp,
    title,
  });
  announcePracticeDone();
}

export function trackExerciseComplete(exerciseId, source = "unknown", extra = {}) {
  if (!exerciseId) return;

  const isFirst = !localStorage.getItem(FIRST_EXERCISE_KEY);
  track(ANALYTICS_EVENTS.EXERCISE_COMPLETE, { exercise_id: exerciseId, source, ...extra });

  if (isFirst) {
    localStorage.setItem(FIRST_EXERCISE_KEY, new Date().toISOString());
    track(ANALYTICS_EVENTS.FIRST_EXERCISE_COMPLETE, { exercise_id: exerciseId, source });
  }
}

export function trackShotSession({ makes = 0, misses = 0, shotType = null, usedCourtMap = false } = {}) {
  if (makes + misses === 0) return;
  track(ANALYTICS_EVENTS.SHOT_SESSION, {
    makes,
    misses,
    total: makes + misses,
    shot_type: shotType,
    used_court_map: usedCourtMap,
  });
}

export function trackChallengeIfNew(challengeId, isComplete) {
  if (!isComplete) return;
  const tracked = readJsonSet(TRACKED_CHALLENGES_KEY);
  if (tracked.has(challengeId)) return;
  tracked.add(challengeId);
  writeJsonSet(TRACKED_CHALLENGES_KEY, tracked);
  track(ANALYTICS_EVENTS.CHALLENGE_COMPLETE, { challenge_id: challengeId });
}

/**
 * Once per session per run of a program. Keyed on the run (its enrollment start) so a
 * restarted program counts again; `run` is 1 for the first time through. Keys from before
 * runs were tracked (`program:week:session`) still count for run 1, so upgrading doesn't
 * re-send sessions that were already recorded.
 */
export function trackProgramSessionIfNew(programId, week, sessionIdx, { runStartedAt = 0, run = 1 } = {}) {
  const key = `${programId}@${runStartedAt}:${week}:${sessionIdx}`;
  const legacyKey = `${programId}:${week}:${sessionIdx}`;
  const tracked = readJsonSet(TRACKED_PROGRAM_SESSIONS_KEY);
  if (tracked.has(key)) return;
  tracked.add(key);
  writeJsonSet(TRACKED_PROGRAM_SESSIONS_KEY, tracked);
  if (run === 1 && tracked.has(legacyKey)) return;
  track(ANALYTICS_EVENTS.PROGRAM_SESSION_COMPLETE, {
    program_id: programId,
    week,
    session_idx: sessionIdx,
    run,
  });
  announcePracticeDone();
}

export function trackWorkoutCompleteIfNew(templateKey, today) {
  const tracked = readJsonSet(TRACKED_WORKOUT_DAYS_KEY);
  const key = `${today}:${templateKey}`;
  if (tracked.has(key)) return;
  tracked.add(key);
  writeJsonSet(TRACKED_WORKOUT_DAYS_KEY, tracked);
  track(ANALYTICS_EVENTS.WORKOUT_COMPLETE, { template_key: templateKey });
}

function endSession() {
  if (!sessionStartedAt) return;
  const durationSec = Math.round((Date.now() - sessionStartedAt) / 1000);
  track(ANALYTICS_EVENTS.SESSION_END, { duration_sec: durationSec });
  sessionStartedAt = null;
  sessionId = null;
  flushEventsOnExit();
}

/** Call once on app mount. */
export function initAnalytics({ ageGroup = "unknown", isStandalone = false } = {}) {
  if (!isSupabaseConfigured()) return () => {};
  if (isAutomatedBrowser()) return () => {};

  context = { ageGroup, isStandalone };

  const isFirstEver = !localStorage.getItem(FIRST_SESSION_KEY);
  if (isFirstEver) localStorage.setItem(FIRST_SESSION_KEY, new Date().toISOString());

  sessionStartedAt = Date.now();
  sessionId = crypto.randomUUID();
  track(ANALYTICS_EVENTS.SESSION_START, {
    is_standalone: isStandalone,
    is_return: !isFirstEver,
  });
  upsertAthleteAnalytics({ isFirstSession: isFirstEver });

  const onHide = () => {
    if (document.visibilityState === "hidden") {
      endSession();
    } else if (document.visibilityState === "visible" && !sessionStartedAt) {
      sessionStartedAt = Date.now();
      sessionId = crypto.randomUUID();
      // Distinct from session_start: the app came back to the foreground, it
      // is not a new visit. Counting them together made every session and
      // retention figure roughly six times too big.
      track(ANALYTICS_EVENTS.APP_FOREGROUNDED, { is_standalone: isStandalone });
      upsertAthleteAnalytics();
    }
  };

  const onUnload = () => endSession();

  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onUnload);

  flushTimer = setInterval(() => flushEvents(), FLUSH_INTERVAL_MS);
  flushEvents();

  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onUnload);
    if (flushTimer) clearInterval(flushTimer);
    endSession();
  };
}

export function setAnalyticsAgeGroup(ageGroup) {
  context.ageGroup = ageGroup || "unknown";
}

/** Submit feedback directly (not queued). */
export async function submitFeedback({ rating, sentiment, category, message }) {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Analytics not configured" };
  }
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: "Could not connect" };

  const row = {
    athlete_id: activeAthleteId(),
    rating: rating ?? null,
    sentiment: sentiment ?? null,
    category: category || "general",
    message: message?.trim() || null,
    app_version: getAppVersion(),
  };

  const { error } = await sb.from("feedback").insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { ANALYTICS_EVENTS };
