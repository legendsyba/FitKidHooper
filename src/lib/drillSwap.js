/**
 * Swap a drill in a plan for a different one — and have the swap stick going forward.
 *
 * Modelled on the Fit Tracker's exercise swap (gym_swap.js ranked replacements + learn.js
 * swap memory), but built from FKH's own pieces: a replacement stays in the SAME skill area,
 * fits the kid's level for that area (drillAllowed), and must have a real video. The kid's
 * choice is remembered in settings.drillSwaps ({ fromId: toId }), which applyDrillSwaps() then
 * folds into any session that would have used the swapped-away drill — so a swap a kid makes
 * once carries into tomorrow's plan, the way the Fit Tracker "learns" a swap.
 *
 * Plain module (no React/app imports) so it runs in node for tests.
 */
import { ALL_EXERCISES, EXERCISE_META } from "../data/trainingCatalog.js";
import { DIFFICULTY_TIER } from "./exerciseSkills.js";
import { areaOfExercise, drillAllowed, getSkillLevels } from "./skillLevels.js";

const exOf = (id) => ALL_EXERCISES[id] || null;
/** A drill a kid can actually watch: a YouTube clip or an FKH-original coach-filmed video. */
export const hasVideo = (ex) => !!ex && (ex.videoSource === "fkh" || !!ex.videoId);

/**
 * Ranked replacement drills for `exId` within a plan. Same skill area, allowed at the kid's
 * level, with a video, excluding anything already in the session. Best first.
 *
 * @param exId         the drill being swapped out
 * @param settings     kid settings (skillLevels / experience / age)
 * @param completed    completion map (feeds demonstrated level)
 * @param age          kid age for the physical-drill safety floor (optional)
 * @param exclude      ids already in the session (never offered as a swap)
 * @param limit        how many to return (default 6)
 */
export function drillReplacements(exId, { settings = {}, completed = {}, age, exclude = [], limit = 6 } = {}) {
  const ex = exOf(exId);
  if (!ex) return [];
  const area = areaOfExercise(ex);
  if (!area) return [];
  const levels = getSkillLevels(settings, completed);
  const skip = new Set([exId, ...exclude]);
  const srcTier = DIFFICULTY_TIER[ex.difficulty] || 1;
  const swaps = settings.drillSwaps || {};

  const scored = [];
  for (const [id, cand] of Object.entries(ALL_EXERCISES)) {
    if (skip.has(id)) continue;
    if (areaOfExercise(cand) !== area) continue;      // a swap stays in the same skill area
    if (!hasVideo(cand)) continue;                    // never swap into a drill with no demo
    if (!drillAllowed(cand, levels, age)) continue;   // must fit the kid's level (and age-safety)
    const tier = DIFFICULTY_TIER[cand.difficulty] || 1;
    const score =
      -Math.abs(tier - srcTier) * 2 +                 // closest difficulty to what it replaces
      (cand.videoSource === "fkh" ? 1.5 : 0) +        // prefer FKH-original coach-filmed clips
      (cand.trusted ? 0.5 : 0) +                      // then trusted channels
      (cand.funScore || 0) / 10 +                     // a nudge from how fun/engaging it is
      (swaps[exId] === id ? 100 : 0);                 // the kid's own past choice floats to the top
    scored.push([score, id, cand]);
  }
  scored.sort((a, b) => b[0] - a[0] || String(a[2].name).localeCompare(String(b[2].name)));
  return scored.slice(0, limit).map(([, id, cand]) => ({ id, name: cand.name, difficulty: cand.difficulty, exercise: cand }));
}

/**
 * Record a kid's swap so it sticks going forward. Returns a new drillSwaps map to persist on
 * settings. Swapping a drill back to itself (fromId === toId) clears the preference.
 */
export function recordDrillSwap(settings = {}, fromId, toId) {
  const next = { ...(settings.drillSwaps || {}) };
  if (!fromId || !toId || fromId === toId) delete next[fromId];
  else next[fromId] = toId;
  return next;
}

/** Undo a stored swap (revert to the original drill). Returns a new drillSwaps map. */
export function clearDrillSwap(settings = {}, fromId) {
  const next = { ...(settings.drillSwaps || {}) };
  delete next[fromId];
  return next;
}

/**
 * Fold a kid's stored swaps into a list of exercise ids — the "remember it going forward" step.
 * Each id the kid has swapped away from is replaced by what they swapped to, as long as the
 * target still exists, is in the same area, and isn't already in the list (no duplicates). Safe
 * to call on any generated session's exercise ids before it's shown.
 */
export function applyDrillSwaps(exerciseIds = [], settings = {}) {
  const swaps = settings.drillSwaps || {};
  if (!Object.keys(swaps).length) return exerciseIds;
  const out = [];
  const seen = new Set();
  for (const id of exerciseIds) {
    let use = id;
    const to = swaps[id];
    if (to && exOf(to) && areaOfExercise(exOf(to)) === areaOfExercise(exOf(id)) && !seen.has(to) && !exerciseIds.includes(to)) {
      use = to;
    }
    if (seen.has(use)) { out.push(id); seen.add(id); continue; } // target already present → keep original
    out.push(use);
    seen.add(use);
  }
  return out;
}
