/**
 * Daily Mission contract (do not regress):
 * - Generated once per calendar day (missionLog[today].mission).
 * - After generation, today's mission definition must NOT change for the rest of that day.
 * - Program enrollment, completed drills, or profile updates must NOT regenerate today's mission.
 * - Live completion state still drives task progress; only the mission definition is frozen.
 * - A program started later in the day leads Home's top card from live enrollment
 *   (TodayView liveProgramTask) instead of being added to the mission.
 */

export function isValidCachedMission(mission, today) {
  return !!(
    mission
    && mission.date === today
    && Array.isArray(mission.tasks)
    && mission.tasks.length > 0
    && typeof mission.title === "string"
  );
}

/** Exercise ids required by today's frozen mission (for anti-repeat exclusion). */
export function missionExerciseIds(mission) {
  const ids = new Set();
  for (const task of mission?.tasks || []) {
    for (const id of task.exercises || []) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Read a cached mission from missionLog[today].mission, or generate + return
 * a patch to merge into missionLog. Does not write — caller persists.
 * Callers must not add deps that would re-run generate() after the cache exists.
 */
export function getOrCreateDailyMission({
  missionLog,
  today,
  generate,
}) {
  const entry = missionLog?.[today];
  if (isValidCachedMission(entry?.mission, today)) {
    return { mission: entry.mission, logPatch: null };
  }
  const mission = generate();
  if (!isValidCachedMission(mission, today)) {
    return { mission, logPatch: null };
  }
  return {
    mission,
    logPatch: {
      ...entry,
      mission,
    },
  };
}
