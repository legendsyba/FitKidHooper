/**
 * Player-Development Knowledge Layer — the "skill graph."
 *
 * Data-only module (no UI). The machine-readable form of the design in
 * NextPlay docs/PLAYER_DEVELOPMENT_KNOWLEDGE_LAYER.md + DEV_KNOWLEDGE_VOCABULARY.md.
 *
 * Two grammars:
 *   GAME  (how skills chain in play): situation → entry → move/shot → counter → finish
 *   DEV   (how a skill is built+measured): area → movement_pattern → technique → speed/difficulty → goal
 *
 * Two-layer platform: FKH = Development Skills (these atoms). NextPlay = Tactical Grammar
 * (applies them). Shared vocabulary; bridge via `usedIn` (skill → game scenarios) and, on the
 * NextPlay side, scenario `requires` skills.
 *
 * Extensible: add to SKILLS / MOVEMENT_PATTERNS / ENTRIES; helpers query by area/role/age.
 */

export const GAME_GRAMMAR = ["situation", "entry", "move", "counter", "finish"];
export const DEV_GRAMMAR = ["area", "movement_pattern", "technique", "speed_difficulty", "goal"];

export const AGE_BANDS = {
  foundational: { label: "Foundational", range: "6–12" },
  advanced: { label: "Advanced", range: "MS / HS+" },
};

/** Layer 1 skill areas (every drill maps to one+). */
export const SKILL_AREAS = {
  handles:     { label: "Ball-Handling", emoji: "🏀" },
  shooting:    { label: "Shooting",      emoji: "🎯" },
  finishing:   { label: "Finishing",     emoji: "🏁" },
  footwork:    { label: "Footwork",      emoji: "👟" },
  passing:     { label: "Passing",       emoji: "🤝" },
  defense:     { label: "Defense",       emoji: "🛡️" },
  rebounding:  { label: "Rebounding",    emoji: "🪃" },
  athleticism: { label: "Athleticism",   emoji: "💪" },
};

/** Handle-move functional roles (the handles grammar). A move can have several. */
export const MOVE_ROLES = {
  foundation:       "Sets up everything",
  rhythm:           "Set up the defender",
  direction_change: "Beat the defender",
  escape:           "Create space",
  counter:          "When cut off",
};

/** Movement patterns — the kinesthetic primitive layer skills reference (model once, reuse). */
export const MOVEMENT_PATTERNS = {
  lateral_slide:   { label: "Lateral Slide" },
  drop_step:       { label: "Drop Step" },
  closeout_stride: { label: "Closeout Stride" },
  first_step:      { label: "Explosive First Step" },
  hop:             { label: "Hop / Two-Foot Gather" },
  one_two:         { label: "1-2 Step" },
  gather:          { label: "Gather (into shot/finish)" },
  front_pivot:     { label: "Front Pivot" },
  reverse_pivot:   { label: "Reverse Pivot" },
  jump_stop:       { label: "Jump Stop" },
  second_jump:     { label: "Second Jump" },
  high_point:      { label: "High-Point Jump" },
};

/**
 * Shooting mechanics — DEFAULT framework Base → Load → Lift → Release → Follow-Through.
 * (BEEF kept as an alternate grouping of the same atoms.) One-motion is the default.
 * NB: mechanical "Follow-Through/Reset" ≠ the GAME grammar "finish" (a decision).
 */
export const SHOOTING_MECHANICS = {
  framework: "base_load_lift_release_follow",
  altFrameworks: ["BEEF"],
  stages: {
    base:          ["athletic stance", "balance (nose over toes)", "foot angle — natural 10–30°, not forced square", "weight on balls of feet", "hips loaded", "ready posture"],
    load:          ["shooting pocket", "natural dip (don't force)", "shot prep — hands/eyes/feet ready before the catch", "find target early", "1-2 footwork", "hop footwork"],
    lift:          ["legs initiate", "ball & body rise together", "elbow under the ball", "one-motion (default) / two-motion (advanced)"],
    release:       ["wrist snap", "guide hand guides — doesn't push", "fingers finish through center", "high release", "soft touch / arc"],
    followThrough: ["hold the follow-through", "land balanced", "ready for the next play (don't admire)"],
  },
  principles: ["shot line (one continuous line)", "rhythm (no pause)", "timing — legs start, hands finish"],
};

/**
 * Skills — the core vocabulary. Fields:
 *   id, area, name, gameSlot ('entry'|'move'|'counter'|'finish'|'foundation'),
 *   role? (handles), age ('foundational'|'advanced'), patterns? (movement_pattern ids),
 *   composedOf? (combo → base move ids), tacticalAction? (cross-link into NextPlay's tactical layer),
 *   usedIn? (game-scenario hints — the bridge)
 */
export const SKILLS = [
  // ── BALL-HANDLING (move grammar; combos generated, not enumerated) ──
  { id: "pound",        area: "handles", name: "Pound Dribble",   role: "foundation",       age: "foundational" },
  { id: "hesitation",   area: "handles", name: "Hesitation",      role: "rhythm",           age: "foundational" },
  { id: "hang",         area: "handles", name: "Hang Dribble",    role: "rhythm",           age: "advanced" },
  { id: "in_out",       area: "handles", name: "In-and-Out",      role: "rhythm",           age: "foundational" },
  { id: "inside_out",   area: "handles", name: "Inside-Out",      role: "rhythm",           age: "foundational" },
  { id: "stutter",      area: "handles", name: "Stutter",         role: "rhythm",           age: "foundational" },
  { id: "freeze",       area: "handles", name: "Freeze / Dead Leg", role: "rhythm",         age: "advanced" },
  { id: "cross",        area: "handles", name: "Crossover",       role: "direction_change", age: "foundational" },
  { id: "push_cross",   area: "handles", name: "Push Cross",      role: "direction_change", age: "foundational" },
  { id: "between",      area: "handles", name: "Between-the-Legs", role: "direction_change", age: "foundational" },
  { id: "behind",       area: "handles", name: "Behind-the-Back", role: "direction_change", age: "foundational" },
  { id: "spin",         area: "handles", name: "Spin",            role: "direction_change", age: "advanced" },
  { id: "half_spin",    area: "handles", name: "Half-Spin",       role: "direction_change", age: "advanced" },
  { id: "shamgod",      area: "handles", name: "Shamgod",         role: "direction_change", age: "advanced" },
  { id: "retreat",      area: "handles", name: "Retreat Dribble", role: "escape",           age: "foundational" },
  { id: "pullback",     area: "handles", name: "Pullback",        role: "escape",           age: "foundational" },
  { id: "snatch",       area: "handles", name: "Snatch Back",     role: "escape",           age: "advanced" },
  // exemplar combos (teaching examples only — the Combo Builder generates the rest)
  { id: "cross_behind", area: "handles", name: "Cross → Behind",  role: "direction_change", age: "foundational", composedOf: ["cross", "behind"] },
  { id: "hang_hesi_cross", area: "handles", name: "Hang → Hesi → Cross", role: "direction_change", age: "advanced", composedOf: ["hang", "hesitation", "cross"] },

  // ── SHOOTING — entries (cross-link to tactical actions), shot types, counters, finishes ──
  { id: "spot_up",      area: "shooting", name: "Spot-Up",         gameSlot: "entry",  age: "foundational", patterns: ["hop", "one_two"] },
  { id: "relocation",   area: "shooting", name: "Relocation",      gameSlot: "entry",  age: "foundational" },
  { id: "drift",        area: "shooting", name: "Drift",           gameSlot: "entry",  age: "foundational" },
  { id: "curl",         area: "shooting", name: "Curl",            gameSlot: "entry",  age: "foundational", tacticalAction: "curl" },
  { id: "flare",        area: "shooting", name: "Flare",           gameSlot: "entry",  age: "foundational", tacticalAction: "flare" },
  { id: "pin_down",     area: "shooting", name: "Pin-Down",        gameSlot: "entry",  age: "foundational", tacticalAction: "pin-down" },
  { id: "dho_entry",    area: "shooting", name: "DHO",             gameSlot: "entry",  age: "foundational", tacticalAction: "dho" },
  { id: "transition_shot", area: "shooting", name: "Sprint-Into-Shot", gameSlot: "entry", age: "foundational" },
  { id: "zoom",         area: "shooting", name: "Zoom Action",     gameSlot: "entry",  age: "advanced",    tacticalAction: "zoom" },
  { id: "catch_shoot",  area: "shooting", name: "Catch & Shoot",   gameSlot: "move",   age: "foundational" },
  { id: "pullup_1",     area: "shooting", name: "One-Dribble Pull-Up", gameSlot: "move", age: "foundational" },
  { id: "pullup_2",     area: "shooting", name: "Two-Dribble Pull-Up", gameSlot: "move", age: "foundational" },
  { id: "step_back",    area: "shooting", name: "Step-Back",       gameSlot: "move",   age: "advanced",    patterns: ["gather"] },
  { id: "side_step",    area: "shooting", name: "Side-Step",       gameSlot: "move",   age: "advanced" },
  { id: "floater",      area: "shooting", name: "Floater / Runner", gameSlot: "move",  age: "foundational" },
  { id: "shot_fake_drive", area: "shooting", name: "Shot-Fake → One Dribble", gameSlot: "counter", age: "foundational" },
  { id: "reject_screen", area: "shooting", name: "Reject Screen",  gameSlot: "counter", age: "advanced" },

  // ── FINISHING — gather → finish → counter → outcome ──
  { id: "speed_gather", area: "finishing", name: "Speed Gather (off one)", gameSlot: "entry", age: "foundational", patterns: ["first_step"] },
  { id: "power_gather", area: "finishing", name: "Power Gather (off two)", gameSlot: "entry", age: "foundational", patterns: ["jump_stop"] },
  { id: "low_pickup",   area: "finishing", name: "Low Pickup",      gameSlot: "entry", age: "advanced", patterns: ["first_step"] },
  { id: "layup",        area: "finishing", name: "Overhand Layup",  gameSlot: "move", age: "foundational" },
  { id: "scoop",        area: "finishing", name: "Underhand / Scoop", gameSlot: "move", age: "foundational" },
  { id: "reverse",      area: "finishing", name: "Reverse Layup",   gameSlot: "move", age: "foundational" },
  { id: "euro",         area: "finishing", name: "Euro Step",       gameSlot: "move", age: "advanced" },
  { id: "pro_hop",      area: "finishing", name: "Pro-Hop",         gameSlot: "move", age: "advanced" },
  { id: "up_under",     area: "finishing", name: "Up-and-Under",    gameSlot: "counter", age: "advanced" },

  // ── FOOTWORK (also the movement_pattern source) ──
  { id: "jump_stop_skill", area: "footwork", name: "Jump Stop",    gameSlot: "foundation", age: "foundational", patterns: ["jump_stop"] },
  { id: "front_pivot_skill", area: "footwork", name: "Front Pivot", gameSlot: "foundation", age: "foundational", patterns: ["front_pivot"] },
  { id: "reverse_pivot_skill", area: "footwork", name: "Reverse Pivot", gameSlot: "foundation", age: "foundational", patterns: ["reverse_pivot"] },
  { id: "jab_go",       area: "footwork", name: "Jab-and-Go",      gameSlot: "move", age: "foundational" },
  { id: "rip_through",  area: "footwork", name: "Rip-Through",     gameSlot: "move", age: "foundational" },
  { id: "step_through", area: "footwork", name: "Step-Through",    gameSlot: "move", age: "advanced" },

  // ── PASSING (mostly a Finish/decision skill) ──
  { id: "chest",        area: "passing", name: "Chest Pass",       gameSlot: "move",   age: "foundational" },
  { id: "bounce",       area: "passing", name: "Bounce Pass",      gameSlot: "move",   age: "foundational" },
  { id: "pocket",       area: "passing", name: "Pocket Pass (PnR)", gameSlot: "finish", age: "advanced" },
  { id: "kick_out",     area: "passing", name: "Kick-Out",         gameSlot: "finish", age: "foundational" },
  { id: "dump_off",     area: "passing", name: "Dump-Off",         gameSlot: "finish", age: "foundational" },
  { id: "skip",         area: "passing", name: "Skip Pass",        gameSlot: "move",   age: "advanced" },
  { id: "outlet",       area: "passing", name: "Outlet",           gameSlot: "finish", age: "foundational" },

  // ── DEFENSE (technique/movement areas) ──
  { id: "def_stance",   area: "defense", name: "Athletic Position", gameSlot: "foundation", age: "foundational" },
  { id: "slide",        area: "defense", name: "Lateral Slide",    gameSlot: "move",   age: "foundational", patterns: ["lateral_slide"] },
  { id: "closeout",     area: "defense", name: "Closeout",         gameSlot: "move",   age: "foundational", patterns: ["closeout_stride"] },
  { id: "containment",  area: "defense", name: "Containment / Mirror", gameSlot: "move", age: "foundational" },
  { id: "contest",      area: "defense", name: "Shot Contest (no foul)", gameSlot: "counter", age: "foundational" },
  { id: "recover_xout", area: "defense", name: "Recover / X-Out",  gameSlot: "counter", age: "advanced" },

  // ── REBOUNDING (own area; offensive folds into finishes) ──
  { id: "reb_ready",    area: "rebounding", name: "Ready Position", gameSlot: "foundation", age: "foundational", patterns: ["first_step"] },
  { id: "reb_tracking", area: "rebounding", name: "Ball Tracking",  gameSlot: "entry",  age: "foundational" },
  { id: "reb_pursuit",  area: "rebounding", name: "Pursuit",        gameSlot: "move",   age: "foundational", patterns: ["first_step"] },
  { id: "reb_highpoint", area: "rebounding", name: "High Point",    gameSlot: "move",   age: "foundational", patterns: ["high_point"] },
  { id: "reb_secure",   area: "rebounding", name: "Secure (chin it)", gameSlot: "move", age: "foundational" },
  { id: "reb_second",   area: "rebounding", name: "Second Effort",  gameSlot: "counter", age: "foundational", patterns: ["second_jump"] },
  { id: "reb_putback",  area: "rebounding", name: "Put-Back",       gameSlot: "finish", age: "foundational" },
  { id: "reb_tipcontrol", area: "rebounding", name: "Tip Control (to self/space)", gameSlot: "finish", age: "advanced" },
  { id: "reb_outlet",   area: "rebounding", name: "Outlet & Go",    gameSlot: "finish", age: "foundational" },
];

/** Handles combo grammar — the Combo Builder generates valid chains (not stored per-instance). */
export const COMBO_GRAMMAR = {
  chain: ["rhythm", "direction_change", "counter", "finish"], // canonical, roles optional
  // A valid combo = optional rhythm(s) → a direction_change → optional counter → finish.
  difficulty: (moveIds) => moveIds.length, // + rarity weighting later
};

/**
 * Connection layer — maps FKH's existing drill CATEGORIES (categories.js CATS keys) to skill
 * areas, so every current drill gains a skill-graph home without touching the drills or UI.
 * Finer drill→specific-skill links are extensible (add a per-drill map later).
 */
export const CATEGORY_TO_AREA = {
  handles: "handles", ballhandling: "handles", game_handles: "handles",
  shooting: "shooting", shootingdrills: "shooting", shooting_lab: "shooting",
  footwork: "footwork", footwork_lab: "footwork",
  finishing: "finishing", finishing_school: "finishing",
  passing: "passing", rebounding: "rebounding",
  defense: "defense",
  // athletic/strength/speed/etc. → athleticism (attributes)
  athletic: "athleticism", explosion: "athleticism", strength: "athleticism",
  speed: "athleticism", conditioning: "athleticism", coordination: "athleticism", jumprope: "athleticism",
  balance: "athleticism", deceleration: "athleticism",
};
export const areaForCategory = (cat) => CATEGORY_TO_AREA[cat] ?? null;

// ── helpers ──────────────────────────────────────────────────────────────────
export const skillsByArea = (area) => SKILLS.filter((s) => s.area === area);
export const skillsByRole = (role) => SKILLS.filter((s) => s.role === role);
export const skillsByAge  = (band) => SKILLS.filter((s) => s.age === band);
export const skillsBySlot = (slot) => SKILLS.filter((s) => s.gameSlot === slot);
export const getSkill      = (id)   => SKILLS.find((s) => s.id === id);
/** Skills that cross-link into NextPlay's tactical layer (the shared nodes). */
export const skillsWithTacticalLink = () => SKILLS.filter((s) => s.tacticalAction);

/* ── Development tiers ─────────────────────────────────────────────────────────
 * The Speed/Difficulty axis of the DEV grammar made explicit. Supersedes the
 * 2-value `age` band: T1 Foundation (isolated/controlled) → T2 Application (on the
 * move, combos, live speed) → T3 Game-Speed (contested, reads, counters). Programs
 * and Legend rungs reference these; the age-aware generator serves tier-appropriate
 * reps instead of a flat age gate.
 */
export const TIER_META = {
  1: { key: "foundation",  label: "Foundation",  hint: "Isolated & controlled — learn the move." },
  2: { key: "application", label: "Application", hint: "On the move, combos, live speed." },
  3: { key: "game_speed",  label: "Game-Speed",  hint: "Contested, with reads and counters." },
};

export const SKILL_TIERS = {
  // handles
  pound: 1, hesitation: 1, in_out: 1, inside_out: 1, stutter: 1, cross: 1,
  push_cross: 2, between: 2, behind: 2, retreat: 2, pullback: 2, hang: 2, freeze: 2,
  spin: 3, half_spin: 3, shamgod: 3, snatch: 3, cross_behind: 3, hang_hesi_cross: 3,
  // shooting
  spot_up: 1, catch_shoot: 1,
  relocation: 2, drift: 2, curl: 2, flare: 2, pin_down: 2, dho_entry: 2, transition_shot: 2,
  pullup_1: 2, pullup_2: 2, floater: 2, shot_fake_drive: 2,
  zoom: 3, step_back: 3, side_step: 3, reject_screen: 3,
  // finishing
  speed_gather: 1, power_gather: 1, layup: 1, scoop: 1, reverse: 1,
  low_pickup: 2, euro: 2, pro_hop: 2,
  up_under: 3,
  // footwork
  jump_stop_skill: 1, front_pivot_skill: 1, reverse_pivot_skill: 1, jab_go: 1, rip_through: 1,
  step_through: 2,
  // passing
  chest: 1, bounce: 1,
  kick_out: 2, dump_off: 2, outlet: 2, skip: 2,
  pocket: 3,
  // defense
  def_stance: 1, slide: 1,
  closeout: 2, containment: 2, contest: 2,
  recover_xout: 3,
  // rebounding
  reb_ready: 1, reb_tracking: 1, reb_highpoint: 1, reb_secure: 1,
  reb_pursuit: 2, reb_second: 2, reb_putback: 2, reb_outlet: 2,
  reb_tipcontrol: 3,
};

export const skillTier    = (id) => SKILL_TIERS[id] ?? null;
export const skillsByTier = (t)  => SKILLS.filter((s) => SKILL_TIERS[s.id] === t);
