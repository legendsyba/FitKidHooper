/**
 * Recommend a program from a kid's per-skill levels — the "classify → build the program" step.
 *
 * The self-check (or history) says what a kid is at each skill; this turns that into "start with
 * THIS program." It finds the area the kid most needs work in (among the ones they want to work
 * on, the one they're lowest at), then the program that trains that area at a fitting difficulty
 * — a foundational program for a beginner, the advanced (II) version once they're advanced.
 *
 * A program's area is derived from its own exercises (robust as the catalog changes), not a stored
 * tag.
 */
import { PROGRAMS, ALL_EXERCISES } from "../data/trainingCatalog.js";
import { areaOfExercise, getSkillLevels, clampTier, exerciseTier } from "./skillLevels.js";

const eachExercise = function* (program) {
  for (const w of program.weeks || [])
    for (const s of w.sessions || [])
      for (const id of s.exercises || []) if (ALL_EXERCISES[id]) yield ALL_EXERCISES[id];
};

/** A program's own content difficulty (1-3): the average difficulty of its exercises. */
export function programLevel(program) {
  let sum = 0, n = 0;
  for (const ex of eachExercise(program)) { sum += exerciseTier(ex); n++; }
  return n ? clampTier(sum / n) : 1;
}

/** The dominant skill area of a program: the most common area across its exercises. */
export function programArea(program) {
  const tally = {};
  for (const ex of eachExercise(program)) {
    const a = areaOfExercise(ex);
    if (a) tally[a] = (tally[a] || 0) + 1;
  }
  let best = null, n = 0;
  for (const [a, c] of Object.entries(tally)) if (c > n) { n = c; best = a; }
  return best;
}

/**
 * Recommend a program from a per-area level map. `focusAreas` are the areas the kid chose to work
 * on (empty = consider every area the map scores). Returns { program, area, level } or null.
 */
export function recommendProgramForLevels(levels = {}, focusAreas = [], programs = PROGRAMS, { exclude = [] } = {}) {
  // Drop programs the kid has already finished or is enrolled in, so we never recommend (and the
  // Start button never re-enrolls) something they've done — the caller passes those ids.
  if (exclude.length) { const skip = new Set(exclude); programs = programs.filter((p) => !skip.has(p.id)); }
  // Only areas that actually have a level (focus picks, or everything the map scored) AND that at
  // least one program targets — so an unscored area can't tie its way to the top.
  const scored = focusAreas.length ? focusAreas.filter((a) => levels[a] != null) : Object.keys(levels);
  const withPrograms = scored.filter((a) => programs.some((p) => programArea(p) === a));
  const areas = withPrograms.length ? withPrograms : scored;
  if (!areas.length) return null;
  // The area the kid is LOWEST at = the biggest opportunity.
  const target = areas.slice().sort((a, b) => (levels[a] || 1) - (levels[b] || 1))[0];
  const tLevel = levels[target] || 1;

  const matches = programs.filter((p) => programArea(p) === target);
  if (!matches.length) return null;
  // Structured fields only — a program's name containing "2"/"II" (e.g. "2-on-2 Footwork") must not
  // mark it an advanced sequel. Every real sequel in the catalog carries advancedOf / level / -2 id.
  const isSequel = (p) => !!p.advancedOf || p.level === 2 || /-2$/.test(p.id);
  const wantAdvanced = tLevel >= 3;
  // A beginner/intermediate kid should not land on a "II" sequel; keep them unless that's all there is.
  const pool = (() => {
    const noSeq = matches.filter((p) => !isSequel(p));
    return !wantAdvanced && noSeq.length ? noSeq : wantAdvanced ? matches : noSeq.length ? noSeq : matches;
  })();
  // Closest content difficulty to the kid's level, then the MORE comprehensive program (longer)
  // so a beginner gets the broad foundation over a short single-move one.
  // An advanced kid prefers the sequel/II version where one exists.
  const seqPref = (p) => (wantAdvanced ? (isSequel(p) ? 0 : 1) : 0);
  const ranked = pool.slice().sort((a, b) =>
    seqPref(a) - seqPref(b) ||
    Math.abs(programLevel(a) - tLevel) - Math.abs(programLevel(b) - tLevel) || (b.duration || 0) - (a.duration || 0),
  );
  return { program: ranked[0], area: target, level: tLevel };
}

/** Recommend from a kid's stored state (settings + completion history). */
export function recommendProgram(settings = {}, completed = {}, focusAreas = [], programs = PROGRAMS, opts = {}) {
  return recommendProgramForLevels(getSkillLevels(settings, completed), focusAreas, programs, opts);
}
