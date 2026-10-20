export function programSessionSlot(week, sessionIdx) {
  return `${week}-${sessionIdx}`;
}

export function programEnrollmentAnchor(progProgress, programId) {
  return progProgress?.[programId]?._meta?.enrollmentStartedAt ?? null;
}

/** Normalize stored mark — legacy string or { d, t } object. */
export function readProgramExerciseMark(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return { d: raw, t: 0 };
  if (typeof raw === "object" && raw.d) return { d: raw.d, t: raw.t ?? 0 };
  return null;
}

export function isProgramExerciseDone(progProgress, programId, week, sessionIdx, exId) {
  const anchor = programEnrollmentAnchor(progProgress, programId);
  if (!anchor) return false;
  const raw = progProgress?.[programId]?.[programSessionSlot(week, sessionIdx)]?.[exId];
  const mark = readProgramExerciseMark(raw);
  if (!mark) return false;
  if (typeof raw === "string") return false;
  return mark.t >= anchor;
}

/**
 * Drill ids that make up a session for this athlete. When a program is rebuilt, the old
 * drill list stays on the session as `was`; anyone who already finished it under that list
 * keeps it finished. Computed, not migrated, because progress also arrives from cloud sync.
 */
export function programSessionExerciseIds(prog, progProgress, week, sessionIdx) {
  const session = prog.weeks.find(w => w.week === week)?.sessions[sessionIdx];
  if (!session) return [];
  const allDone = ids => ids.every(exId => isProgramExerciseDone(progProgress, prog.id, week, sessionIdx, exId));
  if (session.was && !allDone(session.exercises) && allDone(session.was)) return session.was;
  return session.exercises;
}

export function isProgramSessionComplete(prog, progProgress, week, sessionIdx) {
  const ids = programSessionExerciseIds(prog, progProgress, week, sessionIdx);
  return ids.length > 0 && ids.every(exId =>
    isProgramExerciseDone(progProgress, prog.id, week, sessionIdx, exId)
  );
}

/** Sets × reps for a drill in this program week, overriding the drill's default. */
export function programDose(prog, week, sessionIdx, exId) {
  return prog?.weeks.find(w => w.week === week)?.sessions[sessionIdx]?.dose?.[exId] ?? null;
}

export function countProgramSessionsDone(prog, progProgress) {
  let done = 0;
  for (const week of prog.weeks) {
    week.sessions.forEach((_, si) => {
      if (isProgramSessionComplete(prog, progProgress, week.week, si)) done++;
    });
  }
  return done;
}

/** Returns 0–1 completion ratio for a program based on per-session exercise completions. */
export function computeProgramProgress(program, programProgress) {
  let total = 0, done = 0;
  for (const week of program.weeks) {
    for (let si = 0; si < week.sessions.length; si++) {
      total++;
      if (isProgramSessionComplete(program, programProgress, week.week, si)) done++;
    }
  }
  return total === 0 ? 0 : done / total;
}

/**
 * Times this program has been finished. Restarting wipes the session marks, so earlier
 * finishes are kept in _meta.completions — otherwise a restart would revoke the badge.
 */
export function programCompletionCount(program, programProgress) {
  const past = programProgress?.[program.id]?._meta?.completions?.length ?? 0;
  return past + (computeProgramProgress(program, programProgress) >= 1 ? 1 : 0);
}

/** Fresh progress entry for a (re)enrollment, carrying forward any finished runs. */
export function freshProgramEntry(program, programProgress, startedAt) {
  const prior = programProgress?.[program.id]?._meta?.completions ?? [];
  const completions = computeProgramProgress(program, programProgress) >= 1
    ? [...prior, startedAt]
    : prior;
  return { _meta: { enrollmentStartedAt: startedAt, ...(completions.length ? { completions } : {}) } };
}

/**
 * A finished program leaves the active list and becomes history: its checkmarks stay (badge,
 * Completed tab), and `_meta.retiredAt` lets Home offer what comes next until the kid picks.
 * Re-checked on every change because saves merge by union — an older copy of the enrollment
 * can come back from cloud sync, and must be retired again rather than revived.
 */
export function retireFinishedPrograms(programs, enrolledPrograms, programProgress, now = Date.now()) {
  const finished = programs.filter(p =>
    enrolledPrograms?.[p.id] && computeProgramProgress(p, programProgress) >= 1);
  if (!finished.length) return null;
  const enrolled = { ...enrolledPrograms };
  const progress = { ...programProgress };
  for (const p of finished) {
    delete enrolled[p.id];
    const meta = progress[p.id]?._meta || {};
    if (!isRetiredRun(meta)) progress[p.id] = { ...progress[p.id], _meta: { ...meta, retiredAt: now } };
  }
  return { enrolled, progress };
}

/* Timestamps, not flags: saves merge numbers by max, so a stale copy from an earlier run
   can never re-open (or hide) the current run's next-step card. */
const isRetiredRun = (meta) => !!meta?.retiredAt && meta.retiredAt >= (meta.enrollmentStartedAt ?? 0);
const awaitingNextStep = (meta) => isRetiredRun(meta) && !((meta.nextHandledAt ?? 0) >= meta.retiredAt);

/** Most recently finished program the kid hasn't chosen a next step for yet. */
export function pendingNextStep(programs, programProgress) {
  let best = null;
  for (const p of programs) {
    const meta = programProgress?.[p.id]?._meta;
    if (!awaitingNextStep(meta)) continue;
    if (!best || meta.retiredAt > best.at) best = { prog: p, at: meta.retiredAt };
  }
  return best?.prog ?? null;
}

/** The kid made their next choice (started something or waved it off) — stop asking. */
export function markNextStepsHandled(programProgress, now = Date.now()) {
  let changed = false;
  const out = { ...programProgress };
  for (const [id, entry] of Object.entries(out)) {
    if (awaitingNextStep(entry?._meta)) {
      out[id] = { ...entry, _meta: { ...entry._meta, nextHandledAt: now } };
      changed = true;
    }
  }
  return changed ? out : programProgress;
}

/** Returns the current week number (1-indexed, capped at duration) for an enrolled program. */
export function programCurrentWeek(startDate, duration) {
  if (!startDate) return 1;
  return programWeekForDate(startDate, duration, new Date().toLocaleDateString("en-CA")) ?? 1;
}

/** Week number (1-indexed) for an arbitrary calendar date within a program. */
export function programWeekForDate(startDate, duration, dateStr) {
  if (!startDate || !dateStr) return null;
  const days = Math.floor(
    (new Date(`${dateStr}T12:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000
  );
  if (days < 0) return null;
  return Math.min(duration, Math.floor(days / 7) + 1);
}

/** Day index 0–6 within the current program week (0 = week start day). */
export function programWeekDayIndex(startDate, todayStr) {
  if (!startDate) return 0;
  const daysSinceStart = Math.floor(
    (new Date(todayStr + "T12:00:00").getTime() - new Date(startDate + "T00:00:00").getTime()) / 86400000
  );
  return ((daysSinceStart % 7) + 7) % 7;
}

/**
 * Session slot days within a program week.
 *
 * Up to four sessions a week they sit every other day so rest is built in (0, 2, 4, 6) —
 * the shape every week-based program uses. A daily program needs more than that, and at
 * two-day spacing its later sessions would land on week days 8, 10, 12…, which never
 * arrive: findDueProgramSession() would return null forever and the athlete would stall
 * partway through every week. Above four sessions, they run on consecutive days instead.
 */
export function programSessionScheduleDays(sessionCount) {
  const spacing = sessionCount > 4 ? 1 : 2;
  return Array.from({ length: sessionCount }, (_, i) => i * spacing);
}

export function getProgramSessionCompletionDate(programProgress, program, programId, week, sessionIdx) {
  if (!isProgramSessionComplete(program, programProgress, week, sessionIdx)) return null;
  const slotData = programProgress?.[programId]?.[programSessionSlot(week, sessionIdx)] || {};
  let maxDate = null;
  for (const exId of programSessionExerciseIds(program, programProgress, week, sessionIdx)) {
    const mark = readProgramExerciseMark(slotData[exId]);
    if (!mark) return null;
    if (!maxDate || mark.d > maxDate) maxDate = mark.d;
  }
  return maxDate;
}

export function wasProgramSessionCompletedOnDate(programProgress, program, programId, week, todayStr) {
  const weekData = program.weeks.find(w => w.week === week);
  if (!weekData) return false;
  return weekData.sessions.some((_, si) =>
    getProgramSessionCompletionDate(programProgress, program, programId, week, si) === todayStr
  );
}

function formatProgramDayOffset(todayStr, daysUntil) {
  if (daysUntil <= 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  const d = new Date(todayStr + "T12:00:00");
  d.setDate(d.getDate() + daysUntil);
  return d.toLocaleDateString("en-US", { weekday:"short" });
}

/**
 * Returns the program session due today (if any), respecting rest spacing and one session per day.
 * null = rest day, week complete, or not yet time for the next session.
 */
export function findDueProgramSession(program, enrollment, programProgress, todayStr) {
  const curWeek = programCurrentWeek(enrollment.startDate, program.duration);
  const weekData = program.weeks.find(w => w.week === curWeek);
  if (!weekData) return null;

  if (wasProgramSessionCompletedOnDate(programProgress, program, program.id, curWeek, todayStr)) {
    return null;
  }

  const weekDay = programWeekDayIndex(enrollment.startDate, todayStr);
  const scheduleDays = programSessionScheduleDays(weekData.sessions.length);

  for (let si = 0; si < weekData.sessions.length; si++) {
    if (isProgramSessionComplete(program, programProgress, curWeek, si)) continue;

    const priorsDone = weekData.sessions.slice(0, si).every((_, i) =>
      isProgramSessionComplete(program, programProgress, curWeek, i));
    if (!priorsDone) break;

    const scheduledDay = scheduleDays[si] ?? si * 2;
    if (weekDay < scheduledDay) return null;

    return { session: weekData.sessions[si], sessionIdx: si, week: curWeek };
  }
  return null;
}

/** Status for Active Program widget and schedule messaging. */
export function getActiveProgramScheduleStatus(program, enrollment, programProgress, todayStr) {
  const curWeek = programCurrentWeek(enrollment.startDate, program.duration);
  const weekData = program.weeks.find(w => w.week === curWeek);
  if (!weekData) return { kind:"none" };

  const due = findDueProgramSession(program, enrollment, programProgress, todayStr);
  if (due) return { kind:"due", ...due };

  const weekComplete = weekData.sessions.every((_, si) =>
    isProgramSessionComplete(program, programProgress, curWeek, si));
  if (weekComplete) {
    if (curWeek >= program.duration) return { kind:"programComplete", week: curWeek };
    return { kind:"weekComplete", week: curWeek };
  }

  const weekDay = programWeekDayIndex(enrollment.startDate, todayStr);
  const scheduleDays = programSessionScheduleDays(weekData.sessions.length);

  if (wasProgramSessionCompletedOnDate(programProgress, program, program.id, curWeek, todayStr)) {
    for (let si = 0; si < weekData.sessions.length; si++) {
      if (isProgramSessionComplete(program, programProgress, curWeek, si)) continue;
      const scheduledDay = scheduleDays[si] ?? si * 2;
      const daysUntil = Math.max(0, scheduledDay - weekDay);
      return {
        kind:"restAfterSession",
        session: weekData.sessions[si],
        sessionIdx: si,
        week: curWeek,
        opensLabel: formatProgramDayOffset(todayStr, daysUntil),
      };
    }
  }

  for (let si = 0; si < weekData.sessions.length; si++) {
    if (isProgramSessionComplete(program, programProgress, curWeek, si)) continue;
    const priorsDone = weekData.sessions.slice(0, si).every((_, i) =>
      isProgramSessionComplete(program, programProgress, curWeek, i));
    if (!priorsDone) {
      return { kind:"due", session: weekData.sessions[si], sessionIdx: si, week: curWeek };
    }
    const scheduledDay = scheduleDays[si] ?? si * 2;
    if (weekDay < scheduledDay) {
      return {
        kind:"rest",
        session: weekData.sessions[si],
        sessionIdx: si,
        week: curWeek,
        opensLabel: formatProgramDayOffset(todayStr, scheduledDay - weekDay),
      };
    }
  }

  if (curWeek >= program.duration) return { kind:"programComplete", week: curWeek };
  return { kind:"weekComplete", week: curWeek };
}

/** Seven-day program week plan with REST labels on off days. */
export function buildProgramWeekPlan(program, enrollment, programProgress, todayStr) {
  if (!enrollment?.startDate) return null;
  const curWeek = programCurrentWeek(enrollment.startDate, program.duration);
  const weekData = program.weeks.find(w => w.week === curWeek);
  if (!weekData) return null;

  const weekDayToday = programWeekDayIndex(enrollment.startDate, todayStr);
  const scheduleDays = programSessionScheduleDays(weekData.sessions.length);
  const dayToSession = Object.fromEntries(scheduleDays.map((d, si) => [d, si]));

  const enrollStart = new Date(enrollment.startDate + "T00:00:00");
  const daysSinceStart = Math.floor(
    (new Date(todayStr + "T12:00:00").getTime() - enrollStart.getTime()) / 86400000
  );
  const weekStartDayOffset = Math.floor(daysSinceStart / 7) * 7;

  const weekComplete = weekData.sessions.every((_, si) =>
    isProgramSessionComplete(program, programProgress, curWeek, si));

  const days = [];
  for (let d = 0; d < 7; d++) {
    const calDate = new Date(enrollStart);
    calDate.setDate(calDate.getDate() + weekStartDayOffset + d);
    const weekdayLabel = calDate.toLocaleDateString("en-US", { weekday:"short" }).slice(0, 3);
    const isToday = d === weekDayToday;

    if (dayToSession[d] !== undefined) {
      const si = dayToSession[d];
      const session = weekData.sessions[si];
      const done = isProgramSessionComplete(program, programProgress, curWeek, si);
      days.push({
        dayIndex: d,
        weekdayLabel,
        isToday,
        kind: done ? "done" : "session",
        sessionIdx: si,
        label: done ? "✓" : `S${si + 1}`,
        title: session.focus,
        done,
      });
    } else {
      days.push({
        dayIndex: d,
        weekdayLabel,
        isToday,
        kind: "rest",
        label: "REST",
        title: "Rest day",
      });
    }
  }

  return { curWeek, weekComplete, days };
}

/**
 * Rebuild missing program-session marks from global s_done completions.
 * Never removes existing marks — only fills gaps (recovery after bad migrations/sync).
 */
export function rehydrateProgramProgressFromCompleted({
  programs,
  enrolledPrograms,
  programProgress,
  completed,
}) {
  if (!programs?.length || !enrolledPrograms || !completed) return programProgress;

  const out = { ...programProgress };
  let changed = false;
  /** Each completion date can only backfill one program slot (avoids week 1 reps filling week 2/3). */
  const usedCompletionKeys = new Set();

  for (const prog of programs) {
    const enr = enrolledPrograms[prog.id];
    if (!enr?.startDate) continue;

    const anchor = out[prog.id]?._meta?.enrollmentStartedAt
      ?? enr.startedAt
      ?? new Date(`${enr.startDate}T12:00:00`).getTime();

    if (!out[prog.id]) {
      out[prog.id] = { _meta: { enrollmentStartedAt: anchor } };
      changed = true;
    } else if (!out[prog.id]._meta?.enrollmentStartedAt) {
      out[prog.id] = { ...out[prog.id], _meta: { ...out[prog.id]._meta, enrollmentStartedAt: anchor } };
      changed = true;
    }

    for (const week of prog.weeks) {
      for (let si = 0; si < week.sessions.length; si++) {
        const slot = programSessionSlot(week.week, si);
        for (const exId of week.sessions[si].exercises) {
          if (isProgramExerciseDone(out, prog.id, week.week, si, exId)) continue;

          let best = null;
          for (const [key, done] of Object.entries(completed)) {
            if (!done || !key.endsWith(`-${exId}`)) continue;
            const d = key.split("-").slice(0, 3).join("-");
            if (d < enr.startDate) continue;
            const completionKey = `${d}-${exId}`;
            if (usedCompletionKeys.has(completionKey)) continue;
            const t = new Date(`${d}T12:00:00`).getTime();
            if (!best || t > best.t) best = { d, t: Math.max(t, anchor), completionKey };
          }
          if (!best) continue;

          usedCompletionKeys.add(best.completionKey);
          if (!out[prog.id][slot]) out[prog.id][slot] = {};
          out[prog.id][slot][exId] = { d: best.d, t: best.t };
          changed = true;
        }
      }
    }
  }

  return changed ? out : programProgress;
}
