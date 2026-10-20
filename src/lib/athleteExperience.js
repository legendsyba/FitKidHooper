/**
 * Single source of truth for whether this device has any real training history.
 * Brand-new athletes have no first-exercise marker and no s_done completions.
 */

export const FIRST_EXERCISE_KEY = "fkh-analytics-first-exercise";
/** Fired on window when a whole practice is finished: today's mission or a
 *  program session. "Finished a practice" is the moment for asks that are not
 *  training (install the app), never halfway through one. */
export const PRACTICE_DONE_EVENT = "fkh-practice-done";

export function announcePracticeDone() {
  try { window.dispatchEvent(new Event(PRACTICE_DONE_EVENT)); } catch { /* non-browser */ }
}

/** True when the athlete has never completed a drill on this device. */
export function isNewAthlete() {
  try {
    if (localStorage.getItem(FIRST_EXERCISE_KEY)) return false;
    const completed = JSON.parse(localStorage.getItem("s_done") || "{}");
    return !Object.keys(completed).some((k) => completed[k]);
  } catch {
    return true;
  }
}

/** Inverse of isNewAthlete — used for What's New, tour, and welcome-back gating. */
export function athleteHasPriorUsage() {
  return !isNewAthlete();
}
