/**
 * Per-skill level — the kid's level at EACH skill area, not their age.
 *
 * A 3rd grader can be advanced at handles and a beginner at finishing; a 12-year-old can still
 * be a beginner at layups. Level is a property of the kid-at-a-skill, so each area climbs its own
 * ladder (beginner → intermediate → advanced), decoupled from age.
 *
 * Today the app levels globally (one XP number, one `experience` flag) and GATES drills by age.
 * This is the keystone that replaces that: a stored per-area level, seeded from what the kid has
 * actually done (inferAreaTiers already computes it — it was just thrown away), overridable by a
 * coach, and read by drill selection instead of ageRange.
 *
 * Grain is per skill AREA (handles/shooting/finishing/footwork/passing/defense/rebounding), not
 * per individual move — that matches how a coach thinks ("she's ahead on handles") and keeps the
 * state small. Tiers are 1=beginner, 2=intermediate, 3=advanced, the same scale as a drill's
 * `difficulty` (DIFFICULTY_TIER) so the two compare directly.
 */
import { SKILL_AREAS, CATEGORY_TO_AREA } from "./skillGraph.js";
import { buildExerciseSkillIndex, DIFFICULTY_TIER } from "./exerciseSkills.js";
import { inferAreaTiers } from "./developmentPathways.js";
import { ALL_EXERCISES, EXERCISE_META } from "../data/trainingCatalog.js";

export const TIER_LABEL = { 1: "beginner", 2: "intermediate", 3: "advanced" };
export const LABEL_TIER = { beginner: 1, intermediate: 2, advanced: 3 };
export const clampTier = (t) => Math.max(1, Math.min(3, Math.round(Number(t) || 1)));
export const tierLabel = (t) => TIER_LABEL[clampTier(t)];
export const labelTier = (l) => LABEL_TIER[String(l || "").toLowerCase()] || 1;

let _index = null;
const skillIndex = () => (_index ||= buildExerciseSkillIndex(ALL_EXERCISES, EXERCISE_META));

/**
 * The kid's level (1-3) per skill area. A per-area coach/kid override (settings.skillLevels) wins;
 * otherwise it is inferred from completion history. So it answers "what level is this kid at
 * finishing" independently of age, and defaults sensibly (beginner) for a brand-new kid.
 */
export function getSkillLevels(settings = {}, completed = {}) {
  const inferred = inferAreaTiers(completed || {}, skillIndex());
  const override = settings.skillLevels || {};
  const out = {};
  for (const area of Object.keys(SKILL_AREAS)) {
    out[area] = clampTier(override[area] != null ? override[area] : inferred[area] != null ? inferred[area] : 1);
  }
  return out;
}

/** The skill area an exercise belongs to (from its workout category, then its resolved skills). */
export function areaOfExercise(ex) {
  if (!ex) return null;
  const cat = ex._cat || EXERCISE_META[ex.id]?._cat;
  if (cat && CATEGORY_TO_AREA[cat]) return CATEGORY_TO_AREA[cat];
  return skillIndex()[ex.id]?.areas?.[0] || null;
}

/**
 * Does this drill fit the kid's level for ITS area? Shows their current level and one stretch
 * rung up, and NEVER floors out an easier drill (a 12-year-old who needs beginner layups gets
 * them). Age is not consulted here — that is the whole point.
 *
 * areaLevels is the map from getSkillLevels(); `stretch` is how many rungs above their level to
 * still offer (default 1, so they always see a reach drill).
 */
export function drillFitsLevel(ex, areaLevels = {}, { stretch = 1 } = {}) {
  const area = areaOfExercise(ex);
  const kid = area ? areaLevels[area] ?? 1 : 1;
  const d = DIFFICULTY_TIER[ex.difficulty] || 1;
  return d <= kid + stretch;
}

/** Set a per-area override; returns the new skillLevels object to persist on settings. */
export function setSkillLevel(settings = {}, area, tierOrLabel) {
  const t = typeof tierOrLabel === "string" ? labelTier(tierOrLabel) : clampTier(tierOrLabel);
  return { ...(settings.skillLevels || {}), [area]: t };
}

/**
 * Should any area level UP? An area evolves when the kid has completed enough drills AT its
 * current level — mastery, not age or time. Returns a new skillLevels override map (or null if
 * nothing changed). `countAtLevel(area, tier)` is supplied by the caller from completion history.
 */
export function evolveSkillLevels(settings = {}, completed = {}, countAtLevel, { needed = 4 } = {}) {
  const levels = getSkillLevels(settings, completed);
  const override = { ...(settings.skillLevels || {}) };
  let changed = false;
  for (const area of Object.keys(SKILL_AREAS)) {
    const cur = levels[area];
    if (cur >= 3) continue;
    if ((countAtLevel?.(area, cur) || 0) >= needed) { override[area] = cur + 1; changed = true; }
  }
  return changed ? override : null;
}
