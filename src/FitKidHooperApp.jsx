import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import HistoryView from "./components/HistoryView.jsx";
import BadgesView from "./components/BadgesView.jsx";
import AuthSheet from "./components/AuthSheet.jsx";
import BuddyVideoInviteBanner from "./components/BuddyVideoInviteBanner.jsx";
import LiveClassBanner from "./components/LiveClassBanner.jsx";
import CoachPanel from "./components/CoachPanel.jsx";
import SharedClassSheet from "./components/SharedClassSheet.jsx";
// Lifted to app level so the coach's own room is not a fullscreen sheet nested
// inside CoachPanel, which is itself a sheet. Lazy: it pulls the LiveKit SDK.
const CoachClassRoom = lazy(() => import("./components/ClassLiveSheet.jsx"));
import { amICoach } from "./lib/coachClasses.js";
import { ownThumbnail, thumbBackdrop } from "./lib/videoThumb.js";
import OnboardingSheet from "./components/OnboardingSheet.jsx";
import PlayLikePickerSheet from "./components/PlayLikePickerSheet.jsx";
import FeedbackCenter from "./components/FeedbackCenter.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useSquadNotifications } from "./hooks/useSquadNotifications.js";
import GuideNavButton from "./components/GuideNavButton.jsx";
import CoachNavButton from "./components/CoachNavButton.jsx";
import ShotTrackerErrorBoundary from "./components/ShotTrackerErrorBoundary.jsx";
import ShotTracker from "./components/ShotTracker.jsx";
import ExerciseDetailSheet from "./components/ExerciseDetailSheet.jsx";
import { LEVELS, getLevel } from "./lib/levels.js";
import { todayKey } from "./lib/dateKeys.js";
import ViewErrorBoundary from "./components/ViewErrorBoundary.jsx";
import CountBadge from "./components/CountBadge.jsx";
import { readShotLog, normalizeShotLog, writeShotLog, countShotMakes } from "./lib/shotLog.js";
import { computeShotStyleMakes } from "./lib/shotStyles.js";
import { getAgeGroup } from "./lib/periodStats.js";
import { needsParentConsent } from "./lib/parentConsent.js";
import { recoverFromSyncBackupIfNeeded } from "./lib/syncBackup.js";
import { writeStoredAvatar, readStoredAvatar, stripAvatarForCloud, migrateAvatarOutOfSettings } from "./lib/avatarStorage.js";
import { safePersistKey } from "./lib/dataSafety.js";
import { readStoredObject, repairStoredObjectKeys, asRecord, readStoredArray } from "./lib/storageParse.js";
import { mergeUserSettings } from "./lib/settingsMerge.js";
import { persistHydratedSettings, normalizeProfileFields, fetchAthleteProfilePatch, mergeProfilePatch } from "./lib/profileHydrate.js";
import { syncAvatarToCloud, restoreLocalAvatarFromCloud, saveAvatarLocally } from "./lib/avatarCloud.js";
import { getEffectiveAthleteId, hasStoredAuthSession } from "./lib/auth.js";
import { migrateIdentitySettings } from "./lib/identity.js";
import { getSupabaseClient } from "./lib/supabaseClient.js";
import { CATS, CAT_DOT_COLORS } from "./lib/categories.js";
import { BADGES_DEF, BADGE_CATS, getEarnedBadges, getBadgeProgress } from "./lib/badges.js";
import { buildProgressJourney } from "./lib/progressJourney.js";
import { claimChallengeRewards } from "./lib/challengesApi.js";
import {
  evaluateEarned, computeCatCounts, grantEntries, getAchievementMeta,
  equipTitle, equipCosmetic, unequipSlot,
  getBenchmark, benchmarkCertTitle,
  recommendProgramsForFavorite, PATHS, trackStageProgress,
} from "./lib/achievements.js";
import { computeExCounts } from "./lib/pathSignatures.js";
import { recordBenchmark, recordLocalPB, readLocalPBs } from "./lib/benchmarksApi.js";
import { readGrowthLog, addGrowthEntry } from "./lib/growth.js";
import {
  readLocalLedger, ledgerIdSet, mergeIntoLocalLedger, pushLedgerEntries, pullLedger,
  pushEquippedIdentity,
} from "./lib/achievementsApi.js";
import { getStreak, getDayShotGoal } from "./lib/progressStats.js";
import { resolveDailyAction, pickChallengeNudge } from "./lib/dailyAction.js";
import { withSessionWarmup, categoriesFromExercises, isWarmupExercise } from "./lib/sessionWarmup.js";
import {
  consumeInviteDeepLink,
  consumeMissionDeepLink,
  consumeNavigationDeepLink,
  listenForNotificationNavigation,
  scheduleMissionReminder,
  dismissNotificationPrompt,
  needsNotificationSubscription,
  subscribeToPush,
} from "./lib/notifications.js";
import {
  readDailyWorkoutStore,
  getOrCreateWorkout,
  setSelectedTemplateInStore,
  applyDayRollover,
  saveDailyWorkoutStore,
  isQuickWorkoutCompleteToday,
} from "./lib/dailyWorkouts.js";
import { getOrCreateDailyMission, missionExerciseIds } from "./lib/dailyMission.js";
import {
  maybeAutoSyncLeaderboard,
  canAutoSyncLeaderboard,
} from "./lib/boardsApi.js";
import {
  initAnalytics,
  setAnalyticsAgeGroup,
  track,
  trackScreen,
  trackProgramsSection,
  trackHomeViewed,
  trackPracticeStarted,
  trackPracticeFinished,
  trackMissionCompleted,
  trackExerciseComplete,
  trackChallengeIfNew,
  trackProgramSessionIfNew,
  trackWorkoutCompleteIfNew,
  ANALYTICS_EVENTS,
} from "./lib/analytics.js";
import {
  migrateThemeSettings,
} from "./lib/theme.js";
import WhatsNewSheet from "./components/WhatsNewSheet.jsx";
import { shouldShowWhatsNew, markWhatsNewSeen, WHATS_NEW_EVENT } from "./lib/changelog.js";
import SettingsSheet from "./components/SettingsSheet.jsx";
import HighlightVideoSheet from "./components/HighlightVideoSheet.jsx";
import {
  hsl, pri, sec, bg, surf, nav, textPri, textMuted, str3, chipStyle, contrastOn,
} from "./lib/themeColors.js";
import GuideSheet from "./components/GuideSheet.jsx";
import CoachFKHSheet from "./components/CoachFKHSheet.jsx";
import CoachIntroSheet from "./components/CoachIntroSheet.jsx";
import { buildCoachAthleteContext } from "./lib/coachAgentApi.js";
import { runGapAnalysis } from "./lib/coachAgent.js";
import OnboardingTour from "./components/OnboardingTour.jsx";
import { TOUR_STEPS, applyTourStep, markTourComplete, shouldShowTourPrompt, dismissTourPrompt } from "./lib/onboardingTour.js";
import ProgramWeekStrip from "./components/ProgramWeekStrip.jsx";
import { CHALLENGES_DEF, getChallengeProgress, buildPersonalChallenges } from "./lib/personalChallenges.js";
import {
  programSessionSlot,
  programEnrollmentAnchor,
  isProgramExerciseDone,
  isProgramSessionComplete,
  computeProgramProgress,
  findDueProgramSession,
  buildProgramWeekPlan,
  rehydrateProgramProgressFromCompleted,
} from "./lib/programProgress.js";
import TodayView from "./views/TodayView.jsx";
import ProgramsView from "./views/ProgramsView.jsx";
import MeView from "./views/MeView.jsx";
import SquadView from "./views/SquadView.jsx";
import ChallengesView from "./views/ChallengesView.jsx";
import DayPlanPanel from "./components/DayPlanPanel.jsx";
import { buildTrainingDayPlan, currentWeekDates, scheduleCategoryExerciseIds, weekdayIndexFromDate } from "./lib/trainingDayPlan.js";
import {
  getProgramKind,
  programKindLabel,
  sortDueProgramEntries,
  missionTitleForDuePrograms,
} from "./lib/programKind.js";
import {
  WORKOUTS,
  SCHEDULE,
  STR_DAYS,
  EXERCISE_META,
  AGE_RULES,
  POSITION_PROFILES,
  WORKOUT_TEMPLATES,
  SCHED_TO_TEMPLATE,
  ALL_EXERCISES,
  PROGRAMS,
} from "./data/trainingCatalog.js";


/* ═══════════════════════════════════════════════════════════════
   SETTINGS & COLOR HELPERS
═══════════════════════════════════════════════════════════════ */
const DEFAULT = {
  primaryHue:38, primarySat:92, primaryLight:55,
  secondaryHue:245, secondarySat:80, secondaryLight:60,
  bgHue:222, bgSat:47, bgLight:10,
  surfaceHue:222, surfaceSat:37, surfaceLight:15,
  buttonHue:222, buttonSat:38, buttonLight:20,
  textHue:210, textSat:25, textLight:94,
  accentHue:158, accentSat:85, accentLight:50,
  customSecondary:false,
  athleteName:"Champ", lastName:"", avatar:null,
  jerseyNumber:null, favoritePlayer:"", favoriteCurrent:"", favoriteAllTime:"", favoritePlayLike:"",
  dateOfBirth:null, experience:"beginner", goals:[], playStyle:"any",
  workoutTimers:true,
  leaderboardSharing:true,
};


/**
 * Calculate current age from an ISO date-of-birth string ("YYYY-MM-DD").
 * Returns 12 when dob is absent (safe fallback for new/migrated profiles).
 * Age updates automatically every time the function is called — no manual updates needed.
 */
function calcAge(dob) {
  if (!dob) return 12;
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function buildCoachMessage(completed, xpData, earnedBadges, programProgress, weakAreas = [], settings = {}) {
  completed = asRecord(completed);
  programProgress = asRecord(programProgress);
  const todayKey = new Date().toLocaleDateString("en-CA");
  const playLike = (settings.favoritePlayLike || "").trim();
  const goalHint = (settings.goals || [])[0];
  const GOAL_LABELS = {
    handles: "handles", shooting: "shooting", finishing: "finishing",
    defense: "defense", footwork: "footwork", get_stronger: "strength",
    conditioning: "conditioning",
  };
  const streak = (() => {
    let s = 0, d = new Date();
    for (let i = 0; i < 60; i++) {
      const k = d.toLocaleDateString("en-CA");
      if (Object.keys(completed).some(c => c.startsWith(k) && completed[c])) { s++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return s;
  })();
  const nextLv = LEVELS.find(l => l.xpMin > xpData.total) || null;
  const xpLeft = nextLv ? nextLv.xpMin - xpData.total : 0;
  const allUnearned = BADGES_DEF.filter(b => !earnedBadges.includes(b.id))
    .map(b => { const { cur, target } = getBadgeProgress(b, completed, programProgress, PROGRAMS); return { ...b, cur, target, pct: cur / target }; })
    .sort((a, b) => b.pct - a.pct || a.target - b.target);
  const nextBadge = allUnearned[0] || null;
  const doneToday = Object.keys(completed).filter(k => k.startsWith(todayKey) && completed[k]).length;

  const bballGapCheck = [
    { key:"game_handles", label:"Game Handles" }, { key:"footwork_lab", label:"Footwork Lab" },
    { key:"finishing_school", label:"Finishing School" }, { key:"shooting_lab", label:"Shooting Lab" },
    { key:"post_moves", label:"Post Moves" }, { key:"basketball_iq", label:"Basketball IQ" },
    { key:"defense", label:"Defense" },
  ];
  // Prefer the shared skill-graph gap analysis (same source Coach FKH chat uses);
  // fall back to the legacy 7-day-untrained-category check if it has no signal yet.
  let gapCat = weakAreas?.[0]?.label || null;
  if (!gapCat) {
    const nowMs = Date.now();
    for (const { key, label } of bballGapCheck) {
      const ids = new Set((WORKOUTS[key] || []).map(e => e.id));
      const lastMs = Object.keys(completed).filter(k => completed[k] && [...ids].some(id => k.includes(id)))
        .map(k => new Date(k.split("-").slice(0, 3).join("-") + "T12:00:00").getTime()).sort((a, b) => b - a)[0] || 0;
      if ((nowMs - lastMs) / 86400000 >= 7) { gapCat = label; break; }
    }
  }

  const closeChallenge = CHALLENGES_DEF
    .map(def => { const { cur, target } = getChallengeProgress(def, completed, WORKOUTS); return { ...def, cur, target, pct: cur / target }; })
    .filter(c => c.pct < 1 && c.pct >= 0.6).sort((a, b) => b.pct - a.pct)[0] || null;

  const catDoneCount = (keys) => keys.flatMap(k => (WORKOUTS[k] || []).filter(e => Object.keys(completed).some(c => completed[c] && c.includes(e.id)))).length;
  const handlesDone = catDoneCount(["handles", "game_handles", "ballhandling"]);
  const shootingDone = catDoneCount(["shooting", "shooting_lab", "shootingdrills"]);
  let balanceMsg = null;
  if (handlesDone >= 3 && shootingDone < 2) balanceMsg = "Your ball handling is ahead — get some shooting reps to balance your game. 🎯";
  else if (shootingDone >= 3 && handlesDone < 2) balanceMsg = "Your shooting is ahead — your weak-hand development needs attention. 🤲";

  if (streak >= 3 && doneToday === 0) return `Keep your ${streak}-day streak alive — train today! 🔥`;
  // Returning after a break (has history, no streak) — don't treat like day-one.
  if (doneToday === 0 && streak === 0 && xpData.total > 0) {
    if (playLike) return `Welcome back — channel that ${playLike} energy today. No pressure, just reps. 🏀`;
    return "Welcome back — pick up where you left off. No pressure, just reps. 🏀";
  }
  if (doneToday === 0 && streak === 0) {
    if (playLike) return `Let's build those ${playLike} skills — first drill starts now. 🏀`;
    if (goalHint && GOAL_LABELS[goalHint]) return `Ready to level up your ${GOAL_LABELS[goalHint]}? Let's get your first rep in. 🏀`;
    return "Every champion started at zero. Let's get your first rep in. 🏀";
  }
  if (nextBadge && nextBadge.target - nextBadge.cur === 1) return `One more and you unlock the ${nextBadge.name} badge! 🏆`;
  if (nextLv && xpLeft <= 20) return `Only ${xpLeft} XP away from ${nextLv.name}. Finish strong! 🌟`;
  if (closeChallenge) return `Only ${closeChallenge.target - closeChallenge.cur} more to complete ${closeChallenge.name}. 🎯`;
  if (gapCat && doneToday === 0) return `You haven't trained ${gapCat} in a week — today's the day. 🏀`;
  if (balanceMsg) return balanceMsg;
  if (doneToday >= 3) return `${doneToday} drills today — you're locked in. Keep stacking! 🔥`;
  if (doneToday >= 1) return "Good start today. One more session makes the difference. 💪";
  return "Stay consistent. Every rep builds the player you're becoming. 📈";
}



function searchExercises(query, limit = 12) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return Object.values(ALL_EXERCISES).filter(ex => {
    const hay = `${ex.name} ${ex.tag || ""} ${ex.desc || ""} ${CATS[ex._cat]?.label || ""} ${ex.trainer || ""}`.toLowerCase();
    return hay.includes(q);
  }).slice(0, limit);
}

function generateWorkout(settings, templateKey, recentIds=[]) {
  const tmpl = WORKOUT_TEMPLATES[templateKey];
  if (!tmpl) return null;
  const age    = Math.min(14, Math.max(9, calcAge(settings.dateOfBirth)));
  const rule   = AGE_RULES[age];
  const dRank  = {beginner:0,intermediate:1,advanced:2};
  const pRank  = dRank[settings.experience||"beginner"]??0;
  const goals  = settings.goals||[];
  const posProfile = POSITION_PROFILES[settings.playStyle||"any"] || POSITION_PROFILES.any;
  const posCats = new Set(posProfile.boostCats);
  const posTags = new Set(posProfile.boostTags);

  // Build pool from template categories, enrich with metadata
  const pool = tmpl.cats.flatMap(cat =>
    (WORKOUTS[cat]||[]).map(ex => ({ ...ex, _cat:cat, meta:EXERCISE_META[ex.id]||{} }))
  );

  // Filter: age range + difficulty (allow one level stretch for challenge)
  const eligible = pool.filter(ex => {
    const m = ex.meta;
    if (m.ageRange && age < m.ageRange[0]) return false;
    return (dRank[m.difficulty]??0) <= pRank + 1;
  });

  // Score: funScore + goal match + position fit + anti-repeat + randomness
  const scored = eligible.map(ex => {
    const m = ex.meta;
    let s = m.funScore || 5;
    if (goals.some(g => (m.basketballTransfer||[]).includes(g))) s += 2;
    if (posCats.has(ex._cat)) s += 2.5;                                          // position cat boost
    if ((m.basketballTransfer||[]).some(t => posTags.has(t))) s += 1.5;          // position tag boost
    if (age <= 11) s += (m.funScore||5) * 0.15; // weight fun more for young athletes
    if (recentIds.includes(ex.id)) s -= 4;
    s += Math.random() * 1.8;
    return { ...ex, _score:s };
  }).sort((a,b) => b._score - a._score);

  let highImpact = 0, totalSecs = 0;
  const maxSecs = rule.maxMinutes * 60 * 1.1;
  const used = new Set();
  const slots = { warmup:[], main:[], finisher:[], recovery:[] };

  const pick = (role, n, test) => {
    const out = [];
    for (const ex of scored) {
      if (out.length >= n) break;
      if (used.has(ex.id)) continue;
      const m = ex.meta, roles = m.workoutRole||[];
      if (!roles.some(r => test(r))) continue;
      if (m.impactLevel==="high") { if (highImpact >= rule.maxHighImpact) continue; highImpact++; }
      const dur = m.estimatedDuration || 90;
      if (totalSecs + dur > maxSecs) continue;
      totalSecs += dur;
      used.add(ex.id);
      out.push(ex);
    }
    return out;
  };

  slots.warmup   = pick("warmup",   tmpl.structure.warmup,   r => r==="warmup");
  slots.main     = pick("main",     tmpl.structure.main,     r => r==="main");
  slots.finisher = pick("finisher", tmpl.structure.finisher, r => r==="finisher");
  slots.recovery = pick("recovery", tmpl.structure.recovery, r => r==="recovery"||r==="warmup");

  if (!slots.warmup.length) {
    const fallback = scored.find(ex => ex.id === "jumping-jacks")
      || scored.find(ex => (ex.meta.workoutRole || []).includes("warmup"));
    if (fallback) slots.warmup = [fallback];
  }

  const exercises = [
    ...slots.warmup.map(e=>({...e,role:"warmup"})),
    ...slots.main.map(e=>({...e,role:"main"})),
    ...slots.finisher.map(e=>({...e,role:"finisher"})),
    ...slots.recovery.map(e=>({...e,role:"recovery"})),
  ];

  return { templateKey, templateName:tmpl.name, templateEmoji:tmpl.emoji, templateDesc:tmpl.desc, exercises, totalSecs, generatedAt:Date.now() };
}

/* ═══════════════════════ XP + LEVELS + BADGES ═══════════════ */




function computeXP(completed, programProgress={}, missionLog={}) {
  completed = asRecord(completed);
  programProgress = asRecord(programProgress);
  missionLog = asRecord(missionLog);
  let exXP=0, workoutXP=0, challengeXP=0, streakXP=0, missionXP=0;
  let shotXP, badgeXP;

  // Exercise XP (5 per) + workout completion bonus (25 per qualifying day)
  const dayMap = {};
  for (const [k,v] of Object.entries(completed)) {
    if (!v) continue;
    const date = k.split("-").slice(0,3).join("-");
    const exId = k.split("-").slice(3).join("-");
    exXP += 5;
    if (!dayMap[date]) dayMap[date] = { count:0, cats:new Set() };
    dayMap[date].count++;
    const cat = (ALL_EXERCISES[exId]||{})._cat;
    if (cat) dayMap[date].cats.add(cat);
  }
  for (const info of Object.values(dayMap)) {
    if (info.count >= 3 && info.cats.size >= 2) workoutXP += 25;
  }

  // Challenge completion XP (100 per)
  for (const def of CHALLENGES_DEF) {
    const { cur, target } = getChallengeProgress(def, completed, WORKOUTS);
    if (cur >= target) challengeXP += 100;
  }

  // Shot XP — minimal contribution (1 XP per 50 makes)
  shotXP = Math.floor(countShotMakes(readShotLog()) / 50);

  // Badge XP (50 per earned badge) — rewards meaningful milestones
  const earnedIds = getEarnedBadges(completed, programProgress, PROGRAMS);
  badgeXP = earnedIds.length * 50;

  // Streak bonus (2 XP per consecutive day when streak ≥ 3)
  const days = [...new Set(
    Object.keys(completed).filter(k=>completed[k]).map(k=>k.split("-").slice(0,3).join("-"))
  )].sort();
  let st=0;
  for (let i=0; i<days.length; i++) {
    if (i===0) { st=1; }
    else {
      const diff=(new Date(days[i]+"T12:00:00")-new Date(days[i-1]+"T12:00:00"))/86400000;
      if(diff<=1.5) st++; else st=1;
    }
    if(st>=3) streakXP+=2;
  }

  // Mission bonus XP (claimed missions)
  for (const m of Object.values(missionLog)) {
    if (m?.claimed) missionXP += (m.bonusXP || 50);
  }

  return { total:exXP+workoutXP+challengeXP+shotXP+streakXP+badgeXP+missionXP, exXP, workoutXP, challengeXP, shotXP, streakXP, badgeXP, missionXP };
}

/** XP gained by completing a practice session's drills today (includes bonuses that unlocked). */
function computeSessionXpEarned(sessionExerciseIds, completed, programProgress, missionLog, todayStr, programContext) {
  const ids = (sessionExerciseIds || []).filter(Boolean);
  if (!ids.length) return 0;
  const after = computeXP(completed, programProgress, missionLog);
  const beforeCompleted = { ...asRecord(completed) };
  for (const id of ids) {
    delete beforeCompleted[`${todayStr}-${id}`];
  }
  let beforeProgramProgress = asRecord(programProgress);
  if (programContext?.programId) {
    const { programId, week, sessionIdx } = programContext;
    const slot = programSessionSlot(week, sessionIdx);
    const prog = beforeProgramProgress[programId];
    if (prog) {
      const slotData = { ...(prog[slot] || {}) };
      for (const id of ids) delete slotData[id];
      beforeProgramProgress = {
        ...beforeProgramProgress,
        [programId]: { ...prog, [slot]: slotData },
      };
    }
  }
  const before = computeXP(beforeCompleted, beforeProgramProgress, missionLog);
  const delta = after.total - before.total;
  return Math.max(delta, ids.length * 5);
}

/* ═══════════════════════ CALENDAR DATA ══════════════════════ */

function buildCalendarData(completed) {
  completed = asRecord(completed);
  const dayMap = {};

  // Group completed exercises by date
  for (const [k, v] of Object.entries(completed)) {
    if (!v) continue;
    const date  = k.split("-").slice(0,3).join("-");
    const exId  = k.split("-").slice(3).join("-");
    if (!dayMap[date]) dayMap[date] = { exs:[], cats:new Set(), shots:0 };
    const ex = ALL_EXERCISES[exId];
    if (ex) {
      dayMap[date].exs.push(ex);
      dayMap[date].cats.add(ex._cat);
    } else {
      dayMap[date].exs.push({ id:exId, name:exId, _cat:"unknown" });
    }
  }

  // Layer in shot data
  try {
    const sl = JSON.parse(localStorage.getItem("shot_log_v2")||"{}");
    for (const [date, shots] of Object.entries(sl)) {
      const makes = (shots||[]).filter(s=>s.made!==false).length;
      if (makes === 0) continue;
      if (!dayMap[date]) dayMap[date] = { exs:[], cats:new Set(), shots:0 };
      dayMap[date].shots  = makes;
      dayMap[date].cats.add("shooting");
    }
  } catch { /* ignore */ }

  // Compute per-day XP and finalise cats → array
  for (const [, data] of Object.entries(dayMap)) {
    data.cats      = [...data.cats];
    const exXP     = data.exs.length * 5;
    const wBonus   = data.exs.length >= 3 && data.cats.length >= 2 ? 25 : 0;
    const shotXP   = Math.floor((data.shots||0)/10) * 5;
    data.xp        = exXP + wBonus + shotXP;
    data.totalDrills = data.exs.length;
  }

  // Compute running streak per day
  const sorted = Object.keys(dayMap).sort();
  let streak = 0;
  for (let i=0; i<sorted.length; i++) {
    if (i===0) { streak=1; }
    else {
      const diff=(new Date(sorted[i]+"T12:00:00")-new Date(sorted[i-1]+"T12:00:00"))/86400000;
      if(diff<=1.5) streak++; else streak=1;
    }
    dayMap[sorted[i]].streakDay = streak;
  }

  return dayMap;
}

/* ═══════════════════════ PROGRESS REPORT ════════════════════ */

function computePeriodXP(periodEntries) {
  // periodEntries = [[key, true], ...] filtered to a date range
  const dayMap = {};
  let exXP = 0;
  for (const [k] of periodEntries) {
    exXP += 5;
    const date = k.split("-").slice(0,3).join("-");
    const exId = k.split("-").slice(3).join("-");
    if (!dayMap[date]) dayMap[date] = { count:0, cats:new Set() };
    dayMap[date].count++;
    const cat = ALL_EXERCISES[exId]?._cat;
    if (cat) dayMap[date].cats.add(cat);
  }
  let workoutXP = 0;
  for (const info of Object.values(dayMap)) {
    if (info.count >= 3 && info.cats.size >= 2) workoutXP += 25;
  }
  return exXP + workoutXP;
}

/* Report building blocks. Module scope on purpose — declared inside the render
   these are a new component type every pass, which remounts the subtree. */
function ReportSection({ emoji, title, surface, children }) {
  return (
    <div style={{ margin:"0 18px 14px",borderRadius:14,background:surface,border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden" }}>
      <div style={{ padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:8 }}>
        <span style={{ fontSize:16 }}>{emoji}</span>
        <span style={{ fontSize:12,fontWeight:800,color:"var(--fkh-text)",letterSpacing:"0.01em" }}>{title}</span>
      </div>
      <div style={{ padding:"12px 14px" }}>{children}</div>
    </div>
  );
}

function ReportStat({ label, value, sub, accent }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:22,fontWeight:800,fontFamily:"'DM Mono',monospace",color:accent,lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3 }}>{label}</div>
      {sub&&<div style={{ fontSize:10,color:"#334155",marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function buildReport(period, completed, badgeDatesMap, enrolledPrograms, favorites, programProgress={}) {
  completed = asRecord(completed);
  badgeDatesMap = asRecord(badgeDatesMap);
  programProgress = asRecord(programProgress);
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA");
  const periodStart = period==="7d"
    ? new Date(now.getTime()-7*86400000).toLocaleDateString("en-CA")
    : period==="30d"
    ? new Date(now.getTime()-30*86400000).toLocaleDateString("en-CA")
    : "2000-01-01";
  const inPeriod = d => d>=periodStart && d<=todayStr;

  // Period-filtered completed entries
  const periodEntries = Object.entries(completed).filter(([k,v])=>{
    if (!v) return false;
    return inPeriod(k.split("-").slice(0,3).join("-"));
  });

  // Group by date
  const dayExMap = {};
  for (const [k] of periodEntries) {
    const date = k.split("-").slice(0,3).join("-");
    const exId = k.split("-").slice(3).join("-");
    if (!dayExMap[date]) dayExMap[date] = [];
    dayExMap[date].push(exId);
  }

  const trainingDays = Object.keys(dayExMap).length;
  const totalExercises = periodEntries.length;
  const totalMinutes = periodEntries.reduce((sum,[k])=>{
    const ex = ALL_EXERCISES[k.split("-").slice(3).join("-")];
    return sum + Math.round((ex?.meta?.estimatedDuration||180)/60);
  }, 0);

  // Shots
  let shotTotal=0, shotBestDay=0, shotBestDayDate=null;
  const shotDayTotals = {};
  try {
    const sl = JSON.parse(localStorage.getItem("shot_log_v2")||"{}");
    for (const [date, shots] of Object.entries(sl)) {
      if (!inPeriod(date)) continue;
      const makes = (shots||[]).filter(s=>s.made!==false).length;
      shotTotal += makes;
      shotDayTotals[date] = (shotDayTotals[date]||0) + makes;
    }
    for (const [date, count] of Object.entries(shotDayTotals)) {
      if (count>shotBestDay) { shotBestDay=count; shotBestDayDate=date; }
    }
  } catch { /* ignore */ }
  const shotActiveDays = Object.keys(shotDayTotals).filter(d=>shotDayTotals[d]>0).length;
  const shotAverage = shotActiveDays>0 ? Math.round(shotTotal/shotActiveDays) : 0;

  // Streaks
  const allDays = [...new Set(
    Object.entries(completed).filter(([,v])=>v).map(([k])=>k.split("-").slice(0,3).join("-"))
  )].sort();
  let currentStreak=0;
  { let d=new Date(now); for(let i=0;i<365;i++){const k=d.toLocaleDateString("en-CA"); if(allDays.includes(k)){currentStreak++;d.setDate(d.getDate()-1);}else break;} }
  const periodDays = allDays.filter(d=>inPeriod(d));
  let longestStreak=0, stk=0;
  for(let i=0;i<periodDays.length;i++){
    if(i===0){stk=1;}else{const diff=(new Date(periodDays[i]+"T12:00:00")-new Date(periodDays[i-1]+"T12:00:00"))/86400000; if(diff<=1.5)stk++;else stk=1;}
    longestStreak=Math.max(longestStreak,stk);
  }

  // Categories
  const REPORT_CATS = [
    {key:"ballhandling",  label:"Ball Handling Foundations",emoji:"🤲"},
    {key:"game_handles",  label:"Game Handles",            emoji:"🎮"},
    {key:"footwork_lab",  label:"Footwork Lab",            emoji:"👟"},
    {key:"finishing_school",label:"Finishing School",      emoji:"🏁"},
    {key:"finishing",     label:"Finishing",               emoji:"🏀"},
    {key:"shooting_lab",  label:"Shooting Lab",            emoji:"🎯"},
    {key:"postmoves",     label:"Post Moves",              emoji:"🏋️"},
    {key:"basketball_iq", label:"Basketball IQ",           emoji:"🧠"},
    {key:"defense",       label:"Defense",                 emoji:"🛡️"},
  ];
  const catCounts = {};
  for(const [k] of periodEntries){
    const cat = ALL_EXERCISES[k.split("-").slice(3).join("-")]?._cat;
    if(cat) catCounts[cat]=(catCounts[cat]||0)+1;
  }
  const categories = REPORT_CATS.map(c=>({
    ...c, count:catCounts[c.key]||0,
    pct: totalExercises>0 ? Math.round(((catCounts[c.key]||0)/totalExercises)*100) : 0,
  }));

  // Period XP
  const periodXP = computePeriodXP(periodEntries);

  // Badges earned in period
  const badgesInPeriod = Object.entries(badgeDatesMap)
    .filter(([,date])=>inPeriod(date))
    .map(([id])=>BADGES_DEF.find(b=>b.id===id))
    .filter(Boolean);

  // Completed programs (all time — no timestamp available)
  const completedPrograms = PROGRAMS.filter(p=>computeProgramProgress(p, programProgress||{})>=1);

  // Completed challenges (all time)
  const completedChallenges = CHALLENGES_DEF.filter(def=>{
    const {cur,target}=getChallengeProgress(def,completed,WORKOUTS); return cur>=target;
  });

  // Most completed exercise (all time)
  const exCounts = {};
  for(const [k,v] of Object.entries(completed)){
    if(!v) continue;
    const exId=k.split("-").slice(3).join("-");
    exCounts[exId]=(exCounts[exId]||0)+1;
  }
  const mostCompletedId = Object.entries(exCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const mostCompleted = mostCompletedId ? {...(ALL_EXERCISES[mostCompletedId]||{}), count:exCounts[mostCompletedId]} : null;

  // Most completed in period
  const periodExCounts = {};
  for(const [k] of periodEntries){
    const exId=k.split("-").slice(3).join("-");
    periodExCounts[exId]=(periodExCounts[exId]||0)+1;
  }
  const periodMostId = Object.entries(periodExCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const periodMostCompleted = periodMostId ? {...(ALL_EXERCISES[periodMostId]||{}), count:periodExCounts[periodMostId]} : null;

  // Starred favorites
  const favExId = Object.entries(favorites.exercises||{}).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const favWorkoutKey = Object.entries(favorites.workouts||{}).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const favProgId = Object.entries(favorites.programs||{}).sort((a,b)=>b[1]-a[1])[0]?.[0];

  return {
    period, periodStart,
    training:{ days:trainingDays, exercises:totalExercises, minutes:totalMinutes },
    shots:{ total:shotTotal, average:shotAverage, bestDay:shotBestDay, bestDayDate:shotBestDayDate },
    streaks:{ current:currentStreak, longest:longestStreak, days:trainingDays },
    periodXP,
    categories,
    badges:badgesInPeriod,
    completedPrograms,
    completedChallenges,
    mostCompleted,
    periodMostCompleted,
    favExercise: favExId ? ALL_EXERCISES[favExId] : null,
    favWorkout: favWorkoutKey ? WORKOUT_TEMPLATES[favWorkoutKey] : null,
    favProgram: favProgId ? PROGRAMS.find(p=>p.id===favProgId) : null,
  };
}

function generateInsights(report, period) {
  const pLabel = period==="7d"?"week":period==="30d"?"month":"all time";
  const insights = [];
  const activeCats = [...report.categories].filter(c=>c.count>0).sort((a,b)=>b.count-a.count);

  if(activeCats.length>0) insights.push(`Your strongest area this ${pLabel} was ${activeCats[0].label}. ${activeCats[0].emoji}`);
  if(activeCats.length>=2){
    const ratio=Math.round(activeCats[0].count/activeCats[activeCats.length-1].count);
    if(ratio>=2) insights.push(`You trained ${activeCats[0].label} ${ratio}× more than ${activeCats[activeCats.length-1].label}. 📊`);
  }
  if(report.streaks.current>=3) insights.push(`You're on a ${report.streaks.current}-day streak — keep stacking! 🔥`);
  else if(report.streaks.longest>=3) insights.push(`Your longest streak this ${pLabel} was ${report.streaks.longest} days. Build on that. 🔥`);
  if(report.shots.total>=50) insights.push(`You made ${report.shots.total.toLocaleString()} shots this ${pLabel}. ${report.shots.bestDay>0?`Best day: ${report.shots.bestDay} makes.`:""} 🎯`);
  if(report.completedPrograms.length>0) insights.push(`You completed the ${report.completedPrograms[0].name} program — ${report.completedPrograms[0].emoji}`);
  if(period==="7d"&&report.training.days>0) insights.push(`You trained ${report.training.days} out of 7 days this week. 📅`);
  else if(period==="30d"&&report.training.days>=3){
    const avg=Math.round(report.training.days/4.3);
    insights.push(`You averaged ${avg} training session${avg!==1?"s":""} per week this month. 📅`);
  }
  if(report.periodXP>=100) insights.push(`You earned ${report.periodXP} XP this ${pLabel}. ⭐`);
  if(report.training.exercises===0) insights.push(`No training logged this ${pLabel} yet — every journey starts with one drill. 🏀`);

  return insights.slice(0,3);
}

/* ═══════════════════════ DAILY MISSION SYSTEM ══════════════ */

const MAX_DAILY_MISSION_TASKS = 5;

/**
 * Deterministically generates one mission per day based on user state.
 * Priority: active program → underworked skill category → day-of-week rotation.
 * Capped at MAX_DAILY_MISSION_TASKS — no unlimited stacking.
 *
 * Anti-repeat uses categories from the prior 3 days only (excludes today) so
 * freestyle drills done before opening Today don't reshape the mission, and so
 * completing today's mission never feeds back into its own definition.
 */
function generateDailyMission(todayStr, settings, completed, enrolledPrograms, programProgress={}) {
  const age = calcAge(settings.dateOfBirth);
  const cutoff = new Date(Date.now()-3*86400000).toLocaleDateString("en-CA");
  const recentCats = new Set(
    Object.keys(completed)
      .filter(k => {
        const d = k.split("-").slice(0, 3).join("-");
        return d >= cutoff && d < todayStr && completed[k];
      })
      .map(k=>ALL_EXERCISES[k.split("-").slice(3).join("-")]?._cat)
      .filter(Boolean)
  );

  const tasks = [];
  let title = "Daily Training";
  let bonusXP = 50;

  /* ── Due program session(s) — all enrolled plans due today, strength before skill ── */
  const enrolledList = PROGRAMS.filter(p => enrolledPrograms[p.id]);
  const dueEntries = [];
  for (const prog of enrolledList) {
    const enrollment = enrolledPrograms[prog.id];
    const due = findDueProgramSession(prog, enrollment, programProgress, todayStr);
    if (due) dueEntries.push({ prog, due });
  }
  const sortedDue = sortDueProgramEntries(dueEntries);
  let task1Cat = null;
  if (sortedDue.length > 0) {
    title = missionTitleForDuePrograms(sortedDue);
    task1Cat = ALL_EXERCISES[sortedDue[0].due.session.exercises[0]]?._cat || null;
    bonusXP = sortedDue.length > 1 ? 100 : 75;
    for (const { prog, due } of sortedDue) {
      const { session, sessionIdx, week } = due;
      tasks.push({
        id: `task-prog-${prog.id}`,
        type: "program",
        label: `${prog.emoji} ${prog.name}: ${session.focus}`,
        kind: getProgramKind(prog.id),
        kindLabel: programKindLabel(prog.id),
        exercises: session.exercises,
        target: session.exercises.length,
        required: true,
        programId: prog.id,
        week,
        sessionIdx,
        programColor: prog.color,
      });
    }
    if (sortedDue.length === 1) {
      const dayIdx = weekdayIndexFromDate(todayStr);
      const dayPlan = SCHEDULE[dayIdx];
      if (dayPlan?.cats?.length) {
        const scheduleExs = scheduleCategoryExerciseIds(dayPlan, WORKOUTS, 2, 6);
        if (scheduleExs.length > 0) {
          tasks.push({
            id: "task-schedule",
            type: "category",
            label: `Also today: ${dayPlan.label}`,
            exercises: scheduleExs,
            target: Math.min(3, scheduleExs.length),
            required: false,
            optional: true,
          });
        }
      }
    }
  }
  if (tasks.length===0) {
    const bbCats = ["ballhandling","footwork","finishing","game_handles","shooting_lab","footwork_lab","shootingdrills","passing","rebounding"];
    const daySeed = new Date(todayStr+"T12:00:00").getDay();
    const underworked = bbCats.find(c=>!recentCats.has(c));
    const fallbackCat = underworked || bbCats[daySeed % bbCats.length];
    const catExs = (WORKOUTS[fallbackCat]||[]).slice(0,3).map(e=>e.id);
    const catInfo = CATS[fallbackCat]||{label:fallbackCat,emoji:"🏀"};
    title = `${catInfo.emoji} ${catInfo.label} Day`;
    task1Cat = fallbackCat;
    tasks.push({
      id:"task-workout", type:"category",
      label:`Complete 3 ${catInfo.label} exercises`,
      exercises: catExs,
      target: Math.min(3, catExs.length),
      required: true,
      category: fallbackCat,
    });
  }

  /* ── Task 2: Complementary skill (skip when following a program — keep mission lean) ── */
  const hasProgramTask = tasks.some(t => t.type === "program");
  if (!hasProgramTask) {
    const skillCats = ["ballhandling","footwork","finishing","game_handles","basketball_iq","shooting_lab","footwork_lab","shootingdrills","postmoves","passing","rebounding"];
    const dayOffset = new Date(todayStr+"T12:00:00").getDay();
    const available = skillCats.filter(c=>c!==task1Cat&&(WORKOUTS[c]||[]).length>=2);
    const skillCat = available.find(c=>!recentCats.has(c)) || available[(dayOffset+1)%available.length];
    if (skillCat) {
      const catExs = (WORKOUTS[skillCat]||[]).slice(0,2).map(e=>e.id);
      const catInfo = CATS[skillCat]||{label:skillCat,emoji:"🏀"};
      tasks.push({
        id:"task-skill", type:"category",
        label:`Do 2 ${catInfo.label} exercises`,
        exercises: catExs,
        target: 2,
        required: true,
        category: skillCat,
      });
    }
  }

  /* ── Task 3: Optional shot goal (age-scaled) ── */
  const shotTarget = age>=13 ? 50 : age>=11 ? 25 : 15;
  tasks.push({
    id:"task-shots", type:"shots",
    label:`Make ${shotTarget} shots`,
    target: shotTarget,
    required: false,
    optional: true,
  });

  return { date:todayStr, title, tasks: tasks.slice(0, MAX_DAILY_MISSION_TASKS), bonusXP };
}

/** Live progress for a single mission task. */
function getMissionTaskProgress(task, completed, todayStr, programProgress={}) {
  if (task.type==="shots") {
    try {
      const sl = JSON.parse(localStorage.getItem("shot_log_v2")||"{}");
      const makes = (sl[todayStr]||[]).filter(s=>s.made!==false).length;
      return { cur:makes, target:task.target };
    } catch { return { cur:0, target:task.target }; }
  }
  if (task.type==="program" && task.programId != null) {
    const prog = PROGRAMS.find(p=>p.id===task.programId);
    if (prog) {
      const done = (task.exercises||[]).filter(exId =>
        isProgramExerciseDone(programProgress, task.programId, task.week, task.sessionIdx, exId)
      ).length;
      return { cur:done, target:task.target };
    }
  }
  // category tasks: count exercises done today
  const done = (task.exercises||[]).filter(exId => !!completed[`${todayStr}-${exId}`]).length;
  return { cur:done, target:task.target };
}



/* ═══════════════════════ RECOMMENDATION ENGINE ══════════════ */

// What template naturally follows each template (recovery rotation)
const RECOVERY_AFTER = {
  jump:      "recovery",
  quickFeet: "handles",
  fullBody:  "shooting",
  recovery:  "quickFeet",
  handles:   "jump",
  shooting:  "fullBody",
};

// Which challenge urgency maps to which template
const CHALLENGE_TEMPLATE_MAP = {
  "jump-5":    "jump",
  "shots-50":  "shooting",
  "handles-5": "handles",
  "speed-5":   "quickFeet",
  "coord-5":   "quickFeet",
};

// Goal → template preference
const GOAL_TEMPLATE_MAP = {
  jump_higher:  "jump",
  quickness:    "quickFeet",
  handles:      "handles",
  shooting:     "shooting",
  get_stronger: "fullBody",
  conditioning: "fullBody",
};

const GOAL_NAMES = {
  jump_higher:"Jump Higher", quickness:"Get Quicker", handles:"Ball Handling",
  shooting:"Shooting", get_stronger:"Get Stronger", conditioning:"Conditioning",
};

// Skill-graph area → workout template, for grounding coach nudges in the shared skill graph
const AREA_TO_TEMPLATE = { handles:"handles", shooting:"shooting", defense:"defense", footwork:"quickFeet" };

function computeRecommendation(settings, completed, currentTemplate, weakAreas = []) {
  completed = asRecord(completed);
  const age   = calcAge(settings.dateOfBirth);
  const goals = settings.goals || [];

  // ── How many days since last training session ──────────────────
  let daysSinceTrained = 0;
  const checkD = new Date(); checkD.setDate(checkD.getDate() - 1);
  for (let i = 0; i < 7; i++) {
    const k = checkD.toLocaleDateString("en-CA");
    if (Object.keys(completed).some(c => c.startsWith(k) && completed[c])) break;
    daysSinceTrained++;
    checkD.setDate(checkD.getDate() - 1);
  }

  // ── Current streak ─────────────────────────────────────────────
  let streak = 0;
  const sd = new Date();
  for (let i = 0; i < 14; i++) {
    const k = sd.toLocaleDateString("en-CA");
    if (Object.keys(completed).some(c => c.startsWith(k) && completed[c])) {
      streak++; sd.setDate(sd.getDate() - 1);
    } else break;
  }

  // ── Which challenge is most urgently close to completion ───────
  let urgentChallenge = null, urgentTemplate = null;
  // Sort by (cur/target) descending so the "closest" one wins
  const sorted = [...CHALLENGES_DEF]
    .filter(d => CHALLENGE_TEMPLATE_MAP[d.id])
    .map(d => ({ def:d, ...getChallengeProgress(d, completed, WORKOUTS) }))
    .sort((a,b) => (b.cur/b.target) - (a.cur/a.target));
  for (const { def, cur, target } of sorted) {
    const pct = cur / target;
    if (pct >= 0.4 && pct < 1) {
      urgentChallenge = def;
      urgentTemplate  = CHALLENGE_TEMPLATE_MAP[def.id];
      break;
    }
  }

  // ── Decision tree ──────────────────────────────────────────────
  let recommendedTemplate = RECOVERY_AFTER[currentTemplate] || "quickFeet";
  const reasons = [];

  // Priority 1 — close to completing a challenge
  if (urgentChallenge && urgentTemplate) {
    const { cur, target } = getChallengeProgress(urgentChallenge, completed, WORKOUTS);
    const remaining = target - cur;
    recommendedTemplate = urgentTemplate;
    const word = remaining === 1 ? "1 more session" : `${remaining} more`;
    reasons.push(`You're ${word} away from completing "${urgentChallenge.name}" — let's finish it.`);
  }

  // Priority 2 — recovery after a hard session
  if (!reasons.length && currentTemplate === "jump") {
    recommendedTemplate = "recovery";
    reasons.push("You trained explosion yesterday — today's recovery work protects your joints and keeps you fresh.");
  }
  if (!reasons.length && currentTemplate === "fullBody") {
    recommendedTemplate = "shooting";
    reasons.push("Skill work the day after strength training is the perfect combo — let your muscles recover while your game grows.");
  }

  // Priority 3 — coming back from a gap
  if (!reasons.length && daysSinceTrained >= 2) {
    recommendedTemplate = age <= 11 ? "quickFeet" : "handles";
    const dayWord = daysSinceTrained + 1 === 3 ? "3 days" : `${daysSinceTrained + 1} days`;
    reasons.push(`It's been ${dayWord} — a short, high-energy session is the perfect way to get back in rhythm.`);
  }

  // Priority 3.5 — grounded skill-area gap (shared source with Coach FKH chat)
  if (!reasons.length && weakAreas?.length) {
    const gap = weakAreas.find(w => AREA_TO_TEMPLATE[w.area]);
    if (gap) {
      recommendedTemplate = AREA_TO_TEMPLATE[gap.area];
      reasons.push(`Your ${gap.label.toLowerCase()} is behind your other skills — let's close that gap today.`);
    }
  }

  // Priority 4 — streak maintenance
  if (!reasons.length && streak >= 2) {
    reasons.push(`You're on a ${streak}-day streak — keep the momentum going today.`);
  }

  // Priority 5 — goal alignment
  if (!reasons.length && goals.length > 0) {
    const matchedGoal = goals.find(g => GOAL_TEMPLATE_MAP[g]);
    if (matchedGoal) {
      recommendedTemplate = GOAL_TEMPLATE_MAP[matchedGoal];
      reasons.push(`This workout targets your "${GOAL_NAMES[matchedGoal]}" goal — stay locked in.`);
    }
  }

  // Priority 6 — age-based variety / focus
  if (!reasons.length) {
    if (age <= 10) {
      const funOpts = ["quickFeet","handles","recovery"];
      recommendedTemplate = funOpts[new Date().getDay() % funOpts.length];
      reasons.push("Mix it up and keep it fun — variety is the secret weapon at your age.");
    } else if (age >= 13) {
      const hardOpts = ["jump","fullBody","quickFeet"];
      recommendedTemplate = hardOpts[new Date().getDay() % hardOpts.length];
      reasons.push("Consistent, progressive training is how the best get better.");
    } else {
      reasons.push("A balanced session today keeps your body developing from every angle.");
    }
  }

  const tmpl = WORKOUT_TEMPLATES[recommendedTemplate] || WORKOUT_TEMPLATES.quickFeet;
  return {
    templateKey:   recommendedTemplate,
    templateName:  tmpl.name,
    templateEmoji: tmpl.emoji,
    templateDesc:  tmpl.desc,
    reason:        reasons[0] || "Let's level up today.",
  };
}

/* ═══════════════════════ SHOT TRACKER DATA ═══════════════════ */
function BadgeCelebration({ badge, onDismiss }) {
  return (
    <div style={{ position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",
      justifyContent:"center",padding:24,
      background:"radial-gradient(ellipse at center, rgba(249,115,22,0.18) 0%, rgba(6,11,20,0.92) 60%)" }}>
      {/* click backdrop to dismiss */}
      <div onClick={onDismiss} style={{ position:"absolute",inset:0 }}/>

      <div style={{ position:"relative",textAlign:"center",maxWidth:320,width:"100%",zIndex:1,
        animation:"fkh-scale-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}>

        {/* Pulse rings */}
        <div style={{ position:"relative",display:"inline-block",marginBottom:16 }}>
          <div style={{ position:"absolute",inset:"-20px",borderRadius:"50%",
            border:`2px solid ${badge.color}`,
            animation:"fkh-pulse-ring 1.2s ease-out 0.3s infinite",pointerEvents:"none" }}/>
          <div style={{ position:"absolute",inset:"-10px",borderRadius:"50%",
            border:`2px solid ${badge.color}88`,
            animation:"fkh-pulse-ring 1.2s ease-out 0.6s infinite",pointerEvents:"none" }}/>
          <div style={{ width:96,height:96,borderRadius:"50%",
            background:`${badge.color}20`,border:`3px solid ${badge.color}`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:48,animation:"fkh-bounce 0.6s ease-out 0.3s 2 both" }}>
            {badge.emoji}
          </div>
        </div>

        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4,marginBottom:8,
          animation:"fkh-fade-up 0.4s ease 0.5s both" }}>
          <div style={{ fontSize:badge.conquest?13:11,fontFamily:"'DM Mono',monospace",letterSpacing:"0.3em",
            color:badge.color,textTransform:"uppercase",fontWeight:badge.conquest?800:400 }}>
            {badge.conquest ? "🏆 Conquest Complete!" : badge.kind==="milestone" ? "Rank Up!" : "Badge Unlocked!"}
          </div>
          {badge.cat && BADGE_CATS[badge.cat] && (
            <div style={{ fontSize:9,color:"#64748b",fontFamily:"'DM Mono',monospace",
              letterSpacing:"0.15em",textTransform:"uppercase" }}>
              {BADGE_CATS[badge.cat].emoji} {BADGE_CATS[badge.cat].label}
            </div>
          )}
          {badge.inspo && (
            <div style={{ fontSize:10,color:"#94a3b8",fontStyle:"italic" }}>
              in the lineage of {badge.inspo}
            </div>
          )}
        </div>
        <div style={{ fontSize:26,fontWeight:800,color:"var(--fkh-text)",marginBottom:8,lineHeight:1.2,
          animation:"fkh-fade-up 0.4s ease 0.6s both" }}>
          {badge.name}
        </div>
        <div style={{ fontSize:13,color:"var(--fkh-text-muted)",marginBottom:28,lineHeight:1.5,
          animation:"fkh-fade-up 0.4s ease 0.7s both" }}>
          {badge.desc}
        </div>

        <button onClick={onDismiss}
          style={{ padding:"14px 36px",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",
            background:badge.color,border:"none",color:"#000",
            animation:"fkh-fade-up 0.4s ease 0.8s both",
            boxShadow:`0 0 24px ${badge.color}55` }}>
          Awesome! 🎉
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════ MISSION CELEBRATIONS ═══════════════ */

function MissionCelebration({ title, bonusXP, color, onDismiss }) {
  return (
    <div style={{ position:"fixed",inset:0,zIndex:600,display:"flex",alignItems:"center",
      justifyContent:"center",padding:24,
      background:"radial-gradient(ellipse at center, rgba(249,115,22,0.22) 0%, rgba(6,11,20,0.94) 60%)" }}>
      <div onClick={onDismiss} style={{ position:"absolute",inset:0 }}/>
      <div style={{ position:"relative",textAlign:"center",maxWidth:320,width:"100%",zIndex:1,
        animation:"fkh-scale-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ position:"relative",display:"inline-block",marginBottom:16 }}>
          <div style={{ position:"absolute",inset:"-20px",borderRadius:"50%",
            border:`2px solid ${color}`,animation:"fkh-pulse-ring 1.2s ease-out 0.3s infinite",pointerEvents:"none" }}/>
          <div style={{ width:96,height:96,borderRadius:"50%",
            background:`${color}20`,border:`3px solid ${color}`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:44,animation:"fkh-bounce 0.6s ease-out 0.3s 2 both" }}>
            🎯
          </div>
        </div>
        <div style={{ fontSize:11,fontFamily:"'DM Mono',monospace",letterSpacing:"0.28em",
          color,textTransform:"uppercase",marginBottom:8 }}>
          Daily Mission Complete!
        </div>
        <div style={{ fontSize:22,fontWeight:800,color:"var(--fkh-text)",marginBottom:8,lineHeight:1.25 }}>
          {title}
        </div>
        <div style={{ fontFamily:"'DM Mono',monospace",fontSize:36,fontWeight:800,color,marginBottom:8,lineHeight:1 }}>
          +{bonusXP} XP
        </div>
        <div style={{ fontSize:13,color:"var(--fkh-text-muted)",marginBottom:28,lineHeight:1.5 }}>
          Nice work today — your XP total just went up!
        </div>
        <button onClick={onDismiss}
          style={{ padding:"14px 36px",borderRadius:14,fontSize:15,fontWeight:800,cursor:"pointer",
            background:color,border:"none",color:"#000",boxShadow:`0 0 24px ${color}55` }}>
          Let's Go! 🏀
        </button>
      </div>
    </div>
  );
}

function MissionTaskToast({ label, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ position:"fixed",top:"calc(12px + env(safe-area-inset-top, 0px))",left:"50%",
      transform:"translateX(-50%)",zIndex:550,width:"min(340px, calc(100% - 32px))",
      animation:"fkh-fade-up 0.35s ease both" }}>
      <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:14,
        background:"rgba(15,23,42,0.96)",border:"1px solid rgba(34,197,94,0.35)",
        boxShadow:"0 8px 32px rgba(0,0,0,0.45)" }}>
        <div style={{ width:36,height:36,borderRadius:10,flexShrink:0,background:"rgba(34,197,94,0.15)",
          border:"1.5px solid rgba(34,197,94,0.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>
          ✓
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:9,fontWeight:800,color:"#22c55e",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:2 }}>
            Mission Step Done
          </div>
          <div style={{ fontSize:12,fontWeight:700,color:"var(--fkh-text)",lineHeight:1.35 }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ CALENDAR VIEW ═════════════════════ */
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW_HEADERS = ["M","T","W","T","F","S","S"];

function CalendarView({
  completed, P, SF, bd,
  schedule, programs, enrolledPrograms, programProgress,
  cats, allExercises, workouts,
  onOpenCategory, onOpenExercise,
}) {
  const now = new Date();
  const [viewDate, setViewDate] = useState(()=>new Date(now.getFullYear(),now.getMonth(),1));
  const [selDate,  setSelDate]  = useState(now.toLocaleDateString("en-CA"));

  const calData = useMemo(()=>buildCalendarData(completed),[completed]);

  const year = viewDate.getFullYear();
  const mon  = viewDate.getMonth();
  const monthKey = `${year}-${String(mon+1).padStart(2,"0")}`;

  // Mon-first calendar cells
  const firstDow   = new Date(year,mon,1).getDay();         // 0=Sun
  const startPad   = (firstDow+6)%7;                        // Mon=0 offset
  const daysInMon  = new Date(year,mon+1,0).getDate();
  const cells = [];
  for (let i=0;i<startPad;i++) cells.push(null);
  for (let d=1;d<=daysInMon;d++) cells.push(d);

  const todayStr = now.toLocaleDateString("en-CA");

  // Month-level stats
  const monthEntries = Object.entries(calData).filter(([d])=>d.startsWith(monthKey));
  const monthXP      = monthEntries.reduce((s,[,v])=>s+v.xp,0);
  const monthDays    = monthEntries.length;
  const monthDrills  = monthEntries.reduce((s,[,v])=>s+v.totalDrills,0);
  const monthMaxStr  = monthEntries.length>0 ? Math.max(...monthEntries.map(([,v])=>v.streakDay||0)) : 0;

  const selData      = calData[selDate];
  const selInMonth   = selDate.startsWith(monthKey);
  const isNowMonth   = year===now.getFullYear() && mon===now.getMonth();
  const dayPlan      = useMemo(
    () => buildTrainingDayPlan(selDate, schedule, programs, enrolledPrograms, programProgress, workouts),
    [selDate, schedule, programs, enrolledPrograms, programProgress, workouts]
  );
  const isFutureDay  = new Date(`${selDate}T12:00:00`) > now;

  const monthPlanMap = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysInMon; d++) {
      const dateStr = `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      map[dateStr] = buildTrainingDayPlan(dateStr, schedule, programs, enrolledPrograms, programProgress, workouts);
    }
    return map;
  }, [year, mon, daysInMon, schedule, programs, enrolledPrograms, programProgress, workouts]);

  const startSession = (exercises, ctx) => {
    const list = withSessionWarmup(
      (exercises || []).map(e => ({ ...e, meta: e.meta || EXERCISE_META[e.id] || {} })),
      workouts,
      EXERCISE_META,
      { categories: categoriesFromExercises(exercises, allExercises) },
    );
    if (list[0]) onOpenExercise?.(list[0], list, ctx);
  };

  // intensity → opacity suffix (same pattern used app-wide)
  const intensityBg = (count) => {
    if (count===0) return "rgba(255,255,255,0.03)";
    if (count<=2)  return "rgba(255,255,255,0.07)";
    if (count<=5)  return "rgba(255,255,255,0.12)";
    return "rgba(255,255,255,0.20)";
  };

  return (
    <div style={{ padding:"4px 20px 20px" }}>

      {/* ── Month nav ──────────────────────────────────────────── */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
        <button onClick={()=>setViewDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1))}
          style={{ width:36,height:36,borderRadius:8,border:`1px solid ${bd}`,
            background:"transparent",color:"#64748b",fontSize:20,cursor:"pointer",fontWeight:300 }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:16,fontWeight:800,color:"var(--fkh-text)" }}>{MONTH_NAMES[mon]}</div>
          <div style={{ fontSize:10,color:"#475569",fontFamily:"'DM Mono',monospace" }}>{year}</div>
        </div>
        <button onClick={()=>setViewDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1))}
          disabled={isNowMonth}
          style={{ width:36,height:36,borderRadius:8,border:`1px solid ${bd}`,
            background:"transparent",color:isNowMonth?"#1e293b":"#64748b",
            fontSize:20,cursor:isNowMonth?"default":"pointer",fontWeight:300 }}>›</button>
      </div>

      {/* ── Day headers ───────────────────────────────────────── */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4 }}>
        {DOW_HEADERS.map((d,i)=>(
          <div key={i} style={{ textAlign:"center",fontSize:9,fontWeight:700,
            color:"#334155",fontFamily:"'DM Mono',monospace",padding:"3px 0",letterSpacing:"0.06em" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ fontSize:9, color:"#475569", marginBottom:8, textAlign:"center" }}>
        <span style={{ color:P }}>●</span> planned · colored dots = logged
      </div>

      {/* ── Calendar grid ─────────────────────────────────────── */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:14 }}>
        {cells.map((day,i)=>{
          if (!day) return <div key={`p${i}`}/>;
          const dateStr = `${year}-${String(mon+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const data    = calData[dateStr];
          const isToday = dateStr===todayStr;
          const isFuture= new Date(dateStr+"T12:00:00")>now;
          const isSel   = dateStr===selDate && selInMonth;
          const cnt     = data?.totalDrills||0;
          const dayPlanCell = monthPlanMap[dateStr];
          const hasPlan = dayPlanCell && !dayPlanCell.isRestDay;

          return (
            <div key={i} onClick={()=> setSelDate(dateStr)}
              style={{
                borderRadius:8,padding:"5px 3px 4px",
                minHeight:54,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"space-between",
                background: isSel ? `${P}28` : intensityBg(cnt),
                border:`1.5px solid ${isSel?P:isToday?`${P}60`:hasPlan?`${P}30`:"transparent"}`,
                cursor:"pointer",
                opacity:isFuture && !hasPlan ? 0.45 : 1,
                transition:"background 0.15s, border 0.15s",
              }}>

              {/* Day number */}
              <div style={{ fontSize:11,fontWeight:isToday?800:500,lineHeight:1,
                color:isSel?P:isToday?P:cnt>0?"var(--fkh-text)":"#475569" }}>
                {day}
              </div>

              {/* Plan + log indicators */}
              <div style={{ display:"flex", gap:2, flexWrap:"wrap", justifyContent:"center", minHeight:10 }}>
                {hasPlan && (
                  <div title="Training planned" style={{ width:5, height:5, borderRadius:"50%", background:P, flexShrink:0 }} />
                )}
                {data?.cats.length>0 && data.cats.slice(0,3).map((cat,ci)=>(
                  <div key={ci} style={{ width:5,height:5,borderRadius:"50%",
                    background:CAT_DOT_COLORS[cat]||"#64748b",flexShrink:0 }}/>
                ))}
              </div>

              {/* XP micro-label */}
              {data?.xp>0&&(
                <div style={{ fontSize:7,fontFamily:"'DM Mono',monospace",
                  color:isSel?P:"#475569",lineHeight:1,marginTop:1 }}>
                  {data.xp}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Month summary ─────────────────────────────────────── */}
      {monthDays>0&&(
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14 }}>
          {[
            { v:monthDays,   l:"Days" },
            { v:monthDrills, l:"Drills" },
            { v:monthXP,     l:"XP" },
            { v:monthMaxStr>0?`${monthMaxStr}🔥`:"—", l:"Best Streak" },
          ].map(({ v,l })=>(
            <div key={l} style={{ background:SF,border:`1px solid ${bd}`,borderRadius:10,
              padding:"9px 6px",textAlign:"center" }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:800,
                color:P,lineHeight:1 }}>{v}</div>
              <div style={{ fontSize:8,color:"#334155",marginTop:3,
                textTransform:"uppercase",letterSpacing:"0.07em" }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Selected day: plan + history ──────────────────────── */}
      {selInMonth && (
        <DayPlanPanel
          plan={dayPlan}
          history={isFutureDay ? null : (selData || null)}
          cats={cats}
          allExercises={allExercises}
          workouts={workouts}
          exerciseMeta={EXERCISE_META}
          P={P}
          SF={SF}
          bd={bd}
          onOpenCategory={onOpenCategory}
          onOpenExercise={onOpenExercise}
          onStartProgramSession={(exs, ctx) => startSession(exs, ctx)}
          onStartCustomWorkout={startSession}
        />
      )}

      {/* ── Empty month state ─────────────────────────────────── */}
      {monthDays===0&&(
        <div style={{ textAlign:"center",padding:"36px 0" }}>
          <div style={{ fontSize:36,marginBottom:12 }}>📅</div>
          <div style={{ fontSize:14,fontWeight:600,color:"#475569",marginBottom:4 }}>
            No workouts logged this month
          </div>
          <div style={{ fontSize:12,color:"#334155" }}>
            Complete exercises to build your training history.
          </div>
        </div>
      )}
    </div>
  );
}



/* ═══════════════════════ PROFILE VIEW ══════════════════════ */


/* Rich stats panel — lives in Progress → Stats (the single stats home). */
function ProgressStatsPanel({ totalXP, xpData, currentLevel, P, ST, SF, bd, lbl }) {
  const nextLevel = LEVELS.find(l=>l.rank===currentLevel.rank+1);
  const xpInLevel  = totalXP - currentLevel.xpMin;
  const xpSpan     = nextLevel ? nextLevel.xpMin - currentLevel.xpMin : 500;
  const pct        = nextLevel ? Math.min(1, xpInLevel / xpSpan) : 1;
  const xpRows = [
    { label:"Exercises completed", value:xpData.exXP,       unit:`${xpData.exXP/5} × 5 XP` },
    { label:"Workouts completed",  value:xpData.workoutXP,  unit:`${xpData.workoutXP/25} × 25 XP` },
    { label:"Challenges cleared",  value:xpData.challengeXP,unit:`${xpData.challengeXP/100} × 100 XP` },
    { label:"Badges earned",       value:xpData.badgeXP,    unit:`${Math.round(xpData.badgeXP/50)} × 50 XP` },
    { label:"Streak bonus",        value:xpData.streakXP,   unit:"consistency bonus" },
    { label:"Shots made",          value:xpData.shotXP,     unit:`${xpData.shotXP*50} makes → ${xpData.shotXP} XP` },
  ].filter(r=>r.value>0);

  return (
    <>
      {/* Level meter */}
      <div style={{ background:`${P}0d`,border:`1px solid ${P}22`,borderRadius:16,padding:"18px 18px",marginBottom:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12 }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:800,color:P,lineHeight:1 }}>{totalXP.toLocaleString()}</div>
            <div style={{ fontSize:10,color:"#475569",marginTop:3,letterSpacing:"0.08em" }}>TOTAL XP</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12,fontWeight:700,color:"var(--fkh-text-muted)" }}>{nextLevel ? `→ ${nextLevel.name}` : "Max Level 👑"}</div>
            {nextLevel && <div style={{ fontSize:10,color:"#475569",marginTop:2 }}>{(nextLevel.xpMin-totalXP).toLocaleString()} XP to go</div>}
          </div>
        </div>
        <div style={{ height:10,background:"rgba(255,255,255,0.07)",borderRadius:99,overflow:"hidden",marginBottom:8 }}>
          <div style={{ height:"100%",borderRadius:99,transition:"width 1s ease",width:`${pct*100}%`,
            background:pct>=1 ? `linear-gradient(90deg,${P},${ST})` : `linear-gradient(90deg,${P}aa,${P})` }}/>
        </div>
        <div style={{ display:"flex",gap:4,marginTop:12,justifyContent:"center" }}>
          {LEVELS.map(l=>{
            const earned = totalXP >= l.xpMin;
            const isCurrent = l.rank === currentLevel.rank;
            const ring = contrastOn(P);
            return (
              <div key={l.rank} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3 }}>
                <div style={{ width:28,height:28,borderRadius:"50%",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",
                  background:earned?(isCurrent?`linear-gradient(135deg,${P},${ST})`:P):"rgba(255,255,255,0.04)",
                  border:earned?`2px solid ${isCurrent?ring:`${ring}55`}`:"2px solid rgba(255,255,255,0.07)" }}>
                  {earned?l.emoji:<span style={{ fontSize:9,color:"#334155" }}>?</span>}
                </div>
                <div style={{ fontSize:7,color:earned?P:"#334155",textAlign:"center",fontWeight:isCurrent?800:400,fontFamily:"'DM Mono',monospace",lineHeight:1.2 }}>
                  {l.name.split(" ").map((w,i)=><div key={i}>{w}</div>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shooting milestones */}
      {(()=>{
        const SHOT_TIERS = [
          { name:"100 Makes Club", emoji:"🏀", target:100,   color:"#60a5fa" },
          { name:"1K Shooter",     emoji:"🎯", target:1000,  color:"#f43f5e" },
          { name:"2.5K Shooter",   emoji:"🔮", target:2500,  color:"#8b5cf6" },
          { name:"5K Shooter",     emoji:"🌠", target:5000,  color:"#06b6d4" },
          { name:"10K Shooter",    emoji:"🏆", target:10000, color:"#f97316" },
        ];
        let allMakes = 0;
        try { const sl=JSON.parse(localStorage.getItem("shot_log_v2")||"{}"); allMakes=Object.values(sl).flatMap(v=>v).filter(s=>s.made!==false).length; } catch { /* ignore */ }
        const tierIdx = SHOT_TIERS.filter(t=>allMakes>=t.target).length - 1;
        const curTier = tierIdx>=0 ? SHOT_TIERS[tierIdx] : null;
        const nxtTier = SHOT_TIERS[tierIdx+1] || null;
        const pctShot = nxtTier ? Math.min(1,(allMakes-(curTier?.target||0))/(nxtTier.target-(curTier?.target||0))) : 1;
        const tColor = curTier?.color || "#60a5fa";
        return (
          <div style={{ background:`${tColor}0d`,border:`1px solid ${tColor}22`,borderRadius:16,padding:"18px 18px",marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:12 }}>
              <div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:800,color:tColor,lineHeight:1 }}>{allMakes.toLocaleString()}</div>
                <div style={{ fontSize:10,color:"#475569",marginTop:3,letterSpacing:"0.08em" }}>SHOTS MADE</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:13,fontWeight:700,color:curTier?tColor:"#475569" }}>{curTier ? `${curTier.emoji} ${curTier.name}` : "🏀 Shooting Beginner"}</div>
                {nxtTier && <div style={{ fontSize:10,color:"#475569",marginTop:2 }}>{(nxtTier.target-allMakes).toLocaleString()} makes to {nxtTier.name}</div>}
              </div>
            </div>
            <div style={{ height:8,background:"rgba(255,255,255,0.07)",borderRadius:99,overflow:"hidden",marginBottom:8 }}>
              <div style={{ height:"100%",borderRadius:99,transition:"width 1s ease",width:`${pctShot*100}%`,background:`linear-gradient(90deg,${tColor}aa,${tColor})` }}/>
            </div>
            <div style={{ display:"flex",gap:4,marginTop:12,justifyContent:"center" }}>
              {SHOT_TIERS.map(t=>(
                <div key={t.name} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3 }}>
                  <div style={{ width:28,height:28,borderRadius:"50%",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",
                    background:allMakes>=t.target?`${t.color}22`:"rgba(255,255,255,0.04)",
                    border:`2px solid ${allMakes>=t.target?t.color:"rgba(255,255,255,0.07)"}` }}>
                    {allMakes>=t.target?t.emoji:<span style={{ fontSize:9,color:"#334155" }}>?</span>}
                  </div>
                  <div style={{ fontSize:6,color:allMakes>=t.target?t.color:"#334155",textAlign:"center",fontFamily:"'DM Mono',monospace",lineHeight:1.2 }}>
                    {t.name.split(" ").map((w,i)=><div key={i}>{w}</div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* XP sources */}
      {xpRows.length>0&&(
        <div style={{ background:SF,border:`1px solid ${bd}`,borderRadius:14,padding:"14px 16px",marginBottom:16 }}>
          <div style={lbl}>XP Breakdown</div>
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {xpRows.map(({ label,value,unit })=>(
              <div key={label} style={{ display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ flex:1,fontSize:12,color:"var(--fkh-text-muted)" }}>{label}</div>
                <div style={{ fontSize:10,color:"#475569",fontFamily:"'DM Mono',monospace" }}>{unit}</div>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:800,color:P,minWidth:48,textAlign:"right" }}>+{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════ SET TRACKER & WORKOUT TIMER ═══════ */

function DrillCard({ w, color, bg2, brd, isDone, onToggle, onViewDetail, favored, onFav }) {
  // color-derived helpers local to this card
  const metaBg  = `${color}12`;
  const metaBrd = `${color}28`;
  const cueTxt  = `${color}cc`;
  return (
    <div onClick={onViewDetail}
      style={{ background:`${color}08`,border:`1px solid ${isDone?color:metaBrd}`,borderRadius:16,overflow:"hidden",marginBottom:14,display:"flex",transition:"border-color 0.2s",cursor:onViewDetail?"pointer":"default" }}>
      <div onClick={onViewDetail}
        style={{ flexShrink:0,width:128,position:"relative",display:"block",background:"#0f172a",cursor:"pointer" }}>
        {ownThumbnail(w)
          ? <img src={ownThumbnail(w)} alt="" style={{ width:128,height:90,objectFit:"cover",display:"block" }}/>
          : <div aria-hidden="true" style={{ width:128,height:90,display:"block",background:thumbBackdrop(w.videoId||w.name,color) }}/>}
        <div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-55%)",width:26,height:26,borderRadius:"50%",background:`${color}cc`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#000",fontWeight:700,border:`1px solid ${color}` }}>▶</div>
        {w.videoSource==="fkh"&&<div style={{ position:"absolute",top:4,right:4,background:"#15803d",color:"#fff",fontSize:7,fontWeight:800,padding:"2px 5px",borderRadius:4,letterSpacing:"0.06em" }}>{w.trainer?"✦ ORIGINAL":"✦ FKH"}</div>}
      </div>
      <div style={{ flex:1,padding:"11px 13px",minWidth:0 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6 }}>
          <div>
            <span style={{ fontSize:9,padding:"2px 8px",borderRadius:20,fontWeight:800,display:"inline-block",marginBottom:4,background:bg2,color,border:`1px solid ${brd}`,letterSpacing:"0.04em" }}>{w.tag}</span>
            {w.trainer && <span style={{ fontSize:9,padding:"2px 8px",borderRadius:20,display:"inline-block",marginBottom:4,marginLeft:4,background:metaBg,color,border:`1px solid ${metaBrd}`,opacity:0.8 }}>📹 {w.trainer}</span>}
            <div style={{ fontSize:13,fontWeight:700,color:"var(--fkh-text)",lineHeight:1.2 }}>{w.name}</div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:6,flexShrink:0 }}>
            {onFav&&<button onClick={e=>{e.stopPropagation();onFav();}}
              style={{ width:30,height:30,borderRadius:8,
                border:`1px solid ${favored?"rgba(250,204,21,0.45)":"rgba(250,204,21,0.22)"}`,
                background:favored?"rgba(250,204,21,0.1)":"transparent",
                color:favored?"#fbbf24":"rgba(250,204,21,0.5)",
                fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
              {favored?"⭐":"☆"}
            </button>}
            <button onClick={e=>{e.stopPropagation();onToggle();}} style={{ width:44,height:44,borderRadius:"50%",border:`2px solid ${isDone?color:metaBrd}`,background:isDone?color:metaBg,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:13,fontWeight:800,color:isDone?"#000":color }}>
              {isDone?"✓":"○"}
            </button>
          </div>
        </div>
        <div style={{ display:"flex",gap:5,marginBottom:8,flexWrap:"wrap" }}>
          <span style={{ fontSize:10,padding:"3px 8px",background:metaBg,borderRadius:6,fontFamily:"'DM Mono',monospace",color,border:`1px solid ${metaBrd}`,fontWeight:600 }}>{w.sets}</span>
          {w.rest!=="N/A"&&<span style={{ fontSize:10,padding:"3px 8px",background:metaBg,borderRadius:6,fontFamily:"'DM Mono',monospace",color,border:`1px solid ${metaBrd}`,fontWeight:600 }}>Rest {w.rest}</span>}
        </div>
        <p style={{ fontSize:12,color:`${color}bb`,lineHeight:1.55,margin:"0 0 8px" }}>{w.desc}</p>
        <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:10,paddingLeft:2 }}>
          {w.cues.map((c,i)=>(
            <div key={i} style={{ fontSize:11,color:cueTxt,display:"flex",lineHeight:1.45,gap:5 }}>
              <span style={{ color,fontWeight:700,flexShrink:0 }}>→</span>{c}
            </div>
          ))}
        </div>
        <button onClick={e=>{e.stopPropagation();onViewDetail();}}
          style={{ display:"flex",alignItems:"center",gap:6,fontSize:11,padding:"7px 12px",borderRadius:10,fontWeight:700,background:bg2,color,border:`1px solid ${brd}`,letterSpacing:"0.01em",cursor:"pointer",width:"100%",textAlign:"left" }}>
          <span style={{ fontSize:13 }}>▶</span> {w.videoTitle || w.name}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DATA MIGRATION LAYER
   ───────────────────────────────────────────────────────────────
   A kid's progress (s_done, fkh-programs, badges, shot logs, …) lives
   in localStorage. App updates only swap the JS bundle — they never
   touch localStorage — so progress already survives updates by default.

   The ONE thing that can still break is changing the *shape* of a
   stored object. When you do that, add a migration here instead of
   risking a broken read. GOLDEN RULE: migrations transform data
   forward, they NEVER delete a kid's progress.

   To add a migration: append a function to MIGRATIONS that upgrades
   storage by one version, then bump DATA_VERSION to match the new
   length. MIGRATIONS[0] runs to reach v1, MIGRATIONS[1] to reach v2…
═══════════════════════════════════════════════════════════════ */
const DATA_VERSION_KEY = "fkh-data-version";

const MIGRATIONS = [
  // ── v0 → v1: baseline ──────────────────────────────────────────
  () => {},
  // ── v1 → v2: enable workout timers for existing installs ───────
  () => {
    try {
      const raw = JSON.parse(localStorage.getItem("s_settings") || "{}");
      if (raw.workoutTimers === undefined) {
        raw.workoutTimers = true;
        localStorage.setItem("s_settings", JSON.stringify(raw));
      }
    } catch { /* ignore */ }
  },
  // ── v2 → v3: program progress only counts after Start Program ───
  () => {
    try {
      const enrolled = JSON.parse(localStorage.getItem("fkh-programs") || "{}");
      let progress = JSON.parse(localStorage.getItem("fkh-program-progress") || "{}");
      let progChanged = false;
      let enrollChanged = false;

      for (const progId of Object.keys(progress)) {
        if (!enrolled[progId]) {
          delete progress[progId];
          progChanged = true;
        }
      }

      for (const [progId, enr] of Object.entries(enrolled)) {
        const startDate = enr.startDate;
        if (!startDate) continue;
        const startedAt = enr.startedAt
          ?? new Date(startDate + "T12:00:00").getTime();
        if (!enr.startedAt) {
          enrolled[progId] = { ...enr, startedAt };
          enrollChanged = true;
        }

        const existing = progress[progId] || {};
        const anchor = existing._meta?.enrollmentStartedAt ?? startedAt;
        const cleaned = { _meta: { enrollmentStartedAt: anchor } };

        for (const [slot, exs] of Object.entries(existing)) {
          if (slot === "_meta" || typeof exs !== "object" || !exs) continue;
          const kept = {};
          for (const [exId, mark] of Object.entries(exs)) {
            // Drop legacy string marks (preview-before-enroll); keep timestamped marks.
            if (typeof mark === "object" && mark?.d && mark.t >= anchor) {
              kept[exId] = mark;
            }
          }
          if (Object.keys(kept).length) cleaned[slot] = kept;
        }

        progress[progId] = cleaned;
        progChanged = true;
      }

      if (progChanged) localStorage.setItem("fkh-program-progress", JSON.stringify(progress));
      if (enrollChanged) localStorage.setItem("fkh-programs", JSON.stringify(enrolled));
    } catch { /* ignore */ }
  },
  // ── v3 → v4: recover program progress wiped by v3 migration or sync ──
  // Rebuilds session marks from s_done — never deletes existing marks.
  () => {
    try {
      persistProgramProgressRecovery();
    } catch (e) {
      console.error("[fkh] program progress recovery failed", e);
    }
  },
  // ── v4 → v5: legacy favoritePlayer → split Settings fields ─────
  () => {
    try {
      const raw = JSON.parse(localStorage.getItem("s_settings") || "{}");
      const next = normalizeProfileFields(raw);
      if (JSON.stringify(next) !== JSON.stringify(raw)) {
        localStorage.setItem("s_settings", JSON.stringify(next));
      }
    } catch { /* ignore */ }
  },
  // ── v5 → v6: signed-in athletes skip onboarding after app updates ──
  () => {
    try {
      if (localStorage.getItem("s_onboarded")) return;
      if (hasStoredAuthSession()) {
        localStorage.setItem("s_onboarded", "1");
        return;
      }
      const hasUsername = Boolean(localStorage.getItem("fkh-last-username"));
      const hasCloudSave = parseInt(localStorage.getItem("fkh-cloud-version") || "0", 10) > 0;
      if (hasUsername && hasCloudSave) {
        localStorage.setItem("s_onboarded", "1");
      }
    } catch { /* ignore */ }
  },
  // ── v6 → v7: normalize shot_log_v2 (fixes Shots tab white-screen) ──
  () => {
    try {
      const normalized = normalizeShotLog(readStoredObject("shot_log_v2"));
      localStorage.setItem("shot_log_v2", JSON.stringify(normalized));
    } catch { /* ignore */ }
  },
  // ── v7 → v8: repair null / array poison in object-shaped localStorage keys ──
  () => {
    repairStoredObjectKeys();
  },
  // ── v8 → v9: re-repair after cloud sync regressions ──
  () => {
    repairStoredObjectKeys();
  },
  // ── v9 → v10: move avatar out of s_settings (memory / crash fix on Android) ──
  () => {
    migrateAvatarOutOfSettings();
  },
];

const DATA_VERSION = MIGRATIONS.length; // keep in lock-step automatically

/** Rebuild fkh-program-progress from s_done when session marks were lost. */
function persistProgramProgressRecovery() {
  try {
    const enrolled = readStoredObject("fkh-programs");
    const progress = readStoredObject("fkh-program-progress");
    const completed = readStoredObject("s_done");
    const next = rehydrateProgramProgressFromCompleted({
      programs: PROGRAMS,
      enrolledPrograms: enrolled,
      programProgress: progress,
      completed,
    });
    if (next === progress) return false;
    safePersistKey("fkh-program-progress", next);
    return true;
  } catch {
    return false;
  }
}

// Keys that indicate a real, pre-existing install (vs. a fresh device).
const KNOWN_DATA_KEYS = ["s_settings", "s_done", "fkh-programs", "shot_log_v2"];
const hasExistingData = () => KNOWN_DATA_KEYS.some(k => localStorage.getItem(k) != null);

function runDataMigrations() {
  let stored;
  try { stored = localStorage.getItem(DATA_VERSION_KEY); }
  catch { return; } // localStorage blocked (private mode, etc.) — nothing to do

  // Fresh install: no version stamp and no app data. Stamp the current
  // version and skip legacy migrations — they assume old shapes that a
  // brand-new device never had.
  if (stored == null && !hasExistingData()) {
    try { localStorage.setItem(DATA_VERSION_KEY, String(DATA_VERSION)); } catch { /* ignore */ }
    return;
  }

  const from = parseInt(stored || "0", 10) || 0;
  if (from >= DATA_VERSION) return;

  for (let v = from; v < DATA_VERSION; v++) {
    try {
      MIGRATIONS[v]?.();
    } catch (e) {
      // Stop and do NOT stamp the version, so it retries on the next
      // load rather than silently skipping a failed upgrade.
      console.error(`[fkh] data migration to v${v + 1} failed — left at v${v}`, e);
      return;
    }
  }
  try { localStorage.setItem(DATA_VERSION_KEY, String(DATA_VERSION)); } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════════
   ID-STABILITY GUARD (dev only)
   ───────────────────────────────────────────────────────────────
   Progress is keyed by exercise id (s_done) and program id
   (fkh-programs). If an update renames or removes an id that stored
   progress points to, that history silently orphans — checkmarks
   vanish, a kid loses their place. This warns loudly in the dev
   console so an accidental rename is caught before it ships.
   Completely inert in production builds.
═══════════════════════════════════════════════════════════════ */
function checkIdStability() {
  if (!(import.meta.env && import.meta.env.DEV)) return;
  try {
    const knownEx  = new Set(Object.keys(ALL_EXERCISES));
    const knownPgm = new Set(PROGRAMS.map(p => p.id));

    // Exercise ids referenced by completion history (s_done):
    const done = JSON.parse(localStorage.getItem("s_done") || "{}");
    const orphanEx = new Set();
    for (const key of Object.keys(done)) {
      if (!done[key]) continue;
      const exId = key.split("-").slice(3).join("-"); // strip the YYYY-MM-DD prefix
      if (exId && !knownEx.has(exId)) orphanEx.add(exId);
    }

    // Program ids referenced by enrollment (fkh-programs):
    const enrolled = JSON.parse(localStorage.getItem("fkh-programs") || "{}");
    const orphanPgm = Object.keys(enrolled).filter(id => !knownPgm.has(id));

    if (orphanEx.size || orphanPgm.length) {
      console.warn(
        "%c⚠ [fkh] ID-stability guard: stored progress references ids missing from the current bundle.\n" +
        "This history will NOT map onto the new plans. Did an id get renamed or removed?",
        "color:#f97316;font-weight:bold;"
      );
      if (orphanEx.size)  console.warn("  Orphaned exercise ids:", [...orphanEx]);
      if (orphanPgm.length) console.warn("  Orphaned program ids:", orphanPgm);
      console.warn("  Fix: keep the original id and edit name/desc/etc. instead — or add a migration to remap the old id.");
    }
  } catch (e) {
    console.warn("[fkh] ID-stability guard failed to run", e);
  }
}

// Run once at module load — before the component mounts and before any
// useState initializer reads localStorage.
try {
  recoverFromSyncBackupIfNeeded();
  runDataMigrations();
  repairStoredObjectKeys();
  migrateAvatarOutOfSettings();
  persistProgramProgressRecovery();
  checkIdStability();
} catch (e) {
  console.error("[fkh] app boot failed — attempting repair", e);
  try {
    repairStoredObjectKeys();
    migrateAvatarOutOfSettings();
  } catch { /* ignore */ }
}

function loadSettingsFromStorage(defaults) {
  try {
    migrateAvatarOutOfSettings();
    const raw = readStoredObject("s_settings");
    if (raw.avatar) {
      writeStoredAvatar(raw.avatar);
      delete raw.avatar;
    }
    if (raw.athleteAge && !raw.dateOfBirth) {
      const year = new Date().getFullYear() - Number(raw.athleteAge);
      raw.dateOfBirth = `${year}-06-15`;
    }
    delete raw.athleteAge;
    const merged = mergeUserSettings(raw, {});
    return migrateIdentitySettings(migrateThemeSettings({ ...defaults, ...merged }));
  } catch {
    return { ...defaults };
  }
}

/* ═══════════════════════ MAIN APP ═══════════════════════ */
export default function FitKidHooperApp() {
  const [settings, setSettings] = useState(() => loadSettingsFromStorage(DEFAULT));
  const [showSettings, setShowSettings] = useState(false);
  const [showPlayLikePicker, setShowPlayLikePicker] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  // Coach mode. Granted by hand in the database and re-checked server-side on
  // every action — this only decides whether the tools are visible.
  const [isCoach, setIsCoach] = useState(false);
  const [showCoachPanel, setShowCoachPanel] = useState(false);
  const [coachRoom, setCoachRoom] = useState(null);
  /* Read straight off the URL, and declared before pendingNav because that
     initializer strips the query params. Setting this inside the pendingNav
     effect instead would be a synchronous setState in an effect body. */
  const [pendingClassId, setPendingClassId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("class"); }
    catch { return null; }
  });
  const [authInitialMode, setAuthInitialMode] = useState("signin");
  const [inviteCode] = useState(() => consumeInviteDeepLink());
  /* Everything that says "when the app opens, go somewhere" funnels through one
     pending-navigation value. Mission, invite and notification links each had
     their own state and their own effect, and all three called setView -- so
     with more than one present the winner was whichever effect ran last. The
     order below is that same precedence, stated once instead of implied. */
  const [pendingNav, setPendingNav] = useState(() => {
    const nav = consumeNavigationDeepLink();
    if (nav) return nav;
    if (inviteCode) return { tab: "boards" };
    if (consumeMissionDeepLink()) return { tab: "home", focusMission: true };
    return null;
  });
  const [openMessagesInbox, setOpenMessagesInbox] = useState(false);
  const auth = useAuth(settings);
  const { squadNotifications, unreadMessages, friendRequests, feedActivity, challengeActivity, markSquadTabSeen, refreshSquadNotifications } = useSquadNotifications(auth.isSignedIn, auth.username);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideMode, setGuideMode] = useState("explore");
  const [shotLogTick, setShotLogTick] = useState(0);

  // Shot Tracking on Today: today's numbers, plus quick-log buttons.
  const shotsToday = useMemo(() => {
    const day = readShotLog()[new Date().toLocaleDateString("en-CA")] || [];
    const taken = day.length;
    const made = day.filter(sh => sh.made !== false).length;
    return { made, taken, pct: taken ? Math.round((100 * made) / taken) : null, goal: getDayShotGoal() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotLogTick]);

  /* A quick +5 has no spot attached, and every shot in the log needs one.
     Rather than invent a zone, reuse the most recent spot the athlete logged;
     with no history at all there is nothing sensible to assume, so the caller
     sends them to the court instead. */
  const quickLogShots = useCallback((n) => {
    const log = readShotLog();
    const dates = Object.keys(log).sort();
    let last = null;
    for (let i = dates.length - 1; i >= 0 && !last; i--) {
      const day = log[dates[i]];
      if (Array.isArray(day) && day.length) last = day[day.length - 1];
    }
    if (!last) return false;
    const key = new Date().toLocaleDateString("en-CA");
    const stamp = Date.now();
    const entries = Array.from({ length: n }, (_, i) => ({
      type: last.type, location: last.location ?? null, style: last.style ?? null,
      made: true, ts: stamp + i,
    }));
    writeShotLog({ ...log, [key]: [...(log[key] || []), ...entries] });
    setShotLogTick(t => t + 1);
    return true;
  }, []);
  const [view, setView] = useState("home");
  const [prevView, setPrevView] = useState("home");
  const [activeCat, setActiveCat] = useState(null);
  const [activeExercise, setActiveExercise] = useState(null);
  // From the practice-complete celebration, a guest taps "Save My Player" →
  // close the sheet and open the reframed signup (parent-consent). This is the
  // "earn it, then save it" wall: it fires after real success, not at cold open.
  const openSavePlayer = () => { setActiveExercise(null); setAuthInitialMode("signup"); setShowAuth(true); };
  const [detailList, setDetailList] = useState([]);
  const [schedTab, setSchedTab] = useState("week");
  const [scheduleDetailDate, setScheduleDetailDate] = useState(null);
  const [celebratedBadges, setCelebratedBadges] = useState(()=>{
    try{return new Set(JSON.parse(localStorage.getItem("fkh-celebrated-badges")||"[]"));}catch{return new Set();}
  });
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const [ledger, setLedger] = useState(()=>readLocalLedger());
  const [benchmarkPBs, setBenchmarkPBs] = useState(()=>readLocalPBs());
  const [growthLog, setGrowthLog] = useState(()=>readGrowthLog());
  const handleLogHeight = useCallback(h=>setGrowthLog(addGrowthEntry(h)),[]);
  const [progressTab, setProgressTab] = useState("overview");
  const [programSegment, setProgramSegment] = useState(() => {
    try {
      return Object.keys(readStoredObject("fkh-programs")).length ? "myPlan" : "forYou";
    } catch { return "forYou"; }
  });
  const [programsHubSection, setProgramsHubSection] = useState("plans");
  const [lockerBadgesOpen, setLockerBadgesOpen] = useState(true);
  const [showFindDrills, setShowFindDrills] = useState(false);
  const [showCoachFKH, setShowCoachFKH] = useState(false);
  const [coachInitialQuery, setCoachInitialQuery] = useState(null);
  const [showCoachIntro, setShowCoachIntro] = useState(false);
  const [tourPendingAfterCoach, setTourPendingAfterCoach] = useState(false);
  const [workoutOpen, setWorkoutOpen] = useState(() => {
    try { return localStorage.getItem("fkh-workout-open") === "1"; } catch { return false; }
  });
  const [templateScrolledEnd, setTemplateScrolledEnd] = useState(false);
  const [friendsFocusTick, setFriendsFocusTick] = useState(0);
  const [playerHighlight, setPlayerHighlight] = useState(null);
  const [avatarRevision, setAvatarRevision] = useState(0);
  const avatarUrl = useMemo(() => readStoredAvatar(), [avatarRevision]);
  const bumpAvatar = useCallback(() => setAvatarRevision(v => v + 1), []);
  const headerFrameColor = useMemo(
    () => (settings.equipped?.frame ? getAchievementMeta(settings.equipped.frame)?.color : null),
    [settings.equipped],
  );

  useEffect(() => {
    migrateAvatarOutOfSettings();
    (async () => {
      const av = readStoredAvatar();
      if (av && av.length > 120_000) {
        const saved = await saveAvatarLocally(av);
        if (saved.ok) bumpAvatar();
      }
    })();
  }, [bumpAvatar]);

  const openPlayerHighlight = useCallback(({ videoId, title }) => {
    setPlayerHighlight({ videoId, title });
  }, []);

  useEffect(() => {
    if (view === "profile") {
      setProgressTab("overview");
      setView("progress");
    }
  }, [view]);

  useEffect(() => {
    try { localStorage.setItem("fkh-workout-open", workoutOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [workoutOpen]);

  const focusSquad = useCallback(() => {
    setView("squad");
    setFriendsFocusTick(t => t + 1);
  }, []);

  const navigateToMessages = useCallback(() => {
    setView("squad");
    setOpenMessagesInbox(true);
    setFriendsFocusTick(t => t + 1);
  }, []);

  const openLegendsJourney = useCallback(() => {
    setView("boards");
  }, []);

  const openProgramsSection = useCallback((section = "plans") => {
    setProgramsHubSection(section);
    setView("programs");
  }, []);
  const [badgeDates, setBadgeDates] = useState(() => readStoredObject("fkh-badge-dates"));
  const [lastEarnedBadge, setLastEarnedBadge] = useState(null);
  const [completed, setCompleted] = useState(() => readStoredObject("s_done"));
  const [programProgress, setProgramProgress] = useState(() => readStoredObject("fkh-program-progress"));
  const [setLog, setSetLog] = useState(() => readStoredObject("fkh-set-log"));
  const [maxRepsMap, setMaxRepsMap] = useState(() => readStoredObject("fkh-max-reps"));
  const [bilateralPrefs, setBilateralPrefs] = useState(() => readStoredObject("fkh-bilateral-prefs"));
  const [detailContext, setDetailContext] = useState(null);
  const [enrolledPrograms, setEnrolledPrograms] = useState(() => readStoredObject("fkh-programs"));
  const [selectedProgram, setSelectedProgram] = useState(null); // programId string when drill-in open
  const [missionLog, setMissionLog] = useState(() => readStoredObject("fkh-missions"));
  const [missionCelebration, setMissionCelebration] = useState(null);
  const [missionTaskToast, setMissionTaskToast] = useState(null);
  const celebratedMissionTasksRef = useRef(new Set());
  const [favorites, setFavorites] = useState(() => readStoredObject("fkh-favs", { exercises: {}, workouts: {}, programs: {} }));
  const [strDay, setStrDay] = useState(()=>localStorage.getItem('s_strday')||'Day 1');
  const reloadAthleteStateFromStorage = useCallback(() => {
    repairStoredObjectKeys();
    migrateAvatarOutOfSettings();
    persistProgramProgressRecovery();
    setSettings(loadSettingsFromStorage(DEFAULT));
    setCompleted(readStoredObject("s_done"));
    setProgramProgress(readStoredObject("fkh-program-progress"));
    setEnrolledPrograms(readStoredObject("fkh-programs"));
    setMissionLog(readStoredObject("fkh-missions"));
    setFavorites(readStoredObject("fkh-favs", { exercises: {}, workouts: {}, programs: {} }));
    setSetLog(readStoredObject("fkh-set-log"));
    setMaxRepsMap(readStoredObject("fkh-max-reps"));
    setBadgeDates(readStoredObject("fkh-badge-dates"));
    setStrDay(localStorage.getItem("s_strday") || "Day 1");
    setLedger(readLocalLedger());
    setBenchmarkPBs(readLocalPBs());
    setGrowthLog(readGrowthLog());
    try {
      const celebrated = readStoredArray("fkh-celebrated-badges");
      setCelebratedBadges(new Set(celebrated));
    } catch { /* ignore */ }
  }, []);

  const hydrateProfileIntoState = useCallback(async (userId) => {
    if (!userId) return;
    if (!readStoredAvatar()) {
      await restoreLocalAvatarFromCloud(userId);
    }
    const patch = await fetchAthleteProfilePatch(userId);
    setSettings(prev => {
      const next = migrateThemeSettings(
        mergeProfilePatch(normalizeProfileFields(prev), patch)
      );
      persistHydratedSettings(next, prev);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, []);

  const completedSafe = useMemo(() => asRecord(completed), [completed]);
  const missionLogSafe = useMemo(() => asRecord(missionLog), [missionLog]);
  const enrolledProgramsSafe = useMemo(() => asRecord(enrolledPrograms), [enrolledPrograms]);
  const programProgressSafe = useMemo(() => asRecord(programProgress), [programProgress]);

  const applyCloudSync = useCallback(async () => {
    try {
      const result = await auth.syncNow();
      repairStoredObjectKeys();
      migrateAvatarOutOfSettings();
      persistProgramProgressRecovery();
      reloadAthleteStateFromStorage();
      const sb = getSupabaseClient();
      const userId = (await sb?.auth.getSession())?.data?.session?.user?.id;
      if (userId) await hydrateProfileIntoState(userId).catch(() => {});
      if (result?.ok) refreshSquadNotifications();
      return result;
    } catch (e) {
      console.error("[fkh] applyCloudSync failed", e);
      try {
        repairStoredObjectKeys();
        migrateAvatarOutOfSettings();
        reloadAthleteStateFromStorage();
      } catch { /* ignore */ }
      return { ok: false, error: e?.message || String(e) };
    }
  }, [auth.syncNow, reloadAthleteStateFromStorage, hydrateProfileIntoState, refreshSquadNotifications]);
  const [reportPeriod, setReportPeriod] = useState("30d");
  useEffect(() => {
    if (!auth.isSignedIn) return undefined;
    let cancelled = false;
    amICoach().then(v => { if (!cancelled) setIsCoach(v); });
    return () => { cancelled = true; };
  }, [auth.isSignedIn]);

  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (localStorage.getItem("s_onboarded")) return false;
    if (hasStoredAuthSession()) return false;
    return settings.athleteName === DEFAULT.athleteName;
  });
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const tourStepRef = useRef(0);
  useEffect(() => { tourStepRef.current = tourStep; }, [tourStep]);
  const [showTourPrompt, setShowTourPrompt] = useState(() => shouldShowTourPrompt());
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  // Existing-guest "save your player" nudge — dismissible, persists per device.
  const [guestSaveDismissed, setGuestSaveDismissed] = useState(() => {
    try { return localStorage.getItem("fkh-save-prompt-dismissed") === "1"; } catch { return false; }
  });
  const dismissGuestSavePrompt = useCallback(() => {
    setGuestSaveDismissed(true);
    try { localStorage.setItem("fkh-save-prompt-dismissed", "1"); } catch { /* ignore */ }
  }, []);
  const [homeMissionFocus, setHomeMissionFocus] = useState(false);
  const [pushError, setPushError] = useState(null);
  const openSchedule = useCallback((returnView = "home", tab = "calendar") => {
    setPrevView(returnView);
    setSchedTab(tab);
    setScheduleDetailDate(null);
    setView("schedule");
  }, []);

  const finishTour = useCallback(() => {
    markTourComplete();
    setTourActive(false);
    setTourStep(0);
    setShowTourPrompt(false);
    document.body.style.overflow = "";
    track(ANALYTICS_EVENTS.ONBOARDING_TOUR_COMPLETE, {});
  }, []);

  const tourHandlersRef = useRef({ setView, setProgressTab, setProgramsHubSection, setSelectedProgram });
  useEffect(() => { tourHandlersRef.current = { setView, setProgressTab, setProgramsHubSection, setSelectedProgram }; },
    [setView, setProgressTab, setProgramsHubSection, setSelectedProgram]);

  const goToTourStep = useCallback((index) => {
    const step = TOUR_STEPS[index];
    if (!step) return;
    applyTourStep(step, tourHandlersRef.current);
    setTourStep(index);
  }, []);

  const advanceTour = useCallback(() => {
    const prev = tourStepRef.current;
    if (prev >= TOUR_STEPS.length - 1) {
      finishTour();
      return;
    }
    goToTourStep(prev + 1);
  }, [finishTour, goToTourStep]);

  const backTour = useCallback(() => {
    const prev = tourStepRef.current;
    if (prev <= 0) return;
    goToTourStep(prev - 1);
  }, [goToTourStep]);

  const openGuide = useCallback((mode = "explore") => {
    setGuideMode(mode);
    setShowGuide(true);
  }, []);

  const startTour = useCallback(() => {
    setShowGuide(false);
    setShowSettings(false);
    setShowTourPrompt(false);
    setTourActive(true);
    goToTourStep(0);
  }, [goToTourStep]);

  const dismissTourPromptBanner = useCallback(() => {
    dismissTourPrompt();
    setShowTourPrompt(false);
  }, []);

  const dismissNotificationPromptBanner = useCallback(() => {
    dismissNotificationPrompt();
    setShowNotificationPrompt(false);
  }, []);

  const enableNotificationsFromPrompt = useCallback(async () => {
    if (!auth.isSignedIn) return { ok: false, reason: "not_signed_in" };
    const result = await subscribeToPush();
    if (result.ok) setShowNotificationPrompt(false);
    return result;
  }, [auth.isSignedIn]);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.isSignedIn) return;
    localStorage.setItem("s_onboarded", "1");
    setShowOnboarding(false);
  }, [auth.loading, auth.isSignedIn]);

  // Post-onboarding sequence in progress: Meet Coach FKH intro, or the coach
  // sheet it opened while a tour start is still pending. Other first-run
  // surfaces (notifications, tour prompt, what's new) must wait their turn.
  const inPostOnboardingFlow = showCoachIntro || (showCoachFKH && tourPendingAfterCoach);

  useEffect(() => {
    if (!auth.isSignedIn || tourActive || showOnboarding || inPostOnboardingFlow) {
      setShowNotificationPrompt(false);
      return undefined;
    }
    let cancelled = false;
    needsNotificationSubscription().then(need => {
      if (!cancelled) setShowNotificationPrompt(need);
    });
    return () => { cancelled = true; };
  }, [auth.isSignedIn, tourActive, showOnboarding, inPostOnboardingFlow]);

  useEffect(() => {
    if (tourActive || showOnboarding || inPostOnboardingFlow) return;
    setShowTourPrompt(shouldShowTourPrompt());
  }, [tourActive, showOnboarding, inPostOnboardingFlow, completedSafe]);

  useEffect(() => {
    const onShow = () => setShowWhatsNew(true);
    window.addEventListener(WHATS_NEW_EVENT, onShow);
    return () => window.removeEventListener(WHATS_NEW_EVENT, onShow);
  }, []);

  useEffect(() => {
    if (showOnboarding || inPostOnboardingFlow || tourActive || auth.loading) return;
    if (!shouldShowWhatsNew()) return;
    const t = setTimeout(() => setShowWhatsNew(true), 800);
    return () => clearTimeout(t);
  }, [showOnboarding, inPostOnboardingFlow, tourActive, auth.loading]);

  const getExerciseCategory = useCallback(exId => (ALL_EXERCISES[exId] || {})._cat, []);

  const syncLeaderboard = useCallback(async ({ force = false } = {}) => {
    const result = await maybeAutoSyncLeaderboard({
      settings,
      completed,
      missionLog,
      getCategory: getExerciseCategory,
      force,
    });
    if (result.ok) {
      track(ANALYTICS_EVENTS.LEADERBOARD_PUSH, { success: true, auto: !force });
    } else if (result.error) {
      track(ANALYTICS_EVENTS.LEADERBOARD_PUSH, { success: false, auto: !force, error: result.error });
    }
    return result;
  }, [settings, completed, missionLog, getExerciseCategory]);

  const syncLeaderboardRef = useRef(syncLeaderboard);
  useEffect(() => { syncLeaderboardRef.current = syncLeaderboard; }, [syncLeaderboard]);

  useEffect(() => {
    const run = () => syncLeaderboardRef.current();
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!canAutoSyncLeaderboard(settings)) return;
    const timer = setTimeout(() => syncLeaderboardRef.current(), 90_000);
    return () => clearTimeout(timer);
  }, [completed, missionLog, settings.athleteName]);


  const settingsPersistKey = useMemo(() => {
    try { return JSON.stringify(stripAvatarForCloud(settings)); } catch { return ""; }
  }, [settings]);

  useEffect(() => {
    if (!settingsPersistKey) return;
    safePersistKey("s_settings", JSON.parse(settingsPersistKey));
  }, [settingsPersistKey]);

  const avatarSyncRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const athleteId = await getEffectiveAthleteId();
      if (cancelled || !athleteId) return;
      const localAvatar = readStoredAvatar();
      if (!localAvatar) return;
      if (avatarSyncRef.current === localAvatar) return;
      avatarSyncRef.current = localAvatar;
      await syncAvatarToCloud(localAvatar, athleteId);
    })();
    return () => { cancelled = true; };
  }, [avatarRevision]);
  useEffect(()=>{
    const bgColor = bg(settings);
    const bgL = Number(settings.bgLight);
    const textL = Number(settings.textLight);
    const textHue = Number(settings.textHue);
    const textSat = Number(settings.textSat);
    const safeBgL = Number.isFinite(bgL) ? bgL : 8;
    const safeTextL = Number.isFinite(textL) ? textL : 94;
    const safeTextHue = Number.isFinite(textHue) ? textHue : 210;
    const safeTextSat = Number.isFinite(textSat) ? textSat : 25;
    const safeText = Math.abs(safeTextL - safeBgL) < 28
      ? hsl(safeTextHue, safeTextSat, safeBgL < 50 ? 92 : 14)
      : textPri(settings);
    const safeMuted = Math.abs(safeTextL - safeBgL) < 28
      ? hsl(safeTextHue, Math.max(safeTextSat - 10, 0), safeBgL < 50 ? 62 : 38)
      : textMuted(settings);
    document.documentElement.style.setProperty("--fkh-bg", bgColor);
    document.documentElement.style.setProperty("--fkh-text", safeText);
    document.documentElement.style.setProperty("--fkh-text-muted", safeMuted);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bgColor);
  }, [settings.bgHue, settings.bgSat, settings.bgLight, settings.textHue, settings.textSat, settings.textLight]);
  useEffect(()=>{ safePersistKey("s_done", completed); },[completed]);
  useEffect(()=>{ safePersistKey("fkh-program-progress", programProgress); },[programProgress]);
  useEffect(()=>{ safePersistKey("fkh-set-log", setLog); },[setLog]);
  useEffect(()=>{ safePersistKey("fkh-max-reps", maxRepsMap); },[maxRepsMap]);
  useEffect(()=>{ safePersistKey("fkh-bilateral-prefs", bilateralPrefs); },[bilateralPrefs]);
  useEffect(()=>{ safePersistKey("fkh-programs", enrolledPrograms); },[enrolledPrograms]);
  useEffect(()=>{ safePersistKey("fkh-missions", missionLog); },[missionLog]);
  useEffect(()=>{ safePersistKey("fkh-favs", favorites); },[favorites]);

  const isFav      = (type, id) => !!(favorites[type]||{})[id];
  const toggleFav  = (type, id) => {
    if (type === "exercises" && !isFav(type, id)) track(ANALYTICS_EVENTS.EXERCISE_FAVORITE, { exercise_id: id });
    setFavorites(prev=>{
      const sec = { ...(prev[type]||{}) };
      if (sec[id]) delete sec[id]; else sec[id] = Date.now();
      return { ...prev, [type]:sec };
    });
  };

  const today = todayKey();
  const P = pri(settings), S = sec(settings), BG = bg(settings), ST = str3(settings);
  const NV = nav(settings), SF = surf(settings);

  const isDone  = id => !!completed[`${today}-${id}`];
  const toggle  = useCallback((id, source) => {
    const key = `${today}-${id}`;
    const src = source || view;
    if (!completed[key]) trackExerciseComplete(id, src);
    setCompleted(p => ({ ...p, [key]: !p[key] }));
  }, [today, completed, view]);

  const markProgramExercise = useCallback((ctx, exId) => {
    const { programId, week, sessionIdx } = ctx;
    if (!enrolledPrograms[programId]) return;
    const anchor = programEnrollmentAnchor(programProgress, programId);
    if (!anchor) return;
    const slot = programSessionSlot(week, sessionIdx);
    const date = todayKey();
    const at = Date.now();
    setProgramProgress(prev => ({
      ...prev,
      [programId]: {
        ...(prev[programId] || {}),
        _meta: prev[programId]?._meta,
        [slot]: {
          ...(prev[programId]?.[slot] || {}),
          [exId]: { d: date, t: at },
        },
      },
    }));
  }, [enrolledPrograms, programProgress]);

  const toggleProgramExercise = useCallback((ctx, exId) => {
    const { programId, week, sessionIdx } = ctx;
    if (!enrolledPrograms[programId]) return;
    const slot = programSessionSlot(week, sessionIdx);
    const done = isProgramExerciseDone(programProgress, programId, week, sessionIdx, exId);
    if (done) {
      setProgramProgress(prev => {
        const next = { ...prev };
        const slotData = { ...(next[programId]?.[slot] || {}) };
        delete slotData[exId];
        next[programId] = { ...(next[programId] || {}), _meta: next[programId]?._meta, [slot]: slotData };
        return next;
      });
    } else {
      markProgramExercise(ctx, exId);
      const day = todayKey();
      trackExerciseComplete(exId, "program", { program_id: programId, week: ctx.week, session_idx: ctx.sessionIdx });
      setCompleted(p => p[`${day}-${exId}`] ? p : { ...p, [`${day}-${exId}`]: true });
    }
  }, [enrolledPrograms, programProgress, markProgramExercise]);

  const handleSetLogChange = useCallback((key, data) => {
    setSetLog(prev => ({ ...prev, [key]: { ...prev[key], ...data } }));
  }, []);

  const handleMaxRepsChange = useCallback((exId, reps) => {
    setMaxRepsMap(prev => reps > (prev[exId] || 0) ? { ...prev, [exId]: reps } : prev);
  }, []);

  const handleBilateralPrefChange = useCallback((exId, on, unit = "hand") => {
    setBilateralPrefs(prev => ({ ...prev, [exId]: { on, unit } }));
  }, []);
  const setStrDayPersist = day => { setStrDay(day); localStorage.setItem('s_strday',day); };

  /* Exercise Detail helpers ────────────────────────────────── */
  const activePracticeRef = useRef(null);

  const isExerciseDoneForPractice = useCallback((exId, programContext) => {
    if (programContext && !isWarmupExercise({ id: exId })) {
      return isProgramExerciseDone(
        programProgress,
        programContext.programId,
        programContext.week,
        programContext.sessionIdx,
        exId,
      );
    }
    return !!completed[`${today}-${exId}`];
  }, [completed, programProgress, today]);

  const openDetail = useCallback((ex, list = [], context = null, practiceSource = null) => {
    const enrich = e => ({ ...e, _cat:e._cat||"speed", meta:e.meta||EXERCISE_META[e.id]||{} });
    const enrichedList = list.map(enrich);
    setActiveExercise(enrich(ex));
    setDetailList(enrichedList);
    setDetailContext(context);

    if (practiceSource && enrichedList.length > 0) {
      const exerciseIds = enrichedList.map(e => e.id);
      const allAlreadyDone = exerciseIds.every(id => isExerciseDoneForPractice(id, context));
      if (!allAlreadyDone) {
        activePracticeRef.current = {
          source: practiceSource,
          exerciseIds,
          startedAt: Date.now(),
          programContext: context,
        };
        trackPracticeStarted(practiceSource, {
          exerciseCount: exerciseIds.length,
          programId: context?.programId ?? null,
        });
      } else {
        activePracticeRef.current = null;
      }
    } else if (!enrichedList.length) {
      activePracticeRef.current = null;
    }
  }, [isExerciseDoneForPractice]);
  const openSessionWithWarmup = useCallback((exList, ctx, startEx = null, practiceSource = null) => {
    const list = withSessionWarmup(
      (exList || []).map(e => ({ ...e, meta: e.meta || EXERCISE_META[e.id] || {} })),
      WORKOUTS,
      EXERCISE_META,
      { categories: categoriesFromExercises(exList, ALL_EXERCISES) },
    );
    const first = startEx || list[0];
    if (first) openDetail(first, list, ctx, practiceSource);
  }, [openDetail]);
  const detailIdx  = activeExercise ? detailList.findIndex(e=>e.id===activeExercise.id) : -1;
  const nextExDetail = detailIdx>=0 && detailIdx<detailList.length-1 ? detailList[detailIdx+1] : null;
  const closeDetail  = () => { setActiveExercise(null); setDetailContext(null); activePracticeRef.current = null; };

  const askCoachAboutExercise = useCallback((exerciseId) => {
    setCoachInitialQuery({ intent: "explain_drill", exerciseId, label: "Tell me about this drill" });
    setShowCoachFKH(true);
  }, []);

  const detailSheetProps = {
    programContext: detailContext,
    setLog, onSetLogChange: handleSetLogChange,
    maxRepsMap, onMaxRepsChange: handleMaxRepsChange,
    bilateralPrefs, onBilateralPrefChange: handleBilateralPrefChange,
    settings, today,
    onAskCoach: askCoachAboutExercise,
    sessionList: detailList,
    isSessionExerciseDone: isExerciseDoneForPractice,
    sessionXpEarned: detailList.length >= 2
      ? computeSessionXpEarned(
        detailList.map((e) => e.id),
        completedSafe,
        programProgressSafe,
        missionLogSafe,
        today,
        detailContext,
      )
      : null,
    // Badge/mission celebrations are full-screen overlays with a semi-
    // transparent backdrop — showing the practice-complete screen underneath
    // at the same time bleeds both together. Defer to them instead of racing.
    hasPendingCelebration: celebrationQueue.length > 0 || !!missionCelebration,
  };

  const todayIdx  = new Date().getDay()===0?6:new Date().getDay()-1;
  const todayPlan = SCHEDULE[todayIdx];

  /* Workout generator ──────────────────────────────────────────── */
  const defaultTmpl = todayPlan.cats.map(c=>SCHED_TO_TEMPLATE[c]).find(Boolean)||"quickFeet";
  const workoutStoreRef = useRef(null);
  const [selectedTemplate, setSelectedTemplate] = useState(defaultTmpl);
  const [coachBasisTemplate, setCoachBasisTemplate] = useState(null);
  const [todaysWorkout, setTodaysWorkout] = useState(null);

  const recentExIds = useMemo(()=>{
    // Derived from `today` rather than the clock: a memo factory runs during
    // render, so Date.now() here made the memo impure.
    const cutoff = new Date(new Date(today+"T00:00:00").getTime()-3*86400000).toLocaleDateString("en-CA");
    // Exclude today's frozen mission drills from workout anti-repeat so completing
    // the mission doesn't push those exercises out of Quick Workout shuffles.
    const exclude = missionExerciseIds(missionLogSafe[today]?.mission);
    return Object.keys(completedSafe)
      .filter(k=>{ const d=k.split("-").slice(0,3).join("-"); return d>=cutoff && completedSafe[k]; })
      .map(k=>k.split("-").slice(3).join("-"))
      .filter(id => !exclude.has(id));
  },[completedSafe, missionLogSafe, today]);

  const loadWorkoutForTemplate = useCallback((templateKey, { forceRegenerate = false } = {}) => {
    if (!workoutStoreRef.current) {
      const raw = readDailyWorkoutStore();
      workoutStoreRef.current = applyDayRollover(raw, today, completed);
      saveDailyWorkoutStore(workoutStoreRef.current);
    }
    const { workout, store } = getOrCreateWorkout({
      store: workoutStoreRef.current,
      templateKey,
      settings,
      recentExIds,
      generateWorkout,
      forceRegenerate,
    });
    workoutStoreRef.current = store;
    setTodaysWorkout(workout);
    return workout;
  }, [today, completed, settings, recentExIds]);

  // Restore cached workouts on mount — auto-pick coach recommendation on new day
  const workoutInitRef = useRef(false);
  useEffect(() => {
    if (workoutInitRef.current) return;
    workoutInitRef.current = true;
    const raw = readDailyWorkoutStore();
    const didRollover = raw && raw.activeDate !== today;
    const rolled = applyDayRollover(raw, today, completed);
    let store = rolled;
    let tmpl;

    if (didRollover) {
      const basis = rolled.coachBasisTemplate || defaultTmpl;
      const rec = computeRecommendation(settings, completed, basis);
      tmpl = rec.templateKey;
      store = setSelectedTemplateInStore(rolled, tmpl);
    } else {
      tmpl = rolled.selectedTemplate || defaultTmpl;
    }

    saveDailyWorkoutStore(store);
    workoutStoreRef.current = store;
    setCoachBasisTemplate(store.coachBasisTemplate ?? null);
    setSelectedTemplate(tmpl);
    loadWorkoutForTemplate(tmpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount init only
  }, []);

  // New calendar day while app is open: apply coach pick and refresh workout
  useEffect(() => {
    if (!workoutInitRef.current) return;
    const prev = workoutStoreRef.current;
    const rolled = applyDayRollover(prev, today, completed);
    if (prev && rolled.activeDate !== prev.activeDate) {
      const basis = rolled.coachBasisTemplate || defaultTmpl;
      const rec = computeRecommendation(settings, completed, basis);
      const store = setSelectedTemplateInStore(rolled, rec.templateKey);
      workoutStoreRef.current = store;
      saveDailyWorkoutStore(store);
      setCoachBasisTemplate(store.coachBasisTemplate ?? null);
      setSelectedTemplate(rec.templateKey);
      loadWorkoutForTemplate(rec.templateKey);
    }
  }, [today, completed, settings, defaultTmpl, loadWorkoutForTemplate]);

  const selectTemplate = useCallback((templateKey) => {
    setSelectedTemplate(templateKey);
    if (!workoutStoreRef.current) {
      const raw = readDailyWorkoutStore();
      workoutStoreRef.current = applyDayRollover(raw, today, completed);
    }
    workoutStoreRef.current = setSelectedTemplateInStore(workoutStoreRef.current, templateKey);
    loadWorkoutForTemplate(templateKey);
  }, [today, completed, loadWorkoutForTemplate]);

  const refreshWorkout = useCallback(() => {
    loadWorkoutForTemplate(selectedTemplate, { forceRegenerate: true });
  }, [selectedTemplate, loadWorkoutForTemplate]);

  const startQuickWorkout = useCallback((templateKey) => {
    selectTemplate(templateKey);
    const w = loadWorkoutForTemplate(templateKey);
    const exs = (w?.exercises || []).map(e => ({ ...e, meta: e.meta || EXERCISE_META[e.id] || {} }));
    if (exs[0]) openDetail(exs[0], exs);
  }, [selectTemplate, loadWorkoutForTemplate, openDetail]);

  const quickWorkoutComplete = useMemo(
    () => isQuickWorkoutCompleteToday(todaysWorkout, completed, today),
    [todaysWorkout, completed, today]
  );

  const openSettingsTab = useCallback(() => {
    setShowSettings(false);
    setView("progress");
    setProgressTab("settings");
  }, []);

  const openFeedback = useCallback(() => {
    setShowSettings(false);
    setShowGuide(false);
    setShowFeedback(true);
  }, []);

  const openWhatsNew = useCallback(() => {
    setShowSettings(false);
    setShowGuide(false);
    setShowWhatsNew(true);
  }, []);

  const dismissWhatsNew = useCallback(() => {
    markWhatsNewSeen();
    setShowWhatsNew(false);
  }, []);

  const settingsSheet = showSettings ? (
    <SettingsSheet settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} onOpenFeedback={openFeedback}
      avatarUrl={avatarUrl}
      onAvatarChange={bumpAvatar}
      onOpenWhatsNew={openWhatsNew}
      onOpenAuth={() => { setShowSettings(false); setShowAuth(true); }}
      isSignedIn={auth.isSignedIn}
      signedInUsername={auth.username}
      onCloudSync={applyCloudSync}
      cloudSyncStatus={auth.syncStatus}
      cloudSyncDetail={auth.syncDetail}
      onLogout={async () => { await auth.logout(); }} />
  ) : null;

  const authSheet = showAuth ? (
    <AuthSheet
      P={pri(settings)}
      SF={surf(settings)}
      /* Above the shared-class sheet (410) when one is open, or it would
         appear behind the very thing that asked for it. */
      zIndex={showOnboarding ? 450 : pendingClassId ? 430 : 350}
      initialMode={authInitialMode}
      parentConsent={needsParentConsent(settings.dateOfBirth)}
      firstName={settings.athleteName || ""}
      lastName={settings.lastName || ""}
      onClose={() => { setShowAuth(false); setAuthInitialMode("signin"); }}
      onSignedIn={async () => {
        setShowAuth(false);
        setAuthInitialMode("signin");
        if (showOnboarding) {
          localStorage.setItem("s_onboarded", "1");
          track(ANALYTICS_EVENTS.ONBOARDING_COMPLETE, {});
          setShowOnboarding(false);
          setShowCoachIntro(true);
        }
      }}
    />
  ) : null;

  const feedbackSheet = showFeedback ? (
    <FeedbackCenter settings={settings} onClose={() => setShowFeedback(false)} />
  ) : null;

  const navigateFromGuide = useCallback((dest) => {
    setShowGuide(false);
    switch (dest) {
      case "today": setView("home"); break;
      case "squad": setView("squad"); break;
      case "shots": setView("shots"); break;
      case "programs": setView("programs"); break;
      case "boards": setView("boards"); break;
      // Legend journeys moved off Challenges to Me > Badges.
      case "paths": setView("progress"); setProgressTab("locker"); break;
      case "progress": setView("progress"); setProgressTab("overview"); break;
      case "badges": setView("progress"); setProgressTab("locker"); break;
      case "stats": setView("progress"); setProgressTab("stats"); break;
      case "history": setPrevView("progress"); setView("history"); break;
      case "playlike": setShowPlayLikePicker(true); break;
      case "settings": openSettingsTab(); break;
      case "account": setShowAuth(true); break;
      case "guide": openGuide("explore"); break;
      case "whatsnew": openWhatsNew(); break;
      default: break;
    }
  }, [openGuide, openWhatsNew, openSettingsTab]);

  const guideSheet = showGuide ? (
    <GuideSheet P={P} SF={SF} initialMode={guideMode} onClose={() => setShowGuide(false)}
      onNavigate={navigateFromGuide} onStartTour={startTour}
      onOpenFeedback={openFeedback} onOpenWhatsNew={openWhatsNew} />
  ) : null;

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    return initAnalytics({ ageGroup: getAgeGroup(settings.dateOfBirth), isStandalone });
  }, []);

  useEffect(() => {
    setAnalyticsAgeGroup(getAgeGroup(settings.dateOfBirth));
  }, [settings.dateOfBirth]);

  useEffect(() => {
    let screen = view;
    if (view === "programs" && selectedProgram) screen = "program_detail";
    else if (view === "cat" && activeCat) screen = `cat_${activeCat}`;
    else if (view === "schedule") screen = `schedule_${schedTab}`;
    trackScreen(screen);
    if (view === "home") trackHomeViewed();
  }, [view, selectedProgram, activeCat, schedTab]);

  /* Which of the Programs hub's sixteen states is actually in use. screen_view
     records the whole tab as one value, so the four sections and the four
     Plans segments were invisible. */
  useEffect(() => {
    if (view !== "programs" || selectedProgram) return;
    trackProgramsSection(programsHubSection, programsHubSection === "plans" ? programSegment : null);
  }, [view, selectedProgram, programsHubSection, programSegment]);

  useEffect(() => {
    const ap = activePracticeRef.current;
    if (!ap) return;
    const allDone = ap.exerciseIds.every((id) => isExerciseDoneForPractice(id, ap.programContext));
    if (!allDone) return;
    trackPracticeFinished(ap.source, {
      exerciseCount: ap.exerciseIds.length,
      durationSec: Math.round((Date.now() - ap.startedAt) / 1000),
    });
    activePracticeRef.current = null;
  }, [completed, programProgress, isExerciseDoneForPractice]);

  const prevWorkoutCompleteRef = useRef(false);
  useEffect(() => {
    if (quickWorkoutComplete && !prevWorkoutCompleteRef.current) {
      trackWorkoutCompleteIfNew(selectedTemplate, today);
    }
    prevWorkoutCompleteRef.current = quickWorkoutComplete;
  }, [quickWorkoutComplete, selectedTemplate, today]);

  useEffect(() => {
    for (const def of CHALLENGES_DEF) {
      const { cur, target } = getChallengeProgress(def, completed, WORKOUTS);
      trackChallengeIfNew(def.id, cur >= target);
    }
  }, [completed]);

  useEffect(() => {
    for (const programId of Object.keys(enrolledPrograms)) {
      const prog = PROGRAMS.find(p => p.id === programId);
      if (!prog) continue;
      for (const week of prog.weeks) {
        for (let si = 0; si < week.sessions.length; si++) {
          if (isProgramSessionComplete(prog, programProgress, week.week, si)) {
            trackProgramSessionIfNew(programId, week.week, si);
          }
        }
      }
    }
  }, [enrolledPrograms, programProgress]);

  const coachAthleteContext = useMemo(
    () => buildCoachAthleteContext({ settings, completed: completedSafe, enrolledPrograms: enrolledProgramsSafe, workouts: WORKOUTS }),
    [settings, completedSafe, enrolledProgramsSafe],
  );
  const coachGapAnalysis = useMemo(() => runGapAnalysis(coachAthleteContext), [coachAthleteContext]);

  const coachRec = useMemo(() =>
    computeRecommendation(settings, completedSafe, coachBasisTemplate ?? defaultTmpl, coachGapAnalysis.weakAreas),
  [settings, completedSafe, coachBasisTemplate, defaultTmpl, coachGapAnalysis]);

  /* XP / Level / Badges ──────────────────────────────────── */
  const xpData = useMemo(() => computeXP(completedSafe, programProgressSafe, missionLogSafe), [completedSafe, programProgressSafe, missionLogSafe]);
  const currentLevel = useMemo(() => getLevel(xpData.total), [xpData.total]);
  const prevLevelRankRef = useRef(currentLevel.rank);
  useEffect(() => {
    if (currentLevel.rank > prevLevelRankRef.current) {
      track(ANALYTICS_EVENTS.LEVEL_UP, {
        level: currentLevel.rank,
        level_name: currentLevel.name,
        total_xp: xpData.total,
      });
    }
    prevLevelRankRef.current = currentLevel.rank;
  }, [currentLevel, xpData.total]);
  const earnedBadges = useMemo(() => getEarnedBadges(completedSafe, programProgressSafe, PROGRAMS), [completedSafe, programProgressSafe]);
  const personalChallenges = useMemo(() => buildPersonalChallenges(completedSafe, WORKOUTS), [completedSafe]);
  const recommendedProgramIds = useMemo(() => recommendProgramsForFavorite(settings), [settings]);
  const totalBadges = BADGES_DEF.length;
  const totalTracks = PATHS.length;
  const coachMsg = useMemo(
    () => buildCoachMessage(completedSafe, xpData, earnedBadges, programProgressSafe, coachGapAnalysis.weakAreas, settings),
    [completedSafe, xpData, earnedBadges, programProgressSafe, coachGapAnalysis, settings]
  );
  // Detect newly unlocked badges → queue celebration + record dates
  useEffect(()=>{
    const newBadges = earnedBadges.filter(id=>!celebratedBadges.has(id));
    if (newBadges.length===0) return;
    const defs = newBadges.map(id=>BADGES_DEF.find(b=>b.id===id)).filter(Boolean);
    for (const id of newBadges) track(ANALYTICS_EVENTS.BADGE_EARN, { badge_id: id });
    setCelebrationQueue(q=>[...q,...defs]);
    if (defs.length>0) setLastEarnedBadge(defs[defs.length-1]);
    const updated = new Set([...celebratedBadges,...newBadges]);
    setCelebratedBadges(updated);
    try { localStorage.setItem("fkh-celebrated-badges",JSON.stringify([...updated])); } catch { /* ignore */ }
    // Record earn date for each new badge (first-time only)
    const today = new Date().toLocaleDateString("en-CA");
    setBadgeDates(prev=>{
      const next={...prev};
      for (const id of newBadges) { if (!next[id]) next[id]=today; }
      try{ localStorage.setItem("fkh-badge-dates",JSON.stringify(next)); }catch { /* ignore */ }
      return next;
    });
  },[earnedBadges]);

  // Shared progression context — drives both the grant ledger and the journey UI.
  const progressCtx = useMemo(()=>{
    try {
      const sl = readShotLog();
      const makes = countShotMakes(sl);
      const maxStreak = earnedBadges.includes("streak-30") ? 30
        : earnedBadges.includes("streak-14") ? 14
        : earnedBadges.includes("streak-7") ? 7 : 0;
      return {
        earnedBadgeIds: new Set(earnedBadges),
        ledgerIds: new Set(Object.keys(asRecord(ledger))),
        makes,
        maxStreak,
        catCounts: computeCatCounts(completedSafe, getExerciseCategory),
        exCounts: computeExCounts(completedSafe),
        styleMakes: computeShotStyleMakes(sl),
      };
    } catch (e) {
      console.error("[fkh] progress context failed", e);
      return {
        earnedBadgeIds: new Set(earnedBadges),
        ledgerIds: new Set(),
        makes: 0,
        maxStreak: 0,
        catCounts: {},
        exCounts: {},
        styleMakes: {},
      };
    }
  },[earnedBadges, completedSafe, getExerciseCategory, ledger, shotLogTick]);

  const tracksComplete = useMemo(
    () => PATHS.filter(t => trackStageProgress(t, progressCtx).reached >= t.stages.length).length,
    [progressCtx]
  );

  // Progress Journey view-model for Me › Progress — reframes existing training
  // data (completed drills, shots, badges, ledger, XP) as identity + growth.
  // Pure derivation, no new tracking. Level context comes from LEVELS here
  // since that table lives in this file.
  const progressJourney = useMemo(() => {
    const nextLv = LEVELS.find(l => l.rank === currentLevel.rank + 1) || null;
    const levelContext = nextLv ? {
      nextLevelName: nextLv.name,
      nextLevelEmoji: nextLv.emoji,
      xpToNext: Math.max(0, nextLv.xpMin - xpData.total),
      xpInto: xpData.total - currentLevel.xpMin,
      xpSpan: nextLv.xpMin - currentLevel.xpMin,
      pct: Math.min(1, (xpData.total - currentLevel.xpMin) / Math.max(1, nextLv.xpMin - currentLevel.xpMin)),
    } : null;
    return buildProgressJourney({
      completed: completedSafe,
      shotLog: readShotLog(),
      getCategory: getExerciseCategory,
      settings,
      earnedBadges,
      badgeDates: badgeDates || {},
      ledger: ledger || {},
      catCounts: progressCtx.catCounts,
      programProgress: programProgressSafe,
      programs: PROGRAMS,
      badgesDef: BADGES_DEF,
      levelContext,
    });
  }, [completedSafe, settings, earnedBadges, badgeDates, ledger, progressCtx, programProgressSafe, currentLevel, xpData.total, shotLogTick]);

  // Progression ledger — the single grant path.
  // journey milestones/titles/cosmetics, syncs to the cloud ledger, and celebrates
  // newly reached ranks with the same confetti moment as badges.
  useEffect(()=>{
    try {
      const earnedAll = new Set([...earnedBadges, ...evaluateEarned(progressCtx)]);
      const owned = ledgerIdSet(readLocalLedger());
      const entries = grantEntries(earnedAll, owned, {});
      if (!entries.length) return;
      mergeIntoLocalLedger(entries);
      setLedger(readLocalLedger());
      pushLedgerEntries(entries).catch(()=>{});
      const milestoneDefs = entries
        .filter(e => e.kind === "milestone")
        .map(e => { const m = getAchievementMeta(e.achievement_id); return m && { id: m.id, name: m.name, emoji: m.emoji, color: m.color, desc: m.flavor, kind: "milestone", conquest: m.conquest, inspo: m.inspo }; })
        .filter(Boolean);
      if (milestoneDefs.length) setCelebrationQueue(q=>[...q, ...milestoneDefs]);
    } catch (e) {
      console.error("[fkh] ledger grant failed", e);
    }
  },[progressCtx, earnedBadges]);

  // On open: claim any challenge rewards earned (server-validated, immediate),
  // then pull the cloud ledger so progression + new rewards follow across devices.
  useEffect(()=>{
    claimChallengeRewards()
      .catch(()=>0)
      .then(()=>pullLedger())
      .then(()=>setLedger(readLocalLedger()))
      .catch(()=>{});
  },[]);

  // Equip system — ownership is the ledger; equipped state lives in settings and
  // is mirrored to the profile so friends/boards see it.
  const ledgerSet = useMemo(()=>ledgerIdSet(ledger),[ledger]);
  const persistEquip = useCallback((next)=>{
    setSettings(next);
    pushEquippedIdentity({ activeTitle: next.activeTitle, equipped: next.equipped }).catch(()=>{});
  },[]);
  const handleEquipTitle = useCallback(id=>persistEquip(equipTitle(settings, id, ledgerSet)),[settings, ledgerSet, persistEquip]);
  const handleEquipCosmetic = useCallback(id=>persistEquip(equipCosmetic(settings, id, ledgerSet)),[settings, ledgerSet, persistEquip]);
  const handleUnequipSlot = useCallback(slot=>persistEquip(unequipSlot(settings, slot)),[settings, persistEquip]);

  // Log a benchmark test → update PB, append to the cloud series, and (if the
  // threshold is met) certify it as an equippable title via the one grant path.
  const handleLogBenchmark = useCallback((benchmarkId, value)=>{
    const b = getBenchmark(benchmarkId);
    if (!b || !Number.isFinite(value)) return;
    setBenchmarkPBs(recordLocalPB(benchmarkId, value));
    recordBenchmark(benchmarkId, value).catch(()=>{});
    const certId = benchmarkCertTitle(b, value);
    if (!certId) return;
    const owned = ledgerIdSet(readLocalLedger());
    const entries = grantEntries(new Set([certId]), owned, { context:{ benchmark: benchmarkId, value } });
    if (!entries.length) return;
    mergeIntoLocalLedger(entries);
    setLedger(readLocalLedger());
    pushLedgerEntries(entries).catch(()=>{});
    const m = getAchievementMeta(certId);
    if (m) setCelebrationQueue(q=>[...q, { id:m.id, name:m.name, emoji:m.emoji, color:m.color,
      desc:`Certified: ${b.label} ${value}${b.unit}`, kind:"milestone" }]);
  },[]);

  /* Daily Mission contract — see dailyMission.js. Generated once per calendar day;
     enrollment, completions, and profile changes must not regenerate today's mission. */
  const todayMission = useMemo(() => {
    const fallback = {
      date: today,
      title: "Daily Training",
      tasks: [{
        id: "task-fallback",
        type: "category",
        label: "Complete 3 drills from Programs",
        exercises: [],
        target: 3,
        required: true,
      }],
      bonusXP: 50,
    };
    try {
      const { mission } = getOrCreateDailyMission({
        missionLog: missionLogSafe,
        today,
        generate: () => generateDailyMission(
          today,
          settings,
          completedSafe,
          enrolledProgramsSafe,
          programProgressSafe,
        ),
      });
      return mission || fallback;
    } catch (e) {
      console.error("[fkh] daily mission generation failed", e);
      return fallback;
    }
  // completedSafe / programProgressSafe intentionally omitted: regenerating from
  // live completion state was flipping the mission mid-day. First generation
  // still sees them via the generate closure when there is no cache yet.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- freeze mission for the calendar day
  }, [today, settings, enrolledProgramsSafe, missionLogSafe]);

  // Persist a freshly generated mission into missionLog once (cloud-synced via fkh-missions).
  useEffect(() => {
    const cached = missionLogSafe[today]?.mission;
    if (cached?.date === today && Array.isArray(cached.tasks) && cached.tasks.length) return;
    if (!todayMission?.tasks?.length || todayMission.date !== today) return;
    setMissionLog((prev) => {
      if (prev[today]?.mission?.date === today && prev[today]?.mission?.tasks?.length) return prev;
      return { ...prev, [today]: { ...prev[today], mission: todayMission } };
    });
  }, [today, todayMission, missionLogSafe]);

  const missionClaimed = !!missionLogSafe[today]?.claimed;

  const requiredTasksDone = useMemo(()=>
    todayMission.tasks.filter(t=>t.required).every(t=>{
      const {cur,target} = getMissionTaskProgress(t, completedSafe, today, programProgressSafe);
      return cur >= target;
    }),
  [todayMission, completedSafe, today, programProgressSafe]);

  const challengeProgress = useCallback((def, completedArg) => getChallengeProgress(def, completedArg, WORKOUTS), []);

  const challengeNudge = useMemo(
    () => pickChallengeNudge(CHALLENGES_DEF, challengeProgress, completedSafe),
    [completedSafe, challengeProgress]
  );

  const activeProgForMission = useMemo(() => {
    const dueList = [];
    for (const prog of PROGRAMS) {
      if (!enrolledProgramsSafe[prog.id]) continue;
      const due = findDueProgramSession(prog, enrolledProgramsSafe[prog.id], programProgressSafe, today);
      if (due) dueList.push({ prog, due });
    }
    const sorted = sortDueProgramEntries(dueList);
    return sorted[0]?.prog || PROGRAMS.find(p => enrolledProgramsSafe[p.id]) || null;
  }, [enrolledProgramsSafe, programProgressSafe, today]);

  const dueSessionForMission = useMemo(() => {
    if (!activeProgForMission) return null;
    const enrollment = enrolledPrograms[activeProgForMission.id];
    return findDueProgramSession(activeProgForMission, enrollment, programProgress, today);
  }, [activeProgForMission, enrolledPrograms, programProgress, today]);

  const missionHasProgramTask = todayMission.tasks.some(t => t.type === "program");

  const dailyAction = useMemo(() => resolveDailyAction({
    mission: todayMission,
    enrolledPrograms,
    programProgress,
    todayStr: today,
    challenges: CHALLENGES_DEF,
    getChallengeProgress: challengeProgress,
    completed,
    coachTemplateKey: coachRec?.templateKey,
    activeProgram: activeProgForMission,
    dueSession: dueSessionForMission,
  }), [todayMission, enrolledPrograms, programProgress, today, completed, coachRec, activeProgForMission, dueSessionForMission, challengeProgress]);

  useEffect(() => {
    if (auth.loading || !auth.isSignedIn || !auth.user?.id) return;
    refreshSquadNotifications();
    const retry = setTimeout(refreshSquadNotifications, 1500);
    return () => clearTimeout(retry);
  }, [auth.loading, auth.isSignedIn, auth.user?.id, refreshSquadNotifications]);

  useEffect(() => {
    if (auth.isSignedIn) refreshSquadNotifications();
  }, [view, auth.isSignedIn, refreshSquadNotifications]);

  /* The one place a pending navigation is applied. */
  useEffect(() => {
    if (!pendingNav) return;
    if (pendingNav.tab) setView(pendingNav.tab);
    if (pendingNav.focusMission) setHomeMissionFocus(true);
    if (pendingNav.openMessages) {
      setOpenMessagesInbox(true);
      setFriendsFocusTick(t => t + 1);
    }
    if (pendingNav.openFriends) setFriendsFocusTick(t => t + 1);
    if (pendingNav.openProgram) setSelectedProgram(pendingNav.openProgram);
    setPendingNav(null);
  }, [pendingNav]);

  useEffect(() => listenForNotificationNavigation(setPendingNav), []);

  useEffect(() => {
    const onShow = () => {
      const link = consumeNavigationDeepLink();
      if (link) setPendingNav(link);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  useEffect(() => {
    if (!auth.isSignedIn || auth.loading) return;
    let cancelled = false;
    (async () => {
      try {
        await applyCloudSync();
        if (cancelled) return;
        await claimChallengeRewards().catch(() => 0);
        await pullLedger().catch(() => {});
        if (!cancelled) setLedger(readLocalLedger());
      } catch (e) {
        console.error("[fkh] post-sign-in sync failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [auth.isSignedIn, auth.loading, applyCloudSync]);

  // Normalize legacy profile fields when Settings opens — local only, no cloud overwrite.
  useEffect(() => {
    const settingsOpen = showSettings || (view === "progress" && progressTab === "settings");
    if (!settingsOpen) return;
    try {
      setSettings(prev => {
        const next = migrateThemeSettings(normalizeProfileFields(prev));
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    } catch (e) {
      console.error("[fkh] settings normalize failed", e);
    }
  }, [showSettings, view, progressTab]);

  // Auto-sync the leaderboard on app open / sign-in (not just when Boards is
  // opened). Self-throttled to ~30 min, so it's cheap to fire here.
  useEffect(() => {
    maybeAutoSyncLeaderboard({
      settings, completed, missionLog, getCategory: getExerciseCategory, earnedBadges, ledger,
    }).catch(() => {});
  }, [auth.isSignedIn]);

  useEffect(() => {
    scheduleMissionReminder({
      missionComplete: missionClaimed,
      missionTitle: todayMission.title,
      athleteName: settings.athleteName,
    });
  }, [missionClaimed, todayMission.title, settings.athleteName]);

  // Reset per-day task celebration tracking at midnight rollover
  useEffect(() => {
    const stored = missionLog[today]?.celebratedTasks;
    if (stored?.length) {
      celebratedMissionTasksRef.current = new Set(stored);
    } else if (missionLog[today]?.claimed) {
      celebratedMissionTasksRef.current = new Set(todayMission.tasks.map(t => t.id));
    } else {
      celebratedMissionTasksRef.current = new Set();
    }
  }, [today, missionLog, todayMission.tasks]);

  // Toast when individual mission steps complete
  useEffect(() => {
    if (missionTaskToast) return;
    for (const task of todayMission.tasks) {
      if (celebratedMissionTasksRef.current.has(task.id)) continue;
      const { cur, target } = getMissionTaskProgress(task, completed, today, programProgress);
      if (cur >= target) {
        celebratedMissionTasksRef.current.add(task.id);
        setMissionLog(prev => ({
          ...prev,
          [today]: {
            ...(prev[today] || {}),
            celebratedTasks: [...celebratedMissionTasksRef.current],
          },
        }));
        setMissionTaskToast({ id: task.id, label: task.label });
        break;
      }
    }
  }, [todayMission, completed, today, programProgress, missionTaskToast]);

  // Auto-claim bonus XP when all required tasks complete + celebration popup
  useEffect(()=>{
    if (requiredTasksDone && !missionClaimed) {
      const entry = { claimed:true, bonusXP:todayMission.bonusXP, claimedAt:Date.now(),
        celebratedTasks: [...celebratedMissionTasksRef.current] };
      setMissionLog(prev => ({ ...prev, [today]: entry }));
      track(ANALYTICS_EVENTS.MISSION_CLAIM, { mission_day: today, bonus_xp: todayMission.bonusXP, title: todayMission.title });
      trackMissionCompleted({ missionDay: today, bonusXp: todayMission.bonusXP, title: todayMission.title });
      setMissionCelebration({ title: todayMission.title, bonusXP: todayMission.bonusXP });
    }
  },[requiredTasksDone, missionClaimed, today, todayMission.bonusXP, todayMission.title]);

  const catColor = key => key==="strength" ? ST : key==="speed"||key==="balance" ? P : S;
  const catBg    = key => `${catColor(key)}16`;
  const catBrd   = key => `${catColor(key)}2e`;

  const bd  = "rgba(255,255,255,0.07)";
  const lbl = { fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.18em",color:`${P}80`,marginBottom:10,textTransform:"uppercase" };
  const NAV = [
    {id:"home",     emoji:"☀️",label:"Today"},
    {id:"squad",    emoji:"👥",label:"Squad"},
    {id:"shots",    emoji:"🏀",label:"Shots"},
    {id:"programs", emoji:"📋",label:"Programs"},
    {id:"boards",  emoji:"🏆",label:"Challenges"},
    {id:"progress", emoji:"⭐",label:"Me"},
  ];

  const tourOverlay = tourActive ? (
    <OnboardingTour
      step={TOUR_STEPS[tourStep]}
      stepIndex={tourStep}
      stepCount={TOUR_STEPS.length}
      navTabs={NAV}
      P={P}
      SF={SF}
      onNext={advanceTour}
      onBack={backTour}
      onSkip={finishTour}
    />
  ) : null;

  const programDetailSheet = activeExercise ? (
    <ExerciseDetailSheet exercise={activeExercise} color={P} isSignedIn={auth.isSignedIn} onSavePlayer={openSavePlayer}
      bg2={SF} brd={bd} BG={BG} SF={SF}
      isDone={detailContext && !isWarmupExercise(activeExercise)
        ? isProgramExerciseDone(programProgress, detailContext.programId, detailContext.week, detailContext.sessionIdx, activeExercise.id)
        : isDone(activeExercise.id)}
      onToggle={()=>{
        if (detailContext && !isWarmupExercise(activeExercise)) toggleProgramExercise(detailContext, activeExercise.id);
        else toggle(activeExercise.id, detailContext ? "program_warmup" : undefined);
      }}
      onClose={closeDetail} onNext={nextExDetail?()=>setActiveExercise(nextExDetail):null}
      completed={completedSafe}
      favored={isFav("exercises",activeExercise.id)}
      onToggleFav={()=>toggleFav("exercises",activeExercise.id)}
      totalXP={xpData.total}
      {...detailSheetProps}/>
  ) : null;

  const renderBottomNav = () => (
    <div style={{ position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:680,background:NV,borderTop:`1px solid ${bd}`,display:"flex",zIndex:50,paddingBottom:"env(safe-area-inset-bottom, 0px)", pointerEvents:tourActive?"none":"auto", opacity:tourActive?0.92:1 }}>
      {NAV.map(n=>(
        <button key={n.id} onClick={()=>setView(n.id)} aria-label={`${n.emoji} ${n.label}`} style={{ flex:1,padding:"10px 0 12px",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
          <span style={{ position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:18 }}>{n.emoji}</span>
            {n.id === "squad" && squadNotifications > 0 && (
              <CountBadge count={squadNotifications} P={P} style={{ position:"absolute", top:-8, right:-12, minWidth:18, height:18, fontSize:10, padding:"0 5px", boxShadow:"0 0 0 2px var(--fkh-bg, #0b1220)" }} />
            )}
          </span>
          <span style={{ fontSize:9,color:view===n.id?P:"#475569",fontWeight:view===n.id?700:400,letterSpacing:"0.04em" }}>{n.label}</span>
          {view===n.id&&<div style={{ width:16,height:2,borderRadius:99,background:P,marginTop:1 }}/>}
        </button>
      ))}
    </div>
  );

  const renderMissionOverlays = () => (
    <>
      {missionCelebration&&<MissionCelebration
        title={missionCelebration.title} bonusXP={missionCelebration.bonusXP} color={P}
        onDismiss={()=>setMissionCelebration(null)}/>}
      {missionTaskToast&&<MissionTaskToast
        label={missionTaskToast.label}
        onDone={()=>setMissionTaskToast(null)}/>}
    </>
  );

  const shellOverlays = (
    <>
      {settingsSheet}{feedbackSheet}{authSheet}{guideSheet}
      {/* App-level: a buddy calling has to reach you wherever you are, not
          only on the Squad tab. */}
      <BuddyVideoInviteBanner P={P} isSignedIn={auth.isSignedIn} />
      <LiveClassBanner P={P} isSignedIn={auth.isSignedIn} />
      {pendingClassId && (
        <SharedClassSheet P={P} SF={surf(settings)} classId={pendingClassId}
          isSignedIn={auth.isSignedIn}
          onOpenAuth={(mode)=>{ setAuthInitialMode(mode); setShowAuth(true); }}
          onClose={()=>setPendingClassId(null)} />
      )}
      {coachRoom && (
        <Suspense fallback={null}>
          <CoachClassRoom P={P} klass={coachRoom} onClose={()=>setCoachRoom(null)} />
        </Suspense>
      )}
      {showCoachPanel && (
        <CoachPanel P={P} SF={surf(settings)}
          onClose={()=>setShowCoachPanel(false)}
          onOpenClass={(c)=>{ setShowCoachPanel(false); setCoachRoom(c); }} />
      )}
      {showPlayLikePicker && (
        <PlayLikePickerSheet
          open={showPlayLikePicker}
          onClose={() => setShowPlayLikePicker(false)}
          value={settings.favoritePlayLike || ""}
          onChange={v => setSettings(s => ({ ...s, favoritePlayLike: v }))}
          accent={P}
        />
      )}
      {showWhatsNew && (
        <WhatsNewSheet P={P} SF={SF} onClose={() => setShowWhatsNew(false)} onDismiss={dismissWhatsNew} />
      )}
      {playerHighlight && (
        <HighlightVideoSheet
          videoId={playerHighlight.videoId}
          title={playerHighlight.title}
          color={P}
          BG={BG}
          onClose={() => setPlayerHighlight(null)}
        />
      )}
      {showCoachFKH && (
        <CoachFKHSheet
          open={showCoachFKH}
          onClose={() => {
            setShowCoachFKH(false);
            setCoachInitialQuery(null);
            // Don't auto-start the guided tour — first practice comes first.
            // Tour prompt appears after the first completed drill.
            if (tourPendingAfterCoach) setTourPendingAfterCoach(false);
          }}
          P={P}
          SF={SF}
          bd={bd}
          athleteContext={coachAthleteContext}
          isSignedIn={auth.isSignedIn}
          initialQuery={coachInitialQuery}
          onOpenProgram={(id) => { setSelectedProgram(id); setView("programs"); setShowCoachFKH(false); }}
          onOpenExercise={(id) => { const ex = ALL_EXERCISES[id]; if (ex) openDetail(ex); setShowCoachFKH(false); }}
        />
      )}
      {celebrationQueue.length>0&&<BadgeCelebration badge={celebrationQueue[0]} onDismiss={()=>setCelebrationQueue(q=>q.slice(1))}/>}
      {renderMissionOverlays()}
      {tourOverlay}
    </>
  );

  /* PROGRAMS */
  if (view==="programs") {
    return (
      <ProgramsView
        onOpenCoach={() => setShowCoachFKH(true)}
        programs={PROGRAMS}
        settings={settings}
        enrolledPrograms={enrolledPrograms}
        setEnrolledPrograms={setEnrolledPrograms}
        programProgress={programProgress}
        setProgramProgress={setProgramProgress}
        programSegment={programSegment}
        setProgramSegment={setProgramSegment}
        programsHubSection={programsHubSection}
        setProgramsHubSection={setProgramsHubSection}
        recommendedProgramIds={recommendedProgramIds}
        earnedBadges={earnedBadges}
        selectedProgram={selectedProgram}
        setSelectedProgram={setSelectedProgram}
        allExercises={ALL_EXERCISES}
        exerciseMeta={EXERCISE_META}
        cats={CATS}
        workouts={WORKOUTS}
        schedule={SCHEDULE}
        workoutTemplates={WORKOUT_TEMPLATES}
        favorites={favorites}
        todayMission={todayMission}
        searchExercises={searchExercises}
        onPickCategory={(cat) => { setActiveCat(cat); setPrevView("programs"); setView("cat"); }}
        startQuickWorkout={startQuickWorkout}
        P={P}
        BG={BG}
        SF={SF}
        bd={bd}
        shellOverlays={shellOverlays}
        detailSheet={programDetailSheet}
        renderBottomNav={renderBottomNav}
        setShowSettings={openSettingsTab}
        onOpenGuide={() => openGuide("explore")}
        isFav={isFav}
        toggleFav={toggleFav}
        openDetail={openDetail}
        toggle={toggle}
        toggleProgramExercise={toggleProgramExercise}
        isDone={isDone}
        completed={completedSafe}
      />
    );
  }

  /* SQUAD */
  if (view === "squad") {
    return (
      <SquadView
        onOpenCoach={() => setShowCoachFKH(true)}
        settings={settings}
        completed={completedSafe}
        missionLog={missionLog}
        getCategory={getExerciseCategory}
        earnedBadges={earnedBadges}
        ledger={ledger}
        personalChallenges={personalChallenges}
        currentLevel={currentLevel}
        xpData={xpData}
        P={P}
        BG={BG}
        SF={SF}
        bd={bd}
        lbl={lbl}
        initialInviteCode={inviteCode}
        isSignedIn={auth.isSignedIn}
        onOpenAuth={() => { setAuthInitialMode("signup"); setShowAuth(true); }}
        focusFriendsTick={friendsFocusTick}
        onPushSuccess={() => setPushError(null)}
        unreadMessages={unreadMessages}
        friendRequests={friendRequests}
        feedActivity={feedActivity}
        challengeActivity={challengeActivity}
        squadNotifications={squadNotifications}
        onSquadTabSeen={markSquadTabSeen}
        onUnreadRefresh={refreshSquadNotifications}
        onOpenGuide={() => openGuide("explore")}
        openMessagesInbox={openMessagesInbox}
        onMessagesInboxOpened={() => setOpenMessagesInbox(false)}
        shellOverlays={shellOverlays}
        renderBottomNav={renderBottomNav}
      />
    );
  }

  /* SHOTS */
  if (view==="shots") return (
    <div style={{ background:BG,minHeight:"100vh",maxWidth:680,margin:"0 auto" }}>
      {shellOverlays}
      <ShotTrackerErrorBoundary P={P} onRepaired={() => setShotLogTick(t => t + 1)}>
        <ShotTracker P={P} S={S} BG={BG} athleteName={settings.athleteName} settings={settings}
          onLogChange={() => setShotLogTick(t => t + 1)}
          onOpenGuide={() => openGuide("explore")}
          onOpenCoach={() => setShowCoachFKH(true)} />
      </ShotTrackerErrorBoundary>
      {renderBottomNav()}
    </div>
  );

  /* ME */
  if (view==="progress") {
    return (
      <MeView
        settings={settings}
        progressTab={progressTab}
        setProgressTab={setProgressTab}
        xpData={xpData}
        currentLevel={currentLevel}
        journey={progressJourney}
        onStartPractice={() => setView("home")}
        earnedBadges={earnedBadges}
        completed={completedSafe}
        programProgress={programProgress}
        badgeDates={badgeDates}
        totalBadges={totalBadges}
        tracksComplete={tracksComplete}
        totalTracks={totalTracks}
        programs={PROGRAMS}
        allExercises={ALL_EXERCISES}
        progressCtx={progressCtx}
        ledgerSet={ledgerSet}
        ledger={ledger}
        benchmarkPBs={benchmarkPBs}
        growthLog={growthLog}
        lockerBadgesOpen={lockerBadgesOpen}
        setLockerBadgesOpen={setLockerBadgesOpen}
        P={P}
        S={S}
        ST={ST}
        BG={BG}
        SF={SF}
        bd={bd}
        lbl={lbl}
        shellOverlays={shellOverlays}
        BadgesView={BadgesView}
        ProgressStatsPanel={ProgressStatsPanel}
        onOpenGuide={() => openGuide("explore")}
        setSettings={setSettings}
        onOpenFeedback={openFeedback}
        onOpenWhatsNew={openWhatsNew}
        onOpenAuth={() => setShowAuth(true)}
        onCloudSync={applyCloudSync}
        cloudSyncStatus={auth.syncStatus}
        cloudSyncDetail={auth.syncDetail}
        onLogout={async () => { await auth.logout(); }}
        avatarUrl={avatarUrl}
        onAvatarChange={bumpAvatar}
        isSignedIn={auth.isSignedIn}
        signedInUsername={auth.username}
        onViewHistory={() => { setPrevView("progress"); setView("history"); }}
        onOpenSchedule={() => openSchedule("progress", "calendar")}
        onViewReport={() => { setPrevView("progress"); setView("report"); }}
        onViewLeaderboard={() => setView("boards")}
        pushError={pushError}
        onLogBenchmark={handleLogBenchmark}
        onEquipTitle={handleEquipTitle}
        onEquipCosmetic={handleEquipCosmetic}
        onUnequipSlot={handleUnequipSlot}
        onLogHeight={handleLogHeight}
        onOpenPlayerHighlight={openPlayerHighlight}
        onOpenExercise={exId => {
          const ex = ALL_EXERCISES[exId];
          if (ex) openDetail({ ...ex, meta: EXERCISE_META[exId] || {} }, []);
        }}
        onOpenShots={() => setView("shots")}
        onOpenCoach={() => setShowCoachFKH(true)}
        renderBottomNav={renderBottomNav}
      />
    );
  }

  /* HISTORY */
  if (view==="history") return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif", background:BG, color:"var(--fkh-text)", minHeight:"100vh", maxWidth:680, margin:"0 auto", paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      {shellOverlays}
      <HistoryView
        completed={completedSafe} badgeDates={badgeDates} settings={settings}
        allExercises={ALL_EXERCISES}
        P={P} BG={BG} SF={SF} bd={bd} lbl={lbl}
        onBack={() => setView(prevView === "progress" ? "progress" : "home")}/>
      {renderBottomNav()}
    </div>
  );

  /* CHALLENGES */
  if (view==="boards") {
    return (
      <ChallengesView
        onOpenCoach={() => setShowCoachFKH(true)}
        settings={settings}
        completed={completedSafe}
        missionLog={missionLog}
        getCategory={getExerciseCategory}
        earnedBadges={earnedBadges}
        ledger={ledger}
        personalChallenges={personalChallenges}
        currentLevel={currentLevel}
        xpData={xpData}
        P={P}
        BG={BG}
        SF={SF}
        bd={bd}
        lbl={lbl}
        initialInviteCode={inviteCode}
        isSignedIn={auth.isSignedIn}
        onOpenAuth={() => { setAuthInitialMode("signup"); setShowAuth(true); }}
            onAddFriends={focusSquad}
        focusFriendsTick={friendsFocusTick}
        onPushSuccess={() => setPushError(null)}
        onOpenGuide={() => openGuide("explore")}
        shellOverlays={shellOverlays}
        renderBottomNav={renderBottomNav}
        progressCtx={progressCtx}
      />
    );
  }


  /* CATEGORY DRILLS */
  if (view==="cat" && activeCat) {
    const color = catColor(activeCat), bg2 = catBg(activeCat), brd = catBrd(activeCat);
    const isStrength = activeCat==="strength";
    const filteredWorkouts = isStrength
      ? (WORKOUTS.strength.filter(w=>STR_DAYS[strDay]?.ids.includes(w.id)).concat(WORKOUTS.strength.filter(w=>w.id==="str-full")))
      : WORKOUTS[activeCat];
    return (
      <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:BG,color:"var(--fkh-text)",minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}>
        {shellOverlays}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:`2px solid ${color}40`,position:"sticky",top:0,background:NV,backdropFilter:"blur(10px)",zIndex:10 }}>
          <button onClick={()=>setView(prevView)} style={{ background:`${color}14`,border:`1px solid ${color}30`,borderRadius:8,color,fontSize:12,fontWeight:700,cursor:"pointer",padding:"5px 10px",letterSpacing:"0.02em" }}>← Back</button>
          <span style={{ fontSize:15,fontWeight:800,color,letterSpacing:"-0.01em" }}>{CATS[activeCat].emoji} {CATS[activeCat].label}</span>
          <button onClick={openSettingsTab} style={{ background:`${color}14`,border:`1px solid ${color}30`,borderRadius:8,color,fontSize:16,cursor:"pointer",padding:"5px 8px" }}>⚙</button>
        </div>

        {/* Strength day picker */}
        {isStrength && (
          <div style={{ padding:"12px 16px 0" }}>
            <div style={lbl}>Training Program — Select Day</div>
            <div style={{ display:"flex",gap:8,marginBottom:14 }}>
              {Object.keys(STR_DAYS).map((key)=>(
                <button key={key} onClick={()=>setStrDayPersist(key)} style={{ flex:1,padding:"10px 8px",borderRadius:12,border:`1px solid ${strDay===key?color:bd}`,background:strDay===key?`${color}18`:"transparent",color:strDay===key?color:"#475569",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center",lineHeight:1.3 }}>
                  <div style={{ fontSize:16,marginBottom:3 }}>{key==="Day 1"?"💪":key==="Day 2"?"🎯":"⚡"}</div>
                  {key}
                  <div style={{ fontSize:9,color:`${color}99`,marginTop:2 }}>{key==="Day 1"?"Strength/Core":key==="Day 2"?"Balance/Move":"Power/Athletic"}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding:"0 16px 80px" }}>
          {filteredWorkouts.map(w => (
            <DrillCard key={w.id} w={w} color={color} bg2={bg2} brd={brd} isDone={isDone(w.id)} onToggle={()=>toggle(w.id)}
              onViewDetail={()=>openDetail(w, filteredWorkouts)}
              favored={isFav("exercises",w.id)} onFav={()=>toggleFav("exercises",w.id)}/>
          ))}
        </div>
        {activeExercise&&<ExerciseDetailSheet isSignedIn={auth.isSignedIn} onSavePlayer={openSavePlayer}
          exercise={activeExercise} color={catColor(activeExercise._cat)}
          bg2={catBg(activeExercise._cat)} brd={catBrd(activeExercise._cat)}
          BG={BG} SF={SF} isDone={isDone(activeExercise.id)}
          onToggle={()=>toggle(activeExercise.id)}
          onClose={closeDetail}
          onNext={nextExDetail?()=>setActiveExercise(nextExDetail):null}
          completed={completedSafe}
          favored={isFav("exercises",activeExercise.id)}
          onToggleFav={()=>toggleFav("exercises",activeExercise.id)}
          navLabel={activeCat&&CATS[activeCat]?`${CATS[activeCat].emoji} ${CATS[activeCat].label}`:undefined}
          totalXP={xpData.total}
          {...detailSheetProps}/>}
        {renderBottomNav()}
      </div>
    );
  }

  /* REPORT */
  if (view==="report") {
    const report = buildReport(reportPeriod, completed, badgeDates, enrolledPrograms, favorites, programProgress);
    const insights = generateInsights(report, reportPeriod);
    const periodLabel = reportPeriod==="7d"?"Last 7 Days":reportPeriod==="30d"?"Last 30 Days":"All Time";
    /* Section and Stat used to be declared here, inside the render. React saw a
       new component type every pass and remounted the whole report subtree, so
       they are ReportSection / ReportStat at module scope now. */

    return (
      <div style={{ background:BG,minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:80 }}>
        {shellOverlays}
        {celebrationQueue.length>0&&<BadgeCelebration badge={celebrationQueue[0]} onDismiss={()=>setCelebrationQueue(q=>q.slice(1))}/>}
        {renderMissionOverlays()}
        {activeExercise&&<ExerciseDetailSheet exercise={activeExercise} color={P} isSignedIn={auth.isSignedIn} onSavePlayer={openSavePlayer}
          bg2={SF} brd={bd} BG={BG} SF={SF}
          isDone={isDone(activeExercise.id)} onToggle={()=>toggle(activeExercise.id)}
          onClose={closeDetail} onNext={nextExDetail?()=>setActiveExercise(nextExDetail):null}
          completed={completedSafe}
          favored={isFav("exercises",activeExercise.id)}
          onToggleFav={()=>toggleFav("exercises",activeExercise.id)}
          totalXP={xpData.total}
          {...detailSheetProps}/>}

        {/* Header */}
        <div style={{ padding:"20px 18px 14px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4 }}>
            <div>
              <button onClick={() => setView(prevView === "progress" ? "progress" : "home")}
                style={{ marginBottom:10,padding:"5px 12px",borderRadius:8,border:`1px solid ${P}30`,background:`${P}14`,color:P,fontSize:11,fontWeight:700,cursor:"pointer" }}>
                ← {prevView === "progress" ? "Me" : "Home"}
              </button>
              <h1 style={{ fontSize:22,fontWeight:800,color:"var(--fkh-text)",margin:0 }}>📈 Progress Report</h1>
              <p style={{ fontSize:12,color:"#64748b",margin:"4px 0 0" }}>{settings.athleteName} · {periodLabel}</p>
            </div>
            <button onClick={openSettingsTab} style={{ padding:"8px 10px",borderRadius:10,border:`1px solid ${bd}`,background:SF,color:"#64748b",fontSize:14,cursor:"pointer" }}>⚙️</button>
          </div>
          {/* Period selector */}
          <div style={{ display:"flex",gap:6,marginTop:10 }}>
            {[["7d","7 Days"],["30d","30 Days"],["all","All Time"]].map(([key,label])=>(
              <button key={key} onClick={()=>setReportPeriod(key)}
                style={{ flex:1,padding:"9px 0",borderRadius:10,fontSize:11,fontWeight:700,cursor:"pointer",border:"none",
                  ...(reportPeriod===key
                    ? { background:P, color:"#000" }
                    : chipStyle(settings, false, P)) }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 💡 Coach FKH Insights — at the top for impact */}
        <ReportSection surface={SF} emoji="💡" title="Coach FKH Insights">
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {insights.length>0 ? insights.map((ins,i)=>(
              <div key={i} style={{ display:"flex",gap:10,alignItems:"flex-start",padding:"9px 11px",borderRadius:10,background:`${P}0d`,border:`1px solid ${P}20` }}>
                <div style={{ width:20,height:20,borderRadius:6,background:`${P}20`,border:`1px solid ${P}35`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:P,flexShrink:0,marginTop:1 }}>{i+1}</div>
                <span style={{ fontSize:12,color:"var(--fkh-text)",lineHeight:1.55 }}>{ins}</span>
              </div>
            )) : (
              <div style={{ fontSize:12,color:"#475569",textAlign:"center",padding:"8px 0" }}>Train more to unlock insights. 🏀</div>
            )}
          </div>
        </ReportSection>

        {/* 🏋️ Training Overview */}
        <ReportSection surface={SF} emoji="🏋️" title="Training">
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10 }}>
            <ReportStat accent={P} label="Days" value={report.training.days}/>
            <ReportStat accent={P} label="Exercises" value={report.training.exercises}/>
            <ReportStat accent={P} label="Minutes" value={report.training.minutes}/>
          </div>
        </ReportSection>

        {/* 🏀 Shots Made */}
        <ReportSection surface={SF} emoji="🏀" title="Shots Made">
          {report.shots.total===0
            ? <div style={{ fontSize:12,color:"#475569",textAlign:"center" }}>No shots logged this period.</div>
            : <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10 }}>
                <ReportStat accent={P} label="Total Makes" value={report.shots.total.toLocaleString()}/>
                <ReportStat accent={P} label="Daily Avg" value={report.shots.average}/>
                <ReportStat accent={P} label="Best Day" value={report.shots.bestDay} sub={report.shots.bestDayDate ? new Date(report.shots.bestDayDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}) : ""}/>
              </div>
          }
        </ReportSection>

        {/* 🔥 Streaks */}
        <ReportSection surface={SF} emoji="🔥" title="Streaks">
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10 }}>
            <ReportStat accent={P} label="Current" value={`${report.streaks.current}d`}/>
            <ReportStat accent={P} label="Best This Period" value={`${report.streaks.longest}d`}/>
            <ReportStat accent={P} label="Training Days" value={report.streaks.days}/>
          </div>
        </ReportSection>

        {/* ⭐ Level Progress */}
        <ReportSection surface={SF} emoji="⭐" title="Level Progress">
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10 }}>
            <span style={{ fontSize:28 }}>{currentLevel.emoji}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14,fontWeight:800,color:"var(--fkh-text)" }}>{currentLevel.name}</div>
              <div style={{ fontSize:11,color:"#64748b" }}>
                {reportPeriod!=="all" ? `+${report.periodXP} XP earned this period` : `${xpData.total} XP total`}
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:18,fontWeight:800,fontFamily:"'DM Mono',monospace",color:P }}>{xpData.total.toLocaleString()}</div>
              <div style={{ fontSize:9,color:"#475569" }}>TOTAL XP</div>
            </div>
          </div>
          {(()=>{
            const nextLv = LEVELS.find(l=>l.xpMin>xpData.total);
            if (!nextLv) return <div style={{ fontSize:11,color:"#22c55e",fontWeight:700 }}>🏆 Max Level Achieved!</div>;
            const pct = Math.round(((xpData.total-currentLevel.xpMin)/(nextLv.xpMin-currentLevel.xpMin))*100);
            return (
              <>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                  <span style={{ fontSize:10,color:"#64748b" }}>→ {nextLv.emoji} {nextLv.name}</span>
                  <span style={{ fontSize:10,color:P,fontWeight:700 }}>{pct}%</span>
                </div>
                <div style={{ height:5,borderRadius:99,background:"rgba(255,255,255,0.07)" }}>
                  <div style={{ height:"100%",width:`${pct}%`,borderRadius:99,background:`linear-gradient(90deg,${P},${S})` }}/>
                </div>
                <div style={{ fontSize:10,color:"#475569",marginTop:6 }}>{nextLv.xpMin-xpData.total} XP to {nextLv.name}</div>
              </>
            );
          })()}
        </ReportSection>

        {/* 📈 Category Breakdown */}
        <ReportSection surface={SF} emoji="📈" title="Category Breakdown">
          {report.training.exercises===0
            ? <div style={{ fontSize:12,color:"#475569",textAlign:"center" }}>No exercises logged this period.</div>
            : <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {report.categories.filter(c=>c.count>0).sort((a,b)=>b.count-a.count).map(cat=>(
                  <div key={cat.key}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                      <span style={{ fontSize:12,fontWeight:600,color:"var(--fkh-text)" }}>{cat.emoji} {cat.label}</span>
                      <span style={{ fontSize:11,color:P,fontWeight:700 }}>{cat.count} · {cat.pct}%</span>
                    </div>
                    <div style={{ height:5,borderRadius:99,background:"rgba(255,255,255,0.07)" }}>
                      <div style={{ height:"100%",width:`${cat.pct}%`,borderRadius:99,background:P,minWidth:cat.count>0?4:0 }}/>
                    </div>
                  </div>
                ))}
                {report.categories.every(c=>c.count===0) && <div style={{ fontSize:12,color:"#475569",textAlign:"center" }}>No basketball-specific categories tracked yet.</div>}
              </div>
          }
        </ReportSection>

        {/* 🏆 Achievements */}
        <ReportSection surface={SF} emoji="🏆" title="Achievements">
          <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
            {/* Badges earned in period */}
            <div>
              <div style={{ fontSize:10,color:"#64748b",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em" }}>Badges Earned{reportPeriod!=="all"?` This ${reportPeriod==="7d"?"Week":"Month"}`:""}</div>
              {report.badges.length>0
                ? <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                    {report.badges.map(b=>(
                      <div key={b.id} style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:20,
                        background:`${b.color||P}15`,border:`1px solid ${b.color||P}30` }}>
                        <span style={{ fontSize:14 }}>{b.emoji}</span>
                        <span style={{ fontSize:11,fontWeight:700,color:b.color||P }}>{b.name}</span>
                      </div>
                    ))}
                  </div>
                : <div style={{ fontSize:11,color:"#334155" }}>No badges earned this period yet.</div>
              }
            </div>
            {/* Programs */}
            <div>
              <div style={{ fontSize:10,color:"#64748b",fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em" }}>Programs Completed</div>
              {report.completedPrograms.length>0
                ? <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                    {report.completedPrograms.map(p=>(
                      <div key={p.id} style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 10px",borderRadius:20,
                        background:`${p.color}15`,border:`1px solid ${p.color}30` }}>
                        <span style={{ fontSize:14 }}>{p.emoji}</span>
                        <span style={{ fontSize:11,fontWeight:700,color:p.color }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                : <div style={{ fontSize:11,color:"#334155" }}>No programs completed yet.</div>
              }
            </div>
            {/* Challenges */}
            <div>
              <div style={{ fontSize:10,color:"#64748b",fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em" }}>Challenges Completed</div>
              <div style={{ fontSize:22,fontWeight:800,fontFamily:"'DM Mono',monospace",color:P }}>{report.completedChallenges.length}<span style={{ fontSize:11,color:"#475569",fontWeight:400,fontFamily:"sans-serif" }}> / {CHALLENGES_DEF.length}</span></div>
            </div>
          </div>
        </ReportSection>

        {/* 📌 Favorites */}
        <ReportSection surface={SF} emoji="📌" title="Favorites">
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {[
              { label:"Most Completed (All Time)", value: report.mostCompleted ? `${report.mostCompleted.name} (${report.mostCompleted.count}×)` : "—" },
              { label:`Top Drill This ${reportPeriod==="7d"?"Week":reportPeriod==="30d"?"Month":"Period"}`, value: report.periodMostCompleted ? `${report.periodMostCompleted.name} (${report.periodMostCompleted.count}×)` : "—" },
              { label:"⭐ Starred Exercise", value: report.favExercise ? report.favExercise.name : "None yet — tap ☆ on any drill" },
              { label:"⭐ Starred Workout", value: report.favWorkout ? `${report.favWorkout.emoji} ${report.favWorkout.name}` : "None yet" },
              { label:"⭐ Starred Program", value: report.favProgram ? `${report.favProgram.emoji} ${report.favProgram.name}` : "None yet" },
            ].map(({label,value})=>(
              <div key={label} style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,
                padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ fontSize:11,color:"#64748b",flex:1 }}>{label}</span>
                <span style={{ fontSize:11,fontWeight:700,color:"var(--fkh-text)",textAlign:"right",maxWidth:"55%" }}>{value}</span>
              </div>
            ))}
          </div>
        </ReportSection>

        {renderBottomNav()}
      </div>
    );
  }

  /* SCHEDULE / CALENDAR (Tier 1 — expose existing views) */
  if (view==="schedule") {
    const scheduleBack = ["home", "profile", "progress", "report"].includes(prevView) ? prevView : "home";
    const scheduleBackLabel = scheduleBack === "progress" || scheduleBack === "profile" ? "Me"
      : scheduleBack === "report" ? "Report" : "Home";
    return (
      <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:BG,color:"var(--fkh-text)",minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}>
        {shellOverlays}
        {celebrationQueue.length>0&&<BadgeCelebration badge={celebrationQueue[0]} onDismiss={()=>setCelebrationQueue(q=>q.slice(1))}/>}
        {renderMissionOverlays()}
        {tourOverlay}
        <div style={{ padding:"16px 20px 12px",borderBottom:`1px solid ${P}14`,position:"sticky",top:0,background:BG,backdropFilter:"blur(10px)",zIndex:10 }}>
          <button onClick={()=>setView(scheduleBack)}
            style={{ marginBottom:10,padding:"5px 12px",borderRadius:8,border:`1px solid ${P}30`,background:`${P}14`,color:P,fontSize:11,fontWeight:700,cursor:"pointer" }}>
            ← {scheduleBackLabel}
          </button>
          <h1 style={{ fontSize:20,fontWeight:800,margin:0,color:"var(--fkh-text)" }}>🗓 Training Calendar</h1>
          <p style={{ fontSize:12,color:"#64748b",margin:"4px 0 0" }}>Weekly plan & training history</p>
          <div style={{ display:"flex",gap:8,marginTop:12 }}>
            {[
              { id:"week",     label:"📋 This Week" },
              { id:"calendar", label:"🗓 Calendar"   },
            ].map(t=>(
              <button key={t.id} onClick={()=>setSchedTab(t.id)}
                style={{ flex:1,padding:"9px 0",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",
                  ...(schedTab===t.id
                    ? { background:P, border:`1px solid ${P}`, color:"#000" }
                    : chipStyle(settings, false, P)) }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {schedTab==="week"&&(
          <div style={{ padding:"4px 20px 20px" }}>
            {(() => {
              const enrolledList = PROGRAMS.filter(p => enrolledPrograms[p.id]);
              if (!enrolledList.length) return null;
              return (
                <>
                  {enrolledList.length > 1 && (
                    <div style={{ ...lbl, marginTop: 4 }}>My Programs</div>
                  )}
                  {enrolledList.map(prog => {
                    const enrollment = enrolledPrograms[prog.id];
                    const weekPlan = buildProgramWeekPlan(prog, enrollment, programProgress, today);
                    if (!weekPlan) return null;
                    return (
                      <div key={prog.id} style={{ marginBottom:16,padding:"12px 14px",borderRadius:14,background:`${prog.color}0c`,border:`1px solid ${prog.color}33` }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:2 }}>
                          <span style={{ fontSize:16 }}>{prog.emoji}</span>
                          <span style={{ fontSize:12,fontWeight:700,color:"var(--fkh-text)" }}>{prog.name}</span>
                          <span style={{ fontSize:10,color:prog.color,fontWeight:700,marginLeft:"auto" }}>Week {weekPlan.curWeek}</span>
                        </div>
                        <ProgramWeekStrip plan={weekPlan} color={prog.color} />
                      </div>
                    );
                  })}
                </>
              );
            })()}

            {scheduleDetailDate && (
              <div style={{ marginBottom: 14 }}>
                <button type="button" onClick={() => setScheduleDetailDate(null)}
                  style={{ marginBottom: 8, padding:"5px 10px", borderRadius:8, border:`1px solid ${bd}`,
                    background:"transparent", color:"#64748b", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                  ← Back to week
                </button>
                <DayPlanPanel
                  plan={buildTrainingDayPlan(scheduleDetailDate, SCHEDULE, PROGRAMS, enrolledPrograms, programProgress, WORKOUTS)}
                  history={buildCalendarData(completed)[scheduleDetailDate] || null}
                  cats={CATS}
                  allExercises={ALL_EXERCISES}
                  workouts={WORKOUTS}
                  exerciseMeta={EXERCISE_META}
                  P={P}
                  SF={SF}
                  bd={bd}
                  onOpenCategory={cat => { setActiveCat(cat); setPrevView("schedule"); setView("cat"); }}
                  onOpenExercise={(ex, list, ctx) => openSessionWithWarmup(list || [ex], ctx, ex)}
                  onStartProgramSession={(exs, ctx) => openSessionWithWarmup(exs, ctx)}
                  onStartCustomWorkout={exList => openSessionWithWarmup(exList, null)}
                />
              </div>
            )}

            {!scheduleDetailDate && (
              <>
                <div style={lbl}>This Week&apos;s Plan</div>
                {(() => {
                  const weekDates = currentWeekDates(today);
                  const calData = buildCalendarData(completed);
                  return SCHEDULE.map((d, i) => {
                    const dateStr = weekDates[i];
                    const isToday = dateStr === today;
                    const dayPlan = buildTrainingDayPlan(dateStr, SCHEDULE, PROGRAMS, enrolledPrograms, programProgress, WORKOUTS);
                    const dayData = calData[dateStr];
                    const hasWork = d.cats.length > 0 || dayPlan.programSessions.length > 0 || (dayPlan.customSessions?.length || 0) > 0;
                    return (
                      <div key={i}
                        onClick={hasWork ? () => setScheduleDetailDate(dateStr) : undefined}
                        style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", borderRadius:10,
                          marginBottom:4,
                          background:isToday ? `${P}0e` : "transparent",
                          border:`1px solid ${isToday ? `${P}30` : "transparent"}`,
                          cursor:hasWork ? "pointer" : undefined }}>
                        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:11,
                          color:isToday ? P : `${P}99`, width:32, flexShrink:0, fontWeight:isToday ? 800 : 400 }}>
                          {d.day}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, color:isToday ? P : `${P}dd`, fontWeight:600 }}>{d.label}</div>
                          {dayPlan.programSessions.map(({ program, session, done }) => (
                            <div key={program.id} style={{ marginTop:6 }}>
                              <div style={{ fontSize:10, color:program.color, fontWeight:700 }}>
                                {program.emoji} {program.name} · {session.focus}{done ? " ✓" : ""}
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", gap:2, marginTop:4, paddingLeft:4 }}>
                                {session.exercises.slice(0, 4).map(exId => {
                                  const ex = ALL_EXERCISES[exId];
                                  if (!ex) return null;
                                  return (
                                    <div key={exId} style={{ fontSize:10, color:"#94a3b8" }}>{ex.name}</div>
                                  );
                                })}
                                {session.exercises.length > 4 && (
                                  <div style={{ fontSize:9, color:"#64748b" }}>+{session.exercises.length - 4} more</div>
                                )}
                              </div>
                            </div>
                          ))}
                          {(dayPlan.customSessions || []).map(cw => (
                            <div key={cw.id} style={{ fontSize:10, color:P, marginTop:4, fontWeight:700 }}>
                              {cw.emoji} {cw.name} · {cw.exerciseIds.length} drills
                            </div>
                          ))}
                        </div>
                        {dayData?.xp > 0 && (
                          <span style={{ fontSize:9, fontFamily:"'DM Mono',monospace", color:"#22c55e",
                            background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.2)",
                            borderRadius:20, padding:"2px 7px", flexShrink:0 }}>
                            +{dayData.xp} XP
                          </span>
                        )}
                        {isToday && !dayData && (
                          <span style={{ fontSize:9, fontWeight:800, color:P, letterSpacing:"0.06em", flexShrink:0 }}>TODAY</span>
                        )}
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end", maxWidth:120 }}>
                          {d.cats.map(c => (
                            <button key={c} type="button"
                              onClick={e => { e.stopPropagation(); setActiveCat(c); setPrevView("schedule"); setView("cat"); }}
                              style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background:catBg(c),
                                color:catColor(c), border:`1px solid ${catBrd(c)}`, fontWeight:600, cursor:"pointer" }}>
                              {CATS[c].emoji}
                            </button>
                          ))}
                        </div>
                        {hasWork && <span style={{ fontSize:16, color:`${P}80`, flexShrink:0, lineHeight:1 }}>›</span>}
                      </div>
                    );
                  });
                })()}
              </>
            )}
          </div>
        )}

        {schedTab==="calendar"&&(
          <CalendarView
            completed={completedSafe}
            P={P}
            S={S}
            BG={BG}
            SF={SF}
            bd={bd}
            lbl={lbl}
            schedule={SCHEDULE}
            programs={PROGRAMS}
            enrolledPrograms={enrolledPrograms}
            programProgress={programProgress}
            cats={CATS}
            allExercises={ALL_EXERCISES}
            workouts={WORKOUTS}
            onOpenCategory={cat => { setActiveCat(cat); setPrevView("schedule"); setView("cat"); }}
            onOpenExercise={(ex, list, ctx) => openSessionWithWarmup(list || [ex], ctx, ex)}
            onStartProgramSession={(exs, ctx) => openSessionWithWarmup(exs, ctx)}
          />
        )}

        {renderBottomNav()}
      </div>
    );
  }

  /* HOME */
  return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:BG,color:"var(--fkh-text)",minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      {shellOverlays}
      {activeExercise&&<ExerciseDetailSheet isSignedIn={auth.isSignedIn} onSavePlayer={openSavePlayer}
        exercise={activeExercise} color={catColor(activeExercise._cat)}
        bg2={catBg(activeExercise._cat)} brd={catBrd(activeExercise._cat)}
        BG={BG} SF={SF} isDone={isDone(activeExercise.id)}
        onToggle={()=>toggle(activeExercise.id)}
        onClose={closeDetail}
        onNext={nextExDetail?()=>setActiveExercise(nextExDetail):null}
        completed={completedSafe}
        favored={isFav("exercises",activeExercise.id)}
        onToggleFav={()=>toggleFav("exercises",activeExercise.id)}
        totalXP={xpData.total}
        {...detailSheetProps}/>}
      {celebrationQueue.length>0&&<BadgeCelebration badge={celebrationQueue[0]}
        onDismiss={()=>setCelebrationQueue(q=>q.slice(1))}/>}
      {renderMissionOverlays()}
      {tourOverlay}
      {showOnboarding && !auth.loading && (
        <OnboardingSheet
          P={P}
          onComplete={({ settings: patch, finalize = true }) => {
            setSettings(p => {
              const next = { ...p, ...patch };
              safePersistKey("s_settings", next, { force: true });
              return next;
            });
            if (!finalize) return;
            localStorage.setItem("s_onboarded", "1");
            markWhatsNewSeen(); // baseline release so brand-new athletes skip changelog
            track(ANALYTICS_EVENTS.ONBOARDING_COMPLETE, {});
            setShowOnboarding(false);
            setShowCoachIntro(true);
          }}
          onAuthSuccess={undefined}
          onForgotPasscode={() => { setAuthInitialMode("forgot"); setShowAuth(true); }}
        />
      )}
      {showCoachIntro && (
        <CoachIntroSheet
          P={P}
          athleteName={settings.athleteName}
          onPickPrompt={(q) => {
            setShowCoachIntro(false);
            setCoachInitialQuery({ intent: q.intent, label: q.label });
            setShowCoachFKH(true);
            setTourPendingAfterCoach(true);
          }}
          onSkip={() => { setShowCoachIntro(false); /* tour waits until after first practice */ }}
        />
      )}
      {/* One row: who you are, then the two things you can ask for anywhere.
          The app name used to sit above this and wrapped to two lines on a
          phone — it told a returning kid nothing they didn't know. */}
      <div style={{ padding:"14px 20px",borderBottom:`1px solid ${P}14` }}>
        <div style={{ display:"flex",alignItems:"center",gap:11 }}>
          <div onClick={()=>{ setView("progress"); setProgressTab("overview"); }}
            style={{ width:38,height:38,borderRadius:"50%",background:`${P}18`,flexShrink:0,
              border:`2px solid ${headerFrameColor || P}`,
              boxShadow:headerFrameColor ? `0 0 10px ${headerFrameColor}55` : "none",
              overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }}/> : <span style={{ fontSize:18 }}>👤</span>}
          </div>
          <div onClick={()=>{ setView("progress"); setProgressTab("overview"); }}
            style={{ flex:1,minWidth:0,cursor:"pointer" }}>
            <div style={{ fontSize:19,fontWeight:800,letterSpacing:"-0.02em",lineHeight:1.1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
              {settings.athleteName}
            </div>
            <div style={{ fontSize:10,fontFamily:"'DM Mono',monospace",color:P,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
              {currentLevel.emoji} {currentLevel.name.toUpperCase()} · {xpData.total} XP
            </div>
          </div>
          {isCoach && (
            <button type="button" onClick={()=>setShowCoachPanel(true)}
              aria-label="Coach tools"
              style={{ flexShrink:0, padding:"7px 10px", borderRadius:10, cursor:"pointer",
                border:`1px solid ${P}55`, background:`${P}18`, color:P,
                fontSize:11, fontWeight:800, whiteSpace:"nowrap" }}>
              📋 Classes
            </button>
          )}
          <CoachNavButton compact P={P} onClick={()=>setShowCoachFKH(true)} />
          <GuideNavButton compact onClick={() => openGuide("explore")} />
        </div>
      </div>


      {/* Badge Earned Notification Banner (home screen) */}
      {lastEarnedBadge && view==="home" && (
        <div style={{ margin:"10px 20px 0",padding:"12px 14px",borderRadius:14,
          background:`${lastEarnedBadge.color}12`,
          border:`1px solid ${lastEarnedBadge.color}35`,
          display:"flex",alignItems:"center",gap:12,
          animation:"fkh-fade-up 0.35s ease both" }}>
          <div style={{ width:38,height:38,borderRadius:12,flexShrink:0,
            background:`${lastEarnedBadge.color}20`,
            border:`1.5px solid ${lastEarnedBadge.color}50`,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:20,animation:"fkh-bounce 0.6s ease-out 0.1s both" }}>
            {lastEarnedBadge.emoji}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:11,fontWeight:800,color:lastEarnedBadge.color,
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2 }}>
              Badge Unlocked!
            </div>
            <div style={{ fontSize:13,fontWeight:700,color:"var(--fkh-text)",lineHeight:1.2 }}>
              {lastEarnedBadge.name}
            </div>
          </div>
          <button onClick={()=>{ setView("progress"); setProgressTab("locker"); setLastEarnedBadge(null); }}
            style={{ background:lastEarnedBadge.color,border:"none",color:"#000",fontSize:10,
              fontWeight:800,cursor:"pointer",borderRadius:20,padding:"5px 12px",
              whiteSpace:"nowrap",flexShrink:0 }}>
            View →
          </button>
          <button onClick={()=>setLastEarnedBadge(null)}
            style={{ background:"none",border:"none",color:"#475569",fontSize:16,
              cursor:"pointer",padding:0,lineHeight:1,flexShrink:0 }}>
            ✕
          </button>
        </div>
      )}

      <ViewErrorBoundary
        label="Today"
        title="Today couldn't load"
        message="Something broke on the home screen. Tap try again — if it keeps happening, open Me → Settings and export a backup."
        P={P}
        onRetry={() => setShotLogTick(t => t + 1)}
      >
        <TodayView
        settings={settings}
        P={P}
        S={S}
        ST={ST}
        BG={BG}
        SF={SF}
        NV={NV}
        bd={bd}
        today={today}
        growthLog={growthLog}
        schedule={SCHEDULE}
        todayMission={todayMission}
        missionClaimed={missionClaimed}
        requiredTasksDone={requiredTasksDone}
        completed={completedSafe}
        programProgress={programProgress}
        challengeNudge={challengeNudge}
        dailyAction={dailyAction}
        missionHasProgramTask={missionHasProgramTask}
        enrolledPrograms={enrolledPrograms}
        programs={PROGRAMS}
        progressCtx={progressCtx}
        showFindDrills={showFindDrills}
        onShowFindDrills={() => setShowFindDrills(true)}
        onHideFindDrills={() => setShowFindDrills(false)}
        onOpenProgramsSection={openProgramsSection}
        favorites={favorites}
        cats={CATS}
        workouts={WORKOUTS}
        allExercises={ALL_EXERCISES}
        exerciseMeta={EXERCISE_META}
        workoutTemplates={WORKOUT_TEMPLATES}
        searchExercises={searchExercises}
        onPickCategory={(cat) => { setActiveCat(cat); setPrevView("home"); setView("cat"); }}
        onOpenPath={openLegendsJourney}
        onSetFavorite={() => setShowPlayLikePicker(true)}
        onOpenPlayerHighlight={openPlayerHighlight}
        onFocusFriends={focusSquad}
        onOpenMessages={navigateToMessages}
        squadNotifications={squadNotifications}
        unreadMessages={unreadMessages}
        isSignedIn={auth.isSignedIn}
        onOpenAuth={() => setShowAuth(true)}
        onOpenChallenges={() => setView("boards")}
        workoutOpen={workoutOpen}
        onToggleWorkoutOpen={() => setWorkoutOpen(o => !o)}
        todaysWorkout={todaysWorkout}
        quickWorkoutComplete={quickWorkoutComplete}
        selectedTemplate={selectedTemplate}
        coachRec={coachRec}
        templateScrolledEnd={templateScrolledEnd}
        onTemplateScrolledEnd={setTemplateScrolledEnd}
        selectTemplate={selectTemplate}
        refreshWorkout={refreshWorkout}
        loadWorkoutForTemplate={loadWorkoutForTemplate}
        isDone={isDone}
        isFav={isFav}
        toggleFav={toggleFav}
        openDetail={openDetail}
        getMissionTaskProgress={getMissionTaskProgress}
        isProgramExerciseDone={isProgramExerciseDone}
        onOpenWorkout={() => setWorkoutOpen(true)}
        showTourPrompt={showTourPrompt && !tourActive && !showOnboarding}
        onStartTour={startTour}
        onOpenGuide={() => openGuide("tour")}
        onDismissTourPrompt={dismissTourPromptBanner}
        showNotificationPrompt={showNotificationPrompt && !tourActive && !showOnboarding}
        onEnableNotifications={enableNotificationsFromPrompt}
        onDismissNotificationPrompt={dismissNotificationPromptBanner}
        showGuestSavePrompt={!auth.isSignedIn && !auth.loading && !showOnboarding && !tourActive && !guestSaveDismissed && xpData.total > 0}
        guestSaveXp={xpData.total}
        guestSaveStreak={getStreak(completedSafe)}
        onSavePlayer={openSavePlayer}
        onDismissGuestSavePrompt={dismissGuestSavePrompt}
        onOpenSchedule={() => openSchedule("home", "week")}
        shotsToday={shotsToday}
        onQuickLogShots={quickLogShots}
        onOpenShots={() => setView("shots")}
        onOpenCoach={() => setShowCoachFKH(true)}
        coachMsg={coachMsg}
        focusMissionSection={homeMissionFocus}
        onMissionFocusHandled={() => setHomeMissionFocus(false)}
      />
      </ViewErrorBoundary>

      {renderBottomNav()}
    </div>
  );
}
