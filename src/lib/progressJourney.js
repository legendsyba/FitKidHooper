/**
 * Progress Journey — turns the athlete's existing training data into an
 * identity + growth story for the Me › Progress tab.
 *
 * This is a PRESENTATION layer over systems that already exist: it reads
 * completed drills, the shot log, earned badges, the achievement ledger, and
 * XP — and reframes them as "who you're becoming / what improved / what's
 * next." It creates NO new tracking and duplicates no progression system.
 */

import { getBadgeProgress } from "./badges.js";
import { getStreak, getTrainingDays, getCategoryBreakdown } from "./progressStats.js";
import { getPeriodRange } from "./periodStats.js";

/* Catalog category (ex._cat) → a coarse skill "area" used for both the identity
   archetype and the skill-growth bars. Kept local (not imported) so this stays
   a thin read-only view and doesn't couple to the skill-graph internals. */
const CAT_TO_AREA = {
  handles: "handles", ballhandling: "handles", game_handles: "handles",
  shooting: "shooting", shootingdrills: "shooting", shooting_lab: "shooting",
  finishing: "finishing", finishing_school: "finishing",
  footwork: "footwork", footwork_lab: "footwork",
  passing: "passing",
  defense: "defense",
  rebounding: "rebounding",
  postmoves: "post",
  basketball_iq: "iq",
  strength: "athleticism", conditioning: "athleticism", athletic: "athleticism", jumprope: "athleticism",
  explosion: "athleticism", speed: "athleticism", balance: "athleticism",
  coordination: "athleticism", deceleration: "athleticism",
};

/* Area → how it reads to a kid: a label, an emoji, and the identity they're
   growing into. Archetype names reuse the product's Train Like Legends voice. */
const AREA_META = {
  handles:     { label: "Ball-Handling", emoji: "🏀", archetype: "Ball Handler" },
  shooting:    { label: "Shooting",      emoji: "🎯", archetype: "Shooter" },
  finishing:   { label: "Finishing",     emoji: "🏁", archetype: "Finisher" },
  footwork:    { label: "Footwork",      emoji: "👟", archetype: "Technician" },
  passing:     { label: "Passing",       emoji: "🤝", archetype: "Playmaker" },
  defense:     { label: "Defense",       emoji: "🛡️", archetype: "Lockdown Defender" },
  rebounding:  { label: "Rebounding",    emoji: "🪃", archetype: "Glass Cleaner" },
  post:        { label: "Post Play",     emoji: "💪", archetype: "Bucket Getter" },
  iq:          { label: "Basketball IQ", emoji: "🧠", archetype: "Floor General" },
  athleticism: { label: "Athleticism",   emoji: "💥", archetype: "Athlete" },
};

/* Onboarding goal value → area, so a brand-new athlete gets an aspirational
   identity from what they said they want before they've trained anything. */
const GOAL_TO_AREA = {
  shooting: "shooting", handles: "handles", defense: "defense",
  explosion: "athleticism", speed: "athleticism", conditioning: "athleticism",
  strength: "athleticism", coordination: "athleticism",
};

const areaMeta = (area) => AREA_META[area] || AREA_META.athleticism;

function areaCountsFromCatCounts(catCounts = {}) {
  const areas = {};
  for (const [cat, n] of Object.entries(catCounts)) {
    const area = CAT_TO_AREA[cat];
    if (!area) continue;
    areas[area] = (areas[area] || 0) + n;
  }
  return areas;
}

// Current calendar week, Monday → today (getPeriodRange("week") is the app's
// canonical week; "7d" is NOT a valid id and silently falls through to
// all-time, which is the bug this replaces).
function thisWeekRange() {
  return getPeriodRange("week");
}
// The full week before this one: the 7 days ending the day before this
// week's Monday.
function lastWeekRange() {
  const mondayStr = getPeriodRange("week").start;
  const monday = new Date(`${mondayStr}T00:00:00`);
  const end = new Date(monday); end.setDate(monday.getDate() - 1);
  const start = new Date(monday); start.setDate(monday.getDate() - 7);
  return { start: start.toLocaleDateString("en-CA"), end: end.toLocaleDateString("en-CA") };
}

/* ── Identity: "who am I becoming" ──────────────────────────────────────────
   Dominant trained area → archetype once there's real data; before that, an
   aspirational identity from the goals they picked (or their position). */
function deriveIdentity({ catCounts, settings, hasTrained }) {
  if (hasTrained) {
    const areas = areaCountsFromCatCounts(catCounts);
    const top = Object.entries(areas).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const m = areaMeta(top[0]);
      return { archetype: m.archetype, emoji: m.emoji, area: top[0], aspirational: false };
    }
  }
  // Aspirational — new athlete
  const goal = (settings?.goals || [])[0];
  const area = GOAL_TO_AREA[goal]
    || (settings?.playStyle === "guard" ? "iq" : settings?.playStyle === "post" ? "post" : null);
  const m = area ? areaMeta(area) : { archetype: "Hooper", emoji: "🌱" };
  return { archetype: m.archetype, emoji: m.emoji, area: area || null, aspirational: true };
}

/* ── Recent Improvements: meaningful change, not raw totals ─────────────────
   Max 3, most motivating first. Only surfaces items that are actually true. */
function getRecentImprovements({ completed, getCategory }) {
  const out = [];
  const week = thisWeekRange();
  const practicesThisWeek = getTrainingDays(completed, week);
  const streak = getStreak(completed);

  if (streak >= 2) out.push({ emoji: "🔥", label: `${streak}-Day Streak`, detail: "Keep it alive" });
  if (practicesThisWeek >= 1) {
    out.push({ emoji: "📅", label: `${practicesThisWeek} Practice${practicesThisWeek === 1 ? "" : "s"} This Week`, detail: "Consistency builds players" });
  }

  // Most-improved area: biggest week-over-week gain in drills for one area.
  const thisW = getCategoryBreakdown(completed, getCategory, week);
  const lastW = getCategoryBreakdown(completed, getCategory, lastWeekRange());
  const areaThis = {}, areaLast = {};
  for (const [cat, n] of thisW) { const a = CAT_TO_AREA[cat]; if (a) areaThis[a] = (areaThis[a] || 0) + n; }
  for (const [cat, n] of lastW) { const a = CAT_TO_AREA[cat]; if (a) areaLast[a] = (areaLast[a] || 0) + n; }
  let bestArea = null, bestDelta = 0;
  for (const [a, n] of Object.entries(areaThis)) {
    const delta = n - (areaLast[a] || 0);
    if (delta > bestDelta) { bestDelta = delta; bestArea = a; }
  }
  if (bestArea && bestDelta >= 2) {
    const m = areaMeta(bestArea);
    out.push({ emoji: m.emoji, label: `+${bestDelta} ${m.label}`, detail: "Most improved this week" });
  } else if (out.length < 2) {
    // Fall back to the strongest area overall so the block is never thin.
    const topThis = Object.entries(areaThis).sort((x, y) => y[1] - x[1])[0];
    if (topThis && topThis[1] > 0) {
      const m = areaMeta(topThis[0]);
      out.push({ emoji: m.emoji, label: `${topThis[1]} ${m.label} drill${topThis[1] === 1 ? "" : "s"}`, detail: "Your focus this week" });
    }
  }

  return out.slice(0, 3);
}

/* ── Next Goal: exactly ONE, the nearest meaningful milestone ───────────────
   Prefers a badge that's genuinely close; otherwise the next level. */
function getNextGoal({ completed, programProgress, programs, badgesDef, earnedBadges, levelContext }) {
  const earned = new Set(earnedBadges || []);
  let bestBadge = null, bestPct = 0;
  for (const b of badgesDef || []) {
    if (earned.has(b.id)) continue;
    const { cur, target } = getBadgeProgress(b, completed, programProgress, programs) || {};
    if (!target) continue;
    const pct = Math.min(1, cur / target);
    // "close" = meaningfully underway but not done; pick the highest such pct.
    if (pct >= 0.34 && pct < 1 && pct > bestPct) {
      bestPct = pct;
      bestBadge = { badge: b, cur, target, pct };
    }
  }
  if (bestBadge) {
    const remaining = bestBadge.target - bestBadge.cur;
    return {
      kind: "badge",
      emoji: bestBadge.badge.emoji,
      label: `${bestBadge.badge.name}`,
      detail: bestBadge.badge.desc,
      cur: bestBadge.cur,
      target: bestBadge.target,
      pct: bestBadge.pct,
      cta: `${remaining} to go`,
    };
  }
  if (levelContext?.nextLevelName && levelContext.xpToNext > 0) {
    return {
      kind: "level",
      emoji: levelContext.nextLevelEmoji || "⭐",
      label: `Reach ${levelContext.nextLevelName}`,
      detail: "Keep training to level up",
      cur: levelContext.xpInto,
      target: levelContext.xpSpan,
      pct: levelContext.pct,
      cta: `${levelContext.xpToNext.toLocaleString()} XP to go`,
    };
  }
  return null;
}

/* ── Milestone Timeline: recent wins, newest first ─────────────────────────
   Merges dated badges with the achievement ledger (titles/cosmetics), which
   already carry earned_at. No new storage. */
function getMilestoneTimeline({ badgeDates, ledger, badgesDef }) {
  const byId = Object.fromEntries((badgesDef || []).map((b) => [b.id, b]));
  const items = [];
  for (const [id, date] of Object.entries(badgeDates || {})) {
    const b = byId[id];
    if (b) items.push({ id, emoji: b.emoji, label: b.name, date });
  }
  for (const [id, entry] of Object.entries(ledger || {})) {
    if (byId[id]) continue; // already covered by badgeDates
    const date = (entry?.earned_at || "").slice(0, 10);
    if (!date) continue;
    // Titles/cosmetics: humanize the id if we have no richer meta here.
    const label = entry?.context?.label || id.replace(/^title-|^cos-/, "").replace(/-/g, " ");
    const emoji = entry?.kind === "title" ? "🏷️" : entry?.kind === "cosmetic" ? "✨" : "🏅";
    items.push({ id, emoji, label: label.replace(/\b\w/g, (c) => c.toUpperCase()), date });
  }
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return items.slice(0, 5);
}

/* ── Skill Growth: simple bars from area counts (no charts) ─────────────────*/
function getSkillGrowth({ catCounts }) {
  const areas = areaCountsFromCatCounts(catCounts);
  const rows = Object.entries(areas)
    .map(([area, count]) => ({ area, count, ...areaMeta(area) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const max = rows.length ? rows[0].count : 0;
  return rows.map((r) => ({ ...r, pct: max ? r.count / max : 0 }));
}

/**
 * Build the full journey view-model. All inputs are things the app already
 * has in hand; this function is pure and side-effect free.
 */
export function buildProgressJourney({
  completed = {},
  shotLog = {},
  getCategory,
  settings = {},
  earnedBadges = [],
  badgeDates = {},
  ledger = {},
  catCounts = {},
  programProgress = {},
  programs = [],
  badgesDef = [],
  levelContext = null,
} = {}){
  const trainingDaysAll = getTrainingDays(completed);
  const hasTrained = trainingDaysAll > 0;

  return {
    isEmpty: !hasTrained,
    identity: deriveIdentity({ catCounts, settings, hasTrained }),
    improvements: hasTrained ? getRecentImprovements({ completed, shotLog, getCategory }) : [],
    nextGoal: getNextGoal({ completed, programProgress, programs, badgesDef, earnedBadges, levelContext }),
    milestones: getMilestoneTimeline({ badgeDates, ledger, badgesDef }),
    skills: getSkillGrowth({ catCounts }),
  };
}
