import { isHighImpactDay } from "./warmup.js";
import { PROGRAMS } from "../data/trainingCatalog.js";

const ROPE_PROGRAM_IDS = PROGRAMS.filter(p => (p.equipment || []).includes("jump_rope")).map(p => p.id);
const ROPE_WARMUP_SETS = "2x30 s";
let ropeCache = { raw: undefined, owns: false };

/**
 * Starting a jump rope program means the kid has a rope, so from then on every program's
 * warm-up opens with rope work. Read from saved progress (it survives leaving or finishing
 * the program) and cached on the raw string, since warm-ups are built during render.
 */
export function ownsJumpRope() {
  let raw;
  try { raw = localStorage.getItem("fkh-program-progress"); } catch { return false; }
  if (raw === ropeCache.raw) return ropeCache.owns;
  let owns = false;
  try {
    const progress = JSON.parse(raw || "{}");
    owns = ROPE_PROGRAM_IDS.some(id => progress?.[id]);
  } catch { /* ignore */ }
  ropeCache = { raw, owns };
  return owns;
}

/** Reliable warm-up drills — always available, kid-friendly, low equipment. */
const WARMUP_PICK_ORDER = [
  "jumping-jacks",
  "high-knees",
  "fast-feet",
  "pogo-hops",
  "glute-bridge",
  "carioca",
  "rhythm-line-hops",
  "cross-body-toe-taps",
];

function findExercise(workouts, id) {
  for (const list of Object.values(workouts || {})) {
    const ex = (list || []).find(e => e.id === id);
    if (ex) return ex;
  }
  return null;
}

function enrichExercise(ex, exerciseMeta) {
  const meta = exerciseMeta?.[ex.id] || ex.meta || {};
  return {
    ...ex,
    meta,
    role: "warmup",
    _warmupBlock: true,
    sets: meta.equipment === "jump_rope" ? ROPE_WARMUP_SETS : (ex.sets || "2x30 s"),
  };
}

export function isWarmupExercise(ex) {
  return !!(ex?.role === "warmup" || ex?._warmupBlock);
}

/* Only the opening drill counts, and never a high-impact one. A warm-up-capable drill later
   in the session (glute bridges after squats) used to cancel the warm-up for the whole
   session, and a jump day opening on pogo jumps got no warm-up at all. */
export function sessionAlreadyHasWarmup(exerciseList) {
  const first = (exerciseList || [])[0];
  if (!first) return false;
  if (isWarmupExercise(first)) return true;
  return (first.meta?.workoutRole || []).includes("warmup") && first.meta?.impactLevel !== "high";
}

/** Pick 2–3 dynamic warm-up drills to open every session. */
export function pickSessionWarmupExercises(workouts, exerciseMeta, { count = 2, categories = [], hasRope = ownsJumpRope() } = {}) {
  const want = isHighImpactDay(categories) ? Math.max(count, 3) : count;
  const pool = [];
  const seen = new Set();
  const order = hasRope
    ? ["jump-rope", ...WARMUP_PICK_ORDER.filter(id => id !== "jumping-jacks")]
    : WARMUP_PICK_ORDER;

  for (const id of order) {
    if (pool.length >= want) break;
    const ex = findExercise(workouts, id);
    if (!ex || seen.has(id)) continue;
    pool.push(enrichExercise(ex, exerciseMeta));
    seen.add(id);
  }

  if (pool.length < want) {
    const cats = categories.length ? categories : Object.keys(workouts || {});
    for (const cat of cats) {
      for (const ex of workouts[cat] || []) {
        if (pool.length >= want) break;
        const roles = exerciseMeta?.[ex.id]?.workoutRole || [];
        if (!roles.includes("warmup")) continue;
        if (!hasRope && exerciseMeta?.[ex.id]?.equipment === "jump_rope") continue;
        if (seen.has(ex.id)) continue;
        pool.push(enrichExercise(ex, exerciseMeta));
        seen.add(ex.id);
      }
    }
  }

  return pool;
}

export function categoriesFromExercises(exerciseList, allExercises = {}) {
  const cats = new Set();
  for (const ex of exerciseList || []) {
    const cat = ex._cat || allExercises[ex.id]?._cat;
    if (cat) cats.add(cat);
  }
  return [...cats];
}

/** Prepend warm-up drills when the list does not already include them. */
export function withSessionWarmup(exerciseList, workouts, exerciseMeta, options = {}) {
  const main = exerciseList || [];
  if (sessionAlreadyHasWarmup(main)) return main;
  const existing = new Set(main.map(e => e.id));
  const warmups = pickSessionWarmupExercises(workouts, exerciseMeta, options)
    .filter(w => !existing.has(w.id));
  return warmups.length ? [...warmups, ...main] : main;
}
