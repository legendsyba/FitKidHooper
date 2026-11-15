/**
 * Skill self-check — a kid classifies their OWN level per skill, so the program starts at the
 * right rung without waiting for completion history.
 *
 * The kid picks what they want to work on, answers a few concrete questions per area ("of 10 open
 * layups, how many do you make?", "can you cross between your legs with a defender on you?"), and
 * each answer carries a tier (1 beginner / 2 intermediate / 3 advanced). The answers are averaged
 * per area and written as the per-area override that skillLevels.js reads — so the self-check
 * drives selection the same way inferred history does.
 *
 * Questions are deliberately about a MOVE being doable under game pressure, not drills done — that
 * is what separates a beginner from an advanced kid at the same age.
 */

export const WANT_TO_WORK_OPTIONS = [
  { area: "handles", label: "Ball handling", emoji: "🏀" },
  { area: "finishing", label: "Finishing / layups", emoji: "🏁" },
  { area: "shooting", label: "Shooting", emoji: "🎯" },
  { area: "footwork", label: "Footwork & moves", emoji: "👟" },
  { area: "defense", label: "Defense", emoji: "🛡️" },
  { area: "passing", label: "Passing", emoji: "🤝" },
];

// Three answer tiers, shared wording where it fits. Each option's `tier` is the level it implies.
const NO_SOME_YES = (t1, t2, t3) => [
  { label: t1, tier: 1 },
  { label: t2, tier: 2 },
  { label: t3, tier: 3 },
];

export const ASSESSMENT = {
  handles: {
    label: "Ball handling", emoji: "🏀",
    questions: [
      { id: "h-btl-def", q: "Can you dribble between your legs with a defender guarding you?",
        options: NO_SOME_YES("Not yet", "Slowly / sometimes", "Yes, at full speed") },
      { id: "h-weak", q: "Is your weak hand almost as good as your strong hand?",
        options: NO_SOME_YES("No", "Getting there", "Yes") },
      { id: "h-noleak", q: "Can you dribble hard without looking at the ball?",
        options: NO_SOME_YES("No", "A little", "Yes") },
    ],
  },
  finishing: {
    label: "Finishing / layups", emoji: "🏁",
    questions: [
      { id: "f-open10", q: "Out of 10 open layups, how many do you make?",
        options: [{ label: "0–4", tier: 1 }, { label: "5–7", tier: 2 }, { label: "8–10", tier: 3 }] },
      { id: "f-weak", q: "Can you make a layup with your OFF hand?",
        options: NO_SOME_YES("Not yet", "Sometimes", "Yes, easily") },
      { id: "f-contact", q: "Can you finish when a defender is on you?",
        options: NO_SOME_YES("No", "Sometimes", "Yes") },
    ],
  },
  shooting: {
    label: "Shooting", emoji: "🎯",
    questions: [
      { id: "s-ft10", q: "Out of 10 free throws, how many do you make?",
        options: [{ label: "0–3", tier: 1 }, { label: "4–6", tier: 2 }, { label: "7–10", tier: 3 }] },
      { id: "s-offdribble", q: "Can you shoot a jump shot off the dribble?",
        options: NO_SOME_YES("Not yet", "Sometimes", "Yes") },
      { id: "s-form", q: "Is your shooting form the same every time?",
        options: NO_SOME_YES("No", "Mostly", "Yes") },
    ],
  },
  footwork: {
    label: "Footwork & moves", emoji: "👟",
    questions: [
      { id: "fw-stopchange", q: "Can you stop fast and change direction without traveling?",
        options: NO_SOME_YES("Not yet", "Sometimes", "Yes") },
      { id: "fw-attackleft", q: "If they make you go left, can you attack and finish left?",
        options: NO_SOME_YES("No", "Sometimes", "Yes") },
      { id: "fw-jab", q: "Can you jab step and drive past a defender?",
        options: NO_SOME_YES("Not yet", "Sometimes", "Yes") },
    ],
  },
  defense: {
    label: "Defense", emoji: "🛡️",
    questions: [
      { id: "d-slide", q: "Can you slide your feet and stay in front of the dribbler?",
        options: NO_SOME_YES("Not yet", "Sometimes", "Yes") },
      { id: "d-stopquick", q: "Are you good at stopping quickly and changing direction on defense?",
        options: NO_SOME_YES("No", "Sometimes", "Yes") },
    ],
  },
  passing: {
    label: "Passing", emoji: "🤝",
    questions: [
      { id: "p-moving", q: "Can you pass accurately to a teammate who is moving?",
        options: NO_SOME_YES("Not yet", "Sometimes", "Yes") },
      { id: "p-pressure", q: "Can you pass out of trouble when someone guards you?",
        options: NO_SOME_YES("No", "Sometimes", "Yes") },
    ],
  },
};

/**
 * Score raw answers into a per-area level (1-3). `answers` maps questionId → chosen tier. Only
 * areas with at least one answered question get a level; the rest are left out (so unassessed
 * areas keep whatever they already were). Averages the area's answered tiers, rounds to nearest.
 */
export function scoreAssessment(answers = {}) {
  const perArea = {};
  for (const [area, def] of Object.entries(ASSESSMENT)) {
    const tiers = def.questions.map((q) => answers[q.id]).filter((t) => t === 1 || t === 2 || t === 3);
    if (!tiers.length) continue;
    const avg = tiers.reduce((a, b) => a + b, 0) / tiers.length;
    perArea[area] = Math.max(1, Math.min(3, Math.round(avg)));
  }
  return perArea;
}

/** Merge a scored self-check into the stored per-area override (to persist on settings.skillLevels). */
export function assessmentToSkillLevels(scored = {}, existing = {}) {
  return { ...existing, ...scored };
}

/** The questions to ask given the areas a kid picked to work on (empty picks → everything). */
export function questionsFor(areas = []) {
  const picked = areas.length ? areas : Object.keys(ASSESSMENT);
  return picked.filter((a) => ASSESSMENT[a]).map((a) => ({ area: a, ...ASSESSMENT[a] }));
}
