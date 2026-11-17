/**
 * Partner mode — classify which drills are better with a buddy, and remember
 * buddy-scoreboard names + the team's best combined score per drill.
 *
 * The signal is CATEGORY (`_cat`), not `setup`: only ~22 drills carry a `setup`
 * field, but every drill has a category. The founder's own list — rebounds,
 * (advanced) shooting, ball handling, passing — plus the explicit partner_games
 * category and 1v1 defense are the skills that get more fun and competitive with
 * a partner. Research backs a mastery-framed, cooperative-competitive design:
 * two kids pushing each other beats either kid alone, while a permanent
 * kid-vs-kid ranking raises dropout — so the scoreboard celebrates BOTH and
 * stores only the team's combined best, never a head-to-head win/loss record.
 */

import { ALL_EXERCISES } from "../data/trainingCatalog.js";

/** Categories that REQUIRE another person. */
const PARTNER_SETUPS = new Set(["partner", "group"]);

/**
 * A drill's canonical category. A drill can be cross-listed in several category
 * arrays, and each array's instance is tagged with THAT array's `_cat` (e.g.
 * "tennis-snatch" is a ball-handling drill also listed under speed, so the speed
 * instance carries `_cat:"speed"`). We want the drill's HOME category, which is
 * the one ALL_EXERCISES keeps — so look that up by id first, and only fall back
 * to the object's own `_cat` when the id isn't in the canonical map.
 */
function catOf(exercise) {
  const byId = exercise?.id ? ALL_EXERCISES[exercise.id]?._cat : undefined;
  return byId || exercise?._cat;
}

/**
 * Solo-capable categories that are simply better, and more competitive, with a
 * buddy — the founder's own list: rebounds, (advanced) shooting, ball handling,
 * passing. Deliberately NOT defense or finishing: those categories are mostly
 * solo agility/footwork (cones, carioca, deceleration), so tagging them all
 * "better with a buddy" would be noise. 1v1 defense drills are partner_games
 * already, so they're caught as "needs".
 */
const BUDDY_CATEGORIES = new Set([
  "rebounding",
  "passing",
  "shooting", "shootingdrills", "shooting_lab",
  "handles", "game_handles", "ballhandling",
]);

/**
 * How partner-friendly a drill is.
 * @returns {"needs"|"better"|"solo"}
 *   "needs"  — can't be done alone (partner_games / setup partner|group)
 *   "better" — solo-capable but more fun/competitive with a buddy
 *   "solo"   — fine on your own
 */
export function partnerFit(exercise) {
  if (!exercise) return "solo";
  const cat = catOf(exercise);
  if (cat === "partner_games") return "needs";
  if (PARTNER_SETUPS.has(exercise.setup)) return "needs";
  if (BUDDY_CATEGORIES.has(cat)) return "better";
  return "solo";
}

/** Short badge for a drill card/detail. `null` for solo drills (no badge). */
export function partnerFitBadge(exercise) {
  const fit = partnerFit(exercise);
  if (fit === "needs") return { emoji: "🤝", label: "Grab a buddy" };
  if (fit === "better") return { emoji: "🤝", label: "Better with a buddy" };
  return null;
}

export function isPartnerFit(exercise) {
  return partnerFit(exercise) !== "solo";
}

/* ── Buddy-scoreboard persistence (per-viewer convenience only) ───────────── */

const NAMES_KEY = "fkh-buddy-names";
const BEST_KEY = "fkh-buddy-best"; // { [drillId]: combinedBestTotal }

/** Remembered buddy names, defaulted. Never throws. */
export function loadBuddyNames() {
  try {
    const raw = JSON.parse(localStorage.getItem(NAMES_KEY) || "null");
    if (Array.isArray(raw) && raw.length === 2) {
      return [String(raw[0] || "Player 1"), String(raw[1] || "Player 2")];
    }
  } catch { /* storage blocked or malformed — fall through to defaults */ }
  return ["Player 1", "Player 2"];
}

export function saveBuddyNames(names) {
  try {
    const clean = [String(names?.[0] || "Player 1").slice(0, 20), String(names?.[1] || "Player 2").slice(0, 20)];
    localStorage.setItem(NAMES_KEY, JSON.stringify(clean));
  } catch { /* non-fatal: a forgotten name is no reason to break the game */ }
}

/** The team's best COMBINED score on a drill (both players added). 0 if none yet. */
export function loadBuddyBest(drillId) {
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    const v = all?.[drillId];
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}

/**
 * Record a finished buddy session's combined total. Returns true when it beats
 * the stored team best (so the UI can celebrate "New team best!"). Mastery
 * framing: we track the TEAM going up, not one kid beating the other.
 */
export function saveBuddyBest(drillId, combinedTotal) {
  const total = Number(combinedTotal) || 0;
  let isTeamBest = false;
  try {
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    const prev = Number.isFinite(all?.[drillId]) ? all[drillId] : 0;
    if (total > prev) {
      all[drillId] = total;
      localStorage.setItem(BEST_KEY, JSON.stringify(all));
      isTeamBest = prev > 0; // only a "new best" if they'd set one before
    }
  } catch { /* storage blocked — the game still played, just not remembered */ }
  return isTeamBest;
}
