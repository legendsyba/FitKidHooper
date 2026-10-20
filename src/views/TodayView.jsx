import { useState, useEffect, useMemo } from "react";
import ProgressRail from "../components/ProgressRail.jsx";
import ChallengeStrip from "../components/ChallengeStrip.jsx";
import FriendsTeaser from "../components/FriendsTeaser.jsx";
import CountBadge from "../components/CountBadge.jsx";
import FindDrillsSheet from "../components/FindDrillsSheet.jsx";
import HomeCollapsibleSection from "../components/HomeCollapsibleSection.jsx";
import { recommendTrackForFavorite, getTrack, trackRankInfo } from "../lib/achievements.js";
import TourPromptBanner from "../components/TourPromptBanner.jsx";
import NotificationPromptBanner from "../components/NotificationPromptBanner.jsx";
import GuestSaveBanner from "../components/GuestSaveBanner.jsx";
import DayPlanPanel from "../components/DayPlanPanel.jsx";
import { buildTrainingDayPlan } from "../lib/trainingDayPlan.js";
import { withSessionWarmup, categoriesFromExercises } from "../lib/sessionWarmup.js";
import { trackCtaClicked } from "../lib/analytics.js";

const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
const pri = s => hsl(s.primaryHue ?? 38, s.primarySat ?? 92, s.primaryLight ?? 55);
const btn = s => hsl(s.buttonHue ?? 222, s.buttonSat ?? 38, s.buttonLight ?? 20);
const textMuted = s => hsl(s.textHue ?? 210, Math.max((s.textSat ?? 25) - 10, 0), Math.max((s.textLight ?? 94) - 30, 52));

function chipStyle(settings, selected, accent) {
  const a = accent || pri(settings);
  const b = btn(settings);
  return selected
    ? { background:`${a}20`, border:`1.5px solid ${a}`, color:a }
    : { background:`${b}2e`, border:`1.5px solid ${b}66`, color:textMuted(settings) };
}

function actionBtnStyle(settings) {
  const b = btn(settings);
  return { background:`${b}2e`, border:`1px solid ${b}66`, color:textMuted(settings) };
}

/* Six sections competed on the home screen and all of them persisted their
   open state, so a returning kid could land on a screen where everything was
   shut. Now four: the two you act on are open, the two you glance at are not. */
const DEFAULT_HOME_OPEN = { mission: true, shots: true, squad: false, legends: false };

function loadHomeOpen() {
  try {
    const raw = localStorage.getItem("fkh-home-sections");
    if (raw) return { ...DEFAULT_HOME_OPEN, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_HOME_OPEN };
}


export default function TodayView({
  settings,
  P,
  S,
  ST,
  BG,
  SF,
  NV,
  bd,
  today,
  schedule,
  todayMission,
  missionClaimed,
  completed,
  programProgress,
  challengeNudge,
  dailyAction,
  enrolledPrograms,
  programs,
  progressCtx,
  coachMsg,
  onOpenCoach,
  shotsToday,
  onQuickLogShots,
  onOpenShots,
  showFindDrills,
  onHideFindDrills,
  favorites,
  cats,
  workouts,
  allExercises,
  exerciseMeta,
  workoutTemplates,
  searchExercises,
  onOpenProgramsSection,
  finishedProgram,
  nextProgram,
  onStartProgram,
  onDismissNextStep,
  onBrowsePrograms,
  onPickCategory,
  onOpenPath,
  onSetFavorite,
  onOpenPlayerHighlight,
  onFocusFriends,
  onOpenMessages,
  onOpenChallenges,
  squadNotifications = 0,
  unreadMessages = 0,
  isSignedIn = false,
  onOpenAuth,
  workoutOpen,
  onToggleWorkoutOpen,
  todaysWorkout,
  quickWorkoutComplete,
  selectedTemplate,
  coachRec,
  templateScrolledEnd,
  onTemplateScrolledEnd,
  selectTemplate,
  refreshWorkout,
  loadWorkoutForTemplate,
  isDone,
  isFav,
  toggleFav,
  openDetail,
  getMissionTaskProgress,
  isProgramExerciseDone,
  onOpenWorkout,
  showTourPrompt,
  onStartTour,
  onOpenGuide,
  onDismissTourPrompt,
  showNotificationPrompt,
  onEnableNotifications,
  onDismissNotificationPrompt,
  showGuestSavePrompt,
  guestSaveXp = 0,
  guestSaveStreak = 0,
  onSavePlayer,
  onDismissGuestSavePrompt,
  onOpenSchedule,
  focusMissionSection = false,
  onMissionFocusHandled,
}) {
  const homeLbl = { fontFamily:"'DM Mono',monospace", fontSize:12, letterSpacing:"0.13em", color:P, fontWeight:800, marginBottom:10, textTransform:"uppercase" };
  const [homeOpen, setHomeOpen] = useState(loadHomeOpen);

  useEffect(() => {
    if (!focusMissionSection) return;
    setHomeOpen(prev => ({ ...prev, mission: true }));
    onMissionFocusHandled?.();
  }, [focusMissionSection, onMissionFocusHandled]);

  useEffect(() => {
    try { localStorage.setItem("fkh-home-sections", JSON.stringify(homeOpen)); } catch { /* ignore */ }
  }, [homeOpen]);

  const toggleHome = key => setHomeOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // Collapsed Legends still has to say where you are, so the rank rides in the
  // section header — same summary Challenges used before it came off there.
  const legendsHint = useMemo(() => {
    const recId = recommendTrackForFavorite(settings);
    const track = recId ? getTrack(recId) : null;
    if (!track || !progressCtx) return "Legend paths";
    const info = trackRankInfo(track, progressCtx);
    return `${track.archetype} · ${info.currentRank}`;
  }, [settings, progressCtx]);

  const enrolledList = programs.filter(p => enrolledPrograms[p.id]);
  const mission = todayMission;
  const claimed = missionClaimed;
  const unread = Number(unreadMessages) || 0;
  const squadTotal = Number(squadNotifications) || 0;
  const hasSquadActivity = squadTotal > 0;

  const todayPlan = useMemo(
    () => buildTrainingDayPlan(today, schedule, programs, enrolledPrograms, programProgress, workouts),
    [today, schedule, programs, enrolledPrograms, programProgress, workouts],
  );
  const hasTodayPlan = todayPlan.programSessions.length > 0
    || todayPlan.scheduleDay.cats.length > 0
    || (todayPlan.customSessions?.length || 0) > 0;

  // Session-at-a-glance: duration/XP/focus so the athlete can size up today's
  // training before scrolling a full drill list. Same estimatedDuration field
  // and flat 5-XP-per-exercise rate the history/XP screens already use.
  const todayTrainingSummary = useMemo(() => {
    if (!hasTodayPlan) return null;
    const exIds = new Set([
      ...todayPlan.programSessions.flatMap(s => s.session.exercises || []),
      ...(todayPlan.customSessions || []).flatMap(c => c.exerciseIds || []),
      ...(todayPlan.scheduleExerciseIds || []),
    ]);
    if (!exIds.size) return null;
    let seconds = 0;
    const catSet = new Set();
    for (const id of exIds) {
      const ex = allExercises[id];
      if (!ex) continue;
      seconds += exerciseMeta[id]?.estimatedDuration || ex.meta?.estimatedDuration || 180;
      if (ex._cat) catSet.add(ex._cat);
    }
    const focusLabels = [...catSet].map(c => cats[c]?.label?.split(" ")[0] || c).slice(0, 3);
    return {
      minutes: Math.round(seconds / 60),
      xp: exIds.size * 5,
      focusLabels,
    };
  }, [hasTodayPlan, todayPlan, allExercises, exerciseMeta, cats]);

  const startExerciseList = (exercises, practiceSource = "mission") => {
    const list = withSessionWarmup(
      (exercises || []).map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} })),
      workouts,
      exerciseMeta,
    );
    if (list[0]) openDetail(list[0], list, null, practiceSource);
  };

  const startProgramSession = (task) => {
    if (!task?.exercises?.length || task.programId == null) return;
    const ctx = { programId: task.programId, week: task.week, sessionIdx: task.sessionIdx };
    const base = task.exercises
      .map(id => allExercises[id])
      .filter(Boolean)
      .map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} }));
    const list = withSessionWarmup(base, workouts, exerciseMeta, {
      categories: categoriesFromExercises(base, allExercises),
    });
    if (list[0]) openDetail(list[0], list, ctx, "program");
  };

  const openProgramExercise = (task, exId) => {
    const ctx = task.programId != null
      ? { programId: task.programId, week: task.week, sessionIdx: task.sessionIdx }
      : null;
    const base = task.exercises
      .map(id => allExercises[id])
      .filter(Boolean)
      .map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} }));
    const list = withSessionWarmup(base, workouts, exerciseMeta, {
      categories: categoriesFromExercises(base, allExercises),
    });
    const ex = allExercises[exId];
    if (!ex) return;
    openDetail({ ...ex, meta: ex.meta || exerciseMeta[exId] || {} }, list, ctx, "program");
  };

  // Hoisted so both the header's at-a-glance badge and the bottom progress
  // bar read the same numbers instead of computing them twice.
  const reqTasks = mission.tasks.filter(t => t.required);
  const totalReq = reqTasks.reduce((s, t) => { const { target } = getMissionTaskProgress(t, completed, today, programProgress); return s + target; }, 0);
  const doneReq = reqTasks.reduce((s, t) => { const { cur, target } = getMissionTaskProgress(t, completed, today, programProgress); return s + Math.min(cur, target); }, 0);
  const overallPct = totalReq > 0 ? doneReq / totalReq : 0;

  // Single "one obvious action" entry point — follows dailyAction.primaryCTA's
  // existing precedence (program session beats mission) rather than inventing
  // a new rule, then jumps to whichever mission task is actually next undone.
  const nextMissionTask = mission.tasks.find(t => {
    const { cur, target } = getMissionTaskProgress(t, completed, today, programProgress);
    return cur < target;
  });
  /* Today's mission is frozen once generated (see dailyMission.js), so a program started
     later in the day isn't in it. The session due from live enrollments still leads the
     card — program before mission, the existing precedence — without touching the mission. */
  const liveProgramTask = (() => {
    const w = dailyAction.programWidget;
    if (!w || mission.tasks.some(t => t.type === "program")) return null;
    return {
      programId: w.program.id, week: w.week, sessionIdx: w.sessionIdx,
      exercises: w.session.exercises,
      title: `${w.program.emoji} ${w.program.name}`,
      subtitle: `Week ${w.week} · ${w.session.focus}`,
    };
  })();

  const practiceCTA = (() => {
    if (liveProgramTask) return { label: "Start program session", run: () => startProgramSession(liveProgramTask) };
    if (claimed) return null;
    if (dailyAction.primaryCTA?.focus === "program") {
      const programTask = mission.tasks.find(t => t.type === "program"
        && getMissionTaskProgress(t, completed, today, programProgress).cur < getMissionTaskProgress(t, completed, today, programProgress).target);
      if (programTask) return { label: `Continue ${programTask.kindLabel || "session"}`, run: () => startProgramSession(programTask) };
    }
    if (!nextMissionTask) return null;
    if (nextMissionTask.type === "program") {
      return { label: `Continue ${nextMissionTask.kindLabel || "session"}`, run: () => startProgramSession(nextMissionTask) };
    }
    const exList = (nextMissionTask.exercises || []).map(id => allExercises[id]).filter(Boolean);
    if (!exList.length) return null;
    // Progress already made today (even on a different task) means this is a
    // resume, not a fresh start — the label should say so.
    return { label: doneReq > 0 ? "Continue Practice" : "Start Today's Practice", run: () => startExerciseList(exList) };
  })();

  /* The drill the CTA will actually open — first undone exercise of the next
     unfinished task, falling back to the task's own label. */
  const nextDrillName = (() => {
    if (liveProgramTask) return liveProgramTask.title;
    if (!nextMissionTask) return null;
    if (nextMissionTask.type === "program") return nextMissionTask.kindLabel || "Next session";
    const firstUndone = (nextMissionTask.exercises || [])
      .find(id => !completed[`${today}-${id}`]);
    return allExercises[firstUndone]?.name || nextMissionTask.label || null;
  })();

  return (
    <>
      {/* Just finished a program: the finished one is history now, so Home's job is the
          next choice — one tap to start the recommended step, or go pick something else.
          Stays until they start a program or wave it off. */}
      {finishedProgram && (
        <div style={{ margin:"0 20px 12px", padding:"15px", borderRadius:18,
          border:`1px solid ${finishedProgram.color}55`,
          background:`linear-gradient(160deg, ${finishedProgram.color}1f, ${BG} 75%)`, position:"relative" }}>
          <button type="button" aria-label="Dismiss" onClick={onDismissNextStep}
            style={{ position:"absolute", top:8, right:8, width:28, height:28, borderRadius:8, border:"none",
              background:"transparent", color:"#64748b", fontSize:15, cursor:"pointer" }}>✕</button>
          <div style={{ fontSize:22, lineHeight:1 }}>🎉</div>
          <div style={{ fontSize:16, fontWeight:800, color:"var(--fkh-text)", marginTop:6, paddingRight:24, lineHeight:1.25 }}>
            You finished {finishedProgram.name}!
          </div>
          {nextProgram ? (
            <>
              <div style={{ fontSize:12, color:"#94a3b8", marginTop:3 }}>
                {nextProgram.advancedOf === finishedProgram.id ? "You unlocked the next level:" : "Ready for your next program?"}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:11, padding:"10px 11px",
                borderRadius:12, background:"rgba(255,255,255,0.04)", border:`1px solid ${nextProgram.color}33` }}>
                <span style={{ fontSize:26, lineHeight:1 }}>{nextProgram.emoji}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:800, color:"var(--fkh-text)" }}>{nextProgram.name}</div>
                  <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>
                    {nextProgram.level ? `Level ${nextProgram.level} · ` : ""}{nextProgram.duration} weeks · {nextProgram.daysPerWeek}×/week
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => { trackCtaClicked("start_next_program", { program_id: nextProgram.id }); onStartProgram(nextProgram); }}
                style={{ width:"100%", marginTop:11, padding:14, borderRadius:14, border:"none", cursor:"pointer",
                  background:nextProgram.color, color:"#fff", fontSize:15, fontWeight:800 }}>
                Start {nextProgram.name} →
              </button>
              <button type="button" onClick={onBrowsePrograms}
                style={{ width:"100%", marginTop:6, padding:9, border:"none", background:"transparent",
                  color:"#94a3b8", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Pick something else
              </button>
            </>
          ) : (
            <button type="button" onClick={onBrowsePrograms}
              style={{ width:"100%", marginTop:12, padding:14, borderRadius:14, border:"none", cursor:"pointer",
                background:finishedProgram.color, color:"#fff", fontSize:15, fontWeight:800 }}>
              Pick your next program →
            </button>
          )}
        </div>
      )}

      {/* The hero, per the study: where you are, what's next, one action. It
          sits above Today's Mission rather than inside it, so collapsing the
          section can never hide the primary action — and the task list below
          keeps its targets, optional markers and program sessions, which six
          flat drill rows could not express. */}
      {practiceCTA && (
        <div style={{ margin:"0 20px 12px", padding:"16px 15px 15px", borderRadius:18,
          border:`1px solid ${P}40`, background:`linear-gradient(160deg, ${P}14, ${BG} 70%)` }}>
          <div style={{ display:"flex", alignItems:"center", gap:13, marginBottom:13 }}>
            <div style={{ width:62, height:62, borderRadius:"50%", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              background:`conic-gradient(${P} ${overallPct * 360}deg, rgba(255,255,255,0.08) 0deg)` }}>
              <div style={{ width:50, height:50, borderRadius:"50%", background:BG,
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:18, fontWeight:800, lineHeight:1 }}>{doneReq}</span>
                <span style={{ fontSize:8, color:"#475569", lineHeight:1, marginTop:2 }}>of {totalReq}</span>
              </div>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9.5, letterSpacing:"0.14em",
                textTransform:"uppercase", fontWeight:800, color:P, marginBottom:4 }}>
                {doneReq > 0 ? "Up next" : "First up"}
              </div>
              <div style={{ fontSize:17, fontWeight:800, lineHeight:1.15, letterSpacing:"-0.02em",
                textWrap:"pretty", color:"var(--fkh-text)" }}>
                {nextDrillName || mission.title}
              </div>
              {liveProgramTask ? (
                <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>{liveProgramTask.subtitle}</div>
              ) : todayTrainingSummary && (
                <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>
                  {todayTrainingSummary.minutes} min · +{todayTrainingSummary.xp} XP
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={() => { trackCtaClicked("start_practice", { label: practiceCTA.label }); practiceCTA.run(); }}
            style={{ width:"100%", padding:15, borderRadius:14, border:"none", cursor:"pointer",
              background:P, color:"#000", fontSize:15.5, fontWeight:800 }}>
            {practiceCTA.label}
          </button>
        </div>
      )}

      {/* Coach's read on where you are — one line, under the CTA rather than
          above it. Coach itself is a header button on every tab now; this is
          the message, not a second entry point competing for the hero slot. */}
      {coachMsg && (
        <button
          type="button"
          onClick={() => { trackCtaClicked("coach_fkh"); onOpenCoach?.(); }}
          style={{ margin:"0 20px 14px", padding:"8px 11px", borderRadius:10, background:`${P}0b`,
            border:`1px solid ${P}1e`, width:"calc(100% - 40px)", cursor:"pointer", textAlign:"left",
            display:"flex", alignItems:"flex-start", gap:8 }}
        >
          <span style={{ fontSize:13, flexShrink:0, lineHeight:1.35 }}>🏀</span>
          <span style={{ minWidth:0, fontSize:11.5, lineHeight:1.45, color:"var(--fkh-text-muted)",
            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
            <span style={{ fontWeight:800, color:P, letterSpacing:"0.1em", fontSize:9.5, marginRight:6 }}>COACH FKH</span>
            {coachMsg}
          </span>
        </button>
      )}

      {/* Only one onboarding nudge at a time — tour takes priority over the
          notification prompt so they never stack and eat the top of Today. */}
      {showTourPrompt ? (
        <TourPromptBanner P={P} onStartTour={onStartTour} onOpenGuide={onOpenGuide} onDismiss={onDismissTourPrompt} />
      ) : showGuestSavePrompt ? (
        <GuestSaveBanner
          P={P}
          xpTotal={guestSaveXp}
          streak={guestSaveStreak}
          onSave={onSavePlayer}
          onDismiss={onDismissGuestSavePrompt}
        />
      ) : showNotificationPrompt && (
        <NotificationPromptBanner
          P={P}
          onEnable={onEnableNotifications}
          onDismiss={onDismissNotificationPrompt}
        />
      )}

      {hasSquadActivity && (
        <button
          type="button"
          onClick={() => { trackCtaClicked("squad_activity"); (onOpenMessages || onFocusFriends)?.(); }}
          style={{
            display: "block",
            width: "calc(100% - 40px)",
            margin: "0 20px 12px",
            textAlign: "left",
            borderRadius: 14,
            border: `1.5px solid ${P}`,
            background: `${P}20`,
            padding: "12px 14px",
            cursor: "pointer",
            boxShadow: `0 0 0 1px ${P}22 inset`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>{unread > 0 ? "💬" : "👥"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--fkh-text)" }}>
                {squadTotal === 1
                  ? "1 update in Squad"
                  : `${squadTotal} updates in Squad`}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                {unread > 0 && squadTotal === unread
                  ? "Tap to open Messages"
                  : "Messages, requests, feed, or challenges — tap to check Squad"}
              </div>
            </div>
            <CountBadge count={squadTotal} P={P} />
          </div>
        </button>
      )}

      {/* Today's Mission absorbs Today's Training: same block, one header. */}
      <HomeCollapsibleSection
        title="Today's Mission"
        hint={claimed
          ? "complete"
          : todayTrainingSummary
            ? `${todayTrainingSummary.minutes} min · +${todayTrainingSummary.xp} XP`
            : undefined}
        open={homeOpen.mission}
        onToggle={() => toggleHome("mission")}
        labelStyle={homeLbl}
        accentColor={P}
      >
        <div style={{ margin:"0 20px 14px", borderRadius:16,
          border:`1px solid ${claimed ? "rgba(34,197,94,0.35)" : P + "33"}`,
          background:claimed ? "rgba(34,197,94,0.07)" : `${P}0c`, overflow:"hidden" }}>

          <div style={{ padding:"12px 14px 10px", display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4, flexWrap:"wrap" }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:"0.14em",
                  color:claimed ? "#22c55e" : P, textTransform:"uppercase", fontWeight:800 }}>Daily Mission</span>
                {claimed
                  ? <span style={{ fontSize:9, padding:"2px 8px", borderRadius:99,
                      background:"rgba(34,197,94,0.18)", color:"#22c55e", fontWeight:800 }}>✓ COMPLETE</span>
                  : <span style={{ fontSize:9, padding:"2px 8px", borderRadius:99,
                      background:`${P}18`, color:P, fontWeight:700 }}>{doneReq}/{totalReq} TODAY</span>}
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--fkh-text)",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {mission.title}
              </div>
            </div>
            <div style={{ flexShrink:0, borderRadius:10, padding:"7px 11px", textAlign:"center",
              background:claimed ? "rgba(34,197,94,0.12)" : `${P}16`,
              border:`1px solid ${claimed ? "rgba(34,197,94,0.3)" : P + "28"}` }}>
              <div style={{ fontSize:13, fontWeight:800,
                color:claimed ? "#22c55e" : P, lineHeight:1 }}>+{mission.bonusXP}</div>
              <div style={{ fontSize:8, color:"#475569", fontWeight:600, marginTop:1 }}>BONUS XP</div>
            </div>
          </div>

          <div style={{ padding:"0 12px 12px", display:"flex", flexDirection:"column", gap:7 }}>
            {mission.tasks.map(task => {
              const { cur, target } = getMissionTaskProgress(task, completed, today, programProgress);
              const taskDone = cur >= target;
              const pctRaw = target > 0 ? Math.min(1, cur / target) : 0;
              const accent = task.type === "program" && task.programColor ? task.programColor : P;
              return (
                <div key={task.id} style={{
                  padding:"9px 11px", borderRadius:10,
                  background:taskDone
                    ? "rgba(34,197,94,0.07)"
                    : task.optional ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                  border:`1px solid ${taskDone
                    ? "rgba(34,197,94,0.18)"
                    : task.optional ? "rgba(255,255,255,0.04)" : `${accent}22`}`,
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:task.optional ? 0 : 6 }}>
                    <div style={{ width:17, height:17, borderRadius:5, flexShrink:0,
                      border:`1.5px solid ${taskDone ? "#22c55e" : task.optional ? "#2d3748" : accent + "55"}`,
                      background:taskDone ? "#22c55e" : "transparent",
                      display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {taskDone && <span style={{ color:"#fff", fontSize:9, fontWeight:900 }}>✓</span>}
                    </div>
                    <span style={{ flex:1, fontSize:12, fontWeight:600, lineHeight:1.35,
                      color:taskDone ? "#22c55e" : task.optional ? "#475569" : "var(--fkh-text)" }}>
                      {task.label}
                    </span>
                    {task.type === "program" && task.kindLabel && (
                      <span style={{ fontSize:8, padding:"2px 6px", borderRadius:99, flexShrink:0,
                        background: task.kind === "strength" ? "rgba(34,197,94,0.12)" : `${accent}18`,
                        color: task.kind === "strength" ? "#22c55e" : accent,
                        fontWeight:800, letterSpacing:"0.06em" }}>
                        {task.kindLabel.toUpperCase()}
                      </span>
                    )}
                    {task.optional && <span style={{ fontSize:8, color:"#334155",
                      fontWeight:700, letterSpacing:"0.08em", flexShrink:0 }}>OPTIONAL</span>}
                    <span style={{ fontSize:11, fontWeight:700, flexShrink:0,
                      color:taskDone ? "#22c55e" : "#64748b" }}>
                      {Math.min(cur, target)}/{target}
                    </span>
                  </div>
                  {!task.optional && (
                    <div style={{ height:3, borderRadius:99, background:"rgba(255,255,255,0.06)", marginLeft:25 }}>
                      <div style={{ height:"100%", width:`${pctRaw * 100}%`, borderRadius:99,
                        background:taskDone ? "#22c55e" : accent, transition:"width 0.35s" }}/>
                    </div>
                  )}
                  {(task.type === "program" || task.type === "category") && task.exercises?.length > 0 && (
                    <div style={{ marginTop:7, marginLeft:25 }}>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        {task.exercises.map(exId => {
                          const ex = allExercises[exId];
                          if (!ex) return null;
                          const done = task.type === "program" && task.programId != null
                            ? isProgramExerciseDone(programProgress, task.programId, task.week, task.sessionIdx, exId)
                            : !!completed[`${today}-${exId}`];
                          return (
                            <button key={exId} type="button"
                              onClick={() => {
                                if (task.type === "program") openProgramExercise(task, exId);
                                else {
                                  const enriched = { ...ex, _cat:ex._cat, meta:ex.meta || exerciseMeta[exId] || {} };
                                  const taskList = task.exercises.map(id => allExercises[id]).filter(Boolean).map(e => ({ ...e, meta:e.meta || exerciseMeta[e.id] || {} }));
                                  openDetail(enriched, taskList, null, "mission_task");
                                }
                              }}
                              style={{ fontSize:9, padding:"3px 8px", borderRadius:99, cursor:"pointer",
                                background:done ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
                                border:`1px solid ${done ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
                                color:done ? "#22c55e" : "#94a3b8", fontWeight:600 }}>
                              {done ? "✓ " : ""}{ex.name}
                            </button>
                          );
                        })}
                      </div>
                      {task.type === "program" && !taskDone && (
                        <button type="button" onClick={() => { trackCtaClicked("mission_start_session", { label: task.kindLabel }); startProgramSession(task); }}
                          style={{ width:"100%", marginTop:8, padding:"8px 10px", borderRadius:8, border:"none",
                            background: accent, color:"#fff", fontSize:11, fontWeight:800, cursor:"pointer" }}>
                          Start {task.kindLabel || "session"} →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {challengeNudge && !claimed && (
            <div style={{ margin:"0 12px 12px", padding:"10px 12px", borderRadius:10,
              background:`${S}12`, border:`1px solid ${S}28` }}>
              <div style={{ fontSize:10, fontWeight:800, color:S, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>
                Challenge push
              </div>
              <div style={{ fontSize:12, color:"var(--fkh-text)", lineHeight:1.45 }}>
                {challengeNudge.emoji} {challengeNudge.target - challengeNudge.cur} more to finish {challengeNudge.name}
              </div>
              {dailyAction.workoutTemplate && workoutTemplates[dailyAction.workoutTemplate] && (
                <button
                  onClick={() => {
                    trackCtaClicked("try_workout_template", { template: dailyAction.workoutTemplate });
                    selectTemplate(dailyAction.workoutTemplate);
                    onOpenWorkout();
                  }}
                  style={{ marginTop:8, padding:"7px 12px", borderRadius:8, border:`1px solid ${S}44`,
                    background:"transparent", color:S, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                  Try {workoutTemplates[dailyAction.workoutTemplate].name} workout →
                </button>
              )}
            </div>
          )}

          {(() => {
            return (
              <div style={{ padding:"0 12px 12px" }}>
                <div style={{ height:4, borderRadius:99, background:"rgba(255,255,255,0.05)" }}>
                  <div style={{ height:"100%", width:`${overallPct * 100}%`, borderRadius:99,
                    background:claimed ? "#22c55e" : `linear-gradient(90deg,${P},${S})`,
                    transition:"width 0.35s" }}/>
                </div>
                {claimed && (
                  <div style={{ textAlign:"center", marginTop:8, fontSize:11, color:"#22c55e", fontWeight:700 }}>
                    🎉 +{mission.bonusXP} XP earned — come back tomorrow for a new mission!
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {hasTodayPlan && (
          <>
          <div style={{ margin: "0 20px 14px" }}>
            {todayTrainingSummary && (
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:"10px 12px", marginBottom:10,
                borderRadius:12, background:`${P}0a`, border:`1px solid ${P}22`, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ fontSize:14 }}>⏱</span>
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--fkh-text)" }}>{todayTrainingSummary.minutes} min</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ fontSize:14 }}>🏆</span>
                  <span style={{ fontSize:12, fontWeight:700, color:P }}>+{todayTrainingSummary.xp} XP</span>
                </div>
                {todayTrainingSummary.focusLabels.length > 0 && (
                  <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                    <span style={{ fontSize:14 }}>🎯</span>
                    <span style={{ fontSize:12, color:"#94a3b8", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {todayTrainingSummary.focusLabels.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            )}
            <DayPlanPanel
              plan={todayPlan}
              cats={cats}
              allExercises={allExercises}
              workouts={workouts}
              exerciseMeta={exerciseMeta}
              P={P}
              SF={SF}
              bd={bd}
              compact
              showDateHeader={false}
              onOpenCategory={onPickCategory}
              onOpenExercise={(ex, list, ctx) => {
                const enriched = { ...ex, meta: ex.meta || exerciseMeta[ex.id] || {} };
                const fullList = withSessionWarmup(
                  (list || [ex]).map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} })),
                  workouts,
                  exerciseMeta,
                  { categories: categoriesFromExercises(list || [ex], allExercises) },
                );
                openDetail(enriched, fullList, ctx, ctx ? "program" : "schedule");
              }}
              onStartProgramSession={(exList, ctx) => {
                const list = withSessionWarmup(
                  (exList || []).map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} })),
                  workouts,
                  exerciseMeta,
                  { categories: categoriesFromExercises(exList, allExercises) },
                );
                if (list[0]) openDetail(list[0], list, ctx, "program");
              }}
              onStartCustomWorkout={startExerciseList}
              onOpenCalendar={onOpenSchedule}
            />
          </div>
          </>
        )}
      </HomeCollapsibleSection>




      {/* My Programs moved to the Programs tab, which left a kid with no plan
          no route to one from home. One dashed row, only when nothing is
          enrolled. */}
      {enrolledList.length === 0 && !finishedProgram && (() => {
        const picks = programs.slice(0, 2).map(pr => pr.name);
        const rest = Math.max(0, programs.length - picks.length);
        const weeks = programs[0]?.weeks?.length;
        return (
          <button type="button" onClick={() => onOpenProgramsSection?.("plans")}
            style={{ display:"block", width:"calc(100% - 40px)", margin:"0 20px 14px", textAlign:"left",
              padding:"13px 15px", borderRadius:14, cursor:"pointer",
              border:`1px dashed ${P}55`, background:"transparent" }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:9.5, letterSpacing:"0.16em",
              textTransform:"uppercase", fontWeight:800, color:P, marginBottom:5 }}>
              No plan yet
            </div>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--fkh-text)", lineHeight:1.3 }}>
              Pick a program for a week-by-week plan
            </div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:4, lineHeight:1.45 }}>
              {picks.join(", ")}{rest ? `, and ${rest} more` : ""}
              {weeks ? ` — ${weeks} weeks each` : ""}
            </div>
            <div style={{ fontSize:11.5, fontWeight:800, color:P, marginTop:8 }}>Browse programs →</div>
          </button>
        );
      })()}

      {/* New on Today. Shot logging is the daily habit with the lowest
          friction, so it gets a home on the home screen instead of living
          only one tab away. */}
      <HomeCollapsibleSection
        title="Shot Tracking"
        hint={shotsToday && shotsToday.taken > 0
          ? `${shotsToday.made}/${shotsToday.taken} · ${shotsToday.pct}%`
          : "none today"}
        open={homeOpen.shots}
        onToggle={() => toggleHome("shots")}
        labelStyle={homeLbl}
        accentColor={P}
      >
        <div style={{ margin:"0 20px 14px", borderRadius:16, padding:"12px 14px",
          border:`1px solid ${P}33`, background:`${P}0c` }}>
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ width:62, height:62, borderRadius:"50%", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              background:`conic-gradient(${P} ${(shotsToday?.pct || 0) * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}>
              <div style={{ width:50, height:50, borderRadius:"50%", background:BG,
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:15, fontWeight:800, lineHeight:1,
                  color:"var(--fkh-text)" }}>
                  {shotsToday?.pct != null ? `${shotsToday.pct}%` : "—"}
                </span>
              </div>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--fkh-text)" }}>
                {shotsToday?.taken
                  ? `${shotsToday.made} of ${shotsToday.taken} today`
                  : "No shots logged today"}
              </div>
              <div style={{ fontSize:11, color:"#64748b", marginTop:3 }}>
                Goal {shotsToday?.goal ?? 25} makes
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:6, marginTop:12 }}>
            {[5, 10, 25].map(n => (
              <button key={n} type="button"
                onClick={() => { if (!onQuickLogShots?.(n)) onOpenShots?.(); }}
                style={{ flex:1, padding:"9px 4px", borderRadius:10, cursor:"pointer",
                  border:`1px solid ${P}44`, background:`${P}16`, color:P,
                  fontSize:13, fontWeight:800 }}>
                +{n}
              </button>
            ))}
            <button type="button" onClick={() => onOpenShots?.()}
              style={{ flex:1.4, padding:"9px 4px", borderRadius:10, cursor:"pointer",
                border:`1px solid ${bd}`, background:"rgba(255,255,255,0.04)",
                color:"var(--fkh-text-muted)", fontSize:12, fontWeight:700 }}>
              Log spots →
            </button>
          </div>
        </div>
      </HomeCollapsibleSection>

      <HomeCollapsibleSection
        title="Squad"
        hint={squadTotal > 0 ? `${squadTotal} new` : undefined}
        open={homeOpen.squad}
        onToggle={() => toggleHome("squad")}
        labelStyle={homeLbl}
        accentColor={P}
      >
        <FriendsTeaser
          P={P}
          onOpenFriends={onOpenMessages || onFocusFriends}
          squadNotifications={squadTotal}
          unreadMessages={unread}
          isSignedIn={isSignedIn}
          onSignIn={onOpenAuth}
        />
      </HomeCollapsibleSection>

      {/* One line, outside the collapsible, so squad challenges stay visible
          even with Squad shut. */}
      <ChallengeStrip
        P={P}
        variant="teaser"
        onAddFriends={onFocusFriends}
        onOpenChallenges={onOpenChallenges}
      />

      {/* Collapsed by default with the rank in the header — the aspiration is
          worth a glance, not the space it used to take above the drill list. */}
      <HomeCollapsibleSection
        title="Train Like Legends"
        hint={legendsHint}
        open={homeOpen.legends}
        onToggle={() => toggleHome("legends")}
        labelStyle={homeLbl}
        accentColor={P}
      >
        <ProgressRail
          settings={settings}
          ctx={progressCtx}
          P={P}
          onOpenPath={onOpenPath}
          onSetFavorite={onSetFavorite}
          onOpenPlayerHighlight={onOpenPlayerHighlight}
        />
      </HomeCollapsibleSection>

      {missionClaimed && (
        <div style={{ margin:"0 20px 14px", padding:"12px 14px", borderRadius:14, border:`1px solid ${bd}`, background:SF }}>
          <div style={{ fontSize:10, fontWeight:800, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Keep Going</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button type="button" onClick={() => {
              trackCtaClicked("bonus_workout");
              loadWorkoutForTemplate(selectedTemplate);
              const exs = todaysWorkout?.exercises?.map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} })) || [];
              if (exs[0]) openDetail(exs[0], exs, null, "workout");
            }}
              style={{ flex:1, minWidth:120, padding:"10px 12px", borderRadius:10, border:`1px solid ${P}44`, background:`${P}12`, color:P, fontWeight:800, fontSize:12, cursor:"pointer" }}>
              Bonus Workout
            </button>
            <button type="button" onClick={() => onOpenProgramsSection?.("drills")}
              style={{ flex:1, minWidth:120, padding:"10px 12px", borderRadius:10, border:`1px solid ${bd}`, background:"rgba(255,255,255,0.04)", color:"var(--fkh-text)", fontWeight:800, fontSize:12, cursor:"pointer" }}>
              Browse Drills
            </button>
          </div>
        </div>
      )}

      <FindDrillsSheet
        open={showFindDrills}
        onClose={onHideFindDrills}
        onPickCategory={onPickCategory}
        P={P} SF={SF} bd={bd} NV={NV}
        CATS={cats} WORKOUTS={workouts} ALL_EXERCISES={allExercises} EXERCISE_META={exerciseMeta}
        favorites={favorites} isDone={isDone} openDetail={openDetail}
        searchExercises={searchExercises}
      />

      {/* Only when no program is enrolled — otherwise the plan is the answer
          to "what do I do now?" and this is a second, competing one. */}
      {enrolledList.length === 0 && (
      <HomeCollapsibleSection
        title="Quick Workout"
        hint={quickWorkoutComplete ? "complete" : todaysWorkout ? todaysWorkout.templateName : undefined}
        open={workoutOpen}
        onToggle={onToggleWorkoutOpen}
        labelStyle={homeLbl}
        accentColor={P}>
        <div style={{ margin:"0 20px 10px", textAlign:"right" }}>
          <button type="button" onClick={() => onOpenProgramsSection?.("quick")}
            style={{ padding:"6px 10px", borderRadius:8, border:`1px solid ${P}33`, background:"transparent", color:P, fontSize:10, fontWeight:700, cursor:"pointer" }}>
            All templates in Programs →
          </button>
        </div>

        <div style={{ position:"relative" }}>
          <div onScroll={e => { const el = e.currentTarget; onTemplateScrolledEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4); }}
            style={{ display:"flex", gap:7, overflowX:"auto", padding:"0 20px 10px", scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
            {Object.entries(workoutTemplates).map(([key, tmpl]) => (
              <div key={key} style={{ flexShrink:0, display:"flex", alignItems:"center", gap:3 }}>
                <button onClick={() => selectTemplate(key)}
                  style={{ padding:"7px 13px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
                    ...(selectedTemplate === key
                      ? { background:P, border:`1.5px solid ${P}`, color:"#000" }
                      : chipStyle(settings, false, P)) }}>
                  {tmpl.emoji} {tmpl.name}
                </button>
                <button onClick={() => toggleFav("workouts", key)}
                  style={{ padding:"4px 6px", borderRadius:14, fontSize:11, cursor:"pointer",
                    background:"transparent", border:"none",
                    color:isFav("workouts", key) ? "#facc15" : "rgba(250,204,21,0.5)" }}>
                  {isFav("workouts", key) ? "⭐" : "☆"}
                </button>
              </div>
            ))}
          </div>
          {!templateScrolledEnd && <div style={{ position:"absolute", right:0, top:0, bottom:"10px", width:48, background:`linear-gradient(to right,transparent,${BG})`, pointerEvents:"none" }}/>}
        </div>

        {todaysWorkout ? (
          <div style={{ margin:"0 20px 14px", borderRadius:16, overflow:"hidden",
            background:quickWorkoutComplete ? "rgba(34,197,94,0.08)" : `${P}09`,
            border:`1px solid ${quickWorkoutComplete ? "rgba(34,197,94,0.28)" : `${P}22`}` }}>
            <div style={{ padding:"14px 16px 8px", display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ fontSize:28, lineHeight:1 }}>{todaysWorkout.templateEmoji}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:800, color:quickWorkoutComplete ? "#22c55e" : P, lineHeight:1.2 }}>{todaysWorkout.templateName}</div>
                <div style={{ fontSize:11, color:quickWorkoutComplete ? "#4ade80" : "#64748b", marginTop:2 }}>
                  {quickWorkoutComplete ? "All drills done for today!" : todaysWorkout.templateDesc}
                </div>
                {!quickWorkoutComplete && coachRec && selectedTemplate === coachRec.templateKey && (
                  <div style={{ fontSize:11, color:ST, lineHeight:1.45, marginTop:6, opacity:0.9 }}>
                    Coach FKH: {coachRec.reason}
                  </div>
                )}
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                {quickWorkoutComplete ? (
                  <>
                    <div style={{ fontSize:22, lineHeight:1 }}>✓</div>
                    <div style={{ fontSize:9, color:"#22c55e", letterSpacing:"0.07em", fontWeight:800, marginTop:2 }}>DONE</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:22, fontWeight:800, color:P, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{Math.max(1, Math.round(todaysWorkout.totalSecs / 60))}</div>
                    <div style={{ fontSize:9, color:"#475569", letterSpacing:"0.07em" }}>MIN</div>
                  </>
                )}
              </div>
            </div>
            {!quickWorkoutComplete && (
              <div style={{ fontSize:10, color:"#64748b", padding:"0 16px 8px" }}>
                🟡 Warm-up is step 1 — Start Workout opens warm-up drills first.
              </div>
            )}
            <div style={{ padding:"4px 12px 10px" }}>
              {["warmup", "main", "finisher", "recovery"].map(role => {
                const exs = todaysWorkout.exercises.filter(e => e.role === role);
                if (!exs.length) return null;
                const [dot, roleName] = { warmup:["🟡", "Warm-Up"], main:["🔵", "Main Block"], finisher:["🔴", "Finisher"], recovery:["🟢", "Cool Down"] }[role];
                return (
                  <div key={role} style={{ marginBottom:8 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:5, paddingLeft:4 }}>{dot} {roleName}</div>
                    {exs.map(ex => {
                      const done2 = isDone(ex.id);
                      return (
                        <div key={ex.id} onClick={() => openDetail(ex, todaysWorkout.exercises, null, "workout")}
                          style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 8px", borderRadius:10, marginBottom:3, cursor:"pointer",
                            background:done2 ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
                            border:`1px solid ${done2 ? "rgba(34,197,94,0.15)" : "transparent"}` }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, color:done2 ? "#22c55e" : "var(--fkh-text)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ex.name}</div>
                            <div style={{ fontSize:10, color:"#475569" }}>{ex.sets}</div>
                          </div>
                          <div style={{ fontSize:10, color:"#334155", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>{Math.round((ex.meta?.estimatedDuration || 90) / 60)}m</div>
                          <span style={{ fontSize:14, color:done2 ? "#22c55e" : "#334155", flexShrink:0 }}>{done2 ? "✓" : "›"}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div style={{ padding:"8px 14px 14px", borderTop:`1px solid ${quickWorkoutComplete ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)"}` }}>
              {quickWorkoutComplete ? (
                <>
                  <div style={{ textAlign:"center", marginBottom:10, fontSize:12, color:"#22c55e", fontWeight:700, lineHeight:1.45 }}>
                    🎉 Workout complete — {todaysWorkout.exercises.length} drills done! Come back tomorrow for a fresh shuffle.
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => {
                      const exs = todaysWorkout.exercises.map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} }));
                      if (exs[0]) openDetail(exs[0], exs, null, "workout");
                    }}
                      style={{ flex:1, padding:"11px", borderRadius:12, background:"rgba(34,197,94,0.12)", border:"1px solid rgba(34,197,94,0.25)", color:"#22c55e", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                      Review Drills
                    </button>
                    <button onClick={refreshWorkout} title="Shuffle a new workout"
                      style={{ padding:"11px 15px", borderRadius:12, fontSize:16, cursor:"pointer", ...actionBtnStyle(settings) }}>
                      🔀
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => {
                    const exs = withSessionWarmup(
                      todaysWorkout.exercises.map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} })),
                      workouts,
                      exerciseMeta,
                    );
                    trackCtaClicked("start_workout", { template: selectedTemplate });
                    if (exs[0]) openDetail(exs[0], exs, null, "workout");
                  }}
                    style={{ flex:1, padding:"11px", borderRadius:12, background:P, border:"none", color:"#000", fontSize:13, fontWeight:800, cursor:"pointer" }}>
                    Start Workout →
                  </button>
                  <button onClick={refreshWorkout} title="Shuffle exercises"
                    style={{ padding:"11px 15px", borderRadius:12, fontSize:16, cursor:"pointer", ...actionBtnStyle(settings) }}>
                    🔀
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ margin:"0 20px 14px", padding:"20px", borderRadius:16, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", textAlign:"center" }}>
            <div style={{ fontSize:13, color:"#475569" }}>Generating workout…</div>
          </div>
        )}
      </HomeCollapsibleSection>
      )}
    </>
  );
}
