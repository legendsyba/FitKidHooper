/**
 * Single source of truth for whether this device has any real training history.
 * Brand-new athletes have no first-exercise marker and no s_done completions.
 */

export const FIRST_EXERCISE_KEY = "fkh-analytics-first-exercise";
/** Fired on window the moment a device records its first finished drill. */
export const FIRST_EXERCISE_EVENT = "fkh-first-exercise";

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
