#!/usr/bin/env node
/**
 * Program content + progress regression checks — run: node scripts/verify-programs.mjs
 *
 * 1. Every program: drill ids (incl. `was` lists) exist, badge exists, doses parse.
 * 2. Programs with per-week doses are held to youth guidance (NSCA 2009 youth resistance
 *    training; beginner plyometric volume 50–80 landings): every drill dosed, no drill
 *    rated older than the program's age floor, no undeclared equipment, ≤ 80 landings a
 *    session, and never two jump sessions back to back.
 * 3. Progress logic: rebuilt sessions keep old completions, finishing retires a program
 *    into history, and the Home next-step card survives union merges from cloud sync.
 */
import { PROGRAMS, ALL_EXERCISES, EXERCISE_META } from "../src/data/trainingCatalog.js";
import { BADGES_DEF, getEarnedBadges } from "../src/lib/badges.js";
import { parseExerciseSets } from "../src/lib/exerciseSession.js";
import { mergeSaveValue } from "../src/lib/persistMerge.js";
import { buildAthleteContext } from "../src/lib/coachAgent.js";
import {
  computeProgramProgress, isProgramSessionComplete, programCompletionCount,
  freshProgramEntry, retireFinishedPrograms, pendingNextStep, markNextStepsHandled,
  programSessionScheduleDays,
} from "../src/lib/programProgress.js";

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };
const exercise = (id) => (Array.isArray(ALL_EXERCISES) ? ALL_EXERCISES.find(e => e.id === id) : ALL_EXERCISES[id]);

const LANDING_LIMIT = 80;
const MIN_HOURS_BETWEEN_JUMP_DAYS = 72;
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
const landings = (sets) => {
  const p = parseExerciseSets(sets);
  if (!p?.value) return 0;
  const perSet = p.type === "time" ? p.value * CONTACTS_PER_SECOND : p.value;
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
          if (meta.equipment && meta.equipment !== "none") assert((prog.equipment || []).includes(meta.equipment), `${at}: ${id} needs ${meta.equipment}, program doesn't list it`);
        }
        if (!isLandingDrill(id)) continue;
        if (meta.ageRange) assert(meta.ageRange[0] <= prog.ageRange[0], `${at}: jump drill ${id} is rated ${meta.ageRange[0]}+, program starts at ${prog.ageRange[0]}`);
        total += landings(s.dose?.[id] ?? exercise(id)?.sets);
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
