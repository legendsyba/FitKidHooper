/** Skill vs strength lane for multi-program days (strength first, then skill). */
export const PROGRAM_KIND = {
  "jump-higher": "strength",
  "bodyweight-beast": "strength",
  "bodyweight-beast-2": "strength",
  "guard-handles": "skill",
  "become-shooter": "skill",
  "first-step-explosion": "skill",
  "complete-hooper": "skill",
  "smooth-handles": "skill",
  "cramer-29": "skill",
};

export function getProgramKind(programId) {
  return PROGRAM_KIND[programId] || "skill";
}

export function programKindLabel(programId) {
  return getProgramKind(programId) === "strength" ? "Strength" : "Skill";
}

/** Strength sessions before skill when both are due the same day. */
export function sortDueProgramEntries(entries) {
  return [...entries].sort((a, b) => {
    const ka = getProgramKind(a.prog.id);
    const kb = getProgramKind(b.prog.id);
    if (ka !== kb) return ka === "strength" ? -1 : 1;
    return a.prog.name.localeCompare(b.prog.name);
  });
}

export function missionTitleForDuePrograms(sortedEntries) {
  if (!sortedEntries.length) return "Daily Training";
  if (sortedEntries.length === 1) {
    const { prog, due } = sortedEntries[0];
    /* A daily program is numbered in days, not weeks, and its own name already carries the
       span ("29 Day Challenge") — "— Week 3" on top of that just reads as a contradiction. */
    if (prog.cadence === "daily") return `${prog.emoji} ${prog.name}`;
    return `${prog.emoji} ${prog.name} — Week ${due.week}`;
  }
  const kinds = new Set(sortedEntries.map(e => getProgramKind(e.prog.id)));
  const week = Math.max(...sortedEntries.map(e => e.due.week));
  if (kinds.size > 1) return `💪 + 🎮 Strength & Skill — Week ${week}`;
  const emojis = sortedEntries.map(e => e.prog.emoji).join(" ");
  return `${emojis} — Week ${week}`;
}
