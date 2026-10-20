import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient.js";
import { handleCoachRequest } from "./coachAgent.js";
import { buildPersonalChallenges } from "./personalChallenges.js";

/**
 * Build athlete context from app state for coach requests. Streak and
 * activeChallenges reuse the same buildPersonalChallenges() the Challenges
 * tab and Today card already compute from, so Coach FKH's answers reflect
 * live progress instead of just enrolled programs and completed drills.
 */
export function buildCoachAthleteContext({ settings, completed, enrolledPrograms, completedProgramIds = [], workouts = {} }) {
  const enrolled = enrolledPrograms && typeof enrolledPrograms === "object" && !Array.isArray(enrolledPrograms)
    ? Object.keys(enrolledPrograms).filter((id) => enrolledPrograms[id])
    : (enrolledPrograms || []).map((p) => (typeof p === "string" ? p : p.id)).filter(Boolean);
  const challenges = buildPersonalChallenges(completed || {}, workouts);
  const streak = challenges.find((c) => c.def.id === "streak-7")?.cur ?? 0;
  const activeChallenges = challenges
    .filter((c) => !c.done && c.cur > 0)
    .map((c) => ({ id: c.def.id, name: c.def.name, cur: c.cur, target: c.target, pct: c.pct }));
  return {
    settings: {
      dateOfBirth: settings?.dateOfBirth,
      experience: settings?.experience,
      goals: settings?.goals,
      playStyle: settings?.playStyle,
      athleteName: settings?.athleteName,
      favoritePlayLike: settings?.favoritePlayLike,
    },
    completed: completed || {},
    enrolledProgramIds: enrolled,
    completedProgramIds,
    streak,
    activeChallenges,
  };
}

/**
 * Local grounded coach response (always available).
 */
export function getLocalCoachResponse({ intent, message, exerciseId, skillId, skillIds, injuryHint, athleteContext }) {
  return handleCoachRequest({ intent, message, exerciseId, skillId, skillIds, injuryHint, athleteContext });
}

function citationsFor(response) {
  return response.data?.citations
    || response.data?.skillGaps?.map((g) => ({ type: "skill", id: g.id }))
    || [];
}

/**
 * Optional edge call. For free-text messages the client couldn't route with
 * an explicit intent, the edge function may return an LLM-derived
 * classification {intent, skillIds} — the classifier's ONLY job is picking
 * the right intent/skills, never generating content. When that happens this
 * re-runs the exact same local deterministic pipeline with the corrected
 * routing, so the final answer is always grounded, citation-backed catalog
 * data regardless of whether classification ran. Falls back to the local
 * regex-routed answer on any error, missing config, or invalid classification.
 */
export async function invokeCoachAgent({ intent, message, exerciseId, skillId, athleteContext, personalize = false }) {
  const local = getLocalCoachResponse({ intent, message, exerciseId, skillId, athleteContext });
  const citations = citationsFor(local);

  if (!personalize || !isSupabaseConfigured()) {
    return { ...local, mode: "local", citations };
  }

  const sb = getSupabaseClient();
  if (!sb) return { ...local, mode: "local", citations };

  try {
    const { data, error } = await sb.functions.invoke("coach-agent", {
      body: {
        intent, // raw, possibly undefined — tells the edge fn this was free text worth classifying
        message,
        exerciseId,
        skillId,
        athleteContext,
        personalize: true,
        precomputed: {
          message: local.message,
          data: local.data,
          citations,
        },
      },
    });
    if (error || !data?.ok) return { ...local, mode: "local", citations };

    if (data.mode === "llm_classified" && data.classification) {
      const reclassified = getLocalCoachResponse({
        intent: data.classification.intent,
        message,
        skillId: skillId || data.classification.skillIds?.[0],
        skillIds: data.classification.skillIds,
        injuryHint: data.classification.hasInjury,
        exerciseId,
        athleteContext,
      });
      return { ...reclassified, mode: "llm_classified", citations: citationsFor(reclassified) };
    }

    return {
      intent: data.intent || local.intent,
      message: data.message || local.message,
      data: data.data || local.data,
      citations: data.citations || citations,
      mode: data.mode || "structured",
    };
  } catch {
    return { ...local, mode: "local", citations };
  }
}
