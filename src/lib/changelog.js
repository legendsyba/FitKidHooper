/**
 * Bump RELEASE_ID when shipping user-visible changes — drives the in-app "What's new" sheet.
 */
import { athleteHasPriorUsage } from "./athleteExperience.js";

export const RELEASE_ID = "2026.11.1";

export const WHATS_NEW = {
  id: RELEASE_ID,
  headline: "November update — train through the season",
  items: [
    { emoji: "🏀", text: "In-Season Hooper — 8 weeks, 4 short sessions a week: 2 strength, 2 speed & jumps, built to fit around practice and games (Programs)" },
    { emoji: "📈", text: "Same moves every week, the dose steps up — 2×8 to 4×8, more sprints, a few more jumps" },
    { emoji: "🧊", text: "Rest days built in, with the Recovery Day workout between sessions" },
  ],
};

const SEEN_KEY = "fkh-last-seen-release";

export const WHATS_NEW_EVENT = "fkh-show-whats-new";

export function showWhatsNewSheet() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT));
}

/**
 * Brand-new athletes never see the release changelog.
 * Only returning athletes (prior usage) see What's New when RELEASE_ID advances.
 */
export function shouldShowWhatsNew() {
  if (typeof window === "undefined") return false;
  try {
    if (!localStorage.getItem("s_onboarded")) return false;
    if (!athleteHasPriorUsage()) {
      // Baseline current release silently so the first ship after signup isn't a popup.
      if (localStorage.getItem(SEEN_KEY) !== RELEASE_ID) markWhatsNewSeen();
      return false;
    }
    return localStorage.getItem(SEEN_KEY) !== RELEASE_ID;
  } catch {
    return false;
  }
}

export function markWhatsNewSeen() {
  try {
    localStorage.setItem(SEEN_KEY, RELEASE_ID);
  } catch { /* ignore */ }
}

/** Re-open from Settings or Update banner — does not change seen state. */
export function getWhatsNew() {
  return WHATS_NEW;
}
