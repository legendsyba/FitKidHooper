/** Shared progress primitives — used by History, Report, Home, and Boards. */

import { getPeriodRange } from "./periodStats.js";

export function parseCompletedKey(key) {
  const parts = key.split("-");
  if (parts.length < 4) return null;
  return { date: parts.slice(0, 3).join("-"), exId: parts.slice(3).join("-") };
}

/**
 * Training streak with rest-grace: a single rest day between sessions doesn't
 * break the streak (rest is good — and the growth-spurt window is when injuries
 * cluster). Two missed days in a row ends it. Only active days count toward the
 * number, so today not being done *yet* won't drop you to 0.
 */
export function getStreak(completed, { graceDays = 1 } = {}) {
  const keys = Object.keys(completed || {});
  const active = (k) => keys.some(c => c.startsWith(k) && completed[c]);
  let streak = 0;
  let missesInARow = 0;
  const d = new Date();
  for (let i = 0; i < 90; i++) {
    const k = d.toLocaleDateString("en-CA");
    if (active(k)) {
      streak++;
      missesInARow = 0;
    } else if (i === 0) {
      // Today isn't done *yet* — the day isn't over, so it neither breaks the streak nor
      // counts toward it. Without this, a comeback morning after a grace rest day (trained,
      // rested yesterday, haven't trained today) read as two misses and dropped to 0 —
      // showing the streak as already lost exactly when training today would save it.
    } else {
      missesInARow++;
      if (missesInARow > graceDays) break; // two real missed days in a row ends the streak
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function countShots(shotLog, { start = null, end = null } = {}) {
  let makes = 0;
  for (const [date, shots] of Object.entries(shotLog || {})) {
    if (start && date < start) continue;
    if (end && date > end) continue;
    makes += (shots || []).filter(s => s.made !== false).length;
  }
  return makes;
}

export function getTrainingDays(completed, { start = null, end = null } = {}) {
  const days = new Set();
  for (const key of Object.keys(completed || {})) {
    if (!completed[key]) continue;
    const p = parseCompletedKey(key);
    if (!p) continue;
    if (start && p.date < start) continue;
    if (end && p.date > end) continue;
    days.add(p.date);
  }
  return days.size;
}

/** Distinct calendar days with any drill check-off or logged shots (all-time). */
export function getAllTrainingDayCount(completed, shotLog) {
  const days = new Set();
  for (const key of Object.keys(completed || {})) {
    if (!completed[key]) continue;
    const p = parseCompletedKey(key);
    if (p) days.add(p.date);
  }
  for (const [date, shots] of Object.entries(shotLog || {})) {
    if ((shots || []).length > 0) days.add(date);
  }
  return days.size;
}

export function getCategoryBreakdown(completed, getCategory, { start = null, end = null } = {}) {
  const counts = {};
  for (const key of Object.keys(completed || {})) {
    if (!completed[key]) continue;
    const p = parseCompletedKey(key);
    if (!p) continue;
    if (start && p.date < start) continue;
    if (end && p.date > end) continue;
    const cat = getCategory?.(p.exId) || "other";
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function getWeekShotGoal() {
  try {
    return parseInt(localStorage.getItem("shot_week_goal") || localStorage.getItem("fkh-shot-goal") || "100", 10);
  } catch {
    return 100;
  }
}

export function setWeekShotGoal(n) {
  const v = String(Math.max(1, parseInt(n, 10) || 100));
  try {
    localStorage.setItem("shot_week_goal", v);
    localStorage.setItem("fkh-shot-goal", v);
  } catch { /* ignore */ }
}

export function getMonthShotGoal() {
  try {
    const stored = localStorage.getItem("fkh-shot-month-goal") || localStorage.getItem("shot_month_goal");
    if (stored) return parseInt(stored, 10);
    return Math.max(200, getWeekShotGoal() * 4);
  } catch {
    return 400;
  }
}

export function setMonthShotGoal(n) {
  const v = String(Math.max(1, parseInt(n, 10) || 400));
  try {
    localStorage.setItem("fkh-shot-month-goal", v);
    localStorage.setItem("shot_month_goal", v);
  } catch { /* ignore */ }
}

export function getDayShotGoal() {
  try {
    const stored = localStorage.getItem("fkh-shot-day-goal");
    if (stored) return parseInt(stored, 10);
    // Sensible first value: a week's target spread over training days, not 7.
    return Math.max(25, Math.round(getWeekShotGoal() / 4 / 5) * 5);
  } catch {
    return 25;
  }
}

export function setDayShotGoal(n) {
  const v = String(Math.max(1, parseInt(n, 10) || 25));
  try {
    localStorage.setItem("fkh-shot-day-goal", v);
  } catch { /* ignore */ }
}

const GOAL_PERIODS = ["day", "week", "month"];

export function getShotGoalPeriod() {
  try {
    const stored = localStorage.getItem("fkh-shot-goal-period");
    return GOAL_PERIODS.includes(stored) ? stored : "week";
  } catch {
    return "week";
  }
}

export function setShotGoalPeriod(period) {
  try {
    localStorage.setItem("fkh-shot-goal-period", GOAL_PERIODS.includes(period) ? period : "week");
  } catch { /* ignore */ }
}

export function countMakesInLogRange(log, startDate, endDate) {
  let makes = 0;
  for (const [date, shots] of Object.entries(log || {})) {
    if (startDate && date < startDate) continue;
    if (endDate && date > endDate) continue;
    makes += (shots || []).filter(s => s.made !== false).length;
  }
  return makes;
}

export function getWeekMakesFromLog(log, refDate = new Date()) {
  const now = refDate instanceof Date ? refDate : new Date(refDate);
  const mondayOffset = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - mondayOffset);
  const startKey = start.toLocaleDateString("en-CA");
  const endKey = now.toLocaleDateString("en-CA");
  return countMakesInLogRange(log, startKey, endKey);
}

export function getMonthMakesFromLog(log, refDate = new Date()) {
  const now = refDate instanceof Date ? refDate : new Date(refDate);
  const startKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const endKey = now.toLocaleDateString("en-CA");
  return countMakesInLogRange(log, startKey, endKey);
}

export function getDayMakesFromLog(log, refDate = new Date()) {
  const key = (refDate instanceof Date ? refDate : new Date(refDate)).toLocaleDateString("en-CA");
  return countMakesInLogRange(log, key, key);
}

export function daysLeftInWeek(refDate = new Date()) {
  const dow = refDate.getDay();
  return dow === 0 ? 1 : 7 - dow;
}

export function daysLeftInMonth(refDate = new Date()) {
  const last = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
  return Math.max(1, last - refDate.getDate() + 1);
}

export function getProgressSnapshot({ completed, shotLog, getCategory, period = "all_time" } = {}) {
  const range = period === "all_time" ? { start: null, end: null } : getPeriodRange(period);
  return {
    streak: getStreak(completed),
    trainingDays: getTrainingDays(completed, range),
    shotsMade: countShots(shotLog, range),
    categoryBreakdown: getCategoryBreakdown(completed, getCategory, range),
    period,
  };
}
