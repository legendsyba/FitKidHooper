#!/usr/bin/env node
/**
 * Program content + progress regression checks — run: node scripts/verify-programs.mjs
 *
 * 1. Every program: drill ids (incl. `was` lists) exist, badge exists, doses parse.
 * 2. Programs with per-week doses are held to youth guidance (NSCA 2009 youth resistance
 *    training; beginner plyometric volume 50–80 landings): every drill dosed, no drill
 *    rated older than the program's age floor, no undeclared equipment, ≤ 80 landings a
 *    session, and at least 48 h between jump days.
 * 3. Progress logic: rebuilt sessions keep old completions, finishing retires a program
 *    into history, and the Home next-step card survives union merges from cloud sync.
 */
import { PROGRAMS, ALL_EXERCISES, EXERCISE_META, WORKOUTS, SCHEDULE, WORKOUT_TEMPLATES } from "../src/data/trainingCatalog.js";
import { BUILD_FOCUS_OPTIONS } from "../src/lib/missionGenerator.js";
import { pickSessionWarmupExercises, withSessionWarmup } from "../src/lib/sessionWarmup.js";
import { drillGearItems } from "../src/lib/programGear.js";
import { BADGES_DEF, getEarnedBadges } from "../src/lib/badges.js";
import { parseExerciseSets } from "../src/lib/exerciseSession.js";
import { mergeSaveValue } from "../src/lib/persistMerge.js";
import { buildAthleteContext } from "../src/lib/coachAgent.js";
import { suggestNextProgram, isProgramLocked, nextProgramReason } from "../src/lib/achievements.js";
import {
  computeProgramProgress, isProgramSessionComplete, programCompletionCount,
  freshProgramEntry, retireFinishedPrograms, pendingNextStep, markNextStepsHandled,
  programSessionScheduleDays,
} from "../src/lib/programProgress.js";

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };
const exercise = (id) => (Array.isArray(ALL_EXERCISES) ? ALL_EXERCISES.find(e => e.id === id) : ALL_EXERCISES[id]);

const LANDING_LIMIT = 80;
/* Founder's call (2026-10-20), within youth guidance of 48–72 h between plyometric days. */
const MIN_HOURS_BETWEEN_JUMP_DAYS = 48;
const CONTACTS_PER_SECOND = 2;
/* Jumps a kid lands from: plyometric and landing drills, plus rebounding and burpees,
   which jump every rep but are typed "athletic"/"conditioning". Sprints, slides, layup
   finishes and live games share those types without being landings, so they're excluded. */
const JUMPS_TYPED_OTHERWISE = new Set(["reb-self-toss", "reb-outlet", "reb-power", "burpees"]);
const isLandingDrill = (id) => {
  const m = EXERCISE_META[id] || {};
  if (JUMPS_TYPED_OTHERWISE.has(id)) return true;
  return ["medium", "high"].includes(m.impactLevel) && ["elastic", "deceleration"].includes(m.movementType);
};
/* Combo drills land several times per rep/round ("several pogos, then a tuck jump"). */
const LANDINGS_PER_REP = { "pogo-to-tuck": 4, "broad-bounds-sprint": 5, "hop-hop-stick": 3 };
const landings = (sets, id) => {
  const p = parseExerciseSets(sets);
  if (!p) return 0;
  const perRep = LANDINGS_PER_REP[id] ?? 1;
  if (p.type === "rounds") return p.count * perRep;
  if (!p.value) return 0;
  const perSet = p.type === "time" ? p.value * CONTACTS_PER_SECOND : p.value * perRep;
  return p.count * perSet * (p.bilateral ? 2 : 1);
};

/* ── 1 + 2: content ── */
for (const prog of PROGRAMS) {
  const tag = prog.id;
  assert(BADGES_DEF.some(b => b.id === prog.badgeId), `${tag}: badge ${prog.badgeId} missing from BADGES_DEF`);
  if (prog.advancedOf) assert(PROGRAMS.some(p => p.id === prog.advancedOf), `${tag}: advancedOf ${prog.advancedOf} not found`);
  const jumpDays = [];

  prog.weeks.forEach((week, wi) => {
    const days = programSessionScheduleDays(week.sessions.length);
    week.sessions.forEach((s, si) => {
      const at = `${tag} w${week.week}s${si + 1}`;
      for (const id of [...s.exercises, ...(s.was || [])]) assert(!!exercise(id), `${at}: drill ${id} not in catalog`);
      for (const [id, dose] of Object.entries(s.dose || {})) {
        assert(s.exercises.includes(id), `${at}: dose for ${id}, which isn't in the session`);
        assert(!!parseExerciseSets(dose), `${at}: dose "${dose}" for ${id} doesn't parse`);
      }
      let total = 0;
      for (const id of s.exercises) {
        const meta = EXERCISE_META[id] || {};
        if (s.dose) {
          assert(!!s.dose[id], `${at}: ${id} has no dose`);
        }
        if (!isLandingDrill(id)) continue;
        if (meta.ageRange) assert(meta.ageRange[0] <= prog.ageRange[0], `${at}: jump drill ${id} is rated ${meta.ageRange[0]}+, program starts at ${prog.ageRange[0]}`);
        total += landings(s.dose?.[id] ?? exercise(id)?.sets, id);
      }
      assert(total <= LANDING_LIMIT, `${at}: ${total} landings (limit ${LANDING_LIMIT})`);
      if (total > 0) jumpDays.push({ at, day: wi * 7 + days[si] });
    });
  });
  for (let i = 1; i < jumpDays.length; i++) {
    const hours = (jumpDays[i].day - jumpDays[i - 1].day) * 24;
    assert(hours >= MIN_HOURS_BETWEEN_JUMP_DAYS, `${tag}: ${jumpDays[i - 1].at} → ${jumpDays[i].at} only ${hours} h apart (min ${MIN_HOURS_BETWEEN_JUMP_DAYS})`);
  }
}

/* ── 2a: gear ── every program says what a kid needs (shown on its card and page), and every
   drill records its gear (shown on the workout screen). A program must list everything its
   drills need and nothing they don't. Shooting/finishing/rebounding/post drills need a hoop
   unless they're solo footwork. */
const HOOP_CATEGORIES = new Set(["shooting", "shootingdrills", "shooting_lab", "finishing", "finishing_school", "rebounding", "postmoves"]);
const NO_HOOP_OK = new Set(["reb-boxout"]);
for (const [cat, list] of Object.entries(WORKOUTS)) {
  for (const ex of list) {
    const raw = EXERCISE_META[ex.id]?.equipment;
    assert(!!raw, `${ex.id}: no equipment recorded (workout screen would say "None")`);
    if (HOOP_CATEGORIES.has(cat) && !NO_HOOP_OK.has(ex.id)) assert(drillGearItems(raw).includes("hoop"), `${ex.id} (${cat}) doesn't list a hoop`);
  }
}
const gearFor = (id) => drillGearItems(EXERCISE_META[id]?.equipment);
for (const prog of PROGRAMS) {
  assert(Array.isArray(prog.equipment), `${prog.id}: declare equipment (use [] for none)`);
  const declared = new Set([...(prog.equipment || []), ...(prog.equipmentFew || [])]);
  const seen = new Set();
  for (const w of prog.weeks) for (const s of w.sessions) for (const id of s.exercises) {
    for (const g of gearFor(id)) {
      seen.add(g);
      assert(declared.has(g), `${prog.id}: ${id} needs ${g}, program doesn't list it`);
    }
  }
  for (const g of declared) assert(seen.has(g), `${prog.id}: lists ${g} but no drill uses it`);
}

/* ── 2b: jump rope volume ── rope is high-frequency, low-amplitude jumping (not counted as
   landings above). Shin splints come from doing too much too soon, so: ≤ 5 min of actual
   jumping a session, the heaviest session of a week ≤ 25% above the week before (Level 2's
   first week vs Level 1's last too), and every session opens with an easy (warm-up-role) rope drill
   so the warm-up builder doesn't stack extra rope on top. */
const ROPE_SECONDS_LIMIT = 300;
const ROPE_WEEKLY_GROWTH = 1.25;
const ropeSeconds = (id, sets) => {
  const m = EXERCISE_META[id] || {};
  if (m.equipment !== "jump_rope" || m.impactLevel === "low") return 0;
  const p = parseExerciseSets(sets);
  return p?.value ? p.count * p.value : 0;
};
const ropeWeekPeaks = (prog) => prog.weeks.map(w =>
  Math.max(...w.sessions.map(s => s.exercises.reduce((t, id) => t + ropeSeconds(id, s.dose?.[id] ?? exercise(id)?.sets), 0))));
for (const prog of PROGRAMS.filter(p => (p.equipment || []).includes("jump_rope"))) {
  const peaks = ropeWeekPeaks(prog);
  peaks.forEach((sec, wi) => assert(sec <= ROPE_SECONDS_LIMIT, `${prog.id} w${wi + 1}: ${sec} s of rope jumping in a session (limit ${ROPE_SECONDS_LIMIT})`));
  const base = prog.advancedOf && PROGRAMS.find(p => p.id === prog.advancedOf);
  const prior = [...(base ? [ropeWeekPeaks(base).at(-1)] : []), ...peaks];
  for (let i = 1; i < prior.length; i++) {
    assert(prior[i] <= prior[i - 1] * ROPE_WEEKLY_GROWTH, `${prog.id}: rope volume jumps ${prior[i - 1]} → ${prior[i]} s week to week (max +25%)`);
  }
  prog.weeks.forEach(w => w.sessions.forEach((s, si) => {
    const first = EXERCISE_META[s.exercises[0]] || {};
    assert(first.equipment === "jump_rope" && (first.workoutRole || []).includes("warmup"),
      `${prog.id} w${w.week}s${si + 1}: must open with an easy rope drill (bounce, side swing or alternate foot)`);
  }));
}

/* No session starts cold on a jump: the session as launched (warm-up included) must open
   with something other than a landing drill. */
for (const prog of PROGRAMS) {
  prog.weeks.forEach(w => w.sessions.forEach((s, si) => {
    const list = s.exercises.map(id => ({ ...exercise(id), meta: EXERCISE_META[id] || {} }));
    const launched = withSessionWarmup(list, WORKOUTS, EXERCISE_META, { hasRope: false });
    assert(!isLandingDrill(launched[0]?.id), `${prog.id} w${w.week}s${si + 1}: starts cold on ${launched[0]?.id} (no warm-up)`);
  }));
}

/* Opt-in gear categories: drills needing a rope or bands live only in their own category,
   and nothing that builds a workout for every kid (schedule days, quick templates, mission
   focuses) draws from them — a kid without the gear must never be handed those drills. */
const OPT_IN = [
  { cat: "jumprope", gear: ["jump_rope"] },
  { cat: "bands", gear: ["mini_band", "long_band"] },
];
for (const [cat, list] of Object.entries(WORKOUTS)) {
  for (const ex of list) {
    const items = drillGearItems(EXERCISE_META[ex.id]?.equipment);
    for (const { cat: home, gear } of OPT_IN) {
      if (items.some(g => gear.includes(g))) assert(cat === home, `${ex.id} needs ${gear.join("/")} but sits in ${cat}`);
    }
  }
}
for (const { cat } of OPT_IN) {
  for (const day of SCHEDULE) assert(!(day.cats || []).includes(cat), `schedule ${day.day} pulls ${cat} drills for every kid`);
  for (const [key, t] of Object.entries(WORKOUT_TEMPLATES)) assert(!(t.cats || []).includes(cat), `template ${key} pulls ${cat} drills for every kid`);
  for (const f of BUILD_FOCUS_OPTIONS) assert(!(f.cats || []).includes(cat), `mission focus ${f.id} pulls ${cat} drills for every kid`);
}

const warmIds = (hasRope) => pickSessionWarmupExercises(WORKOUTS, EXERCISE_META, { categories: ["strength"], hasRope });
assert(!warmIds(false).some(w => EXERCISE_META[w.id]?.equipment === "jump_rope"), "kids without a rope must not get rope warm-ups");
assert(warmIds(true)[0]?.id === "jump-rope" && warmIds(true)[0].sets === "2x30 s", "rope owners' warm-up should open with 2x30 s of rope");

/* ── 3: progress logic ── */
const T0 = Date.now() - 30 * 86400000;
const D0 = new Date(T0).toLocaleDateString("en-CA");
const marked = (prog, lists, anchor) => {
  const entry = { _meta: { enrollmentStartedAt: anchor } };
  prog.weeks.forEach(w => w.sessions.forEach((s, si) => {
    const ids = lists(s);
    if (ids) entry[`${w.week}-${si}`] = Object.fromEntries(ids.map(x => [x, { d: D0, t: anchor + 1 }]));
  }));
  return entry;
};

for (const prog of PROGRAMS.filter(p => p.weeks.some(w => w.sessions.some(s => s.was)))) {
  const old = { [prog.id]: marked(prog, s => s.was || s.exercises, T0) };
  assert(computeProgramProgress(prog, old) === 1, `${prog.id}: finishing the pre-rebuild plan no longer counts as finished`);
  assert(getEarnedBadges({}, old, PROGRAMS).includes(prog.badgeId), `${prog.id}: pre-rebuild finishers lose their badge`);
  const week = prog.weeks.find(w => w.sessions.some(s => s.was));
  const si = week.sessions.findIndex(s => s.was);
  const one = { [prog.id]: marked(prog, s => (s === week.sessions[si] ? s.was : null), T0) };
  assert(isProgramSessionComplete(prog, one, week.week, si), `${prog.id}: a session finished pre-rebuild reopened`);
}

const bb = PROGRAMS.find(p => p.id === "bodyweight-beast");
const other = PROGRAMS.find(p => p.id !== bb.id && !p.advancedOf);
const T1 = Date.now() - 1000;
const enrolled = { [bb.id]: { startDate: D0, startedAt: T0 }, [other.id]: { startDate: D0, startedAt: T0 } };
const progress = { [bb.id]: marked(bb, s => s.exercises, T0), [other.id]: { _meta: { enrollmentStartedAt: T0 } } };

const retired = retireFinishedPrograms(PROGRAMS, enrolled, progress, T1);
assert(retired && !retired.enrolled[bb.id] && retired.enrolled[other.id], "finishing should retire only the finished program");
assert(retired && computeProgramProgress(bb, retired.progress) === 1, "retiring must keep the checkmarks (history)");
assert(retired && getEarnedBadges({}, retired.progress, PROGRAMS).includes(bb.badgeId), "retiring must keep the badge");
assert(retired && retireFinishedPrograms(PROGRAMS, retired.enrolled, retired.progress) === null, "retiring should be idempotent");
assert(retired && pendingNextStep(PROGRAMS, retired.progress)?.id === bb.id, "Home should ask what's next after finishing");

const resurrected = retireFinishedPrograms(PROGRAMS, mergeSaveValue(retired.enrolled, enrolled), mergeSaveValue(retired.progress, progress), T1 + 60000);
assert(resurrected && !resurrected.enrolled[bb.id], "an enrollment brought back by cloud merge must retire again");
assert(resurrected && resurrected.progress[bb.id]._meta.retiredAt === T1, "re-retiring must keep the original finish time");

const dismissed = markNextStepsHandled(retired.progress);
assert(pendingNextStep(PROGRAMS, dismissed) === null, "dismissing should clear the Home card");
assert(pendingNextStep(PROGRAMS, mergeSaveValue(dismissed, retired.progress)) === null, "a dismissed card must stay dismissed after a merge");

const restartAt = Date.now();
const run2 = { ...retired.progress, [bb.id]: freshProgramEntry(bb, retired.progress, restartAt) };
assert(programCompletionCount(bb, run2) === 1 && getEarnedBadges({}, run2, PROGRAMS).includes(bb.badgeId), "restarting must keep the badge and finish count");
const stale = mergeSaveValue(run2, retired.progress);
assert(pendingNextStep(PROGRAMS, stale) === null, "a stale copy must not reopen the Home card mid-run");
assert(retireFinishedPrograms(PROGRAMS, { [bb.id]: { startDate: D0, startedAt: restartAt } }, stale) === null, "a stale copy's old checkmarks must not finish the new run");
const run2done = { ...stale, [bb.id]: { ...marked(bb, s => s.exercises, restartAt), _meta: stale[bb.id]._meta } };
const second = retireFinishedPrograms(PROGRAMS, { [bb.id]: { startDate: D0, startedAt: restartAt } }, run2done, restartAt + 5000);
assert(second && pendingNextStep(PROGRAMS, mergeSaveValue(second.progress, dismissed))?.id === bb.id, "an old dismissal must not hide the next finish's card");
assert(second && programCompletionCount(bb, second.progress) === 2, "finishing twice should count twice");

/* The road from beginner to Jump Higher II: Up Next always points at the next real step. */
const next = (id, earned, enrolled = {}) => suggestNextProgram(id, PROGRAMS, enrolled, earned)?.id;
const B = ["pgm-bodyweight"], B2 = [...B, "pgm-bodyweight-2"], J = ["pgm-jump-higher"];
assert(next("bodyweight-beast", B) === "bodyweight-beast-2", "BB I → BB II");
assert(next("jump-higher", J) === "bodyweight-beast", "JH done, no BB → BB I (on the way to JH II)");
assert(next("bodyweight-beast-2", B2) === "jump-higher", "BB II done, no JH → JH");
assert(next("bodyweight-beast-2", [...B2, ...J]) === "jump-higher-2", "BB II + JH done → JH II unlocked");
assert(next("jump-higher", [...J, ...B2]) === "jump-higher-2", "JH + BB II done → JH II unlocked");
const jh2 = PROGRAMS.find(p => p.id === "jump-higher-2");
assert(isProgramLocked(jh2, PROGRAMS, J), "JH II stays locked without BB II");
assert(nextProgramReason("jump-higher", PROGRAMS.find(p => p.id === "bodyweight-beast"), PROGRAMS, J) === "Next step toward Jump Higher II:",
  "Up Next explains the road to JH II");

const coachRecs = (completedProgramIds) => buildAthleteContext({
  settings: { dateOfBirth: "2015-06-15", experience: "beginner", goals: ["strength"], playStyle: "any" },
  completed: {}, enrolledProgramIds: [], completedProgramIds,
}).developmentPlan.recommendedPrograms;
assert(coachRecs([]).includes(bb.id), "(setup) coach should recommend Bodyweight Beast to a new strength kid");
assert(!coachRecs([bb.id]).includes(bb.id), "coach must not recommend a program the kid already finished");
assert(coachRecs([bb.id]).includes("bodyweight-beast-2"), "coach should offer the next level of a finished program");

if (failures.length) {
  console.error(`verify-programs: ${failures.length} problem(s)\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(`verify-programs: ${PROGRAMS.length} programs OK`);
