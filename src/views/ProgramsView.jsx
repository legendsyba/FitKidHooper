import { useMemo, useState } from "react";
import { pathTagForProgram, suggestNextProgram, isProgramLocked } from "../lib/achievements.js";
import { getBrandLogo } from "../lib/brandLogos.js";
import ProgramIcon from "../components/ProgramIcon.jsx";
import { shareProgram } from "../lib/programShare.js";
import { track, ANALYTICS_EVENTS } from "../lib/analytics.js";
import {
  computeProgramProgress,
  programCurrentWeek,
  isProgramExerciseDone,
  isProgramSessionComplete,
  countProgramSessionsDone,
  getActiveProgramScheduleStatus,
  programWeekDayIndex,
  programCompletionCount,
  programSessionExerciseIds,
  programDose,
} from "../lib/programProgress.js";
import { parseExerciseSets } from "../lib/exerciseSession.js";
import {
  readCustomWorkouts,
  saveCustomWorkout,
  deleteCustomWorkout,
  emptyWeekDays,
  exerciseIdsForCustomWorkout,
  countCustomWorkoutExercises,
  activeDaysInWeekPlan,
  getTodayWeekDayKey,
  WEEK_DAY_KEYS,
  WEEK_DAY_LABELS,
} from "../lib/customWorkouts.js";
import { generateCustomMissionWorkout, BUILD_FOCUS_OPTIONS, BUILD_INTENSITY_OPTIONS } from "../lib/missionGenerator.js";
import { safePersistKey } from "../lib/dataSafety.js";
import { buildTrainingDayPlan } from "../lib/trainingDayPlan.js";
import { withSessionWarmup, categoriesFromExercises } from "../lib/sessionWarmup.js";
import GuideNavButton from "../components/GuideNavButton.jsx";
import CoachNavButton from "../components/CoachNavButton.jsx";

const todayKey = () => new Date().toLocaleDateString("en-CA");

/**
 * Programs come in two cadences. Week-based ones (all but Cramer 29) read as
 * "4 weeks · 3×/week"; a daily program reads as "29 days · daily", because its
 * real unit is the day and "5 weeks · 7×/week" both undersells it and reads oddly
 * against a week-5 that holds a single capstone day.
 */
const programCadenceLabel = (prog, per = "×/week") =>
  prog.cadence === "daily"
    ? `${prog.totalDays} days · daily`
    : `${prog.duration} weeks · ${prog.daysPerWeek}${per}`;

/**
 * Partner credit badge. Programs with a `brandLogo` show the partner's real mark; the rest
 * keep the plain "✦ Trainer" pill. Boxed artwork (its own background) gets a rounded tile
 * and a hairline so it reads as a badge rather than a rectangle dropped on the card; free
 * artwork is white-on-transparent and sits directly on the surface.
 */
function TrainerCredit({ prog, size = 16 }) {
  if (!prog.trainer) return null;
  const brand = getBrandLogo(prog.brandLogo);
  if (!brand) {
    return (
      <span style={{ fontSize:9,padding:"2px 7px",borderRadius:99,background:"linear-gradient(135deg,#16a34a,#15803d)",color:"#fff",fontWeight:800,letterSpacing:"0.06em" }}>
        ✦ {prog.trainer}
      </span>
    );
  }
  const boxed = brand.style === "boxed";
  return (
    <span style={{ display:"inline-flex",alignItems:"center",gap:5,padding:boxed ? "2px 7px 2px 3px" : "2px 8px",borderRadius:99,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)" }}>
      <img
        src={brand.mark}
        alt=""
        style={{ height:size,width:boxed ? size : "auto",objectFit:"contain",borderRadius:boxed ? 4 : 0,display:"block" }}
      />
      <span style={{ fontSize:9,fontWeight:800,letterSpacing:"0.05em",color:"var(--fkh-text)" }}>{prog.trainer}</span>
    </span>
  );
}

/** "3x10 each leg" → "3 × 10 each leg" — easier to read at a glance. */
const formatDose = (sets) => (sets || "").replace(/^(\d+)\s*x\s*/i, "$1 × ");

/**
 * What got harder since last week, in words a kid gets instantly: "+1 set", "more reps",
 * "longer", or "NEW" for a drill that wasn't in last week. Null when nothing went up.
 */
function doseChangeLabel(prog, weekNum, exId, sets, allExercises) {
  if (weekNum <= 1) return null;
  const prevSessions = prog.weeks.find(w => w.week === weekNum - 1)?.sessions || [];
  const prevIdx = prevSessions.findIndex(s => s.exercises.includes(exId));
  if (prevIdx < 0) return "NEW";
  const cur = parseExerciseSets(sets);
  const prev = parseExerciseSets(programDose(prog, weekNum - 1, prevIdx, exId) ?? allExercises[exId]?.sets);
  if (!cur || !prev) return null;
  if (cur.count > prev.count) {
    const n = cur.count - prev.count;
    return `+${n} set${n > 1 ? "s" : ""}`;
  }
  const top = d => d.maxValue ?? d.value ?? 0;
  if (cur.count === prev.count && (cur.value > prev.value || top(cur) > top(prev))) {
    return cur.type === "time" ? "longer" : "more reps";
  }
  return null;
}

/** Day number (1-indexed) an enrolled athlete is on in a daily program. */
const programDayNumber = (prog, startDate, week) =>
  Math.min(prog.totalDays, (week - 1) * 7 + programWeekDayIndex(startDate, todayKey()) + 1);

const HUB_SECTIONS = [
  { id: "plans", label: "Plans", emoji: "📋" },
  { id: "drills", label: "Drills", emoji: "🏀" },
  { id: "quick", label: "Quick", emoji: "⚡" },
  { id: "build", label: "Build", emoji: "🛠" },
];

export default function ProgramsView({
  programs,
  settings,
  enrolledPrograms,
  setEnrolledPrograms,
  programProgress,
  enrollProgram,
  programSegment,
  setProgramSegment,
  programsHubSection,
  setProgramsHubSection,
  recommendedProgramIds,
  earnedBadges,
  selectedProgram,
  setSelectedProgram,
  allExercises,
  exerciseMeta,
  cats,
  workouts,
  schedule,
  workoutTemplates,
  favorites,
  todayMission,
  searchExercises,
  onPickCategory,
  startQuickWorkout,
  P,
  BG,
  SF,
  bd,
  shellOverlays,
  detailSheet,
  renderBottomNav,
  setShowSettings,
  onOpenGuide,
  onOpenCoach,
  isFav,
  toggleFav,
  openDetail,
  toggle,
  toggleProgramExercise,
  isDone,
  completed,
}) {
  const [query, setQuery] = useState("");
  const [customWorkouts, setCustomWorkouts] = useState(() => readCustomWorkouts());
  const [buildName, setBuildName] = useState("");
  const [buildPicks, setBuildPicks] = useState([]);
  const [buildMode, setBuildMode] = useState("day");
  const [buildWeekDays, setBuildWeekDays] = useState(emptyWeekDays);
  const [activeBuildDay, setActiveBuildDay] = useState(getTodayWeekDayKey);
  /* Transient "Link copied" confirmation — cleared on a timer, so it never needs to
     survive a re-render or be threaded anywhere. */
  const [shareNote, setShareNote] = useState(null);
  /* Set only when both the share sheet and the clipboard are unavailable (an unfocused
     document refuses a clipboard write, and some in-app browsers block both). Shows the
     link in a selectable field so it is still copyable by hand — no timer, because the
     reader needs as long as it takes. */
  const [shareFallbackUrl, setShareFallbackUrl] = useState(null);
  const [missionFocus, setMissionFocus] = useState("mission");
  const [missionIntensity, setMissionIntensity] = useState("medium");
  const [buildCatFilter, setBuildCatFilter] = useState("all");
  const [buildPickQuery, setBuildPickQuery] = useState("");

  const enrollProg = (prog) => {
    enrollProgram(prog);
    setProgramSegment("myPlan");
  };

  const unenrollProg = (progId) => {
    const nextEnrolled = { ...enrolledPrograms };
    delete nextEnrolled[progId];
    setEnrolledPrograms(nextEnrolled);
    safePersistKey("fkh-programs", nextEnrolled, { force: true });
    if (selectedProgram === progId) setSelectedProgram(null);
  };

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return { programs: [], exercises: [] };
    const qLower = q.toLowerCase();
    const matchedPrograms = programs.filter(p =>
      `${p.name} ${p.desc}`.toLowerCase().includes(qLower),
    );
    const matchedExercises = searchExercises(q, 20);
    return { programs: matchedPrograms, exercises: matchedExercises };
  }, [query, programs, searchExercises]);

  const favExercises = useMemo(() => (
    Object.entries(favorites?.exercises || {})
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => allExercises[id])
      .filter(Boolean)
  ), [favorites, allExercises]);

  const openExercise = (ex, list = [], ctx = null) => {
    const enriched = { ...ex, meta: ex.meta || exerciseMeta[ex.id] || {} };
    const base = list.map(e => ({ ...e, meta: e.meta || exerciseMeta[e.id] || {} }));
    const fullList = withSessionWarmup(base, workouts, exerciseMeta, {
      categories: categoriesFromExercises(base, allExercises),
    });
    openDetail(enriched, fullList, ctx);
  };

  const startCustomList = (entryOrIds) => {
    const entry = Array.isArray(entryOrIds)
      ? { exerciseIds: entryOrIds, type: "day" }
      : entryOrIds;
    const exerciseIds = exerciseIdsForCustomWorkout(entry);
    const exs = exerciseIds.map(id => allExercises[id]).filter(Boolean);
    if (!exs.length) return;
    openExercise(exs[0], exs);
  };

  const saveBuiltWorkout = () => {
    if (buildMode === "week") {
      const days = buildWeekDays;
      const total = WEEK_DAY_KEYS.reduce((n, k) => n + (days[k]?.length || 0), 0);
      const daysWithDrills = WEEK_DAY_KEYS.filter(k => (days[k]?.length || 0) >= 2).length;
      if (total < 2 || daysWithDrills < 1) return;
      const entry = saveCustomWorkout({ name: buildName || "My Week", type: "week", days });
      setCustomWorkouts(readCustomWorkouts());
      setBuildName("");
      setBuildWeekDays(emptyWeekDays());
      startCustomList(entry);
      return;
    }
    if (buildPicks.length < 2) return;
    const entry = saveCustomWorkout({ name: buildName || "My Workout", exerciseIds: buildPicks });
    setCustomWorkouts(readCustomWorkouts());
    setBuildName("");
    setBuildPicks([]);
    startCustomList(entry);
  };

  const toggleBuildPick = (exId) => {
    if (buildMode === "week") {
      setBuildWeekDays(prev => {
        const dayList = prev[activeBuildDay] || [];
        const next = dayList.includes(exId)
          ? dayList.filter(id => id !== exId)
          : [...dayList, exId];
        return { ...prev, [activeBuildDay]: next };
      });
      return;
    }
    setBuildPicks(prev => prev.includes(exId) ? prev.filter(id => id !== exId) : [...prev, exId]);
  };

  const activeBuildPicks = buildMode === "week" ? (buildWeekDays[activeBuildDay] || []) : buildPicks;
  const weekPlanTotal = WEEK_DAY_KEYS.reduce((n, k) => n + (buildWeekDays[k]?.length || 0), 0);
  const canSaveWeek = WEEK_DAY_KEYS.some(k => (buildWeekDays[k]?.length || 0) >= 2);
  const canSaveDay = buildPicks.length >= 2;

  const buildExerciseList = useMemo(() => {
    const q = buildPickQuery.trim().toLowerCase();
    let list = Object.values(allExercises);
    if (buildCatFilter === "favorites") {
      list = favExercises;
    } else if (buildCatFilter !== "all") {
      list = list.filter(ex => ex._cat === buildCatFilter);
    }
    if (q.length >= 2) {
      list = list.filter(ex =>
        `${ex.name} ${ex._cat} ${cats[ex._cat]?.label || ""}`.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [allExercises, buildCatFilter, buildPickQuery, favExercises, cats]);

  const generateFromMission = () => {
    const w = generateCustomMissionWorkout({
      settings,
      workouts,
      exerciseMeta,
      focusId: missionFocus,
      intensityId: missionIntensity,
      mission: todayMission,
      allExercises,
    });
    if (!w?.exercises?.length) return;
    openExercise(w.exercises[0], w.exercises);
  };

  const onShareProgram = async (prog) => {
    setShareFallbackUrl(null);
    const res = await shareProgram(prog);
    track(ANALYTICS_EVENTS.PROGRAM_SHARE, { program_id: prog.id, method: res.method });
    /* Backing out of the OS sheet is a non-event — showing "copied" there would be a lie. */
    if (res.method === "dismissed" || res.method === "shared") return;
    if (res.method === "copied") {
      setShareNote("Link copied");
      setTimeout(() => setShareNote(null), 2400);
      return;
    }
    setShareFallbackUrl(res.url || null);
  };

  if (selectedProgram) {
    const prog = programs.find(p => p.id === selectedProgram);
    if (prog) {
      const enrollment = enrolledPrograms[prog.id];
      const curWeekNum = enrollment ? programCurrentWeek(enrollment.startDate, prog.duration) : 1;
      const pct = Math.round(computeProgramProgress(prog, programProgress) * 100);
      const sessionDone = (week, sessionIdx) => isProgramSessionComplete(prog, programProgress, week, sessionIdx);
      const totalSessions = prog.weeks.reduce((s, w) => s + w.sessions.length, 0);
      const doneSessions = countProgramSessionsDone(prog, programProgress);
      const today = todayKey();
      const schedStatus = enrollment
        ? getActiveProgramScheduleStatus(prog, enrollment, programProgress, today)
        : null;
      const todayPlan = enrollment
        ? buildTrainingDayPlan(today, schedule, [prog], enrolledPrograms, programProgress, workouts)
        : null;
      const timesFinished = programCompletionCount(prog, programProgress);
      /* A finished program retires from the enrolled list, so "finished" is history, not
         enrollment. The completing render can still see it enrolled for a moment. */
      const finished = schedStatus?.kind === "programComplete" || (!enrollment && timesFinished > 0);
      const locked = !enrollment && isProgramLocked(prog, programs, earnedBadges);
      const baseProg = prog.advancedOf ? programs.find(p => p.id === prog.advancedOf) : null;
      const nextProg = finished ? suggestNextProgram(prog.id, programs, enrolledPrograms, earnedBadges) : null;
      const showMarks = !!enrollment || finished;

      return (
        <div style={{ background:BG,minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:80 }}>
          {shellOverlays}
          {detailSheet}

          <div style={{ padding:"16px 18px 0" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
              <button onClick={() => setSelectedProgram(null)}
                style={{ padding:"6px 14px",borderRadius:8,border:`1px solid ${prog.color}30`,background:`${prog.color}14`,color:prog.color,fontSize:12,fontWeight:700,cursor:"pointer" }}>
                ← Programs
              </button>
              <div style={{ flex:1 }} />
              {shareNote && (
                <span style={{ fontSize:11,fontWeight:700,color:prog.color,maxWidth:170,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                  {shareNote}
                </span>
              )}
              <button onClick={() => onShareProgram(prog)} aria-label={`Share ${prog.name}`}
                style={{ padding:"6px 14px",borderRadius:8,border:`1px solid ${prog.color}30`,background:`${prog.color}14`,color:prog.color,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0 }}>
                Share
              </button>
            </div>
            {shareFallbackUrl && (
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:`1px solid ${prog.color}22` }}>
                <input readOnly value={shareFallbackUrl} onFocus={(e) => e.target.select()}
                  aria-label="Program link"
                  style={{ flex:1,minWidth:0,background:"transparent",border:"none",color:"var(--fkh-text)",fontSize:11,outline:"none" }} />
                <button onClick={() => setShareFallbackUrl(null)}
                  style={{ background:"none",border:"none",color:"#64748b",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0 }}>
                  Done
                </button>
              </div>
            )}
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:12 }}>
              <ProgramIcon prog={prog} size={72} active />
              <div>
                <div style={{ fontSize:20,fontWeight:800,color:"var(--fkh-text)",lineHeight:1.2 }}>{prog.name}</div>
                <div style={{ fontSize:11,color:"#64748b",marginTop:2 }}>{programCadenceLabel(prog)} · Ages {prog.ageRange[0]}–{prog.ageRange[1]}</div>
              </div>
            </div>
            {(() => {
              /* The detail page is where the partner's mark gets real size. Free artwork shows
                 at its natural aspect; boxed artwork stays square in a rounded tile. */
              const brand = getBrandLogo(prog.brandLogo);
              if (!brand) return null;
              const boxed = brand.style === "boxed";
              return (
                <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:14,padding:"12px 14px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:`1px solid ${prog.color}22` }}>
                  <img
                    src={brand.mark}
                    alt={brand.name}
                    style={{ height:52,width:boxed ? 52 : "auto",maxWidth:132,objectFit:"contain",borderRadius:boxed ? 10 : 0,flexShrink:0,display:"block" }}
                  />
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:9,fontWeight:800,letterSpacing:"0.1em",color:"#64748b" }}>PROGRAM BY</div>
                    <div style={{ fontSize:13,fontWeight:800,color:"var(--fkh-text)",marginTop:2 }}>{brand.name}</div>
                  </div>
                </div>
              );
            })()}

            <p style={{ fontSize:13,color:"var(--fkh-text-muted)",lineHeight:1.6,margin:"0 0 14px" }}>{prog.desc}</p>

            <div style={{ background:SF,borderRadius:12,padding:"12px 14px",border:`1px solid ${prog.color}22`,marginBottom:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                <span style={{ fontSize:11,fontWeight:700,color:prog.color }}>{pct}% complete</span>
                <span style={{ fontSize:11,color:"#475569" }}>{doneSessions}/{totalSessions} sessions</span>
              </div>
              <div style={{ height:6,borderRadius:99,background:"rgba(255,255,255,0.06)" }}>
                <div style={{ height:"100%",width:`${pct}%`,borderRadius:99,background:`linear-gradient(90deg,${prog.color},${prog.color}bb)`,transition:"width 0.4s" }}/>
              </div>
              {enrollment && (
                <div style={{ marginTop:8,fontSize:11,color:"#475569" }}>
                  {prog.cadence === "daily"
                    ? <>Currently on <span style={{ color:prog.color,fontWeight:700 }}>Day {programDayNumber(prog, enrollment.startDate, curWeekNum)}</span> of {prog.totalDays}</>
                    : <>Currently on <span style={{ color:prog.color,fontWeight:700 }}>Week {curWeekNum}</span> of {prog.duration}</>}
                </div>
              )}
              {timesFinished > 0 && (
                <div style={{ marginTop:4,fontSize:11,color:"#22c55e",fontWeight:700 }}>
                  🏅 Finished {timesFinished === 1 ? "once" : `${timesFinished}×`}
                </div>
              )}
            </div>

            {finished ? (
              <>
                <div style={{ marginBottom:12,padding:"14px",borderRadius:12,background:`linear-gradient(135deg,${prog.color}22,${prog.color}0c)`,border:`1px solid ${prog.color}44`,textAlign:"center" }}>
                  <div style={{ fontSize:24,marginBottom:4 }}>🎉</div>
                  <div style={{ fontSize:14,fontWeight:800,color:"var(--fkh-text)" }}>You finished this program!</div>
                  <div style={{ fontSize:12,color:"#94a3b8",marginTop:3 }}>It's saved in your Completed programs.</div>
                </div>
                {nextProg && (
                  <div style={{ marginBottom:10,padding:"13px 14px",borderRadius:12,background:`${nextProg.color}0c`,border:`1px solid ${nextProg.color}33` }}>
                    <div style={{ fontSize:10,fontWeight:800,color:nextProg.color,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8 }}>{nextProg.advancedOf === prog.id ? "⬆️ Level Up" : "Up Next"}</div>
                    <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                      <ProgramIcon prog={nextProg} size={40} />
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:13,fontWeight:800,color:"var(--fkh-text)" }}>{nextProg.name}</div>
                        <div style={{ fontSize:11,color:"#64748b",marginTop:1 }}>{programCadenceLabel(nextProg)}</div>
                      </div>
                      <button onClick={() => setSelectedProgram(nextProg.id)}
                        style={{ padding:"8px 12px",borderRadius:8,border:"none",background:nextProg.color,color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0 }}>
                        View →
                      </button>
                    </div>
                  </div>
                )}
                <button onClick={() => { if (window.confirm(`Start ${prog.name} again from Week 1? Your badge stays.`)) enrollProg(prog); }}
                  style={{ width:"100%",padding:"11px",borderRadius:10,border:`1px solid ${prog.color}40`,background:"transparent",color:prog.color,fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:18 }}>
                  Do it again ↻
                </button>
              </>
            ) : locked ? (
              <button onClick={() => setSelectedProgram(baseProg.id)}
                style={{ width:"100%",padding:"13px",borderRadius:12,border:`1px dashed ${prog.color}55`,background:`${prog.color}0a`,color:"var(--fkh-text-muted)",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:18 }}>
                🔒 Finish {baseProg.name} to unlock Level {prog.level}
              </button>
            ) : enrollment
              ? <button onClick={() => { if (window.confirm("Leave this program? Your exercise progress is kept.")) unenrollProg(prog.id); }}
                  style={{ width:"100%",padding:"11px",borderRadius:10,border:`1px solid ${prog.color}30`,background:"transparent",color:"#64748b",fontSize:12,fontWeight:600,cursor:"pointer",marginBottom:18 }}>
                  Leave Program
                </button>
              : <button onClick={() => enrollProg(prog)}
                  style={{ width:"100%",padding:"13px",borderRadius:12,border:"none",background:prog.color,color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer",marginBottom:18,boxShadow:`0 4px 16px ${prog.color}50` }}>
                  Start Program →
                </button>
            }

            <div style={{ fontSize:11,color:"#64748b",lineHeight:1.55,margin:"-8px 0 16px",padding:"10px 12px",borderRadius:10,background:"rgba(255,255,255,0.03)",border:`1px solid ${bd}` }}>
              {(() => {
                /* Both numbers used to be hardcoded (3 drills, rest days between). Cramer 29 is
                   one drill a day with no rest days, so read the shape off the program. */
                const perSession = prog.weeks[0]?.sessions[0]?.exercises.length ?? 3;
                return (
                  <>
                    Each session is <span style={{ color:"var(--fkh-text)",fontWeight:700 }}>{perSession} focused drill{perSession === 1 ? "" : "s"}</span>
                    {prog.cadence === "daily"
                      ? <>, every day for {prog.totalDays} days straight — no rest days, that's the challenge.</>
                      : <>, {prog.daysPerWeek}× per week with rest days in between.</>}
                  </>
                );
              })()}
              {enrollment && todayPlan?.scheduleDay?.cats?.length > 0 && (
                <> On program days, your general plan ({todayPlan.scheduleDay.label}) adds more drills — see <span style={{ color:prog.color,fontWeight:700 }}>Today → Training</span> or the calendar.</>
              )}
            </div>

            {enrollment && schedStatus && !finished && (
              <div style={{ marginBottom:16,padding:"11px 13px",borderRadius:12,background:`${prog.color}0c`,border:`1px solid ${prog.color}33` }}>
                <div style={{ fontSize:10,fontWeight:800,color:prog.color,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4 }}>Today</div>
                {schedStatus.kind === "due" && (
                  <div style={{ fontSize:12,color:"var(--fkh-text)",lineHeight:1.5 }}>
                    Session due: <span style={{ fontWeight:700 }}>{schedStatus.session.focus}</span>
                    {" "}({schedStatus.session.exercises.length} drills)
                  </div>
                )}
                {(schedStatus.kind === "rest" || schedStatus.kind === "restAfterSession") && (
                  <div style={{ fontSize:12,color:"#94a3b8",lineHeight:1.5 }}>
                    Program rest day{schedStatus.opensLabel ? ` — next session ${schedStatus.opensLabel}` : ""}.
                    {todayPlan?.scheduleDay?.cats?.length > 0 && (
                      <> General training still on: {todayPlan.scheduleDay.label}.</>
                    )}
                  </div>
                )}
                {schedStatus.kind === "weekComplete" && (
                  <div style={{ fontSize:12,color:"#22c55e",fontWeight:600 }}>Week {schedStatus.week} complete ✓</div>
                )}
              </div>
            )}
          </div>

          {prog.weeks.map(week => {
            const isCurrent = enrollment && week.week === curWeekNum;
            const isUnlocked = !enrollment || week.week <= curWeekNum;
            const isFuture = enrollment && week.week > curWeekNum;
            const weekDone = week.sessions.every((_, si) => sessionDone(week.week, si));
            const weekPct = Math.round((week.sessions.filter((_, si) => sessionDone(week.week, si)).length / week.sessions.length) * 100);
            return (
              <div key={week.week} style={{ margin:"0 18px 12px",borderRadius:14,
                border:`1px solid ${isCurrent ? prog.color+"44" : "rgba(255,255,255,0.07)"}`,
                background:isCurrent ? `${prog.color}08` : SF,overflow:"hidden" }}>
                <div style={{ padding:"13px 14px",display:"flex",alignItems:"center",gap:10 }}>
                  <div style={{ width:32,height:32,borderRadius:8,
                    background:weekDone ? `${prog.color}20` : isCurrent ? `${prog.color}18` : "rgba(255,255,255,0.05)",
                    border:`1px solid ${weekDone ? prog.color+"44" : isCurrent ? prog.color+"33" : "rgba(255,255,255,0.06)"}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:13,fontWeight:800,color:weekDone ? prog.color : isCurrent ? prog.color : "#475569",flexShrink:0 }}>
                    {weekDone ? "✓" : `W${week.week}`}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:2 }}>
                      <span style={{ fontSize:12,fontWeight:700,color:isCurrent?prog.color:"var(--fkh-text)" }}>
                        Week {week.week}
                      </span>
                      {isCurrent && <span style={{ fontSize:9,padding:"2px 7px",borderRadius:99,background:prog.color,color:"#fff",fontWeight:700 }}>CURRENT</span>}
                      {weekDone && <span style={{ fontSize:9,padding:"2px 7px",borderRadius:99,background:"rgba(34,197,94,0.15)",color:"#22c55e",fontWeight:700 }}>DONE</span>}
                    </div>
                    <div style={{ fontSize:11,color:"#64748b",lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{week.goal}</div>
                  </div>
                  <span style={{ fontSize:11,color:weekDone?"#22c55e":isCurrent?prog.color:"#475569",fontWeight:700,flexShrink:0 }}>{weekPct}%</span>
                </div>

                {(isUnlocked || !enrollment) && week.sessions.map((session, si) => {
                  const sDone = showMarks && sessionDone(week.week, si);
                  return (
                    <div key={si} style={{ margin:"0 12px 10px",borderRadius:10,
                      background:sDone ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.04)",
                      border:`1px solid ${sDone ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                      padding:"11px 13px" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:9 }}>
                        <span style={{ fontSize:12,fontWeight:700,color:sDone?"#22c55e":prog.color }}>{session.day}</span>
                        <span style={{ fontSize:10,color:"#64748b" }}>· {session.focus}</span>
                        {sDone && <span style={{ marginLeft:"auto",fontSize:10,color:"#22c55e",fontWeight:700 }}>✓ Done</span>}
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                        {(() => {
                          const ids = showMarks
                            ? programSessionExerciseIds(prog, programProgress, week.week, si)
                            : session.exercises;
                          /* Finished under a program's previous version: show what they actually did. */
                          const legacy = ids !== session.exercises;
                          const withDose = id => {
                            const dose = legacy ? null : programDose(prog, week.week, si, id);
                            return { ...allExercises[id], ...(dose ? { sets: dose } : {}) };
                          };
                          return ids.map(exId => {
                          if (!allExercises[exId]) return null;
                          const ex = withDose(exId);
                          const change = session.dose && !legacy ? doseChangeLabel(prog, week.week, exId, ex.sets, allExercises) : null;
                          const done = showMarks
                            ? isProgramExerciseDone(programProgress, prog.id, week.week, si, exId)
                            : !!completed[`${todayKey()}-${exId}`];
                          const sessionExList = withSessionWarmup(
                            ids.filter(id => allExercises[id]).map(id => ({ ...withDose(id), meta:allExercises[id].meta || exerciseMeta[id] || {} })),
                            workouts,
                            exerciseMeta,
                            { categories: ids.map(id => allExercises[id]?._cat).filter(Boolean) },
                          );
                          const pCtx = enrollment ? { programId: prog.id, week: week.week, sessionIdx: si } : null;
                          return (
                            <div key={exId} onClick={() => { const enriched = { ...ex, _cat:ex._cat, meta:ex.meta || exerciseMeta[exId] || {} }; openDetail(enriched, sessionExList, pCtx); }}
                              style={{ display:"flex",alignItems:"center",gap:9,padding:"7px 9px",borderRadius:8,
                                background:done?"rgba(34,197,94,0.08)":"rgba(255,255,255,0.04)",
                                border:`1px solid ${done?"rgba(34,197,94,0.18)":"rgba(255,255,255,0.05)"}`,
                                cursor:"pointer" }}>
                              <button disabled={!enrollment && finished} onClick={e => { e.stopPropagation();
                                if (enrollment) toggleProgramExercise(pCtx, exId);
                                else if (!finished) toggle(exId);
                              }}
                                style={{ width:20,height:20,borderRadius:6,border:`1.5px solid ${done?"#22c55e":prog.color+"60"}`,
                                  background:done?"#22c55e":"transparent",color:"#fff",fontSize:10,
                                  display:"flex",alignItems:"center",justifyContent:"center",cursor:!enrollment && finished ? "default" : "pointer",flexShrink:0,padding:0 }}>
                                {done?"✓":""}
                              </button>
                              <span style={{ flex:1,fontSize:12,fontWeight:600,color:done?"#22c55e":"var(--fkh-text)",lineHeight:1.3 }}>{ex.name}</span>
                              {change && (
                                <span style={{ fontSize:9,padding:"2px 6px",borderRadius:99,background:"rgba(34,197,94,0.14)",color:"#22c55e",fontWeight:800,flexShrink:0,whiteSpace:"nowrap" }}>
                                  {change === "NEW" ? "NEW" : `⬆ ${change}`}
                                </span>
                              )}
                              <span style={{ fontSize:session.dose && !legacy ? 11 : 9,fontWeight:session.dose && !legacy ? 700 : 400,color:session.dose && !legacy ? "var(--fkh-text-muted)" : "#475569",flexShrink:0,whiteSpace:"nowrap" }}>
                                {formatDose(ex.sets)}
                              </span>
                            </div>
                          );
                        });
                        })()}
                      </div>
                    </div>
                  );
                })}
                {isFuture && (
                  <div style={{ margin:"0 12px 12px", padding:"10px 12px", borderRadius:10,
                    background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize:11, color:"#64748b", lineHeight:1.5 }}>
                      🔒 Opens when you reach Week {week.week} on the calendar
                      {enrollment?.startDate && (() => {
                        const enrollStart = new Date(enrollment.startDate + "T00:00:00");
                        enrollStart.setDate(enrollStart.getDate() + (week.week - 1) * 7);
                        return ` (${enrollStart.toLocaleDateString("en-US", { month:"short", day:"numeric" })})`;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {renderBottomNav()}
        </div>
      );
    }
  }

  const programSegments = [
    { id: "forYou", label: "For You" },
    { id: "myPlan", label: "My Plan" },
    { id: "browse", label: "Browse" },
    { id: "completed", label: "Completed" },
  ];

  /* Featured programs lead every list. This has to be applied to the whole catalog BEFORE the
     "For You" fallback slices the first three — a featured program sitting at the end of
     PROGRAMS would otherwise never make that cut. Array.prototype.sort is stable, so
     equal-ranked programs keep their catalog order. */
  const featuredFirst = (list) =>
    [...list].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  const segmentPrograms = (() => {
    const ranked = featuredFirst(programs);
    if (programSegment === "forYou") {
      /* Featured programs survive the recommendation filter. Once an athlete picks a legend,
         recommendProgramsForFavorite() returns that path's programs and this used to filter
         the list down to exactly them — which silently hid every featured program from the
         default tab, the one place merchandising most needs to land. Featuring is a
         deliberate editorial call, so it outranks path fit rather than competing with it. */
      const ids = new Set(recommendedProgramIds);
      return ids.size ? ranked.filter(p => p.featured || ids.has(p.id)) : ranked.slice(0, 3);
    }
    if (programSegment === "myPlan") return ranked.filter(p => enrolledPrograms[p.id]);
    if (programSegment === "completed") {
      return ranked.filter(p =>
        earnedBadges.includes(p.badgeId) || programCompletionCount(p, programProgress) >= 1,
      );
    }
    return ranked;
  })();

  const segmentLabel = {
    forYou: recommendedProgramIds.length ? "Recommended for your game" : "Popular programs",
    myPlan: "Your active enrollments",
    browse: "All multi-week plans",
    completed: "Programs you've finished",
  }[programSegment];

  const renderProgramCard = (prog) => {
    const enrolled = !!enrolledPrograms[prog.id];
    const pct = enrolled ? Math.round(computeProgramProgress(prog, programProgress) * 100) : 0;
    const completedBadge = earnedBadges.includes(prog.badgeId);
    return (
      <div key={prog.id} onClick={() => setSelectedProgram(prog.id)}
        style={{ borderRadius:14,border:`1px solid ${enrolled?prog.color+"33":"rgba(255,255,255,0.07)"}`,
          background:enrolled?`${prog.color}08`:SF,
          padding:"16px",marginBottom:10,cursor:"pointer",
          boxShadow:enrolled?`0 2px 12px ${prog.color}18`:"none" }}>
        <div style={{ display:"flex",gap:12,alignItems:"flex-start" }}>
          <ProgramIcon prog={prog} size={48} active={enrolled} />
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap" }}>
              <span style={{ fontSize:14,fontWeight:800,color:"var(--fkh-text)" }}>{prog.name}</span>
              {prog.level && <span style={{ fontSize:9,padding:"2px 7px",borderRadius:99,border:`1px solid ${prog.color}66`,color:prog.color,fontWeight:800 }}>
                {isProgramLocked(prog, programs, earnedBadges) ? "🔒 " : ""}LEVEL {prog.level}
              </span>}
              {enrolled && <span style={{ fontSize:9,padding:"2px 7px",borderRadius:99,background:prog.color,color:"#fff",fontWeight:700 }}>ENROLLED</span>}
              {completedBadge && <span style={{ fontSize:9,padding:"2px 7px",borderRadius:99,background:"rgba(34,197,94,0.2)",color:"#22c55e",fontWeight:700 }}>✓ DONE</span>}
              <TrainerCredit prog={prog} />
            </div>
            <div style={{ fontSize:11,color:"#64748b",marginBottom:6 }}>{programCadenceLabel(prog, "x/week")} · Ages {prog.ageRange[0]}–{prog.ageRange[1]}</div>
            {(() => {
              const pathTag = pathTagForProgram(prog.id);
              return pathTag ? (
                <div style={{ fontSize:10,color:P,fontWeight:700,marginBottom:6 }}>Builds your {pathTag}</div>
              ) : null;
            })()}
            <div style={{ fontSize:12,color:"var(--fkh-text-muted)",lineHeight:1.4 }}>{prog.desc}</div>
            {enrolled && (
              <div style={{ marginTop:8 }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <span style={{ fontSize:10,color:prog.color,fontWeight:600 }}>{pct}% complete</span>
                </div>
                <div style={{ height:4,borderRadius:99,background:"rgba(255,255,255,0.08)" }}>
                  <div style={{ height:"100%",width:`${pct}%`,borderRadius:99,background:prog.color }}/>
                </div>
              </div>
            )}
          </div>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6,flexShrink:0 }}>
            <button onClick={e => { e.stopPropagation(); toggleFav("programs", prog.id); }}
              style={{ width:28,height:28,borderRadius:8,
                border:`1px solid ${isFav("programs", prog.id)?"rgba(250,204,21,0.45)":"rgba(250,204,21,0.22)"}`,
                background:isFav("programs", prog.id)?"rgba(250,204,21,0.1)":"transparent",
                color:isFav("programs", prog.id)?"#fbbf24":"rgba(250,204,21,0.5)",
                fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
              {isFav("programs", prog.id)?"⭐":"☆"}
            </button>
            <span style={{ fontSize:16,color:"#475569" }}>›</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ background:BG,minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:80 }}>
      {shellOverlays}
      {detailSheet}

      <div style={{ padding:"20px 18px 6px" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4 }}>
          <div>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.18em",color:`${P}70`,textTransform:"uppercase",marginBottom:4 }}>Training System</div>
            <h1 style={{ fontSize:22,fontWeight:800,color:"var(--fkh-text)",margin:0 }}>Programs 📋</h1>
          </div>
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            <button onClick={() => setShowSettings(true)} style={{ padding:"8px 10px",borderRadius:10,border:`1px solid ${bd}`,background:SF,color:"#64748b",fontSize:14,cursor:"pointer" }}>⚙️</button>
            {onOpenCoach && <CoachNavButton P={P} onClick={onOpenCoach} />}
            {onOpenGuide && <GuideNavButton onClick={() => onOpenGuide("explore")} />}
          </div>
        </div>
        <p style={{ fontSize:12,color:"#64748b",margin:"8px 0 12px",lineHeight:1.5 }}>
          Plans, drills, quick workouts, and custom sessions — all in one place.
        </p>

        <div style={{ position:"relative",marginBottom:12 }}>
          <span style={{ position:"absolute",left:12,top:11,fontSize:14,pointerEvents:"none" }}>🔍</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search programs & exercises…"
            style={{
              width:"100%",padding:"10px 14px 10px 36px",borderRadius:12,border:`1px solid ${bd}`,
              background:SF,color:"var(--fkh-text)",fontSize:14,boxSizing:"border-box",outline:"none",
            }}
          />
        </div>
      </div>

      {query.trim().length >= 2 && (
        <div style={{ padding:"0 18px 14px" }}>
          {searchResults.programs.length > 0 && (
            <>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.14em",color:`${P}70`,textTransform:"uppercase",marginBottom:8 }}>Programs</div>
              {searchResults.programs.map(renderProgramCard)}
            </>
          )}
          {searchResults.exercises.length > 0 && (
            <>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.14em",color:`${P}70`,textTransform:"uppercase",marginBottom:8,marginTop:searchResults.programs.length?12:0 }}>Exercises</div>
              {searchResults.exercises.map(ex => {
                const catInfo = cats[ex._cat] || { emoji:"🏀", label:ex._cat };
                return (
                  <button key={ex.id} type="button" onClick={() => openExercise(ex)} style={{
                    width:"100%",padding:"10px 12px",marginBottom:6,borderRadius:10,border:`1px solid ${bd}`,
                    background:SF,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10,
                  }}>
                    <span>{catInfo.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12,fontWeight:700,color:isDone(ex.id)?"#22c55e":"var(--fkh-text)" }}>{ex.name}</div>
                      <div style={{ fontSize:10,color:"#64748b" }}>{catInfo.label}</div>
                    </div>
                    <button type="button" onClick={e => { e.stopPropagation(); toggleFav("exercises", ex.id); }}
                      style={{ background:"none",border:"none",fontSize:14,cursor:"pointer",color:isFav("exercises",ex.id)?"#fbbf24":"#475569" }}>
                      {isFav("exercises",ex.id)?"⭐":"☆"}
                    </button>
                  </button>
                );
              })}
            </>
          )}
          {!searchResults.programs.length && !searchResults.exercises.length && (
            <div style={{ fontSize:12,color:"#64748b",textAlign:"center",padding:12 }}>No matches</div>
          )}
        </div>
      )}

      {query.trim().length < 2 && (
        <>
          <div style={{ display:"flex",gap:6,padding:"0 18px 12px",overflowX:"auto" }}>
            {HUB_SECTIONS.map(seg => (
              <button key={seg.id} onClick={() => setProgramsHubSection(seg.id)} style={{
                flexShrink:0,padding:"8px 14px",borderRadius:999,fontSize:12,fontWeight:800,cursor:"pointer",
                border:`1px solid ${programsHubSection===seg.id?P:bd}`,
                background:programsHubSection===seg.id?`${P}20`:"transparent",
                color:programsHubSection===seg.id?P:"#64748b",
                display:"flex",alignItems:"center",gap:5,
              }}>
                <span>{seg.emoji}</span>{seg.label}
              </button>
            ))}
          </div>

          {programsHubSection === "plans" && (
            <>
              <div style={{ display:"flex",gap:6,padding:"0 18px 12px",overflowX:"auto" }}>
                {programSegments.map(seg => (
                  <button key={seg.id} onClick={() => setProgramSegment(seg.id)} style={{
                    flexShrink:0,padding:"6px 12px",borderRadius:999,fontSize:11,fontWeight:700,cursor:"pointer",
                    border:`1px solid ${programSegment===seg.id?P+"55":bd}`,
                    background:programSegment===seg.id?`${P}14`:"transparent",
                    color:programSegment===seg.id?P:"#64748b",
                  }}>{seg.label}</button>
                ))}
              </div>
              <div style={{ padding:"0 18px 0" }}>
                <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.18em",color:`${P}70`,textTransform:"uppercase",marginBottom:10 }}>
                  {segmentLabel}
                </div>
                {segmentPrograms.length === 0 && (
                  <div style={{ fontSize:12,color:"#64748b",lineHeight:1.5,marginBottom:16,padding:"12px 14px",borderRadius:12,border:`1px solid ${bd}`,background:SF }}>
                    {programSegment === "myPlan" && "No active programs — browse For You or start a plan below."}
                    {programSegment === "completed" && "No completed programs yet."}
                    {programSegment === "forYou" && "Set a favorite player in Settings to get personalized picks."}
                  </div>
                )}
                {segmentPrograms.map(renderProgramCard)}
              </div>
            </>
          )}

          {programsHubSection === "drills" && (
            <div style={{ padding:"0 18px" }}>
              {favExercises.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.14em",color:`${P}70`,textTransform:"uppercase",marginBottom:8 }}>⭐ Favorites</div>
                  <div style={{ display:"flex",gap:8,overflowX:"auto",paddingBottom:4 }}>
                    {favExercises.map(ex => (
                      <button key={ex.id} type="button" onClick={() => openExercise(ex)} style={{
                        flexShrink:0,padding:"10px 12px",borderRadius:12,border:`1px solid ${P}33`,
                        background:`${P}0c`,cursor:"pointer",minWidth:130,textAlign:"left",
                      }}>
                        <div style={{ fontSize:12,fontWeight:700,color:"var(--fkh-text)" }}>{ex.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.14em",color:`${P}70`,textTransform:"uppercase",marginBottom:10 }}>Training Modules</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                {Object.entries(cats).map(([key, cat]) => {
                  const total = (workouts[key] || []).length;
                  const done = (workouts[key] || []).filter(ex => isDone(ex.id)).length;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  return (
                    <button key={key} type="button" onClick={() => onPickCategory?.(key)} style={{
                      padding:"12px",borderRadius:14,border:`1px solid ${bd}`,background:SF,
                      cursor:"pointer",textAlign:"left",
                    }}>
                      <div style={{ fontSize:20 }}>{cat.emoji}</div>
                      <div style={{ fontSize:12,fontWeight:800,color:"var(--fkh-text)",marginTop:4 }}>{cat.label}</div>
                      <div style={{ fontSize:10,color:"#64748b",marginTop:2 }}>{done}/{total} · {pct}%</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {programsHubSection === "quick" && (
            <div style={{ padding:"0 18px" }}>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.14em",color:`${P}70`,textTransform:"uppercase",marginBottom:10 }}>Quick Workout Templates</div>
              <p style={{ fontSize:12,color:"#64748b",lineHeight:1.5,margin:"0 0 12px" }}>
                Age-aware sessions built from your drill library. Star a template to favorite it.
              </p>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {Object.entries(workoutTemplates).map(([key, tmpl]) => (
                  <div key={key} style={{ borderRadius:14,border:`1px solid ${bd}`,background:SF,padding:"14px",display:"flex",alignItems:"center",gap:12 }}>
                    <div style={{ fontSize:28 }}>{tmpl.emoji}</div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:14,fontWeight:800,color:"var(--fkh-text)" }}>{tmpl.name}</div>
                      <div style={{ fontSize:11,color:"#64748b",marginTop:2,lineHeight:1.4 }}>{tmpl.desc}</div>
                    </div>
                    <div style={{ display:"flex",flexDirection:"column",gap:6,flexShrink:0 }}>
                      <button type="button" onClick={() => toggleFav("workouts", key)}
                        style={{ width:32,height:32,borderRadius:8,border:`1px solid ${isFav("workouts",key)?"rgba(250,204,21,0.45)":"rgba(250,204,21,0.22)"}`,
                          background:"transparent",color:isFav("workouts",key)?"#fbbf24":"#64748b",fontSize:14,cursor:"pointer" }}>
                        {isFav("workouts",key)?"⭐":"☆"}
                      </button>
                      <button type="button" onClick={() => startQuickWorkout?.(key)}
                        style={{ padding:"8px 12px",borderRadius:8,border:"none",background:P,color:"#fff",fontSize:11,fontWeight:800,cursor:"pointer" }}>
                        Start
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {programsHubSection === "build" && (
            <div style={{ padding:"0 18px" }}>
              <div style={{ borderRadius:14,border:`1px solid ${P}33`,background:`${P}0a`,padding:"14px",marginBottom:14 }}>
                <div style={{ fontSize:13,fontWeight:800,color:"var(--fkh-text)",marginBottom:8 }}>🎯 Generate Mission Workout</div>
                <div style={{ fontSize:11,color:"#64748b",fontWeight:700,marginBottom:6 }}>What do you want to work on?</div>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12 }}>
                  {BUILD_FOCUS_OPTIONS.map(opt => (
                    <button key={opt.id} type="button" onClick={() => setMissionFocus(opt.id)} style={{
                      padding:"7px 10px",borderRadius:999,fontSize:11,fontWeight:800,cursor:"pointer",
                      border:`1px solid ${missionFocus===opt.id?P:bd}`,
                      background:missionFocus===opt.id?`${P}18`:"transparent",
                      color:missionFocus===opt.id?P:"#64748b",
                    }}>
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:11,color:"#64748b",fontWeight:700,marginBottom:6 }}>How hard should it be?</div>
                <div style={{ display:"flex",gap:6,marginBottom:10 }}>
                  {BUILD_INTENSITY_OPTIONS.map(opt => (
                    <button key={opt.id} type="button" onClick={() => setMissionIntensity(opt.id)} style={{
                      flex:1,padding:"10px 8px",borderRadius:10,fontSize:11,fontWeight:800,cursor:"pointer",textAlign:"left",
                      border:`1px solid ${missionIntensity===opt.id?P:bd}`,
                      background:missionIntensity===opt.id?`${P}18`:"transparent",
                      color:missionIntensity===opt.id?P:"#64748b",
                    }}>
                      <div>{opt.emoji} {opt.label}</div>
                      <div style={{ fontSize:9,fontWeight:600,marginTop:3,opacity:0.85 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
                {missionFocus === "mission" && todayMission?.title && (
                  <div style={{ fontSize:11,color:"#64748b",lineHeight:1.45,marginBottom:10 }}>
                    Includes drills from: {todayMission.title}
                  </div>
                )}
                <button type="button" onClick={generateFromMission}
                  style={{ width:"100%",padding:"11px",borderRadius:10,border:"none",background:P,color:"#fff",fontSize:13,fontWeight:800,cursor:"pointer" }}>
                  Generate & Start Workout →
                </button>
              </div>

              {customWorkouts.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.14em",color:`${P}70`,textTransform:"uppercase",marginBottom:8 }}>Saved Workouts</div>
                  {customWorkouts.map(cw => (
                    <div key={cw.id} style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"12px",borderRadius:12,border:`1px solid ${bd}`,background:SF }}>
                      <span style={{ fontSize:22 }}>{cw.emoji}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13,fontWeight:700,color:"var(--fkh-text)" }}>{cw.name}</div>
                        <div style={{ fontSize:10,color:"#64748b" }}>
                          {cw.type === "week"
                            ? `${activeDaysInWeekPlan(cw)}-day plan · ${countCustomWorkoutExercises(cw)} drills`
                            : `${countCustomWorkoutExercises(cw)} exercises`}
                        </div>
                      </div>
                      <button type="button" onClick={() => startCustomList(cw)} style={{ padding:"7px 10px",borderRadius:8,border:`1px solid ${P}44`,background:`${P}12`,color:P,fontSize:11,fontWeight:700,cursor:"pointer" }}>Start</button>
                      <button type="button" onClick={() => { deleteCustomWorkout(cw.id); setCustomWorkouts(readCustomWorkouts()); }} style={{ background:"none",border:"none",color:"#64748b",fontSize:16,cursor:"pointer" }}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.14em",color:`${P}70`,textTransform:"uppercase",marginBottom:8 }}>Build Custom Workout</div>
              <div style={{ display:"flex",gap:6,marginBottom:12 }}>
                {[
                  { id:"day", label:"Single Day" },
                  { id:"week", label:"Weekly Plan" },
                ].map(opt => (
                  <button key={opt.id} type="button" onClick={() => setBuildMode(opt.id)} style={{
                    flex:1,padding:"9px 10px",borderRadius:10,fontSize:12,fontWeight:800,cursor:"pointer",
                    border:`1px solid ${buildMode===opt.id?P:bd}`,
                    background:buildMode===opt.id?`${P}18`:"transparent",
                    color:buildMode===opt.id?P:"#64748b",
                  }}>{opt.label}</button>
                ))}
              </div>
              <input
                value={buildName}
                onChange={e => setBuildName(e.target.value)}
                placeholder={buildMode === "week" ? "Week plan name (optional)" : "Workout name (optional)"}
                style={{ width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${bd}`,background:SF,color:"var(--fkh-text)",fontSize:13,marginBottom:10,boxSizing:"border-box" }}
              />
              {buildMode === "week" && (
                <>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:8,lineHeight:1.45 }}>
                    Pick a day, add drills, then repeat for each training day. At least one day needs 2+ drills.
                  </div>
                  <div style={{ display:"flex",gap:5,marginBottom:10,overflowX:"auto",paddingBottom:2 }}>
                    {WEEK_DAY_KEYS.map(key => {
                      const count = buildWeekDays[key]?.length || 0;
                      const isActive = activeBuildDay === key;
                      const isToday = getTodayWeekDayKey() === key;
                      return (
                        <button key={key} type="button" onClick={() => setActiveBuildDay(key)} style={{
                          flexShrink:0,minWidth:44,padding:"8px 6px",borderRadius:10,cursor:"pointer",
                          border:`1px solid ${isActive?P:bd}`,
                          background:isActive?`${P}18`:"transparent",
                          color:isActive?P:"#64748b",
                        }}>
                          <div style={{ fontSize:11,fontWeight:800 }}>{WEEK_DAY_LABELS[key]}</div>
                          <div style={{ fontSize:9,marginTop:2,opacity:0.85 }}>{count}{isToday ? " · today" : ""}</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div style={{ fontSize:11,color:"#64748b",marginBottom:8 }}>
                {buildMode === "week"
                  ? `${WEEK_DAY_LABELS[activeBuildDay]}: ${activeBuildPicks.length} selected · ${weekPlanTotal} total`
                  : `Tap exercises to add (${buildPicks.length} selected, min 2)`}
              </div>
              <input
                value={buildPickQuery}
                onChange={e => setBuildPickQuery(e.target.value)}
                placeholder="Search drills to add…"
                style={{ width:"100%",padding:"9px 12px",borderRadius:10,border:`1px solid ${bd}`,background:SF,color:"var(--fkh-text)",fontSize:13,marginBottom:8,boxSizing:"border-box" }}
              />
              <div style={{ display:"flex",gap:5,marginBottom:10,overflowX:"auto",paddingBottom:2 }}>
                {[
                  { id: "all", label: "All" },
                  { id: "favorites", label: "⭐ Favs" },
                  ...Object.entries(cats).map(([id, cat]) => ({ id, label: cat.label })),
                ].map(opt => (
                  <button key={opt.id} type="button" onClick={() => setBuildCatFilter(opt.id)} style={{
                    flexShrink:0,padding:"6px 10px",borderRadius:999,fontSize:10,fontWeight:800,cursor:"pointer",
                    border:`1px solid ${buildCatFilter===opt.id?P:bd}`,
                    background:buildCatFilter===opt.id?`${P}18`:"transparent",
                    color:buildCatFilter===opt.id?P:"#64748b",
                  }}>{opt.label}</button>
                ))}
              </div>
              <div style={{ maxHeight:280,overflowY:"auto",marginBottom:12 }}>
                {buildExerciseList.length === 0 && (
                  <div style={{ fontSize:12,color:"#64748b",textAlign:"center",padding:16 }}>
                    No drills match — try All or a different category.
                  </div>
                )}
                {buildExerciseList.map(ex => {
                  const picked = activeBuildPicks.includes(ex.id);
                  const catInfo = cats[ex._cat] || { label:ex._cat };
                  return (
                    <button key={ex.id} type="button" onClick={() => toggleBuildPick(ex.id)} style={{
                      width:"100%",padding:"9px 11px",marginBottom:5,borderRadius:9,cursor:"pointer",textAlign:"left",
                      border:`1px solid ${picked?P+"55":bd}`,
                      background:picked?`${P}14`:SF,
                      display:"flex",alignItems:"center",gap:8,
                    }}>
                      <span style={{ width:18,height:18,borderRadius:5,border:`1.5px solid ${picked?P:"#475569"}`,background:picked?P:"transparent",color:"#fff",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                        {picked?"✓":""}
                      </span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12,fontWeight:600,color:"var(--fkh-text)" }}>{ex.name}</div>
                        <div style={{ fontSize:10,color:"#64748b" }}>{catInfo.label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button type="button" disabled={buildMode === "week" ? !canSaveWeek : !canSaveDay} onClick={saveBuiltWorkout}
                style={{ width:"100%",padding:"12px",borderRadius:10,border:"none",
                  background:(buildMode === "week" ? canSaveWeek : canSaveDay)?P:"#334155",color:"#fff",fontSize:13,fontWeight:800,
                  cursor:(buildMode === "week" ? canSaveWeek : canSaveDay)?"pointer":"not-allowed",
                  opacity:(buildMode === "week" ? canSaveWeek : canSaveDay)?1:0.6 }}>
                {buildMode === "week" ? "Save Week Plan & Start Today →" : "Save & Start Workout →"}
              </button>
            </div>
          )}
        </>
      )}

      {renderBottomNav()}
    </div>
  );
}
