#!/usr/bin/env node
/**
 * Invariants for the drill-swap feature — run: node scripts/verify-drill-swap.mjs
 *
 * Guards the promises the swap UI relies on (the repo is co-edited live, so these catch a
 * drift in skillLevels / the catalog before it reaches a kid):
 *   1. A replacement is always same-area, has a video, fits the kid's level, and is never one
 *      already in the session.
 *   2. applyDrillSwaps only ever substitutes a same-area target and never duplicates.
 *   3. recordDrillSwap / clearDrillSwap manage the map as expected.
 *   4. evolveFromSwaps is raise-only, capped at advanced, honours `needed`, and is self-limiting.
 */
import { ALL_EXERCISES } from "../src/data/trainingCatalog.js";
import { areaOfExercise, getSkillLevels, drillAllowed } from "../src/lib/skillLevels.js";
import {
  drillReplacements, hasVideo, recordDrillSwap, clearDrillSwap, applyDrillSwaps, evolveFromSwaps,
} from "../src/lib/drillSwap.js";

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── 1. drillReplacements invariants, over a spread of real drills ──
const settings = { experience: "beginner" };
const sampleIds = ["fin-mikan", "two-ball", "fin-euro", "fs-contact-finish", "relph-scoop", "tn-pocket"];
for (const exId of sampleIds) {
  const ex = ALL_EXERCISES[exId];
  if (!ex) continue;
  const area = areaOfExercise(ex);
  const exclude = ["fin-power-layup", "fin-reverse"]; // arbitrary siblings to prove exclusion
  const levels = getSkillLevels(settings, {});
  const reps = drillReplacements(exId, { settings, exclude });
  for (const r of reps) {
    assert(r.id !== exId, `${exId}: offered itself as a swap`);
    assert(!exclude.includes(r.id), `${exId}: offered an excluded sibling ${r.id}`);
    assert(areaOfExercise(ALL_EXERCISES[r.id]) === area, `${exId}: swap ${r.id} is a different area`);
    assert(hasVideo(ALL_EXERCISES[r.id]), `${exId}: swap ${r.id} has no video`);
    assert(drillAllowed(ALL_EXERCISES[r.id], levels), `${exId}: swap ${r.id} is above the kid's level`);
  }
  // No duplicate ids in the ranked list.
  assert(new Set(reps.map((r) => r.id)).size === reps.length, `${exId}: duplicate drills in swap list`);
}

// ── 2. applyDrillSwaps ──
assert(JSON.stringify(applyDrillSwaps(["fin-mikan", "fin-reverse"], {})) === JSON.stringify(["fin-mikan", "fin-reverse"]),
  "applyDrillSwaps with no swaps must be a no-op");
{
  const s = { drillSwaps: { "fin-mikan": "fs-power-finish" } }; // same area (finishing)
  const out = applyDrillSwaps(["fin-mikan", "fin-reverse"], s);
  assert(out[0] === "fs-power-finish", "applyDrillSwaps did not substitute the swapped drill");
  assert(new Set(out).size === out.length, "applyDrillSwaps introduced a duplicate");
}
{
  // A swap whose target is already in the list must NOT duplicate it — keep the original.
  const s = { drillSwaps: { "fin-mikan": "fin-reverse" } };
  const out = applyDrillSwaps(["fin-mikan", "fin-reverse"], s);
  assert(new Set(out).size === out.length, "applyDrillSwaps duplicated an already-present target");
}
{
  // A cross-area target is refused (defensive — the UI only offers same-area, but data could drift).
  const crossAreaTarget = Object.keys(ALL_EXERCISES).find((id) => areaOfExercise(ALL_EXERCISES[id]) === "defense");
  if (crossAreaTarget) {
    const s = { drillSwaps: { "fin-mikan": crossAreaTarget } };
    assert(applyDrillSwaps(["fin-mikan"], s)[0] === "fin-mikan", "applyDrillSwaps accepted a cross-area swap");
  }
}

// ── 3. record / clear ──
assert(recordDrillSwap({}, "a", "b").a === "b", "recordDrillSwap did not set the mapping");
assert(!("a" in recordDrillSwap({ drillSwaps: { a: "b" } }, "a", "a")), "recordDrillSwap to self did not clear");
assert(!("a" in clearDrillSwap({ drillSwaps: { a: "b" } }, "a")), "clearDrillSwap did not remove the mapping");

// ── 4. evolveFromSwaps ──
{
  // One reach toward a harder drill is not enough; two raises the area one rung.
  let s = { experience: "beginner", drillSwaps: { "fin-mikan": "fin-euro" } }; // beginner→intermediate finishing
  assert(!evolveFromSwaps(s), "evolveFromSwaps raised on a single reach");
  s = { ...s, drillSwaps: { ...s.drillSwaps, "fin-power-layup": "fin-reverse" } };
  const evo = evolveFromSwaps(s);
  assert(evo && evo.raised[0].area === "finishing" && evo.raised[0].to === 2, "two reaches did not raise finishing to 2");
  // Self-limiting: after raising, the same swaps no longer sit above the level.
  assert(!evolveFromSwaps({ ...s, skillLevels: evo.skillLevels }), "evolveFromSwaps double-bumped");
  // Capped at advanced.
  const maxed = { skillLevels: { finishing: 3 }, drillSwaps: { "fin-mikan": "fin-floater", "fin-power-layup": "fin-wrong-foot" } };
  assert(!evolveFromSwaps(maxed), "evolveFromSwaps raised an already-advanced area");
  // Easier swaps never raise.
  const easier = { experience: "intermediate", drillSwaps: { "fin-euro": "fin-mikan", "fin-reverse": "fin-power-layup" } };
  assert(!evolveFromSwaps(easier), "evolveFromSwaps raised on easier swaps");
}

console.log("verify-drill-swap: OK");
