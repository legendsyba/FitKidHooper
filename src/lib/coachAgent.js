/**
 * Coach agent — grounded retrieval + adaptation (no LLM required).
 * Edge function and in-app coach call these helpers; LLM layer only explains citations.
 */
import { ALL_EXERCISES, EXERCISE_META, PROGRAMS } from "../data/trainingCatalog.js";
import { getSkill, SKILL_AREAS, SKILLS, skillTier, TIER_META } from "./skillGraph.js";
import {
  auditExerciseSkillCoverage,
  buildExerciseSkillIndex,
  exercisesForSkill,
  programsCoveringSkill,
  skillsForExercise,
} from "./exerciseSkills.js";
import {
  adaptDevelopmentPlan,
  DEVELOPMENT_PATHWAYS,
  DEVELOPMENT_TIERS,
  selectPathway,
} from "./developmentPathways.js";
import { MASTERY_TRACKS, getBenchmark } from "./achievements.js";
import { matchRegistryEntry } from "./pathRegistry.js";
import { CHALLENGES_DEF } from "./personalChallenges.js";

let _indexCache = null;

function enrichProgramIds(ids) {
  return (ids || []).map((id) => {
    const p = PROGRAMS.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, emoji: p.emoji } : { id };
  });
}

export function getExerciseSkillIndex() {
  if (!_indexCache) _indexCache = buildExerciseSkillIndex(ALL_EXERCISES, EXERCISE_META);
  return _indexCache;
}

export function clearCoachKnowledgeCache() {
  _indexCache = null;
}

export const COACH_INTENTS = [
  "pathway_adapt",
  "recommend_program",
  "explain_drill",
  "explain_skill",
  "gap_analysis",
  "search_exercises",
  "legend_plan",
  "build_workout",
  "week_plan",
  "benchmark_check",
  "off_topic",
];

// Track id → the CHALLENGES_DEF entry that most directly trains it. Only mapped
// where the fit is clean — CHALLENGES_DEF is small and generic, so several
// archetypes (maestro, lockdown, finisher, floater, rebounder, eurostep) have
// no honest match and are intentionally left out rather than forced.
const TRACK_CHALLENGE_MAP = {
  shooter: "cs-25",
  ballhandling: "handles-5",
  stepback: "step-15",
  midrange: "pull-20",
  skywalker: "jump-5",
};

// Archetype phrasing for legend requests that don't name a specific player
// ("become a legend ball handler"). Gated behind a qualifier word in
// findLegendTrackFromMessage so ordinary skill questions ("improve my shooting")
// don't misfire into the legend flow.
const ARCHETYPE_KEYWORDS = {
  shooter: ["shooter", "sharpshooter", "shooting legend"],
  ballhandling: ["ball handler", "ballhandler", "handles legend"],
  midrange: ["mid-range", "midrange", "mid range"],
  stepback: ["step-back", "stepback", "step back", "shot creator"],
  maestro: ["playmaker", "point god", "floor general"],
  lockdown: ["defender", "lockdown", "stopper"],
  finisher: ["finisher", "slasher", "rim attacker"],
  floater: ["floater"],
  skywalker: ["athletic legend", "dunker", "high flyer", "above the rim"],
  rebounder: ["rebounder", "glass cleaner", "board legend"],
  eurostep: ["euro stepper"],
};

// Short player-name keys ("kd", "ai", "mj") collide with ordinary English words
// ("locKDown", "wAIt", "reMJndful"-type coincidences) under plain substring
// matching. Require a real word boundary for anything <=4 chars; longer keys
// are specific enough that a bare .includes() is safe.
function keyMatchesAsWord(text, key) {
  if (!key) return false;
  if (key.length > 4) return text.includes(key);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

/**
 * Match a free-text message (or a saved "who do you play like" setting) to a
 * Train Like Legends mastery track. Prefers the curated FAVORITE_PLAYER_REGISTRY
 * (same source onboarding's player picker uses) over the broader per-track
 * favoritePlayerKeys list, since the registry carries better-curated programs
 * and a human-readable playstyle label.
 */
// Registry-only match (real, curated player names) — split out from the full
// matcher below so routeCoachIntent can check it FIRST at top priority, ahead
// of workout-shaped requests, while the broader fuzzy/archetype match (which
// can misfire on ordinary words like "handles" or "defense" that also happen
// to be legend keywords) only runs as a lower-priority fallback.
function findLegendTrackByRegistry(message) {
  const m = (message || "").toLowerCase();
  if (!m) return null;
  const reg = matchRegistryEntry(m);
  if (reg && (reg.keys || []).some((k) => keyMatchesAsWord(m, k))) {
    const track = MASTERY_TRACKS.find((t) => t.id === reg.primaryPath);
    if (track) return { track, registryEntry: reg };
  }
  return null;
}

export function findLegendTrackFromMessage(message) {
  const m = (message || "").toLowerCase();
  if (!m) return null;

  const registryMatch = findLegendTrackByRegistry(message);
  if (registryMatch) return registryMatch;

  let best = null;
  let bestLen = 0;
  for (const track of MASTERY_TRACKS) {
    for (const key of track.favoritePlayerKeys || []) {
      if (key.length > bestLen && keyMatchesAsWord(m, key)) { best = track; bestLen = key.length; }
    }
  }
  if (best) return { track: best, registryEntry: null };

  if (/\b(like|legend|become (a|the)|play like)\b/.test(m)) {
    for (const track of MASTERY_TRACKS) {
      const kws = ARCHETYPE_KEYWORDS[track.id] || [];
      if (kws.some((k) => m.includes(k))) return { track, registryEntry: null };
    }
  }

  return null;
}

// Tactical/game-IQ requests — no dedicated skill area exists for these in the
// skill graph, but the catalog has a real basketball_iq category, so they're
// routed as a build_workout request scoped to that category (see
// parseWorkoutRequest) rather than falling through to a generic fallback.
const IQ_SIGNAL = /basketball iq|pick.?and.?roll|read(ing)? the defense|spacing|move(ment)? without the ball|decision.?making|better decisions|game reads?|turn(ing|s)? (the ball )?over|turnovers|smarter player|what should i look for/;

/** Route a natural-language message to a structured intent (rule-based; LLM can override later) */
export function routeCoachIntent(message = "") {
  const m = message.toLowerCase();
  // Highest priority: an exact, curated player name is unambiguous regardless
  // of what else is in the message.
  if (findLegendTrackByRegistry(message)) return "legend_plan";
  if (checkBenchmark(message)) return "benchmark_check";
  const mentionsWorkout = /\bworkout\b|training session|practice plan/.test(m);
  const mentionsBuildVerb = /\b(build|make|create|design|give me)\b/.test(m);
  const mentionsDuration = /\d+\s*(min|minute|hour|hr)/.test(m);
  const mentionsWeekSpread = /\bweek\b/.test(m) && /\bdifferent\b|each day|every day|don'?t repeat|without repeating|no repeat/.test(m);
  if (mentionsWorkout && mentionsWeekSpread) return "week_plan";
  if (mentionsWorkout && (mentionsBuildVerb || mentionsDuration)) return "build_workout";
  if (IQ_SIGNAL.test(m)) return "build_workout";
  if (/what does .*(drill|exercise)|explain.*(drill|exercise)|why (does|is) this drill/.test(m)) return "explain_drill";
  // An explicit "how do I get better at X" / "help me improve X" beats the
  // fuzzy legend match below — those verbs are a much stronger, more specific
  // signal for "give me drills" than a bare word (e.g. "crossover," "defense")
  // that only happens to double as a legend-track keyword.
  const wantsHelp = /how (can|do) i|get better|help me|better at|struggling with|teach me|why (do|does|am) i|why (do|does) my/.test(m);
  if (wantsHelp && findAllSkillIdsFromMessage(message).length) return "search_exercises";
  // Lower priority: the fuzzy/archetype legend match — checked after both
  // workout-shaped requests and explicit skill-improvement asks so ordinary
  // words that double as legend keywords ("handles," "defense," "crossover")
  // don't hijack them.
  if (findLegendTrackFromMessage(message)) return "legend_plan";
  if (/what (program|plan)|recommend|should i (do|start|enroll)/.test(m)) return "recommend_program";
  if (/skill|work on|improve|weak/.test(m)) return "gap_analysis";
  if (/pathway|development plan|long.?term/.test(m)) return "pathway_adapt";
  if (/find|search|drill for/.test(m)) return "search_exercises";
  if (/what is|explain/.test(m)) return "explain_skill";
  return "pathway_adapt";
}

export function buildAthleteContext({
  settings = {},
  completed = {},
  enrolledProgramIds = [],
  completedProgramIds = [],
  age,
  streak = 0,
  activeChallenges = [],
}) {
  const athleteAge = age ?? (settings.dateOfBirth ? calcAgeFromDob(settings.dateOfBirth) : 12);
  const index = getExerciseSkillIndex();
  const plan = adaptDevelopmentPlan({
    age: athleteAge,
    experience: settings.experience || "beginner",
    goals: settings.goals || [],
    playStyle: settings.playStyle || "any",
    completed,
    enrolledProgramIds,
    completedProgramIds,
    exerciseSkillIndex: index,
  });
  return { athleteAge, exerciseSkillIndex: index, developmentPlan: plan, settings, streak, activeChallenges };
}

// Short, factual add-on for status-aware intents (pathway/gap/recommend) —
// surfaces whatever's most actionable right now (a near-complete challenge
// beats a plain streak mention). Reuses buildCoachAthleteContext's precomputed
// streak/activeChallenges rather than recomputing from raw completed/workouts.
function statusNote(ctx = {}) {
  const closest = (ctx.activeChallenges || [])
    .filter((c) => c.pct >= 60 && c.pct < 100)
    .sort((a, b) => b.pct - a.pct)[0];
  if (closest) return ` You're close on ${closest.name} — ${closest.cur}/${closest.target}.`;
  if ((ctx.streak || 0) >= 3) return ` Keep your ${ctx.streak}-day streak going.`;
  return "";
}

function calcAgeFromDob(dob) {
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.min(17, Math.max(9, age));
}

export function explainExercise(exerciseId) {
  const ex = ALL_EXERCISES[exerciseId];
  if (!ex) return null;
  const index = getExerciseSkillIndex();
  const mapping = index[exerciseId];
  const meta = EXERCISE_META[exerciseId] || ex.meta || {};
  const skills = (mapping?.skills || []).map((id) => {
    const sk = getSkill(id);
    return sk ? { id, name: sk.name, area: sk.area, tier: skillTier(id) } : { id };
  });
  const programs = PROGRAMS.filter((p) =>
    (p.weeks || []).some((w) => (w.sessions || []).some((s) => (s.exercises || []).includes(exerciseId))),
  ).map((p) => ({ id: p.id, name: p.name }));

  return {
    exerciseId,
    name: ex.name,
    category: ex._cat,
    desc: ex.desc,
    coachNotes: ex.coachNotes,
    skills,
    areas: mapping?.areas || [],
    tier: mapping?.tier,
    basketballTransfer: meta.basketballTransfer,
    programs,
    citations: [
      { type: "exercise", id: exerciseId },
      ...skills.map((s) => ({ type: "skill", id: s.id })),
    ],
  };
}

export function explainSkill(skillId) {
  const sk = getSkill(skillId);
  if (!sk) return null;
  const index = getExerciseSkillIndex();
  const exercises = exercisesForSkill(skillId, index).slice(0, 8).map((e) => {
    const ex = ALL_EXERCISES[e.exerciseId];
    return { id: e.exerciseId, name: ex?.name || e.exerciseId, tier: e.tier };
  });
  const programs = programsCoveringSkill(skillId, PROGRAMS, index).map((p) => ({ id: p.id, name: p.name }));

  return {
    skillId,
    name: sk.name,
    area: sk.area,
    areaLabel: SKILL_AREAS[sk.area]?.label,
    tier: skillTier(skillId),
    tierLabel: TIER_META[skillTier(skillId)]?.label,
    exercises,
    programs,
    citations: [{ type: "skill", id: skillId }, ...exercises.map((e) => ({ type: "exercise", id: e.id }))],
  };
}

export function searchExercisesForSkill(skillId, { maxTier = 3, limit = 12 } = {}) {
  const index = getExerciseSkillIndex();
  return exercisesForSkill(skillId, index)
    .filter((e) => !e.tier || e.tier <= maxTier)
    .slice(0, limit)
    .map((e) => {
      const ex = ALL_EXERCISES[e.exerciseId];
      return { id: e.exerciseId, name: ex?.name, tier: e.tier, areas: e.areas };
    });
}

/** Group drills by skill for a free-text query that may name more than one skill. */
export function searchExercisesForSkills(skillIds, opts = {}) {
  const seen = new Set();
  const groups = [];
  for (const skillId of skillIds || []) {
    const sk = getSkill(skillId);
    if (!sk) continue;
    const exercises = searchExercisesForSkill(skillId, { ...opts, limit: opts.limitPerSkill || 4 })
      .filter((e) => !seen.has(e.id));
    exercises.forEach((e) => seen.add(e.id));
    if (exercises.length) groups.push({ skillId, skillName: sk.name, exercises });
  }
  return groups;
}

/**
 * Build a "Train Like Legends" grounded plan for a matched mastery track —
 * signature drills pulled from the stages within the athlete's current tier,
 * curated programs (registry-preferred), and a related weekly challenge where
 * one honestly exists.
 */
export function explainLegendTrack({ track, registryEntry }, athleteContext = {}) {
  const { developmentPlan } = buildAthleteContext(athleteContext);
  const targetTier = developmentPlan?.targetTier || 1;
  const stages = track.stages.slice(0, Math.min(track.stages.length, targetTier + 1));
  const currentStage = stages[stages.length - 1];

  const drillIds = [...new Set(stages.flatMap((s) => (s.signatureDrills || []).map((d) => d.exId)))].slice(0, 6);
  const exercises = drillIds
    .map((id) => (ALL_EXERCISES[id] ? { id, name: ALL_EXERCISES[id].name } : null))
    .filter(Boolean);

  const programIds = registryEntry?.programs?.length ? registryEntry.programs : (track.relatedProgramIds || []);
  const programs = programIds
    .map((id) => {
      const p = PROGRAMS.find((x) => x.id === id);
      return p ? { id: p.id, name: p.name, emoji: p.emoji } : null;
    })
    .filter(Boolean);

  const challengeDef = TRACK_CHALLENGE_MAP[track.id] && CHALLENGES_DEF.find((c) => c.id === TRACK_CHALLENGE_MAP[track.id]);

  return {
    trackId: track.id,
    archetype: track.archetype,
    theme: track.theme,
    emoji: track.emoji,
    inspo: currentStage?.inspo || null,
    stageName: currentStage?.name,
    playstyleLabel: registryEntry?.label || null,
    exercises,
    programs,
    relatedChallenge: challengeDef
      ? { id: challengeDef.id, name: challengeDef.name, emoji: challengeDef.emoji, desc: challengeDef.desc }
      : null,
    citations: [
      ...exercises.map((e) => ({ type: "exercise", id: e.id })),
      ...programs.map((p) => ({ type: "program", id: p.id })),
    ],
  };
}

// Catalog category (ALL_EXERCISES[id]._cat) → human label, for grouping a built workout.
const CATEGORY_LABELS = {
  strength: "Strength", conditioning: "Conditioning", athletic: "Athletic Movement",
  explosion: "Explosion", speed: "Speed", balance: "Balance", coordination: "Coordination",
  deceleration: "Deceleration",
  handles: "Ball Handling", ballhandling: "Ball Handling", game_handles: "Ball Handling",
  shooting: "Shooting", shootingdrills: "Shooting", shooting_lab: "Shooting",
  footwork: "Footwork", footwork_lab: "Footwork",
  finishing: "Finishing", finishing_school: "Finishing",
  passing: "Passing", rebounding: "Rebounding", defense: "Defense",
  postmoves: "Post Moves", basketball_iq: "Basketball IQ", partner_games: "Partner Games",
};

// A "strength workout" request pulls from the same category mix as the
// existing Full Body Athlete template in the daily-workout generator.
const STRENGTH_CATEGORIES = ["strength", "conditioning", "athletic"];

// Skill area → the catalog categories (ALL_EXERCISES._cat) that cover it.
const AREA_TO_CATEGORIES = {
  handles: ["handles", "ballhandling", "game_handles"],
  shooting: ["shooting", "shootingdrills", "shooting_lab"],
  finishing: ["finishing", "finishing_school"],
  footwork: ["footwork", "footwork_lab"],
  passing: ["passing"],
  defense: ["defense"],
  rebounding: ["rebounding"],
};

// Broader "what kind of workout" phrasing that doesn't route through a single
// skill match — a kid says "dribbling workout" or "defensive workout," not a
// formal skill name. Checked directly against the message, independent of
// findAllSkillIdsFromMessage.
const WORKOUT_CATEGORY_KEYWORDS = [
  [/dribbl(e|ing)|cone (dribbling|handling)/, ["handles", "ballhandling", "game_handles"]],
  [/shooting|jump ?shot|catch.?and.?shoot/, ["shooting", "shootingdrills", "shooting_lab"]],
  [/finish(ing)?|layup|floater/, ["finishing", "finishing_school"]],
  [/footwork|pivot|agility|change of direction/, ["footwork", "footwork_lab", "coordination"]],
  [/defen(se|sive)|lockdown|closeout/, ["defense"]],
  [/rebound(ing)?|glass/, ["rebounding"]],
  [/passing/, ["passing"]],
  [/explosion|vertical|explosive|dunk|jump(ing)? higher/, ["explosion", "athletic"]],
  [/speed|quick(ness)?|faster/, ["speed", "coordination"]],
];

function parseWorkoutRequest(message) {
  const m = (message || "").toLowerCase();
  const minMatch = m.match(/(\d+)\s*(?:min(?:ute)?s?)\b/);
  const hrMatch = m.match(/(\d+)\s*(?:hours?|hrs?)\b/);
  let minutes = null;
  if (minMatch) minutes = parseInt(minMatch[1], 10);
  else if (hrMatch) minutes = parseInt(hrMatch[1], 10) * 60;

  const wantsStrength = /strength|weights?|lifting|full.?body|conditioning/.test(m);
  const skillAreas = [...new Set(findAllSkillIdsFromMessage(m).map((id) => getSkill(id)?.area).filter(Boolean))];
  const wantsBasketballGeneric = /basketball|hoop|skill work|\bdrills?\b/.test(m);
  const wantsIQ = IQ_SIGNAL.test(m);

  const categories = new Set();
  if (wantsStrength) STRENGTH_CATEGORIES.forEach((c) => categories.add(c));
  if (wantsIQ) categories.add("basketball_iq");
  skillAreas.forEach((area) => (AREA_TO_CATEGORIES[area] || []).forEach((c) => categories.add(c)));
  for (const [pattern, cats] of WORKOUT_CATEGORY_KEYWORDS) {
    if (pattern.test(m)) cats.forEach((c) => categories.add(c));
  }
  // Named "basketball" without naming a specific skill → a balanced default mix.
  if (wantsBasketballGeneric && !skillAreas.length && categories.size === (wantsStrength ? STRENGTH_CATEGORIES.length : 0)) {
    ["handles", "shooting", "footwork"].forEach((c) => categories.add(c));
  }
  // A stated duration but no named focus at all ("30 minute workout today")
  // is a clear "just build me something" ask, not a missing piece — asking
  // them to repeat the duration they already gave would be a contradiction.
  if (!categories.size && minutes != null) {
    ["handles", "shooting", "footwork"].forEach((c) => categories.add(c));
  }

  // Equipment/space constraints — a kid saying "no hoop" or "just a driveway"
  // should never get shooting/finishing drills back (both assume a basket)
  // or gear-dependent exercises when they said they have none.
  const noHoop = /no (basketball )?hoop|no basket\b|no rim/.test(m);
  const noEquipment = /no equipment|nothing but a ball|just a ball|only a basketball|no gear|not even a ball/.test(m);
  const constrainedSpace = /driveway|garage|small space|backyard|no gym/.test(m);
  if (noHoop) {
    ["shooting", "shootingdrills", "shooting_lab", "finishing", "finishing_school"].forEach((c) => categories.delete(c));
  }

  return { minutes: minutes || 30, categories: [...categories], noEquipment, noHoop, constrainedSpace };
}

/** Exercise ids completed in the last `days` days, from athleteContext.completed
 * (keys are "YYYY-MM-DD-...-exerciseId"). Used to bias workout generation away
 * from what was *just* done — the same anti-repeat signal the app's daily
 * workout generator already uses, now applied to coach-built workouts too. */
function recentlyDoneExerciseIds(completed, days = 3) {
  const cutoff = new Date(Date.now() - days * 86400000).toLocaleDateString("en-CA");
  const ids = new Set();
  for (const [key, done] of Object.entries(completed || {})) {
    if (!done) continue;
    const dateStr = key.split("-").slice(0, 3).join("-");
    if (dateStr < cutoff) continue;
    const exId = key.split("-").slice(3).join("-");
    if (exId) ids.add(exId);
  }
  return ids;
}

/**
 * Core exercise-picking pass, shared by buildCustomWorkout (one session) and
 * buildWeekPlan (several sessions in a row). `extraExcludeIds` lets a
 * multi-day caller carry forward what earlier days already used, so a week
 * plan doesn't repeat the same drills every day.
 */
function pickWorkoutExercises({ categories, minutes, athleteAge, pRank, noEquipment, constrainedSpace, injured, recentIds, extraExcludeIds }) {
  const dRank = { beginner: 0, intermediate: 1, advanced: 2 };
  const eligible = Object.values(ALL_EXERCISES).filter((ex) => {
    if (!categories.includes(ex._cat)) return false;
    const meta = ex.meta || {};
    if (meta.ageRange && athleteAge < meta.ageRange[0]) return false;
    if ((dRank[meta.difficulty] ?? 0) > pRank + 1) return false;
    if (noEquipment && meta.equipment && !["none", "ball", "basketball"].includes(meta.equipment)) return false;
    if (constrainedSpace && meta.spaceRequired === "large") return false;
    // A stated injury rules out high-impact work entirely rather than just
    // capping how much of it appears — this isn't a substitute for a
    // parent/coach's judgment call, just a default-safe filter.
    if (injured && meta.impactLevel === "high") return false;
    return true;
  });

  const scored = eligible
    .map((ex) => ({
      ...ex,
      _score: (ex.meta?.funScore || 5) + Math.random() * 1.5
        - (recentIds?.has(ex.id) ? 4 : 0)
        - (extraExcludeIds?.has(ex.id) ? 6 : 0),
    }))
    .sort((a, b) => b._score - a._score);

  const maxSecs = minutes * 60 * 1.05;
  const maxHighImpact = injured ? 0 : Math.max(1, Math.round(minutes / 15));
  let totalSecs = 0;
  let highImpact = 0;
  const used = new Set();
  const picked = [];

  const warmup = scored.find((ex) => (ex.meta?.workoutRole || []).includes("warmup"));
  if (warmup) {
    used.add(warmup.id);
    totalSecs += warmup.meta?.estimatedDuration || 90;
    picked.push(warmup);
  }

  for (const ex of scored) {
    if (used.has(ex.id)) continue;
    const dur = ex.meta?.estimatedDuration || 90;
    if (totalSecs + dur > maxSecs) continue;
    if (ex.meta?.impactLevel === "high") {
      if (highImpact >= maxHighImpact) continue;
      highImpact++;
    }
    used.add(ex.id);
    totalSecs += dur;
    picked.push(ex);
  }

  return { picked, totalSecs };
}

// Several raw catalog categories share one display label (shooting/
// shootingdrills/shooting_lab all read "Shooting") — group by label, not by
// raw category, so the UI doesn't show the same section header twice.
function sectionsFor(picked, categories) {
  const labelOrder = [];
  const byLabel = new Map();
  for (const cat of categories) {
    const label = CATEGORY_LABELS[cat] || cat;
    if (!byLabel.has(label)) { byLabel.set(label, []); labelOrder.push(label); }
  }
  for (const ex of picked) {
    const label = CATEGORY_LABELS[ex._cat] || ex._cat;
    if (!byLabel.has(label)) { byLabel.set(label, []); labelOrder.push(label); }
    byLabel.get(label).push({ id: ex.id, name: ex.name });
  }
  return labelOrder
    .map((label) => ({ category: label, label, exercises: byLabel.get(label) }))
    .filter((s) => s.exercises.length);
}

/**
 * Compose a custom workout from the catalog to fit a requested duration and
 * focus (e.g. "a 45 minute strength and basketball workout"). Uses the same
 * scoring signals (funScore, difficulty, impact-level caps) as the app's
 * daily-workout generator, but parameterized by whatever categories the
 * request actually names instead of a fixed template.
 */
export function buildCustomWorkout(message, athleteContext = {}, injuryHint) {
  const { minutes, categories, noEquipment, constrainedSpace } = parseWorkoutRequest(message);
  if (!categories.length) return null;
  const injured = hasInjurySignal(message, injuryHint);

  const { athleteAge, settings } = buildAthleteContext(athleteContext);
  const dRank = { beginner: 0, intermediate: 1, advanced: 2 };
  const pRank = dRank[settings.experience || "beginner"] ?? 0;
  const recentIds = recentlyDoneExerciseIds(athleteContext.completed);

  const { picked, totalSecs } = pickWorkoutExercises({
    categories, minutes, athleteAge, pRank, noEquipment, constrainedSpace, injured, recentIds,
  });

  return {
    requestedMinutes: minutes,
    totalMinutes: Math.round(totalSecs / 60),
    sections: sectionsFor(picked, categories),
    exerciseCount: picked.length,
    citations: picked.map((ex) => ({ type: "exercise", id: ex.id })),
  };
}

const DAY_LABELS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];

/**
 * Build several days' worth of non-repeating sessions in one response (e.g.
 * "give me a different workout every day this week"). Each day reuses the
 * same duration/focus parsed from the request, but carries forward what
 * earlier days already picked so the week doesn't repeat itself — no
 * conversation memory needed, it's all resolved in this one call.
 */
export function buildWeekPlan(message, athleteContext = {}, injuryHint) {
  const { minutes, categories, noEquipment, constrainedSpace } = parseWorkoutRequest(message);
  if (!categories.length) return null;
  const injured = hasInjurySignal(message, injuryHint);

  const { athleteAge, settings } = buildAthleteContext(athleteContext);
  const dRank = { beginner: 0, intermediate: 1, advanced: 2 };
  const pRank = dRank[settings.experience || "beginner"] ?? 0;
  const recentIds = recentlyDoneExerciseIds(athleteContext.completed);

  const dayCount = /\bevery day\b|\b7 days?\b|\ball week\b/.test((message || "").toLowerCase()) ? 7 : 5;
  const usedAcrossDays = new Set();
  const days = [];

  for (let i = 0; i < dayCount; i++) {
    const { picked, totalSecs } = pickWorkoutExercises({
      categories, minutes, athleteAge, pRank, noEquipment, constrainedSpace, injured, recentIds,
      extraExcludeIds: usedAcrossDays,
    });
    if (!picked.length) break;
    picked.forEach((ex) => usedAcrossDays.add(ex.id));
    days.push({
      dayLabel: DAY_LABELS[i] || `Day ${i + 1}`,
      totalMinutes: Math.round(totalSecs / 60),
      sections: sectionsFor(picked, categories),
      exerciseCount: picked.length,
    });
  }

  if (!days.length) return null;
  const allIds = days.flatMap((d) => d.sections.flatMap((s) => s.exercises.map((e) => e.id)));
  return {
    requestedMinutes: minutes,
    dayCount: days.length,
    days,
    // The category pool can be smaller than dayCount × drills-per-day (e.g.
    // ~40 shooting drills can't fill 7 fully non-repeating sessions) — report
    // what actually happened rather than always claiming "no repeats."
    totalDrillSlots: allIds.length,
    uniqueDrillCount: new Set(allIds).size,
    citations: days.flatMap((d) => d.sections.flatMap((s) => s.exercises.map((e) => ({ type: "exercise", id: e.id })))),
  };
}

// Which BENCHMARKS entry a stat question is about — kept separate from
// SKILL_PHRASES since these map to achievements.js's real, kid-calibrated
// thresholds (FT 70%, 3PT 33%, etc.), not the skill graph.
const BENCHMARK_TYPE_KEYWORDS = [
  [/free throws?|\bft%?\b/, "ft_pct"],
  [/three(s|-pointers?)?|\b3s\b|3.?pt|3.?point/, "spot3_pct"],
  [/mid.?range/, "midrange_pct"],
];
const STAT_MATCH = /(\d+)\s*(?:\/|out of|of|-for-)\s*(\d+)/i;
const STREAK_MATCH = /(\d+)\s*layups?\s*(?:in a row|straight|consecutive)/i;

/**
 * Parse a stat a kid reports ("35 out of 100 threes", "12 layups in a row")
 * and check it against the app's real benchmark thresholds — grounded in the
 * same BENCHMARKS/title data the achievement system uses, not a guess.
 */
export function checkBenchmark(message) {
  const m = (message || "").toLowerCase();

  const streakMatch = m.match(STREAK_MATCH);
  if (streakMatch) {
    const made = parseInt(streakMatch[1], 10);
    return buildBenchmarkResult(getBenchmark("layups_row"), made, null, made);
  }

  const statMatch = m.match(STAT_MATCH);
  if (!statMatch) return null;
  const made = parseInt(statMatch[1], 10);
  const attempted = parseInt(statMatch[2], 10);
  if (!attempted) return null;

  let benchmarkId = "spot3_pct"; // most common ask when unspecified
  for (const [pattern, id] of BENCHMARK_TYPE_KEYWORDS) {
    if (pattern.test(m)) { benchmarkId = id; break; }
  }
  const value = Math.round((made / attempted) * 1000) / 10;
  return buildBenchmarkResult(getBenchmark(benchmarkId), made, attempted, value);
}

function buildBenchmarkResult(bm, made, attempted, value) {
  if (!bm) return null;
  const meetsThreshold = value >= bm.threshold;
  const statLabel = bm.unit === "%" ? `${value}%` : `${value} ${bm.label.toLowerCase()}`;
  return {
    benchmarkId: bm.id,
    label: bm.label,
    made,
    attempted,
    value,
    threshold: bm.threshold,
    unit: bm.unit,
    meetsThreshold,
    titleLabel: bm.title.label,
    citations: [],
    message: meetsThreshold
      ? `${statLabel} clears the ${bm.threshold}${bm.unit} benchmark for ${bm.emoji} ${bm.title.label} — that's real accuracy.`
      : `${statLabel} — the benchmark for ${bm.emoji} ${bm.title.label} is ${bm.threshold}${bm.unit}. Keep stacking reps to close the gap.`,
  };
}

export function runGapAnalysis(ctx) {
  const { developmentPlan } = buildAthleteContext(ctx);
  const coverage = auditExerciseSkillCoverage(ALL_EXERCISES, EXERCISE_META);

  return {
    pathway: { id: developmentPlan.pathwayId, name: developmentPlan.pathwayName },
    targetTier: developmentPlan.targetTier,
    tierLabel: developmentPlan.tierLabel,
    skillGaps: developmentPlan.skillGaps,
    weakAreas: developmentPlan.weakAreas,
    recommendedPrograms: developmentPlan.recommendedPrograms.map((id) => {
      const p = PROGRAMS.find((x) => x.id === id);
      return p ? { id: p.id, name: p.name, emoji: p.emoji } : { id };
    }),
    catalogCoverage: {
      mapped: coverage.withSkills,
      total: coverage.total,
      unmappedCount: coverage.unmapped.length,
    },
    citations: developmentPlan.skillGaps.map((g) => ({ type: "skill", id: g.id })),
  };
}

// Kid-facing labels for development tiers (internal keys stay Foundation/Application/Game-Speed).
const KID_TIER_LABEL = {
  Foundation: "building basics",
  Application: "game moves",
  "Game-Speed": "game speed",
};
function kidTierLabel(tierLabel) {
  return KID_TIER_LABEL[tierLabel] || (tierLabel || "").toLowerCase();
}

export function recommendProgram(ctx) {
  const analysis = runGapAnalysis(ctx);
  const top = analysis.recommendedPrograms[0];
  return {
    ...analysis,
    primaryRecommendation: top,
    message: top
      ? `For where you are now (${kidTierLabel(analysis.tierLabel)}), start with ${top.emoji || ""} ${top.name}.`
      : "You're in the right programs for now — keep stacking sessions.",
  };
}

// A message that signals a multi-week/season ask gets its recommended
// program's real duration surfaced explicitly — the PROGRAMS catalog already
// contains structured multi-week plans, this just names that fact instead of
// silently handing back what reads like a single-session suggestion.
function multiWeekSuffix(message, programId) {
  const m = (message || "").toLowerCase();
  if (!/\bweek\b|\bmonth\b|offseason|long.?term|season/.test(m)) return "";
  const p = PROGRAMS.find((x) => x.id === programId);
  return p?.duration ? ` It's a structured ${p.duration}-week plan.` : "";
}

// Short, bounded, pre-written acknowledgments for emotional/confidence
// statements. These never replace the grounded training answer — they
// preface it — and are static text (no generated content), which matters for
// a kids' product: the coach can be warm without improvising anything.
const MINDSET_PHRASES = [
  [/lose confidence|losing confidence/, "Missed shots happen to every shooter, even the pros. Here's what to focus on next:"],
  [/nervous before games|get nervous/, "Nerves mean you care — a solid warm-up routine helps a lot. Here's your focus:"],
  [/too passive|be more aggressive|become more aggressive/, "Aggression is a habit built in practice, not flipped on in games. Here's where to build it:"],
  [/don'?t think i'?m improving|not improving/, "Improvement is hard to see day-to-day — it shows up over weeks. Here's what to keep stacking:"],
  [/teammate is better than me/, "Comparing to last month's you matters more than comparing to teammates. Here's your focus:"],
  [/barely play|don'?t play much/, "Keep stacking reps — that's what earns minutes. Here's where to put the work:"],
  [/terrible game|bad game|rough game/, "One game doesn't define you. Here's what to work on next:"],
  [/motivate me/, "You showed up and asked — that's the hard part done. Here's today's focus:"],
  [/make varsity|make the team/, "Coaches notice consistency more than one big game. Here's what to build:"],
  [/panic under pressure/, "That's normal — reps under a little pressure in practice fix it fastest. Here's where to start:"],
];

function findMindsetAcknowledgment(message) {
  const m = (message || "").toLowerCase();
  for (const [pattern, line] of MINDSET_PHRASES) {
    if (pattern.test(m)) return line;
  }
  return null;
}

// Common local phrasings for a current injury/soreness — checked offline,
// with no LLM required, since this is safety-relevant and must work even
// signed out. The LLM classifier can additionally set `injuryHint` for
// phrasings this regex misses; both feed the same acknowledgment + the same
// high-impact exercise filter in buildCustomWorkout.
const INJURY_PATTERN = /\b(sore|hurt|hurts|injur(?:ed|y)|sprain(?:ed)?|tweak(?:ed)?|rolled|twisted)\b[^.!?]{0,25}\b(ankle|knee|foot|feet|leg|hamstring|back|shoulder|wrist|hand|elbow|shin|calf|hip)\b|\b(ankle|knee|foot|feet|leg|hamstring|back|shoulder|wrist|hand|elbow|shin|calf|hip)\b[^.!?]{0,25}\b(sore|hurt|hurts|injur(?:ed|y)|sprain(?:ed)?)\b/i;

function hasInjurySignal(message, injuryHint) {
  return !!injuryHint || INJURY_PATTERN.test(message || "");
}

function findInjuryAcknowledgment(message, injuryHint) {
  return hasInjurySignal(message, injuryHint)
    ? "Since you mentioned something's sore, here's a lighter plan — and check with a parent or coach before pushing through any pain."
    : null;
}

/**
 * Main coach agent entry — structured response for UI or edge function.
 * LLM layer receives this payload and rewrites `message` in coach voice.
 */
export function handleCoachRequest({
  intent,
  message = "",
  exerciseId,
  skillId,
  skillIds,
  injuryHint,
  athleteContext = {},
}) {
  const resolvedIntent = intent || routeCoachIntent(message);
  const ctx = athleteContext;
  const result = resolveCoachIntent(resolvedIntent, { message, exerciseId, skillId, skillIds, injuryHint, ctx });

  const ack = findInjuryAcknowledgment(message, injuryHint) || findMindsetAcknowledgment(message);
  if (ack) result.message = `${ack} ${result.message}`;
  return result;
}

function resolveCoachIntent(resolvedIntent, { message, exerciseId, skillId, skillIds, injuryHint, ctx }) {
  switch (resolvedIntent) {
    case "off_topic": {
      return {
        intent: resolvedIntent,
        data: null,
        message: "That's not something I can help with — I'm all about your basketball training. Ask me about drills, what to work on next, or a workout and I'll build it.",
      };
    }
    case "explain_drill": {
      const data = explainExercise(exerciseId) || explainExercise(findExerciseIdFromMessage(message));
      return {
        intent: resolvedIntent,
        data,
        message: data
          ? `${data.name}: ${data.coachNotes || data.desc || "Here's what this drill builds."}`
          : "I couldn't find that drill — try asking about a specific skill instead.",
      };
    }
    case "explain_skill": {
      const data = explainSkill(skillId) || explainSkill(findSkillIdFromMessage(message));
      const topDrills = (data?.exercises || []).slice(0, 3).map((e) => e.name).join(", ");
      return {
        intent: resolvedIntent,
        data,
        message: data
          ? `${data.name} (${data.areaLabel}) is a ${data.tierLabel} skill.${topDrills ? ` Best drills: ${topDrills}.` : ""}`
          : "I couldn't find that skill — try asking about handles, shooting, finishing, footwork, passing, defense, or rebounding.",
      };
    }
    case "build_workout": {
      const data = buildCustomWorkout(message, ctx, injuryHint);
      if (!data || !data.sections.length) {
        return {
          intent: resolvedIntent,
          data: null,
          message: 'Tell me how long you\'ve got and what to focus on — like "a 45 minute strength and basketball workout" — and I\'ll build it.',
        };
      }
      const sectionSummary = data.sections.map((s) => s.label).join(" + ");
      return {
        intent: resolvedIntent,
        data,
        message: `${data.totalMinutes}-min workout — ${sectionSummary}. ${data.exerciseCount} drills, ready to go.`,
      };
    }
    case "week_plan": {
      const data = buildWeekPlan(message, ctx, injuryHint);
      if (!data || !data.days.length) {
        return {
          intent: resolvedIntent,
          data: null,
          message: 'Tell me how long each session should be and what to focus on — like "a different 30 minute shooting workout every day this week" — and I\'ll build the week.',
        };
      }
      const repeatNote = data.uniqueDrillCount === data.totalDrillSlots
        ? "no repeats"
        : `${data.uniqueDrillCount} different drills — the ${data.days[0].sections.map((s) => s.label).join("/")} pool isn't big enough to go fully repeat-free for ${data.dayCount} days`;
      return {
        intent: resolvedIntent,
        data,
        message: `${data.dayCount}-day plan built, ${repeatNote} — ${data.days[0].totalMinutes} min/session on ${data.days.map((d) => d.dayLabel).join(", ")}.`,
      };
    }
    case "benchmark_check": {
      const data = checkBenchmark(message);
      if (!data) {
        return {
          intent: resolvedIntent,
          data: null,
          message: "Tell me a made/attempted count — like \"18 out of 25 free throws\" — and I'll check it against real benchmarks.",
        };
      }
      return { intent: resolvedIntent, data, message: data.message };
    }
    case "search_exercises": {
      const resolvedSkillIds = (Array.isArray(skillIds) && skillIds.length)
        ? skillIds
        : (skillId ? [skillId] : findAllSkillIdsFromMessage(message).slice(0, 3));
      const data = searchExercisesForSkills(resolvedSkillIds);
      const totalDrills = data.reduce((n, g) => n + g.exercises.length, 0);
      const preview = data.flatMap((g) => g.exercises).slice(0, 3).map((e) => e.name).join(", ");
      return {
        intent: resolvedIntent,
        data,
        message: data.length
          ? `Here's what'll help with ${data.map((g) => g.skillName).join(" and ")}: ${preview}${totalDrills > 3 ? "…" : "."}`
          : "I couldn't find a drill for that — try naming a specific skill, like crossover or closeout.",
      };
    }
    case "legend_plan": {
      let match = findLegendTrackFromMessage(message);
      if (!match) {
        const favQuery = (ctx.settings?.favoritePlayLike || "").toLowerCase();
        const favEntry = matchRegistryEntry(favQuery);
        const favMatchesAsWord = favEntry && (favEntry.keys || []).some((k) => keyMatchesAsWord(favQuery, k));
        const favTrack = favMatchesAsWord && MASTERY_TRACKS.find((t) => t.id === favEntry.primaryPath);
        if (favTrack) match = { track: favTrack, registryEntry: favEntry };
      }
      if (!match) {
        return {
          intent: resolvedIntent,
          data: null,
          message: 'Tell me a player or a style — like "shoot like Steph" or "become a legend ball handler" — and I\'ll build your path.',
        };
      }
      const data = explainLegendTrack(match, ctx);
      const who = data.inspo ? ` — start like ${data.inspo}` : "";
      const drillNames = data.exercises.slice(0, 3).map((e) => e.name).join(", ");
      return {
        intent: resolvedIntent,
        data,
        message: `${data.emoji} ${data.archetype}${who}.${data.playstyleLabel ? ` ${data.playstyleLabel}.` : ""} Try: ${drillNames || "check the drills below"}.`,
      };
    }
    case "recommend_program": {
      const rec = recommendProgram(ctx);
      return { intent: resolvedIntent, data: rec, message: rec.message + multiWeekSuffix(message, rec.primaryRecommendation?.id) + statusNote(ctx) };
    }
    case "gap_analysis": {
      const gaps = runGapAnalysis(ctx);
      const base = gaps.skillGaps.length
        ? `Focus next on: ${gaps.skillGaps.slice(0, 3).map((g) => g.name).join(", ")}.`
        : "You're on track with what matters most right now — keep stacking.";
      return {
        intent: resolvedIntent,
        data: gaps,
        message: base + statusNote(ctx),
      };
    }
    case "pathway_adapt":
    default: {
      const { developmentPlan } = buildAthleteContext(ctx);
      const pathway = DEVELOPMENT_PATHWAYS.find((p) => p.id === developmentPlan.pathwayId);
      const programs = enrichProgramIds(developmentPlan.recommendedPrograms);
      const base = `${developmentPlan.pathwayName} — ${kidTierLabel(developmentPlan.tierLabel)}. ${programs.length ? `Next up: ${programs[0].emoji || ""} ${programs[0].name || programs[0].id}.` : "Stay consistent with your current plan."}`;
      return {
        intent: "pathway_adapt",
        data: { ...developmentPlan, recommendedPrograms: programs, pathwayDescription: pathway?.description, tiers: DEVELOPMENT_TIERS },
        message: base + multiWeekSuffix(message, programs[0]?.id) + statusNote(ctx),
      };
    }
  }
}

function findExerciseIdFromMessage(message) {
  const m = message.toLowerCase();
  for (const [id, ex] of Object.entries(ALL_EXERCISES)) {
    if (m.includes(id.replace(/-/g, " ")) || m.includes((ex.name || "").toLowerCase())) return id;
  }
  return null;
}

// Natural-language phrasing that doesn't literally match a skill name — the
// stuff a kid actually types ("changing direction with the ball", "shooting
// off the dribble") rather than the catalog's formal skill names.
const SKILL_PHRASES = [
  [/change.?(of.?)?direction|changing direction|break (their|his|her|your)? ?ankles|shake (a |the )?defender|get past (a |the )?defender/, "cross"],
  [/(shoot|shooting|score|scoring) off (the |a )?dribble|pull.?up (jumper|shot)?/, "pullup_1"],
  [/step.?back/, "step_back"],
  [/hesi(tation)?/, "hesitation"],
  [/spin move/, "spin"],
  [/behind.the.back/, "behind"],
  [/between.the.legs/, "between"],
  [/euro.?step/, "euro"],
  [/floater|runner/, "floater"],
  [/box out|rebound(ing)?|grab (more )?boards|crash the glass/, "reb_ready"],
  [/closeout|contain(ing)? (the )?ball on defense|guard the ball|stay in front (of|on) (my|your|a|the) (man|matchup)/, "closeout"],
  [/catch and shoot|spot.?up/, "catch_shoot"],
  [/jab step/, "jab_go"],
  [/pivot/, "front_pivot_skill"],
  [/finish (at|through) contact|and.?one/, "layup"],
  [/miss(ing)? (it |shots? )?(to the )?(left|right|short|long)|shot (feels|is) (too )?(flat|off)|shooting form/, "catch_shoot"],
  [/(elite|better|good) handles?/, "pound"],
];

// Generic single-word shortcuts — only consulted when nothing more specific
// matched above, so e.g. "shooting off the dribble" resolves to the precise
// pull-up skill instead of also picking up the generic "shooting" catch-all.
const SKILL_FALLBACK_PHRASES = [
  [/crossover/, "cross"], [/handles/, "pound"], [/shooting/, "catch_shoot"],
  [/finish/, "layup"], [/defense/, "def_stance"], [/rebound/, "reb_ready"],
];

/**
 * Find every skill a free-text message plausibly refers to (not just the
 * first match) — a kid's question often names more than one thing at once
 * ("changing direction AND shooting off the dribble").
 */
export function findAllSkillIdsFromMessage(message) {
  const m = (message || "").toLowerCase();
  const found = [];
  const seen = new Set();
  const add = (id) => { if (id && !seen.has(id)) { seen.add(id); found.push(id); } };

  // Most specific: literal skill names mentioned in the message, longest first.
  SKILLS
    .filter((sk) => sk.name && m.includes(sk.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)
    .forEach((sk) => add(sk.id));

  for (const [pattern, id] of SKILL_PHRASES) {
    if (pattern.test(m)) add(id);
  }

  if (!found.length) {
    for (const [pattern, id] of SKILL_FALLBACK_PHRASES) {
      if (pattern.test(m)) add(id);
    }
  }

  // Fall back to a representative skill for a mentioned skill area.
  if (!found.length) {
    for (const [areaId, area] of Object.entries(SKILL_AREAS)) {
      if (m.includes(area.label.toLowerCase())) {
        const areaSkill = SKILLS.find((s) => s.area === areaId);
        if (areaSkill) add(areaSkill.id);
      }
    }
  }

  return found;
}

function findSkillIdFromMessage(message) {
  return findAllSkillIdsFromMessage(message)[0] || null;
}

export { skillsForExercise, DEVELOPMENT_PATHWAYS, adaptDevelopmentPlan, selectPathway };
