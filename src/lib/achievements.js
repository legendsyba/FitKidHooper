/**
 * Progression framework — ONE catalog, ONE ledger, ONE grant path.
 *
 * Everything a player can earn is an entry here: legacy badges, mastery-journey
 * milestones, the Titles and Cosmetics those milestones unlock, and (later)
 * challenge/community recognition. Future systems (Challenges, Community Feed,
 * Coach) consume this — they never add a parallel earn/own system.
 *
 * Design notes:
 *  - The catalog lives in CODE (stable ids, like drill ids). No DB catalog table.
 *  - Unlock evaluation runs in app code against stats we ALREADY compute.
 *  - A "mastery track" is just a named family of milestones in a journey order.
 *  - Milestones GRANT a Title and/or Cosmetic — those are their own catalog rows,
 *    so equipping and cross-user display look them up by id.
 */

import {
  matchRegistryEntry,
  favoritePlayerQuery,
  displayFavoritePlayer,
  FAVORITE_PLAYER_REGISTRY,
} from "./pathRegistry.js";
import {
  evaluateStageGate,
  trackStageProgress as computeTrackStageProgress,
} from "./pathGates.js";

/* ── Category buckets (raw exercise categories → a path's skill area) ──────── */
const BUCKETS = {
  handles:     ["handles", "ballhandling"],
  playmaking:  ["game_handles", "footwork", "footwork_lab", "passing"],
  defense:     ["defense", "deceleration", "athletic"],
  explosion:   ["explosion"],
  finishing:   ["finishing", "finishing_school", "footwork", "footwork_lab"],
  midrange:    ["shooting_lab", "shootingdrills", "footwork_lab"],
  stepback:    ["shooting_lab", "shootingdrills", "footwork_lab"],
  touch:       ["finishing", "finishing_school"],
  rebounding:  ["rebounding"],
};

/** Shorthand for structured stage gates (evaluated by pathGates.js). */
const G = {
  makes: (n) => ({ type: "volume", metric: "makes", op: ">=", value: n }),
  bucket: (key, n) => ({ type: "volume", metric: `buckets.${key}`, op: ">=", value: n }),
  streak: (n) => ({ type: "consistency", metric: "streak", op: ">=", value: n }),
  days: (n) => ({ type: "consistency", metric: "training_days", op: ">=", value: n }),
  ledger: (id) => ({ type: "ledger", id }),
  program: (badgeId) => ({ type: "program", badgeId }),
};

function bucketSum(catCounts, keys) {
  return keys.reduce((n, k) => n + (catCounts?.[k] || 0), 0);
}

/* ── Mastery Tracks — multi-stage named journeys (aspiration > certification) ─
 * Each stage is a cooler identity than the last. Stages unlock an equippable
 * Title and a Cosmetic. Gates run on existing signals (makes, streak, category
 * reps, completed programs) so this ships with no new tracking.
 */
/* A journey rung carries BOTH an original identity (the owned, equippable Title —
 * legally clean, brandable, cooler to wear) and an optional `inspo` legend used as
 * the recognizable RANK label and homage (text only — no logos/jerseys/images).
 * The peak rung is a "Conquest": a feat you complete, not an identity you claim.
 * Legend rungs can be globally hidden via SHOW_LEGEND_NAMES. */
export const SHOW_LEGEND_NAMES = true;

export const MASTERY_TRACKS = [
  {
    id: "shooter", name: "Shooting", emoji: "🎯", archetype: "The Shooter",
    theme: "From open looks to limitless range — walk the line of the greatest shooters ever.",
    relatedProgramIds: ["become-shooter", "complete-hooper"],
    favoritePlayerKeys: ["curry","steph","allen","ray","miller","reggie","thompson","klay","bird","durant","kd","lillard","dame","korver","maravich","pistol","edwards","anthony edwards","ant","booker","devin booker","tatum","jayson tatum"],
    stages: [
      { id: "shooter-1", name: "Shooter", emoji: "🎯", flavor: "You knock down the open ones.",
        color: "#60a5fa", rarity: "common",
        requirements: [G.makes(100)] },
      { id: "shooter-2", name: "Knockdown", inspo: "Ray Allen", emoji: "🎯", flavor: "Catch, rise, splash — textbook form.",
        color: "#38bdf8", rarity: "rare",
        title: { id: "title-knockdown", label: "Knockdown" },
        cosmetic: { id: "cos-splash-silver", label: "Silver Splash Frame", slot: "frame", emoji: "💧" },
        requirements: [G.makes(750)],
        signatureDrills: [{ exId: "slab-catch-shoot", min: 8 }, { exId: "sh-form", min: 8 }],
        signatureShots: [{ style: "catch_shoot", min: 40 }] },
      { id: "shooter-3", name: "Microwave", inspo: "Reggie Miller", emoji: "🔥", flavor: "You heat up in a hurry.",
        color: "#a78bfa", rarity: "epic",
        title: { id: "title-microwave", label: "Microwave" },
        cosmetic: { id: "cos-scope-gold", label: "Gold Scope Frame", slot: "frame", emoji: "🔭" },
        requirements: [G.makes(2000), G.streak(7)],
        signatureDrills: [{ exId: "slab-corner-3", min: 10 }],
        signatureShots: [{ style: "catch_shoot", min: 120 }, { style: "stationary", min: 80 }] },
      { id: "shooter-4", name: "Splash Brother", inspo: "Klay Thompson", emoji: "🌊", flavor: "Quick trigger, no conscience.",
        color: "#c084fc", rarity: "epic",
        title: { id: "title-splash-bro", label: "Splash Brother" },
        cosmetic: { id: "cos-splash-blue", label: "Blue Splash Frame", slot: "frame", emoji: "💦" },
        requirements: [G.makes(4000), G.days(21)],
        signatureDrills: [{ exId: "sh-atw", min: 12 }],
        signatureShots: [{ style: "catch_shoot", min: 250 }] },
      { id: "shooter-5", name: "Splash God", inspo: "Steph Curry Conquest", emoji: "👑", flavor: "Range? Unlimited. The summit of shooting.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-splash-god", label: "Splash God" },
        cosmetic: { id: "cos-splash-anim", label: "Animated Splash Frame", slot: "frame", emoji: "🌊" },
        unlockNote: "Earn Range Certified (33% from 3) to unlock",
        requirements: [G.makes(5000), G.ledger("title-range-certified")],
        signatureShots: [{ style: "catch_shoot", min: 400 }, { style: "pull_up", min: 100 }] },
    ],
  },
  {
    id: "ballhandling", name: "Ball Handling", emoji: "🤲", archetype: "The Ball Handler",
    theme: "The ball on a string — cross, wrap, and break ankles like the greats.",
    relatedProgramIds: ["guard-handles", "first-step-explosion"],
    favoritePlayerKeys: ["williams","white","chocolate","hardaway","tim","iverson","ai","kyrie","irving","crossover","handles"],
    stages: [
      { id: "ballhandling-1", name: "Ball Handler", emoji: "🤲", flavor: "The ball listens to your hands.",
        color: "#60a5fa", rarity: "common",
        requirements: [G.bucket("handles", 15)],
        signatureDrills: [{ exId: "bh-pound", min: 6 }, { exId: "bh-crossover", min: 6 }] },
      { id: "ballhandling-2", name: "Handles", inspo: "White Chocolate", emoji: "✨", flavor: "Flashy and in control.",
        hook: "No-look passes and wrist flicks — style with control.",
        highlightVideoId: "f_UphWCvkj4",
        color: "#38bdf8", rarity: "rare",
        title: { id: "title-handles", label: "Handles" },
        cosmetic: { id: "cos-cross-frame", label: "Crossover Frame", slot: "frame", emoji: "✖️" },
        requirements: [G.bucket("handles", 40)],
        signatureDrills: [{ exId: "gh-behind-back", min: 8 }, { exId: "bh-in-out", min: 8 }, { exId: "gh-cross-btl", min: 8 }] },
      { id: "ballhandling-3", name: "Crossover King", inspo: "Tim Hardaway", emoji: "⚡", flavor: "UTA — the killer crossover.",
        hook: "UTA — the killer crossover that changed the game.",
        highlightVideoId: "6d12JgBPoDw",
        color: "#a78bfa", rarity: "epic",
        title: { id: "title-crossover-king", label: "Crossover King" },
        cosmetic: { id: "cos-ufo-emote", label: "UFO Cross Emote", slot: "emote", emoji: "🛸" },
        requirements: [G.bucket("handles", 80), G.streak(5)],
        signatureDrills: [{ exId: "bh-crossover", min: 15 }, { exId: "gh-stationary-cross", min: 12 }, { exId: "gh-change-pace", min: 12 }] },
      { id: "ballhandling-4", name: "The Answer", inspo: "Allen Iverson", emoji: "💎", flavor: "Heart over height — nobody can stay in front.",
        hook: "Heart over height — cross and explode past anyone.",
        highlightVideoId: "rvz-p65_ZO0",
        color: "#c084fc", rarity: "epic",
        title: { id: "title-the-answer", label: "The Answer" },
        cosmetic: { id: "cos-ai-frame", label: "Answer Frame", slot: "frame", emoji: "💎" },
        requirements: [G.bucket("handles", 120), G.program("pgm-guard-handles")],
        signatureDrills: [{ exId: "bh-attack-cross", min: 14 }, { exId: "bh-crossover", min: 22 }, { exId: "sackmann-hesi", min: 10 }] },
      { id: "ballhandling-5", name: "Handle God", inspo: "Kyrie Irving Conquest", emoji: "👑", flavor: "The ball is an extension of your hand.",
        hook: "The ball is an extension of your hand — live combos at game speed.",
        highlightVideoId: "0MC-pNQuByA",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-handle-god", label: "Handle God" },
        cosmetic: { id: "cos-ankle-breaker", label: "Ankle Breaker Emote", slot: "emote", emoji: "🦴" },
        unlockNote: "Complete Handle Like a Guard + 150 handle reps",
        requirements: [G.bucket("handles", 150), G.program("pgm-guard-handles")],
        signatureDrills: [{ exId: "gethandles-combo", min: 12 }, { exId: "gh-cross-btl", min: 18 }, { exId: "bh-combo", min: 12 }] },
    ],
  },
  {
    id: "midrange", name: "Mid-Range", emoji: "🎯", archetype: "The Mid-Range Maestro",
    theme: "The lost art — come off the screen, rise from the elbow, bury it. Own the in-between game.",
    relatedProgramIds: ["become-shooter", "complete-hooper"],
    favoritePlayerKeys: ["hamilton","rip","cade","cunningham","derozan","demar","dirk","nowitzki","midrange","mid-range","pullup","pull-up","elbow"],
    stages: [
      { id: "midrange-1", name: "Pull-Up Kid", emoji: "🎯", flavor: "One dribble into a clean look.",
        color: "#60a5fa", rarity: "common",
        gate: c => c.buckets.midrange >= 15 },
      { id: "midrange-2", name: "Curl Specialist", inspo: "Rip Hamilton", emoji: "🏃", flavor: "Off the screen, catch, rise — never stops moving.",
        hook: "Never stop moving — curl, catch, and bury the mid-range.",
        highlightVideoId: "x6ZIZzzjFRM",
        color: "#38bdf8", rarity: "rare",
        title: { id: "title-curl-specialist", label: "Curl Specialist" },
        cosmetic: { id: "cos-motion-frame", label: "Motion Frame", slot: "frame", emoji: "🏃" },
        gate: c => c.buckets.midrange >= 40,
        signatureDrills: [{ exId: "slab-curl-cut", min: 8 }],
        signatureShots: [{ style: "catch_shoot", min: 30 }] },
      { id: "midrange-3", name: "The Surgeon", inspo: "Cade Cunningham", emoji: "🔪", flavor: "Big guard, slow heartbeat, surgical pull-up.",
        hook: "Slow heartbeat, surgical pull-up — pick your spot and bury it.",
        highlightVideoId: "SShEiud7ty8",
        color: "#a78bfa", rarity: "epic",
        title: { id: "title-surgeon", label: "The Surgeon" },
        cosmetic: { id: "cos-scalpel", label: "Scalpel Emote", slot: "emote", emoji: "🔪" },
        gate: c => c.buckets.midrange >= 80,
        signatureDrills: [{ exId: "slab-elbow", min: 10 }, { exId: "sh-jab-reset", min: 8 }],
        signatureShots: [{ style: "pull_up", min: 60 }] },
      { id: "midrange-4", name: "Mid-Range Assassin", inspo: "DeRozan Conquest", emoji: "🎯", flavor: "From the elbow, it's automatic. The peak of the in-between game.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-midrange-assassin", label: "Mid-Range Assassin" },
        cosmetic: { id: "cos-bullseye-frame", label: "Bullseye Frame", slot: "frame", emoji: "🎯" },
        unlockNote: "Earn Elbow Money (40% mid-range) to unlock",
        gate: c => c.buckets.midrange >= 90 && c.ledgerIds.has("title-elbow-money"),
        signatureDrills: [{ exId: "sb-drive-step", min: 12 }],
        signatureShots: [{ style: "pull_up", min: 100 }, { style: "step_back", min: 50 }] },
    ],
  },
  {
    id: "stepback", name: "Step-Back", emoji: "↩️", archetype: "The Space Creator",
    theme: "Create separation — hop, dribble, drive, then step back like the masters of space.",
    relatedProgramIds: ["step-back-legends", "become-shooter", "complete-hooper"],
    favoritePlayerKeys: ["harden","james","luka","doncic","lillard","dame","curry","steph","dirk","nowitzki","derozan","demar","step-back","stepback","separation"],
    stages: [
      { id: "stepback-1", name: "Hop Shooter", emoji: "🦶", flavor: "One foot, hop back, land, shoot — balance before the dribble.",
        color: "#60a5fa", rarity: "common",
        gate: c => c.buckets.stepback >= 8,
        signatureDrills: [{ exId: "sb-hop-shoot", min: 6 }],
        signatureShots: [{ style: "step_back", min: 15 }] },
      { id: "stepback-2", name: "Separation Artist", inspo: "James Harden", emoji: "↩️", flavor: "Sell the drive, push back, rise clean.",
        hook: "One dribble step-back — the move that rewrote NBA spacing.",
        highlightVideoId: "fFL-PugpRS8",
        color: "#38bdf8", rarity: "rare",
        title: { id: "title-separation", label: "Separation Artist" },
        cosmetic: { id: "cos-stepback-silver", label: "Silver Step-Back Frame", slot: "frame", emoji: "↩️" },
        gate: c => c.buckets.stepback >= 25,
        signatureDrills: [{ exId: "sb-dribble-step", min: 8 }],
        signatureShots: [{ style: "step_back", min: 35 }] },
      { id: "stepback-3", name: "Creator", inspo: "Luka Dončić", emoji: "🎬", flavor: "Drive at game speed, snap into space — full shot creation.",
        hook: "Live drive-to-step-back when the lane closes.",
        highlightVideoId: "eE2Vp10Sqko",
        color: "#a78bfa", rarity: "epic",
        title: { id: "title-creator", label: "Creator" },
        cosmetic: { id: "cos-space-emote", label: "Space Creator Emote", slot: "emote", emoji: "🎬" },
        gate: c => c.buckets.stepback >= 50 && (c.styleMakes?.step_back || 0) >= 50,
        signatureDrills: [{ exId: "sb-drive-step", min: 10 }],
        signatureShots: [{ style: "step_back", min: 75 }] },
      { id: "stepback-4", name: "Logo Killer", inspo: "Damian Lillard Conquest", emoji: "👑", flavor: "From the logo, it's still yours. Peak step-back mastery.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-logo-killer", label: "Logo Killer" },
        cosmetic: { id: "cos-stepback-gold", label: "Gold Step-Back Frame", slot: "frame", emoji: "👑" },
        unlockNote: "Log 100+ step-back makes and master the full 3-level chain",
        gate: c => c.buckets.stepback >= 80 && (c.styleMakes?.step_back || 0) >= 100,
        signatureDrills: [{ exId: "sb-drive-step", min: 15 }],
        signatureShots: [{ style: "step_back", min: 120 }] },
    ],
  },
  {
    id: "maestro", name: "Playmaking", emoji: "🧠", archetype: "The Maestro",
    theme: "Make the defense dance — footwork, reads, and passes like the great floor generals.",
    relatedProgramIds: ["floor-general", "guard-handles", "complete-hooper"],
    favoritePlayerKeys: ["stockton","magic","johnson","nash","kidd","paul","cp3","rondo","point","haliburton","assist","brunson","jalen"],
    stages: [
      { id: "maestro-1", name: "Passer", emoji: "🤲", flavor: "You see the open man.",
        color: "#22d3ee", rarity: "common",
        requirements: [G.bucket("playmaking", 10)] },
      { id: "maestro-2", name: "Pure Point", inspo: "John Stockton", emoji: "🎯", flavor: "Fundamentals on a string — always the right read.",
        color: "#06b6d4", rarity: "rare",
        title: { id: "title-pure-point", label: "Pure Point" },
        cosmetic: { id: "cos-dimes", label: "Dimes Sticker", slot: "avatar_gear", emoji: "💎" },
        requirements: [G.bucket("playmaking", 35)] },
      { id: "maestro-3", name: "Footwork First", inspo: "Jalen Brunson", emoji: "👟", flavor: "Every step creates space — feet before the pass or the shot.",
        hook: "Skip steps, pivots, and two-foot finishes — footwork is your superpower.",
        highlightVideoId: "oPmFhoZqnas",
        color: "#6366f1", rarity: "epic",
        title: { id: "title-footwork-first", label: "Footwork First" },
        cosmetic: { id: "cos-pivot-frame", label: "Pivot Frame", slot: "frame", emoji: "👟" },
        requirements: [G.bucket("playmaking", 55)] },
      { id: "maestro-4", name: "The Maestro", inspo: "Steve Nash", emoji: "🪄", flavor: "You orchestrate the whole floor.",
        color: "#818cf8", rarity: "epic",
        title: { id: "title-maestro", label: "The Maestro" },
        cosmetic: { id: "cos-wizard", label: "Wizard Hat", slot: "avatar_gear", emoji: "🪄" },
        requirements: [G.bucket("playmaking", 75), G.days(14)] },
      { id: "maestro-5", name: "Point God", inspo: "Chris Paul", emoji: "🎖️", flavor: "The game slows down for you.",
        color: "#c084fc", rarity: "epic",
        title: { id: "title-point-god", label: "Point God" },
        cosmetic: { id: "cos-cp-frame", label: "Floor General Frame", slot: "frame", emoji: "🎖️" },
        requirements: [G.bucket("playmaking", 105), G.program("pgm-guard-handles")] },
      { id: "maestro-6", name: "Floor General", inspo: "Magic Johnson Conquest", emoji: "🪄", flavor: "You see the play before it happens. The peak of playmaking.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-floor-general", label: "Floor General" },
        cosmetic: { id: "cos-chevron", label: "General's Chevron Frame", slot: "frame", emoji: "🎖️" },
        unlockNote: "Complete the Complete Hooper program",
        requirements: [G.bucket("playmaking", 130), G.program("pgm-complete-hooper")] },
    ],
  },
  {
    id: "lockdown", name: "Defense", emoji: "🛡️", archetype: "The Lockdown",
    theme: "Nobody scores on you twice. Follow the path of the greatest stoppers.",
    relatedProgramIds: ["lockdown-defender", "complete-hooper", "bodyweight-beast"],
    favoritePlayerKeys: ["payton","glove","pippen","jordan","mj","kawhi","leonard","garnett","kg","rodman","mutombo","wallace","defense","stopper"],
    stages: [
      { id: "lockdown-1", name: "Ball Hawk", emoji: "🐝", flavor: "You're a problem out there.",
        color: "#86efac", rarity: "common",
        gate: c => c.buckets.defense >= 15 },
      { id: "lockdown-2", name: "The Glove", inspo: "Gary Payton", emoji: "🧤", flavor: "You clamp up the best guard on the floor.",
        color: "#22c55e", rarity: "rare",
        title: { id: "title-glove", label: "The Glove" },
        cosmetic: { id: "cos-wall-frame", label: "Brick Wall Frame", slot: "frame", emoji: "🧱" },
        gate: c => c.buckets.defense >= 40 },
      { id: "lockdown-3", name: "Wing Stopper", inspo: "Scottie Pippen", emoji: "🛑", flavor: "Long, switchable, relentless.",
        color: "#16a34a", rarity: "epic",
        title: { id: "title-wing-stopper", label: "Wing Stopper" },
        cosmetic: { id: "cos-cuffs", label: "Handcuffs Emote", slot: "emote", emoji: "🔒" },
        gate: c => c.buckets.defense >= 80 },
      { id: "lockdown-4", name: "The Lockdown", emoji: "🔒", flavor: "Welcome to jail. Defensive Player of the Year.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-lockdown", label: "The Lockdown" },
        cosmetic: { id: "cos-vault-frame", label: "Vault Frame", slot: "frame", emoji: "🔐" },
        gate: c => c.buckets.defense >= 120 },
    ],
  },
  {
    id: "finisher", name: "Slashing", emoji: "⚡", archetype: "The Finisher",
    theme: "Live in the paint and finish through anything — channel the most electric scorers.",
    relatedProgramIds: ["first-step-explosion", "complete-hooper"],
    favoritePlayerKeys: ["wade","flash","iverson","ai","erving","doctor","rose","harden","kyrie","irving","finisher","slash"],
    stages: [
      { id: "finisher-1", name: "Downhill", emoji: "🏃", flavor: "First step's got juice.",
        color: "#fcd34d", rarity: "common",
        gate: c => c.buckets.finishing >= 15 },
      { id: "finisher-2", name: "The Acrobat", inspo: "Dr. J", emoji: "🤸", flavor: "Body control nobody can teach.",
        color: "#fbbf24", rarity: "rare",
        title: { id: "title-acrobat", label: "The Acrobat" },
        cosmetic: { id: "cos-bucket", label: "Bucket Sticker", slot: "avatar_gear", emoji: "🪣" },
        gate: c => c.buckets.finishing >= 40 },
      { id: "finisher-3", name: "Flash", inspo: "Dwyane Wade", emoji: "⚡", flavor: "Too quick, too strong, too late.",
        color: "#f59e0b", rarity: "epic",
        title: { id: "title-flash", label: "Flash" },
        cosmetic: { id: "cos-blur", label: "Blur Frame", slot: "frame", emoji: "⚡" },
        gate: c => c.buckets.finishing >= 80 },
      { id: "finisher-4", name: "Bucket Getter", inspo: "Bucket Conquest", emoji: "🪣", flavor: "You just get buckets. The summit of scoring.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-bucket-getter", label: "Bucket Getter" },
        cosmetic: { id: "cos-flame-trail", label: "Flame Trail", slot: "emote", emoji: "🔥" },
        unlockNote: "Earn Finisher Certified (15 layups in a row) to unlock",
        gate: c => c.buckets.finishing >= 90 && c.ledgerIds.has("title-finisher-certified") },
    ],
  },
  {
    id: "floater", name: "Floater", emoji: "🌧️", archetype: "The Floater",
    theme: "The runner in the lane — drop the teardrop over the big and walk away cool.",
    relatedProgramIds: ["guard-handles", "first-step-explosion"],
    favoritePlayerKeys: ["parker","tony","teardrop","floater","trae","gervin","iceman","runner"],
    stages: [
      { id: "floater-1", name: "Teardrop Kid", emoji: "💧", flavor: "Soft touch over the first big.",
        color: "#60a5fa", rarity: "common",
        gate: c => c.buckets.touch >= 15 },
      { id: "floater-2", name: "The Runner", inspo: "Trae Young", emoji: "🌧️", flavor: "Floats it up before the help even arrives.",
        color: "#38bdf8", rarity: "rare",
        title: { id: "title-runner", label: "The Runner" },
        cosmetic: { id: "cos-teardrop", label: "Teardrop Emote", slot: "emote", emoji: "💧" },
        gate: c => c.buckets.touch >= 35 && c.makes >= 300 },
      { id: "floater-3", name: "Soft Touch", inspo: "Kyrie Irving", emoji: "☁️", flavor: "Impossible angles, feather touch.",
        color: "#a78bfa", rarity: "epic",
        title: { id: "title-soft-touch", label: "Soft Touch" },
        cosmetic: { id: "cos-cloud-frame", label: "Cloud Frame", slot: "frame", emoji: "☁️" },
        gate: c => c.buckets.touch >= 70 && c.makes >= 800 },
      { id: "floater-4", name: "The Teardrop", inspo: "Tony Parker Conquest", emoji: "🌊", flavor: "The teardrop is automatic. Nobody floats it like you.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-teardrop", label: "The Teardrop" },
        cosmetic: { id: "cos-rain-frame", label: "Rainmaker Frame", slot: "frame", emoji: "🌧️" },
        unlockNote: "Earn FT Sniper (70% free throws) to unlock",
        gate: c => c.buckets.touch >= 90 && c.ledgerIds.has("title-ft-sniper") },
    ],
  },
  {
    id: "skywalker", name: "Athleticism", emoji: "💥", archetype: "Above the Rim",
    theme: "Play above the rim — rise with the greatest leapers the game has seen.",
    relatedProgramIds: ["jump-higher", "first-step-explosion", "bodyweight-beast", "jump-rope-basics"],
    favoritePlayerKeys: ["carter","vince","richardson","jrich","wilkins","dominique","lavine","griffin","lebron","james","ja","morant","dunk","westbrook","zion","hops"],
    stages: [
      { id: "skywalker-1", name: "Springs", emoji: "🌀", flavor: "Off the floor in a hurry.",
        color: "#fda4af", rarity: "common",
        requirements: [G.bucket("explosion", 15)],
        signatureDrills: [{ exId: "pogo-jumps", min: 6 }, { exId: "broad-jump-stick", min: 6 }] },
      { id: "skywalker-2", name: "360 Artist", inspo: "Jason Richardson", emoji: "🔄", flavor: "360 dunks and hang time for days.",
        hook: "360 dunks and hang time for days.",
        highlightVideoId: "7_gYpP9yQ0c",
        color: "#fb7185", rarity: "rare",
        title: { id: "title-jrich", label: "360 Artist" },
        cosmetic: { id: "cos-spin-trail", label: "Spin Trail", slot: "emote", emoji: "🔄" },
        requirements: [G.bucket("explosion", 30)],
        signatureDrills: [{ exId: "tuck-jumps", min: 8 }, { exId: "box-jump", min: 6 }, { exId: "pogo-to-tuck", min: 6 }] },
      { id: "skywalker-3", name: "Human Highlight", inspo: "Dominique Wilkins", emoji: "💨", flavor: "Power approach — windmills and tomahawks.",
        hook: "Power approach — windmills and tomahawks at the rim.",
        highlightVideoId: "1j8f7p8K7XQ",
        color: "#f472b6", rarity: "epic",
        title: { id: "title-human-highlight", label: "Human Highlight" },
        cosmetic: { id: "cos-windmill", label: "Windmill Emote", slot: "emote", emoji: "💨" },
        requirements: [G.bucket("explosion", 50)],
        signatureDrills: [{ exId: "squat-jumps", min: 10 }, { exId: "broad-jump", min: 8 }, { exId: "tuck-jumps", min: 12 }] },
      { id: "skywalker-4", name: "Above the Rim", inspo: "Vince Carter", emoji: "🦅", flavor: "Half-man, half-amazing.",
        hook: "Half-man, half-amazing — attack the rim with authority.",
        highlightVideoId: "Kl3yTiK0I-c",
        color: "#fb7185", rarity: "epic",
        title: { id: "title-above-rim", label: "Above the Rim" },
        cosmetic: { id: "cos-hops-trail", label: "Hops Trail", slot: "emote", emoji: "🦘" },
        requirements: [G.bucket("explosion", 70)],
        signatureDrills: [{ exId: "box-jump", min: 12 }, { exId: "drop-jump", min: 8 }, { exId: "squat-jumps", min: 14 }] },
      { id: "skywalker-5", name: "Rim Wrecker", inspo: "Dunk Conquest", emoji: "💥", flavor: "Get out the way. The peak of bounce.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-rim-wrecker", label: "Rim Wrecker" },
        cosmetic: { id: "cos-rim-shake", label: "Rim-Shake Frame", slot: "frame", emoji: "💥" },
        unlockNote: "Complete Jump Higher + 90 explosion reps",
        requirements: [G.bucket("explosion", 90), G.program("pgm-jump-higher")],
        signatureDrills: [{ exId: "drop-jump", min: 12 }, { exId: "box-jump", min: 16 }, { exId: "pogo-to-tuck", min: 10 }] },
    ],
  },
  {
    id: "rebounder", name: "Rebounding", emoji: "🪃", archetype: "The Glass Cleaner",
    theme: "The ball is yours before it hits the floor — box out, go get it, and own the glass.",
    relatedProgramIds: ["own-the-glass", "complete-hooper"],
    favoritePlayerKeys: ["rodman","dennis","worm","draymond","green","moses","malone","ben wallace","wallace","drummond","gobert","rudy","dwight","howard","rebound","boards","glass"],
    stages: [
      { id: "rebounder-1", name: "Box-Out", emoji: "🧱", flavor: "You put a body on your man first.",
        color: "#86efac", rarity: "common",
        requirements: [G.bucket("rebounding", 40)],
        signatureDrills: [{ exId: "reb-boxout", min: 6 }] },
      { id: "rebounder-2", name: "The Motor", inspo: "Draymond Green", emoji: "⚙️", flavor: "Relentless — you chase every single miss.",
        color: "#4ade80", rarity: "rare",
        title: { id: "title-the-motor", label: "The Motor" },
        cosmetic: { id: "cos-glass-bronze", label: "Bronze Glass Frame", slot: "frame", emoji: "🪟" },
        requirements: [G.bucket("rebounding", 150)],
        signatureDrills: [{ exId: "reb-boxout", min: 8 }, { exId: "reb-self-toss", min: 8 }] },
      { id: "rebounder-3", name: "Second Jump", inspo: "Moses Malone", emoji: "🔁", flavor: "Up, down, up again — you win it on the second effort.",
        color: "#22c55e", rarity: "epic",
        title: { id: "title-second-jump", label: "Second Jump" },
        cosmetic: { id: "cos-glass-silver", label: "Silver Glass Frame", slot: "frame", emoji: "🪟" },
        requirements: [G.bucket("rebounding", 400), G.days(14)],
        signatureDrills: [{ exId: "reb-power", min: 8 }, { exId: "reb-tips", min: 8 }] },
      { id: "rebounder-4", name: "Glass Eater", inspo: "Ben Wallace", emoji: "🧹", flavor: "Undersized, unbothered — the whole glass is yours.",
        color: "#16a34a", rarity: "epic",
        title: { id: "title-glass-eater", label: "Glass Eater" },
        cosmetic: { id: "cos-glass-gold", label: "Gold Glass Frame", slot: "frame", emoji: "🏆" },
        requirements: [G.bucket("rebounding", 900), G.streak(7)],
        signatureDrills: [{ exId: "pg-boxout-live", min: 6 }, { exId: "reb-power", min: 10 }] },
      { id: "rebounder-5", name: "The Worm", inspo: "Dennis Rodman Conquest", emoji: "👑", flavor: "Rebounding as an art form. The summit of the glass.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-the-worm", label: "The Worm" },
        cosmetic: { id: "cos-glass-anim", label: "Animated Glass Frame", slot: "frame", emoji: "🪃" },
        unlockNote: "Complete Own the Glass + 1500 rebounding reps",
        requirements: [G.bucket("rebounding", 1500), G.program("pgm-own-the-glass")],
        signatureDrills: [{ exId: "reb-outlet", min: 10 }, { exId: "reb-boxout", min: 12 }] },
    ],
  },
  {
    id: "eurostep", name: "Euro Step", emoji: "👣", archetype: "The Euro Stepper",
    theme: "Two long steps around the big — change direction in the air and finish soft.",
    relatedProgramIds: ["first-step-explosion", "complete-hooper"],
    favoritePlayerKeys: ["manu","ginobili","giannis","antetokounmpo","greek freak","freak","euro","eurostep"],
    stages: [
      { id: "eurostep-1", name: "Two-Step", inspo: "Donovan Mitchell", emoji: "🕷️", flavor: "Long, athletic steps around the first defender — Spida-quick to the rim.",
        color: "#fcd34d", rarity: "common",
        requirements: [G.bucket("finishing", 20)],
        signatureDrills: [{ exId: "fin-euro", min: 5 }] },
      { id: "eurostep-2", name: "The Euro", inspo: "Manu Ginóbili", emoji: "🪄", flavor: "The move Manu brought to the NBA — change direction, finish soft.",
        color: "#fbbf24", rarity: "rare",
        title: { id: "title-the-euro", label: "The Euro" },
        cosmetic: { id: "cos-euro-trail", label: "Euro Trail", slot: "emote", emoji: "👣" },
        requirements: [G.bucket("finishing", 60)],
        signatureDrills: [{ exId: "fin-euro", min: 8 }] },
      { id: "eurostep-3", name: "Change of Pace", inspo: "Shai Gilgeous-Alexander", emoji: "🧊", flavor: "Slow, slow, GONE — change speeds and finish silky through contact.",
        color: "#c084fc", rarity: "epic",
        title: { id: "title-change-of-pace", label: "Change of Pace" },
        cosmetic: { id: "cos-cold-frame", label: "Cold Frame", slot: "frame", emoji: "🧊" },
        requirements: [G.bucket("finishing", 110)],
        signatureDrills: [{ exId: "fin-euro", min: 11 }, { exId: "fs-low-pickup", min: 6 }] },
      { id: "eurostep-4", name: "Freak Step", inspo: "Giannis Antetokounmpo", emoji: "🦌", flavor: "Free-throw line to the rim in two giant steps.",
        color: "#f59e0b", rarity: "epic",
        title: { id: "title-freak-step", label: "Freak Step" },
        cosmetic: { id: "cos-freak-frame", label: "Freak Frame", slot: "frame", emoji: "🦌" },
        requirements: [G.bucket("finishing", 150), G.days(10)],
        signatureDrills: [{ exId: "fin-euro", min: 14 }] },
      { id: "eurostep-5", name: "Unblockable", inspo: "Euro Conquest", emoji: "👑", flavor: "Two long steps nobody can cut off. The peak of the Euro.",
        color: "#f59e0b", rarity: "legendary", conquest: true,
        title: { id: "title-unblockable", label: "Unblockable" },
        cosmetic: { id: "cos-euro-master", label: "Euro Master Frame", slot: "frame", emoji: "👣" },
        unlockNote: "300 finishing reps + 24 Euro Step drills",
        requirements: [G.bucket("finishing", 300)],
        signatureDrills: [{ exId: "fin-euro", min: 24 }] },
    ],
  },
];

/** Alias used in Path Framework docs. */
export const PATHS = MASTERY_TRACKS;

/** Core identity paths surfaced on Today Progress Rail by default. */
export const CORE_PATH_IDS = ["shooter", "ballhandling", "maestro"];

/* ── Meta track — the multi-year north star, gated on the other paths ──────── */
const CORE_TRACK_IDS = MASTERY_TRACKS.map(t => t.id);

export const META_TRACK = {
  id: "legacy", name: "The Franchise", emoji: "🏆",
  theme: "The face of the program.",
  stages: [
    { id: "legacy-1", name: "Two-Way Threat", emoji: "🔁", flavor: "You do it on both ends.",
      color: "#a78bfa", rarity: "epic",
      title: { id: "title-two-way", label: "Two-Way Threat" },
      // ≥2 core tracks reached at least their 2nd stage
      metaGate: reached => CORE_TRACK_IDS.filter(t => (reached[t] || 0) >= 2).length >= 2 },
    { id: "legacy-2", name: "The Franchise", emoji: "🏆", flavor: "They build the team around you.",
      color: "#f59e0b", rarity: "legendary",
      title: { id: "title-franchise", label: "The Franchise" },
      cosmetic: { id: "cos-legend-frame", label: "Legend Frame", slot: "frame", emoji: "🏆" },
      metaGate: reached => CORE_TRACK_IDS.filter(t => isTrackComplete(t, reached)).length >= 3 },
    { id: "legacy-3", name: "Hall of Famer", emoji: "🏛️", flavor: "First ballot. No debate.",
      color: "#fde68a", rarity: "legendary",
      title: { id: "title-hof", label: "Hall of Famer" },
      cosmetic: { id: "cos-hof-jacket", label: "HOF Jacket", slot: "avatar_gear", emoji: "🧥" },
      metaGate: reached => CORE_TRACK_IDS.every(t => isTrackComplete(t, reached)) },
  ],
};

function trackById(id) {
  return MASTERY_TRACKS.find(t => t.id === id);
}
function isTrackComplete(trackId, reached) {
  const t = trackById(trackId);
  return t ? (reached[trackId] || 0) >= t.stages.length : false;
}

/* ── Challenge rewards — granted server-side via the same ledger (kind=cosmetic
 * so they're equippable). Not part of a mastery track; their own `challenge` family. */
export const CHALLENGE_REWARDS = [
  { id: "cos-weekly-flame", kind: "cosmetic", family: "challenge", slot: "emote",
    name: "Flame Trail", emoji: "🔥", color: "#f97316", rarity: "rare" },
];

/* ── Benchmarks — measured accuracy tests. Crossing a threshold earns a
 * certification, which IS an equippable title in the ledger (reward real accuracy,
 * not just volume). The append-only result series lives in `benchmark_results`. */
// Kid-reasonable thresholds: achievable for a dedicated youth player with practice
// (FT 70%, a 1-of-3 three-point clip, etc.) — meaningful, not pro-level.
export const BENCHMARKS = [
  { id: "ft_pct",       label: "Free Throw %", unit: "%", threshold: 70, emoji: "🎯",
    color: "#38bdf8", title: { id: "title-ft-sniper",      label: "FT Sniper" } },
  { id: "spot3_pct",    label: "Spot 3PT %",   unit: "%", threshold: 33, emoji: "🌧️",
    color: "#a78bfa", title: { id: "title-range-certified", label: "Range Certified" } },
  { id: "midrange_pct", label: "Mid-Range %",  unit: "%", threshold: 40, emoji: "🔪",
    color: "#f59e0b", title: { id: "title-elbow-money",     label: "Elbow Money" } },
  { id: "layups_row",   label: "Layups in a Row", unit: "", threshold: 15, emoji: "🏁",
    color: "#22c55e", title: { id: "title-finisher-certified", label: "Finisher Certified" } },
];

export function getBenchmark(id) {
  return BENCHMARKS.find(b => b.id === id) || null;
}
/** Title id earned if a benchmark value meets its threshold, else null. */
export function benchmarkCertTitle(benchmark, value) {
  if (!benchmark || value == null) return null;
  return value >= benchmark.threshold ? benchmark.title.id : null;
}

/* ── Flattened catalog (id → metadata) for display, equip, and ledger kinds ── */
function buildCatalog() {
  const cat = {};
  const addStageRows = (track) => {
    track.stages.forEach((s, i) => {
      cat[s.id] = {
        id: s.id, kind: "milestone", family: track.id, sequence: i + 1,
        name: s.name, emoji: s.emoji, flavor: s.flavor, color: s.color, rarity: s.rarity,
        trackName: track.name, conquest: !!s.conquest, inspo: s.inspo || null,
        unlockNote: s.unlockNote || null,
      };
      if (s.title) {
        cat[s.title.id] = {
          id: s.title.id, kind: "title", family: track.id,
          name: s.title.label, emoji: s.emoji, color: s.color, rarity: s.rarity,
          fromMilestone: s.id,
        };
      }
      if (s.cosmetic) {
        cat[s.cosmetic.id] = {
          id: s.cosmetic.id, kind: "cosmetic", family: track.id, slot: s.cosmetic.slot,
          name: s.cosmetic.label, emoji: s.cosmetic.emoji, color: s.color, rarity: s.rarity,
          fromMilestone: s.id,
        };
      }
      // Conquering a track's legendary peak grants an equippable Legend avatar
      // (original archetype emblem, no licensed assets).
      if (s.conquest) {
        const avId = `avatar-${track.id}`;
        cat[avId] = {
          id: avId, kind: "cosmetic", family: track.id, slot: "avatar",
          name: `${track.archetype || track.name} — Legend`,
          emoji: track.emoji || s.emoji, color: s.color, rarity: "legendary",
          fromMilestone: s.id, legendAvatar: true,
        };
      }
    });
  };
  MASTERY_TRACKS.forEach(t => addStageRows(t));
  addStageRows(META_TRACK);
  for (const r of CHALLENGE_REWARDS) cat[r.id] = { ...r };
  for (const b of BENCHMARKS) {
    cat[b.title.id] = {
      id: b.title.id, kind: "title", family: "benchmark", name: b.title.label,
      emoji: b.emoji, color: b.color, rarity: "epic", fromBenchmark: b.id,
    };
  }
  return cat;
}

export const CATALOG = buildCatalog();

export const TITLES = Object.values(CATALOG).filter(a => a.kind === "title");
export const COSMETICS = Object.values(CATALOG).filter(a => a.kind === "cosmetic");
export const COSMETIC_SLOTS = ["frame", "avatar_gear", "emote"];

export function getAchievementMeta(id) {
  return CATALOG[id] || null;
}
export function titleLabel(id) {
  return CATALOG[id]?.name || null;
}
/** Kind of any ledger id — catalog rows, else a legacy badge. */
export function kindOf(id) {
  return CATALOG[id]?.kind || "badge";
}
export function familyOf(id) {
  return CATALOG[id]?.family || null;
}

/* ── Category counts from completion history (uses the app's category resolver) */
export function computeCatCounts(completed, getCategory) {
  const counts = {};
  for (const key of Object.keys(completed || {})) {
    if (!completed[key]) continue;
    const exId = key.split("-").slice(3).join("-");
    const cat = getCategory?.(exId);
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

/* ── Evaluation ─────────────────────────────────────────────────────────────
 * ctx: { earnedBadgeIds:Set, makes, accuracy, maxStreak, catCounts }
 * Returns the full set of earned achievement ids: milestones + the titles and
 * cosmetics they grant + the meta-track results. Legacy badges are layered in
 * by the caller (they already have ids from getEarnedBadges).
 */
/** Normalize raw stats into the gate-evaluation context (adds skill buckets). */
export function buildEvalCtx(ctxIn) {
  return {
    earnedBadgeIds: ctxIn.earnedBadgeIds || new Set(),
    ledgerIds: ctxIn.ledgerIds || new Set(),
    makes: ctxIn.makes || 0,
    accuracy: ctxIn.accuracy ?? null,
    maxStreak: ctxIn.maxStreak || 0,
    trainingDays: ctxIn.trainingDays || 0,
    benchmarkPBs: ctxIn.benchmarkPBs || {},
    catCounts: ctxIn.catCounts || {},
    exCounts: ctxIn.exCounts || {},
    styleMakes: ctxIn.styleMakes || {},
    buckets: {
      handles: bucketSum(ctxIn.catCounts, BUCKETS.handles),
      playmaking: bucketSum(ctxIn.catCounts, BUCKETS.playmaking),
      defense: bucketSum(ctxIn.catCounts, BUCKETS.defense),
      explosion: bucketSum(ctxIn.catCounts, BUCKETS.explosion),
      finishing: bucketSum(ctxIn.catCounts, BUCKETS.finishing),
      midrange: bucketSum(ctxIn.catCounts, BUCKETS.midrange),
      stepback: bucketSum(ctxIn.catCounts, BUCKETS.stepback),
      touch: bucketSum(ctxIn.catCounts, BUCKETS.touch),
      rebounding: bucketSum(ctxIn.catCounts, BUCKETS.rebounding),
    },
  };
}

export function evaluateEarned(ctxIn) {
  const ctx = buildEvalCtx(ctxIn);

  const earned = new Set();
  const reached = {}; // trackId → highest consecutive stage number reached

  for (const track of MASTERY_TRACKS) {
    let stageNum = 0;
    for (const stage of track.stages) {
      if (!evaluateStageGate(stage, ctx)) break;
      earned.add(stage.id);
      if (stage.title) earned.add(stage.title.id);
      if (stage.cosmetic) earned.add(stage.cosmetic.id);
      if (stage.conquest) earned.add(`avatar-${track.id}`);
      stageNum += 1;
    }
    reached[track.id] = stageNum;
  }

  // Meta track depends on the core tracks' progress.
  for (const stage of META_TRACK.stages) {
    if (!stage.metaGate(reached)) break;
    earned.add(stage.id);
    if (stage.title) earned.add(stage.title.id);
    if (stage.cosmetic) earned.add(stage.cosmetic.id);
    if (stage.conquest) earned.add(`avatar-${META_TRACK.id}`);
  }

  return earned;
}

/* ── Grant path ─────────────────────────────────────────────────────────────
 * The ONLY way a row enters the ledger. Diffs earned-vs-owned and returns the
 * new ledger entries (cloud + local share this shape). Future Challenges and
 * Benchmarks call grantEntries() too — never a parallel writer.
 */
export function grantEntries(earnedIds, ownedIds, { earnedAt, context = {} } = {}) {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds || []);
  const when = earnedAt || new Date().toISOString();
  const out = [];
  for (const id of earnedIds) {
    if (owned.has(id)) continue;
    out.push({
      achievement_id: id,
      kind: kindOf(id),
      family: familyOf(id),
      earned_at: when,
      context,
    });
  }
  return out;
}

/* ── Backfill — turn an existing player's current state into ledger rows once,
 * preserving historical badge dates where we have them. */
export function backfillEntries({ earnedBadgeIds, trackEarnedIds, badgeDates = {}, ownedIds = new Set() }) {
  const owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds || []);
  const out = [];
  const push = (id, dateStr) => {
    if (owned.has(id)) return;
    out.push({
      achievement_id: id,
      kind: kindOf(id),
      family: familyOf(id),
      earned_at: dateStr ? new Date(dateStr + "T12:00:00").toISOString() : new Date().toISOString(),
      context: { backfilled: true },
    });
  };
  for (const id of earnedBadgeIds || []) push(id, badgeDates[id]);
  for (const id of trackEarnedIds || []) push(id, null);
  return out;
}

/* ── Equip system ───────────────────────────────────────────────────────────
 * Ownership is the ledger; equipped state is identity (settings/profile).
 * One active title; one cosmetic per slot. Everything validated against owned.
 */
export function ownedTitleIds(ledgerIds) {
  return [...(ledgerIds || [])].filter(id => kindOf(id) === "title");
}
export function ownedCosmeticIds(ledgerIds) {
  return [...(ledgerIds || [])].filter(id => kindOf(id) === "cosmetic");
}
export function isOwned(ledgerIds, id) {
  return (ledgerIds instanceof Set ? ledgerIds : new Set(ledgerIds || [])).has(id);
}

/** Validate/repair equipped identity against what's actually owned. */
export function sanitizeEquip(settings, ledgerIds) {
  const owned = ledgerIds instanceof Set ? ledgerIds : new Set(ledgerIds || []);
  const out = { activeTitle: settings.activeTitle || null, equipped: { ...(settings.equipped || {}) } };
  if (out.activeTitle && !owned.has(out.activeTitle)) out.activeTitle = null;
  for (const slot of Object.keys(out.equipped)) {
    if (!owned.has(out.equipped[slot])) delete out.equipped[slot];
  }
  return out;
}

export function equipTitle(settings, titleId, ledgerIds) {
  if (titleId && !isOwned(ledgerIds, titleId)) return settings;
  return { ...settings, activeTitle: titleId || null };
}

export function equipCosmetic(settings, cosmeticId, ledgerIds) {
  const meta = CATALOG[cosmeticId];
  if (!meta || meta.kind !== "cosmetic" || !isOwned(ledgerIds, cosmeticId)) return settings;
  return { ...settings, equipped: { ...(settings.equipped || {}), [meta.slot]: cosmeticId } };
}

export function unequipSlot(settings, slot) {
  const next = { ...(settings.equipped || {}) };
  delete next[slot];
  return { ...settings, equipped: next };
}

/* ── Journey progress + personalization ─────────────────────────────────────── */

/** The label a rung shows as your "rank": the legend homage if enabled, else identity. */
export function rungLabel(stage) {
  if (SHOW_LEGEND_NAMES && stage?.inspo) return stage.inspo;
  return stage?.name || "";
}

/** Where an athlete stands on a track: current rung, next goal, % complete. */
export function trackRankInfo(track, ctxIn) {
  const ctx = buildEvalCtx(ctxIn);
  let reached = 0;
  for (const stage of track.stages) {
    if (evaluateStageGate(stage, ctx)) reached += 1;
    else break;
  }
  const current = reached > 0 ? track.stages[reached - 1] : null;
  const next = reached < track.stages.length ? track.stages[reached] : null;
  return {
    reached,
    total: track.stages.length,
    current,
    next,
    complete: reached === track.stages.length,
    pct: Math.round((reached / track.stages.length) * 100),
    currentRank: current ? rungLabel(current) : "Unranked",
    nextGoal: next ? rungLabel(next) : null,
  };
}

/** Within-stage progress for Progress Rail (metric-interpolated, not stage-count jumps). */
export function trackStageProgress(track, ctxIn) {
  return computeTrackStageProgress(track, ctxIn, { buildEvalCtx, trackRankInfo, rungLabel });
}

/** Paths with any activity or progress — for "Also tracking" on the rail. */
export function getSecondaryPaths(ctxIn, primaryTrackId) {
  return MASTERY_TRACKS
    .filter(t => t.id !== primaryTrackId)
    .map(t => ({ track: t, progress: trackStageProgress(t, ctxIn) }))
    .filter(({ progress }) => progress.reached > 0 || progress.stagePct > 0)
    .slice(0, 3);
}

/** Best non-primary path by stage progress when no favorite is set. */
export function getMostActivePathId(ctxIn) {
  let best = MASTERY_TRACKS[0]?.id || null;
  let bestScore = -1;
  for (const track of MASTERY_TRACKS) {
    const p = trackStageProgress(track, ctxIn);
    const score = p.reached * 1000 + p.stagePct;
    if (score > bestScore) {
      bestScore = score;
      best = track.id;
    }
  }
  return best;
}

/** Snapshot for optional cloud cache / squad card display. */
export function buildPathSnapshot(ctxIn, settings) {
  const primaryId = recommendTrackForFavorite(settings) || getMostActivePathId(ctxIn);
  const primary = getTrack(primaryId);
  const progress = primary ? trackStageProgress(primary, ctxIn) : null;
  const snapshot = {};
  for (const track of MASTERY_TRACKS) {
    const info = trackRankInfo(track, ctxIn);
    snapshot[track.id] = {
      reached: info.reached,
      rank: info.currentRank,
      pct: trackStageProgress(track, ctxIn).stagePct,
      complete: info.complete,
    };
  }
  return {
    primaryPathId: primaryId,
    primaryPathRank: progress?.currentRank || null,
    pathProgressPct: progress?.stagePct ?? 0,
    paths: snapshot,
  };
}

export function recommendProgramsForFavorite(settings) {
  const entry = matchRegistryEntry(favoritePlayerQuery(settings));
  if (entry?.programs?.length) return entry.programs;
  const trackId = recommendTrackForFavorite(settings);
  const track = trackId ? getTrack(trackId) : null;
  return track?.relatedProgramIds || [];
}

export function pathTagForProgram(programId) {
  const track = MASTERY_TRACKS.find(t =>
    (t.relatedProgramIds || []).includes(programId)
  );
  return track ? track.archetype : null;
}

/**
 * Programs that must be finished first: `requires` when set (a level that needs more
 * training behind it than its base), else the base program of an advanced level.
 */
export function missingPrerequisites(prog, programs, earnedBadges) {
  const ids = prog.requires || (prog.advancedOf ? [prog.advancedOf] : []);
  return ids
    .map(id => programs.find(p => p.id === id))
    .filter(p => p && !earnedBadges.includes(p.badgeId));
}

export function isProgramLocked(prog, programs, earnedBadges) {
  return missingPrerequisites(prog, programs, earnedBadges).length > 0;
}

/** Why `next` follows `finishedId`, in a few kid-readable words for the Up Next card. */
export function nextProgramReason(finishedId, next, programs, earnedBadges) {
  if (!next) return null;
  if (next.advancedOf === finishedId) return "You unlocked the next level:";
  if ((next.requires || []).includes(finishedId)) return "You unlocked the next level:";
  const target = programs.find(p =>
    (p.advancedOf === finishedId || (p.requires || []).includes(finishedId))
    && !earnedBadges.includes(p.badgeId)
    && missingPrerequisites(p, programs, earnedBadges).some(m =>
      m.id === next.id || missingPrerequisites(m, programs, earnedBadges).some(d => d.id === next.id)));
  if (target) return `Next step toward ${target.name}:`;
  return "Ready for your next program?";
}

/**
 * What to try next after finishing a program. Pulls from the mastery tracks that
 * list this program (same skill family), falling back to any featured program,
 * skipping anything already completed or currently enrolled.
 */
export function suggestNextProgram(programId, programs, enrolledPrograms, earnedBadges) {
  const isAvailable = (p) =>
    p.id !== programId && !enrolledPrograms[p.id] && !earnedBadges.includes(p.badgeId)
    && !isProgramLocked(p, programs, earnedBadges);

  const levelUp = programs.find(p => p.advancedOf === programId && isAvailable(p));
  if (levelUp) return levelUp;

  /* Finishing this may be what unlocked another program's next level. */
  const justUnlocked = programs.find(p => (p.requires || []).includes(programId) && isAvailable(p));
  if (justUnlocked) return justUnlocked;

  /* A next level this program counts toward is still locked behind other programs: point
     at the next one on that road (or, if that one is itself locked, at what unlocks it). */
  const lockedTargets = programs.filter(p =>
    (p.advancedOf === programId || (p.requires || []).includes(programId))
    && !earnedBadges.includes(p.badgeId));
  for (const target of lockedTargets) {
    for (const need of missingPrerequisites(target, programs, earnedBadges)) {
      if (isAvailable(need)) return need;
      const deeper = missingPrerequisites(need, programs, earnedBadges).find(isAvailable);
      if (deeper) return deeper;
    }
  }

  const familyId = programs.find(p => p.id === programId)?.advancedOf ?? programId;
  const relatedIds = MASTERY_TRACKS
    .filter(t => (t.relatedProgramIds || []).includes(familyId))
    .flatMap(t => t.relatedProgramIds);
  for (const id of relatedIds) {
    const p = programs.find(p => p.id === id);
    if (p && isAvailable(p)) return p;
  }

  const featured = programs.find(p => p.featured && isAvailable(p));
  if (featured) return featured;

  return programs.find(isAvailable) || null;
}

export { FAVORITE_PLAYER_REGISTRY, displayFavoritePlayer, matchRegistryEntry };

/**
 * Map a favorite player to the track that best fits their game. Accepts a plain
 * string or a settings object — for an object, "who they want to play like" is the
 * strongest signal, then their current favorite, then all-time, then legacy field.
 */
export function recommendTrackForFavorite(favorite) {
  const entry = matchRegistryEntry(favoritePlayerQuery(favorite));
  if (entry?.primaryPath) return entry.primaryPath;
  const q = favoritePlayerQuery(favorite);
  if (!q) return null;
  for (const track of MASTERY_TRACKS) {
    if ((track.favoritePlayerKeys || []).some(k => q.includes(k))) return track.id;
  }
  return null;
}

export function getTrack(trackId) {
  return MASTERY_TRACKS.find(t => t.id === trackId) || null;
}
