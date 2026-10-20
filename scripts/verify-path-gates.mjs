#!/usr/bin/env node
/**
 * Smoke-test path gate evaluation — run: node scripts/verify-path-gates.mjs
 */
import { evaluateStageGate } from "../src/lib/pathGates.js";
import {
  evaluateEarned,
  buildEvalCtx,
  trackStageProgress,
  recommendTrackForFavorite,
  getTrack,
} from "../src/lib/achievements.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const baseCtx = {
  earnedBadgeIds: new Set(),
  ledgerIds: new Set(),
  makes: 0,
  maxStreak: 0,
  trainingDays: 0,
  catCounts: {},
};

const earned1 = evaluateEarned({ ...baseCtx, makes: 100 });
assert(earned1.has("shooter-1"), "shooter-1 should unlock at 100 makes");

const s3fail = buildEvalCtx({ ...baseCtx, makes: 2500, maxStreak: 3 });
assert(!evaluateStageGate(getTrack("shooter").stages[2], s3fail), "stage 3 needs streak 7");

// Stage 3 also has signature goals: corner 3s plus catch-and-shoot and stationary makes.
const s3sig = { exCounts: { "slab-corner-3": 10 }, styleMakes: { catch_shoot: 120, stationary: 80 } };
const s3noSig = buildEvalCtx({ ...baseCtx, makes: 2500, maxStreak: 7 });
assert(!evaluateStageGate(getTrack("shooter").stages[2], s3noSig), "stage 3 still locked without its signature goals");

const s3ok = buildEvalCtx({ ...baseCtx, makes: 2500, maxStreak: 7, ...s3sig });
assert(evaluateStageGate(getTrack("shooter").stages[2], s3ok), "stage 3 ok with streak + signature goals");

assert(recommendTrackForFavorite({ favoritePlayLike: "Steph Curry" }) === "shooter", "Curry → shooter");
assert(recommendTrackForFavorite({ favoritePlayLike: "Allen Iverson" }) === "ballhandling", "AI → ballhandling");

// Next rung (shooter-2) has signature goals; half of each is done here.
const prog = trackStageProgress(getTrack("shooter"), {
  ...baseCtx, makes: 425,
  exCounts: { "slab-catch-shoot": 4, "sh-form": 4 }, styleMakes: { catch_shoot: 20 },
});
assert(prog.stagePct > 0 && prog.stagePct < 100, "partial stage progress");
assert(prog.progressLabel.includes("425"), "progress label shows current makes");

// ── Signature drills: required subset of specific moves ──────────────────────
const sigStage2 = getTrack("ballhandling").stages[1]; // ballhandling-2 (White Chocolate)

// Volume met (handles bucket 45 ≥ 40) but signature mins not done → still locked.
const volOnly = buildEvalCtx({
  ...baseCtx, catCounts: { handles: 45 }, exCounts: { "bh-pound": 6, "bh-crossover": 6 },
});
assert(!evaluateStageGate(sigStage2, volOnly), "ballhandling-2 locked when signature drills not done despite volume");

// Grinding only one move doesn't satisfy the variety gate.
const oneMove = buildEvalCtx({ ...baseCtx, catCounts: { handles: 200 }, exCounts: { "bh-pound": 200 } });
assert(!evaluateStageGate(sigStage2, oneMove), "grinding a single move doesn't unlock the rung");

// Volume + all three signature mins met → unlocks.
const volPlusSig = buildEvalCtx({
  ...baseCtx, catCounts: { handles: 45 },
  exCounts: { "bh-pound": 6, "bh-crossover": 6, "gh-behind-back": 8, "bh-in-out": 8, "gh-cross-btl": 8 },
});
assert(evaluateStageGate(sigStage2, volPlusSig), "ballhandling-2 unlocks once signature mins met");

// trackStageProgress reflects the signature bottleneck (volume done, one drill short).
const bottleneck = trackStageProgress(getTrack("ballhandling"), {
  ...baseCtx, catCounts: { handles: 45 },
  exCounts: { "bh-pound": 6, "bh-crossover": 6, "gh-behind-back": 8, "bh-in-out": 8 }, // gh-cross-btl missing
});
assert(bottleneck.next?.id === "ballhandling-2", "next rung is ballhandling-2");
assert(bottleneck.stagePct < 100, "stagePct held back by incomplete signature drill");
assert(bottleneck.signatureProgress?.length === 3, "signatureProgress is returned for the next rung");

// Skywalker (legacy gate → structured) gates on signatures too.
const skyS2 = getTrack("skywalker").stages[1];
assert(!evaluateStageGate(skyS2, buildEvalCtx({ ...baseCtx, catCounts: { explosion: 50 } })),
  "skywalker-2 locked without jump signature drills");
assert(evaluateStageGate(skyS2, buildEvalCtx({
  ...baseCtx, catCounts: { explosion: 50 },
  exCounts: { "tuck-jumps": 8, "box-jump": 6, "pogo-to-tuck": 6 },
})), "skywalker-2 unlocks with jump signature drills");

console.log("verify-path-gates: OK");
