/**
 * High-level development pathways — scalable T1 (Foundation) → T2 (Application) → T3 (Game-Speed).
 * Source of truth for agent adaptation and program sequencing. References catalog program ids.
 */
import { SKILL_AREAS, getSkill, skillTier, skillsByArea } from "./skillGraph.js";
import { PROGRAMS } from "../data/trainingCatalog.js";

export const DEVELOPMENT_TIERS = {
  1: { key: "foundation", label: "Foundation", ageHint: "9–11", description: "Isolated reps, form, controlled speed" },
  2: { key: "application", label: "Application", ageHint: "11–14", description: "On the move, combos, live speed" },
  3: { key: "game_speed", label: "Game-Speed", ageHint: "13–17", description: "Contested, reads, counters" },
};

export const MATURITY_BANDS = [
  { id: "youth", ageMin: 9, ageMax: 11, defaultTier: 1, maxTier: 2 },
  { id: "middle", ageMin: 12, ageMax: 14, defaultTier: 2, maxTier: 3 },
  { id: "advanced_youth", ageMin: 15, ageMax: 17, defaultTier: 2, maxTier: 3 },
];

export const EXPERIENCE_TIER_CAP = {
  beginner: 2,
  intermediate: 3,
  advanced: 3,
};

/**
 * Macro pathways — each scales across tiers. programIds are FKH catalog programs at that tier.
 * skillTargets are skillGraph ids the phase emphasizes.
 */
export const DEVELOPMENT_PATHWAYS = [
  {
    id: "complete-player",
    name: "Complete Player",
    emoji: "🏆",
    description: "Balanced development across ball skills, scoring, defense, and athletic base.",
    goalsMatch: ["all", "complete", "basketball"],
    playStyles: ["any", "guard", "forward", "post"],
    phases: [
      {
        tier: 1,
        label: "Build the base",
        programIds: ["bodyweight-beast", "guard-handles", "become-shooter"],
        skillTargets: ["pound", "catch_shoot", "layup", "def_stance", "jump_stop_skill", "reb_ready"],
        areaWeights: { athleticism: 0.25, handles: 0.2, shooting: 0.2, defense: 0.15, finishing: 0.1, footwork: 0.1 },
      },
      {
        tier: 2,
        label: "Connect skills",
        programIds: ["complete-hooper", "lockdown-defender", "own-the-glass"],
        skillTargets: ["cross", "pullup_1", "closeout", "reb_pursuit", "floater"],
        areaWeights: { handles: 0.2, shooting: 0.2, defense: 0.2, finishing: 0.15, rebounding: 0.1, athleticism: 0.15 },
      },
      {
        tier: 3,
        label: "Game-speed mastery",
        programIds: ["first-step-explosion", "step-back-legends", "floor-general"],
        skillTargets: ["step_back", "euro", "recover_xout", "pocket", "hang_hesi_cross"],
        areaWeights: { handles: 0.2, shooting: 0.25, finishing: 0.15, defense: 0.15, passing: 0.15, athleticism: 0.1 },
      },
    ],
  },
  {
    id: "guard-development",
    name: "Guard Development",
    emoji: "🎮",
    description: "Handles, shooting off the dribble, court vision, and on-ball defense.",
    goalsMatch: ["handles", "shooting", "playmaking", "defense"],
    playStyles: ["guard", "combo"],
    phases: [
      {
        tier: 1,
        programIds: ["guard-handles", "become-shooter", "passing-fundamentals"],
        skillTargets: ["pound", "cross", "catch_shoot", "def_stance"],
        areaWeights: { handles: 0.35, shooting: 0.3, defense: 0.2, footwork: 0.15 },
      },
      {
        tier: 2,
        programIds: ["complete-hooper", "lockdown-defender"],
        skillTargets: ["hesitation", "pullup_1", "closeout", "containment"],
        areaWeights: { handles: 0.3, shooting: 0.3, defense: 0.25, passing: 0.15 },
      },
      {
        tier: 3,
        programIds: ["step-back-legends", "floor-general", "first-step-explosion"],
        skillTargets: ["step_back", "pocket", "recover_xout", "hang_hesi_cross"],
        areaWeights: { handles: 0.25, shooting: 0.3, passing: 0.25, defense: 0.2 },
      },
    ],
  },
  {
    id: "wing-development",
    name: "Wing Development",
    emoji: "🦅",
    description: "Two-way wing: catch-and-shoot, finishing, rebounding, and closeouts.",
    goalsMatch: ["shooting", "finishing", "rebounding", "defense"],
    playStyles: ["forward", "wing"],
    phases: [
      {
        tier: 1,
        programIds: ["become-shooter", "bodyweight-beast"],
        skillTargets: ["catch_shoot", "layup", "def_stance", "reb_ready"],
        areaWeights: { shooting: 0.3, athleticism: 0.25, finishing: 0.2, defense: 0.15, rebounding: 0.1 },
      },
      {
        tier: 2,
        programIds: ["complete-hooper", "own-the-glass", "lockdown-defender"],
        skillTargets: ["curl", "floater", "reb_pursuit", "closeout"],
        areaWeights: { shooting: 0.25, finishing: 0.2, rebounding: 0.2, defense: 0.2, athleticism: 0.15 },
      },
      {
        tier: 3,
        programIds: ["first-step-explosion", "step-back-legends"],
        skillTargets: ["side_step", "euro", "reb_second", "contest"],
        areaWeights: { shooting: 0.25, finishing: 0.25, athleticism: 0.2, defense: 0.2, rebounding: 0.1 },
      },
    ],
  },
  {
    id: "big-development",
    name: "Post & Rim Development",
    emoji: "💪",
    description: "Post footwork, finishing through contact, rebounding, and rim protection.",
    goalsMatch: ["post", "rebounding", "finishing", "strength"],
    playStyles: ["post", "center", "forward"],
    phases: [
      {
        tier: 1,
        programIds: ["bodyweight-beast", "own-the-glass"],
        skillTargets: ["power_gather", "layup", "reb_ready", "def_stance"],
        areaWeights: { athleticism: 0.3, rebounding: 0.25, finishing: 0.2, defense: 0.15, footwork: 0.1 },
      },
      {
        tier: 2,
        programIds: ["complete-hooper", "lockdown-defender"],
        skillTargets: ["up_under", "reb_pursuit", "closeout", "contest"],
        areaWeights: { finishing: 0.25, rebounding: 0.25, defense: 0.25, athleticism: 0.15, footwork: 0.1 },
      },
      {
        tier: 3,
        programIds: ["jump-higher", "own-the-glass"],
        skillTargets: ["reb_second", "reb_putback", "recover_xout", "pro_hop"],
        areaWeights: { rebounding: 0.3, finishing: 0.25, athleticism: 0.2, defense: 0.25 },
      },
    ],
  },
  {
    id: "athletic-foundation",
    name: "Athletic Foundation",
    emoji: "⚡",
    description: "Jump, speed, deceleration, and body control — the physical base for all skills.",
    goalsMatch: ["jumping", "speed", "athleticism", "conditioning"],
    playStyles: ["any"],
    phases: [
      {
        tier: 1,
        programIds: ["bodyweight-beast", "jump-rope-basics"],
        skillTargets: [],
        areaWeights: { athleticism: 0.7, footwork: 0.15, defense: 0.15 },
      },
      {
        tier: 2,
        programIds: ["jump-higher", "first-step-explosion"],
        skillTargets: ["speed_gather"],
        areaWeights: { athleticism: 0.8, finishing: 0.1, defense: 0.1 },
      },
      {
        tier: 3,
        programIds: ["first-step-explosion", "complete-hooper"],
        skillTargets: ["pro_hop", "euro"],
        areaWeights: { athleticism: 0.6, finishing: 0.2, handles: 0.1, defense: 0.1 },
      },
    ],
  },
];

export function maturityBandForAge(age) {
  return MATURITY_BANDS.find((b) => age >= b.ageMin && age <= b.ageMax) || MATURITY_BANDS[1];
}

export function effectiveTierCap(age, experience = "beginner") {
  const band = maturityBandForAge(age);
  const expCap = EXPERIENCE_TIER_CAP[experience] ?? 2;
  return Math.min(band.maxTier, expCap);
}

export function selectPathway(settings = {}) {
  const goals = (settings.goals || []).map((g) => g.toLowerCase());
  const playStyle = settings.playStyle || "any";

  const scored = DEVELOPMENT_PATHWAYS.map((p) => {
    let score = 0;
    if (p.playStyles.includes(playStyle) || p.playStyles.includes("any")) score += 2;
    if (goals.some((g) => p.goalsMatch.includes(g))) score += 3;
    if (p.id === "complete-player" && (playStyle === "any" || goals.length === 0)) score += 1;
    return { pathway: p, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.pathway || DEVELOPMENT_PATHWAYS[0];
}

/** Infer athlete's current tier per skill area from completed exercise history */
export function inferAreaTiers(completed, exerciseSkillIndex) {
  const areaTier = {};
  for (const area of Object.keys(SKILL_AREAS)) areaTier[area] = 1;

  const hits = {};
  for (const [key, done] of Object.entries(completed || {})) {
    if (!done) continue;
    const exId = key.split("-").slice(3).join("-");
    const entry = exerciseSkillIndex[exId];
    if (!entry) continue;
    for (const area of entry.areas) {
      hits[area] = hits[area] || [];
      if (entry.tier) hits[area].push(entry.tier);
    }
  }

  for (const [area, tiers] of Object.entries(hits)) {
    if (!tiers.length) continue;
    const avg = tiers.reduce((a, b) => a + b, 0) / tiers.length;
    areaTier[area] = avg >= 2.5 ? 3 : avg >= 1.5 ? 2 : 1;
  }
  return areaTier;
}

/** Find skill gaps vs pathway phase targets */
export function skillGapsForPhase(phase, completed, exerciseSkillIndex) {
  const doneSkills = new Set();
  for (const [key, done] of Object.entries(completed || {})) {
    if (!done) continue;
    const exId = key.split("-").slice(3).join("-");
    for (const s of exerciseSkillIndex[exId]?.skills || []) doneSkills.add(s);
  }
  return (phase.skillTargets || []).filter((s) => !doneSkills.has(s));
}

/**
 * Adapt a pathway to an athlete — returns tier, programs, gaps, and focus areas.
 * Pure function; safe for client + edge function.
 */
export function adaptDevelopmentPlan({
  age = 12,
  experience = "beginner",
  goals = [],
  playStyle = "any",
  completed = {},
  enrolledProgramIds = [],
  completedProgramIds = [],
  exerciseSkillIndex = {},
  pathway: pathwayOverride = null,
}) {
  const pathway = pathwayOverride || selectPathway({ goals, playStyle });
  const tierCap = effectiveTierCap(age, experience);
  const band = maturityBandForAge(age);
  const areaTiers = inferAreaTiers(completed, exerciseSkillIndex);

  let targetTier = band.defaultTier;
  const avgAreaTier = Object.values(areaTiers).reduce((a, b) => a + b, 0) / Object.keys(areaTiers).length;
  if (avgAreaTier >= 2 && tierCap >= 2) targetTier = 2;
  if (avgAreaTier >= 2.5 && tierCap >= 3 && experience !== "beginner") targetTier = 3;
  targetTier = Math.min(targetTier, tierCap);

  const phase = pathway.phases.find((p) => p.tier === targetTier) || pathway.phases[0];
  const gapIds = skillGapsForPhase(phase, completed, exerciseSkillIndex);

  /* A finished program is history: offer its next level instead, else drop it. */
  const taken = (id) => enrolledProgramIds.includes(id) || completedProgramIds.includes(id);
  const recommendedPrograms = [...new Set((phase.programIds || []).map((id) => {
    if (!completedProgramIds.includes(id)) return id;
    return PROGRAMS.find((p) => p.advancedOf === id && !taken(p.id))?.id ?? null;
  }))].filter((id) => id && !taken(id));

  const weakAreas = Object.entries(areaTiers)
    .filter(([area]) => area !== "athleticism")
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([area]) => ({ area, label: SKILL_AREAS[area]?.label || area, tier: areaTiers[area] }));

  return {
    pathwayId: pathway.id,
    pathwayName: pathway.name,
    targetTier,
    tierCap,
    tierLabel: DEVELOPMENT_TIERS[targetTier]?.label,
    phase,
    recommendedPrograms,
    skillGaps: gapIds.map((id) => {
      const sk = getSkill(id);
      return { id, name: sk?.name || id, tier: skillTier(id) };
    }),
    weakAreas,
    areaTiers,
  };
}

/** List skills in an area at or below a tier (for exercise search) */
export function skillsInAreaAtTier(area, maxTier) {
  return skillsByArea(area).filter((s) => (skillTier(s.id) || 1) <= maxTier);
}
