#!/usr/bin/env node
/**
 * Regression tests for bugs fixed in the Nov 2026 activation work — run:
 *   node scripts/verify-regressions.mjs
 *
 * Each of these was a real, shipped bug that unit-level coverage would have caught. The repo is
 * co-edited live, so these lock the fixes in before a refactor quietly reintroduces them.
 *
 *   1. getStreak comeback-morning: today-not-done-yet must NOT read as a broken streak.
 *   2. exerciseTier reads difficulty from ex.difficulty OR ex.meta.difficulty (169/332 drills
 *      carry it only in meta — treating those as tier 1 mis-levels half the catalog).
 */
import { getStreak } from "../src/lib/progressStats.js";
import { exerciseTier } from "../src/lib/skillLevels.js";
import { ALL_EXERCISES } from "../src/data/trainingCatalog.js";

function assert(cond, msg) { if (!cond) throw new Error("FAIL: " + msg); }

// ── helpers ──────────────────────────────────────────────────────────────────
const ymd = (daysAgo) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-CA");
};
/** completion map keyed `YYYY-MM-DD-exId`, like the app stores it. */
const done = (...daysAgo) =>
  Object.fromEntries(daysAgo.map((n) => [`${ymd(n)}-bh-pound`, true]));

// ── 1. getStreak comeback-morning ─────────────────────────────────────────────
// Trained 2 days ago, rested yesterday (within 1-day grace), haven't trained today YET.
// The bug counted today as a miss, so today+yesterday read as two misses and returned 0 —
// showing "streak lost" exactly on the morning that training would save it.
assert(getStreak(done(2)) >= 1, "comeback morning (trained 2d ago, grace rest, today pending) must keep a live streak, not read 0");

// Trained today and yesterday → 2 consecutive active days.
assert(getStreak(done(0, 1)) === 2, "two days in a row should count 2");

// Today pending but trained yesterday → yesterday's streak still stands (today not a miss).
assert(getStreak(done(1)) >= 1, "trained yesterday, today pending → streak stands");

// Two real missed days in a row (last trained 3 days ago) ends the streak.
assert(getStreak(done(3)) === 0, "two consecutive missed days must end the streak");

// Empty history → 0.
assert(getStreak({}) === 0, "no history → 0");

// ── 2. exerciseTier reads meta.difficulty ─────────────────────────────────────
const TIER = { beginner: 1, intermediate: 2, advanced: 3 };

// Explicit fixtures: a meta-only drill and a top-level one, both non-beginner so tier≠1 is real.
assert(exerciseTier(ALL_EXERCISES["5-10-5"]) === 2, "meta-only intermediate drill must be tier 2, not defaulted to 1");
assert(exerciseTier(ALL_EXERCISES["tn-tennis-catch"]) === 3, "top-level advanced drill must be tier 3");
assert(exerciseTier(ALL_EXERCISES["bh-pound"]) === 1, "top-level beginner drill must be tier 1");

// Fallbacks.
assert(exerciseTier(undefined) === 1, "missing exercise defaults to tier 1");
assert(exerciseTier({}) === 1, "no difficulty anywhere defaults to tier 1");

// Catalog-wide: every drill's tier matches its declared difficulty (meta or top-level), and no
// drill that declares a difficulty is silently tier 1 by accident.
let metaChecked = 0;
for (const [id, ex] of Object.entries(ALL_EXERCISES)) {
  const declared = ex.difficulty ?? ex.meta?.difficulty;
  if (!declared) continue;
  assert(exerciseTier(ex) === TIER[declared], `${id}: tier ${exerciseTier(ex)} ≠ declared "${declared}"`);
  if (!ex.difficulty && ex.meta?.difficulty) metaChecked++;
}
assert(metaChecked >= 100, `expected the meta-only path to be exercised across the catalog, only saw ${metaChecked}`);

console.log("verify:regressions — all regression tests passed");
