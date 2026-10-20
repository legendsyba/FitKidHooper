import { calcAge } from "./periodStats.js";

export const BUILD_FOCUS_OPTIONS = [
  { id: "mission", label: "Today's Mission", emoji: "🎯", desc: "Drills from your daily mission goals" },
  { id: "shooting", label: "Shooting", emoji: "🏀", cats: ["shooting", "shooting_lab", "shootingdrills"] },
  { id: "handles", label: "Ball Handling", emoji: "🤲", cats: ["handles", "game_handles", "ballhandling"] },
  { id: "footwork", label: "Footwork & Speed", emoji: "👟", cats: ["footwork", "footwork_lab", "speed", "coordination"] },
  { id: "finishing", label: "Finishing", emoji: "🪣", cats: ["finishing", "postmoves"] },
  { id: "strength", label: "Strength", emoji: "💪", cats: ["strength", "explosion", "deceleration"] },
  { id: "conditioning", label: "Conditioning", emoji: "🔥", cats: ["conditioning", "athletic"] },
  { id: "mix", label: "Mix It Up", emoji: "⭐", cats: ["ballhandling", "shooting", "footwork", "finishing", "conditioning"] },
];

export const BUILD_INTENSITY_OPTIONS = [
  { id: "easy", label: "Easy", emoji: "🌱", desc: "Shorter session · lighter moves" },
  { id: "medium", label: "Medium", emoji: "⚡", desc: "Balanced workout" },
  { id: "hard", label: "Hard", emoji: "🔥", desc: "More drills · tougher challenge" },
];

const AGE_RULES = {
  9: { maxMinutes: 12, maxHighImpact: 1 },
  10: { maxMinutes: 15, maxHighImpact: 2 },
  11: { maxMinutes: 18, maxHighImpact: 2 },
  12: { maxMinutes: 20, maxHighImpact: 3 },
  13: { maxMinutes: 25, maxHighImpact: 4 },
  14: { maxMinutes: 30, maxHighImpact: 5 },
};

const INTENSITY = {
  easy: { warmup: 1, main: 2, finisher: 0, recovery: 1, difficultyBonus: -1, impactDelta: -1 },
  medium: { warmup: 1, main: 3, finisher: 1, recovery: 1, difficultyBonus: 0, impactDelta: 0 },
  hard: { warmup: 1, main: 4, finisher: 1, recovery: 1, difficultyBonus: 1, impactDelta: 1 },
};

const DIFF_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

function missionExerciseIds(mission) {
  if (!mission?.tasks?.length) return [];
  const ids = [];
  const seen = new Set();
  for (const task of mission.tasks) {
    if (task.type === "shots") continue;
    for (const exId of task.exercises || []) {
      if (!seen.has(exId)) {
        seen.add(exId);
        ids.push(exId);
      }
    }
  }
  return ids;
}

function missionCategories(mission, allExercises) {
  const cats = new Set();
  for (const id of missionExerciseIds(mission)) {
    const cat = allExercises[id]?._cat;
    if (cat) cats.add(cat);
  }
  for (const task of mission?.tasks || []) {
    if (task.category) cats.add(task.category);
  }
  return [...cats];
}

function buildPool(cats, workouts, exerciseMeta) {
  return (cats || []).flatMap(cat =>
    (workouts[cat] || []).map(ex => ({
      ...ex,
      _cat: cat,
      meta: exerciseMeta[ex.id] || {},
    })),
  );
}

function scoreExercise(ex, { age, goals, recentIds, boostCats }) {
  const m = ex.meta || {};
  let s = m.funScore || 5;
  if (goals.some(g => (m.basketballTransfer || []).includes(g))) s += 2;
  if (boostCats.has(ex._cat)) s += 2;
  if (age <= 11) s += (m.funScore || 5) * 0.15;
  if (recentIds.includes(ex.id)) s -= 4;
  s += Math.random() * 1.8;
  return s;
}

function pickExercises(scored, { structure, rule, pRank, difficultyBonus, impactDelta, pinIds = [] }) {
  let highImpact = 0;
  let totalSecs = 0;
  const maxSecs = rule.maxMinutes * 60 * 1.1;
  const maxHighImpact = Math.max(0, rule.maxHighImpact + impactDelta);
  const used = new Set();
  const out = { warmup: [], main: [], finisher: [], recovery: [] };

  const eligibleRank = pRank + difficultyBonus;

  const tryAdd = (ex, role) => {
    if (used.has(ex.id)) return false;
    const m = ex.meta || {};
    if ((DIFF_RANK[m.difficulty] ?? 0) > eligibleRank + 1) return false;
    if (m.impactLevel === "high") {
      if (highImpact >= maxHighImpact) return false;
      highImpact += 1;
    }
    const dur = m.estimatedDuration || 90;
    if (totalSecs + dur > maxSecs) return false;
    totalSecs += dur;
    used.add(ex.id);
    out[role].push({ ...ex, role });
    return true;
  };

  for (const id of pinIds) {
    const ex = scored.find(e => e.id === id);
    if (ex) tryAdd(ex, "main");
  }

  const pickRole = (role, count, roleTest) => {
    for (const ex of scored) {
      if (out[role].length >= count) break;
      const roles = ex.meta?.workoutRole || [];
      if (!roles.some(r => roleTest(r))) continue;
      tryAdd(ex, role);
    }
  };

  pickRole("warmup", structure.warmup, r => r === "warmup");
  pickRole("main", structure.main, r => r === "main");
  pickRole("finisher", structure.finisher, r => r === "finisher");
  pickRole("recovery", structure.recovery, r => r === "recovery" || r === "warmup");

  return out;
}

function flattenSlots(slots) {
  return [
    ...slots.warmup,
    ...slots.main,
    ...slots.finisher,
    ...slots.recovery,
  ];
}

/**
 * Generate a custom workout for Programs → Build.
 * @param {{ settings, workouts, exerciseMeta, focusId, intensityId, mission?, allExercises?, recentIds? }} opts
 */
export function generateCustomMissionWorkout({
  settings = {},
  workouts = {},
  exerciseMeta = {},
  focusId = "mission",
  intensityId = "medium",
  mission = null,
  allExercises = {},
  recentIds = [],
}) {
  const focusOpt = BUILD_FOCUS_OPTIONS.find(f => f.id === focusId) || BUILD_FOCUS_OPTIONS[0];
  const intensity = INTENSITY[intensityId] || INTENSITY.medium;
  const age = Math.min(14, Math.max(9, calcAge(settings.dateOfBirth) || 9)); // unknown age → youngest, most careful
  const rule = AGE_RULES[age] || AGE_RULES[11];
  const pRank = DIFF_RANK[settings.experience || "beginner"] ?? 0;
  const goals = settings.goals || [];

  let cats = focusOpt.cats || [];
  let pinIds = [];
  let title = focusOpt.label;
  let desc = focusOpt.desc || "Custom generated session.";

  if (focusId === "mission") {
    pinIds = missionExerciseIds(mission);
    cats = missionCategories(mission, allExercises);
    if (!cats.length) cats = ["ballhandling", "shooting", "footwork"];
    title = mission?.title || "Today's Mission";
    desc = pinIds.length
      ? "Mission drills plus matching skill work."
      : "Skill workout built around today's mission.";
  }

  const pool = buildPool(cats, workouts, exerciseMeta);
  if (!pool.length) return null;

  const boostCats = new Set(cats);
  const scored = pool
    .filter(ex => {
      const m = ex.meta;
      if (m.ageRange && age < m.ageRange[0]) return false;
      return (DIFF_RANK[m.difficulty] ?? 0) <= pRank + intensity.difficultyBonus + 1;
    })
    .map(ex => ({
      ...ex,
      _score: scoreExercise(ex, { age, pRank, goals, recentIds, boostCats }),
    }))
    .sort((a, b) => b._score - a._score);

  const slots = pickExercises(scored, {
    structure: {
      warmup: intensity.warmup,
      main: intensity.main,
      finisher: intensity.finisher,
      recovery: intensity.recovery,
    },
    rule,
    pRank,
    difficultyBonus: intensity.difficultyBonus,
    impactDelta: intensity.impactDelta,
    pinIds,
  });

  let exercises = flattenSlots(slots);

  if (exercises.length < 2) {
    for (const ex of scored) {
      if (exercises.length >= 3) break;
      if (exercises.some(e => e.id === ex.id)) continue;
      exercises.push({ ...ex, role: "main" });
    }
  }

  if (!exercises.length) return null;

  const intensityLabel = BUILD_INTENSITY_OPTIONS.find(o => o.id === intensityId)?.label || "Medium";

  return {
    templateKey: `build-${focusId}`,
    templateName: title,
    templateEmoji: focusOpt.emoji,
    templateDesc: `${desc} · ${intensityLabel} intensity`,
    exercises,
    fromMission: focusId === "mission",
    generatedAt: Date.now(),
  };
}

/** @deprecated Use generateCustomMissionWorkout */
export function generateWorkoutFromMission(mission, allExercises) {
  const ids = missionExerciseIds(mission);
  if (!ids.length) return null;
  const exercises = ids.map(id => ({ ...allExercises[id], role: "main" })).filter(e => e.id);
  return {
    templateKey: "mission",
    templateName: mission?.title || "Today's Mission",
    templateEmoji: "🎯",
    templateDesc: "Drills pulled from your daily mission goals.",
    exercises,
    fromMission: true,
    generatedAt: Date.now(),
  };
}
