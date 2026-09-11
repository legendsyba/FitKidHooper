import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  TIMER_PREP_SECS, TIMER_WARN_SECS, TIMER_REST_WARN_SECS, TIMER_SWITCH_SECS,
  exerciseSideLabel, switchSpeechFor, parseExerciseSets, bilateralModeLabel,
  isBilateralEnabled, resolvePrescription, parseRestSeconds, setLogKey,
  timerAlert, announceCountdown, fmtTimerSecs,
} from "../lib/exerciseSession.js";
import { LEVELS, getLevel } from "../lib/levels.js";
import { CATS } from "../lib/categories.js";
import { BENEFIT_MAP, ALL_EXERCISES } from "../data/trainingCatalog.js";
import { getChainForExercise, getChainStatus } from "../lib/progressionChains.js";
import { useWakeLock } from "../lib/useWakeLock.js";
import { youtubeEmbedUrl } from "../lib/youtubeEmbedUrl.js";
import { ownThumbnail, thumbBackdrop } from "../lib/videoThumb.js";
import { track, ANALYTICS_EVENTS } from "../lib/analytics.js";

function ExerciseSetTracker({
  exercise, color, SF,
  prescription, restSecs,
  sets, onSetsChange,
  timersEnabled,
  maxReps, onMaxRepsChange,
  onAllSetsComplete,
  bilateralOn, bilateralUnit, onBilateralChange,
}) {
  const [timerPhase, setTimerPhase] = useState(null); // prep | work | switch | rest
  const [timerSecs, setTimerSecs] = useState(0);
  const [activeSetIdx, setActiveSetIdx] = useState(null);
  const [activeSideIdx, setActiveSideIdx] = useState(0);
  const [liveReps, setLiveReps] = useState(0);
  const liveRepsRef = useRef(0);
  const timerSecsRef = useRef(0);
  const warnedRef = useRef({ fifteen:false });
  const phaseRef = useRef(null);
  const setIdxRef = useRef(null);
  const sideIdxRef = useRef(0);
  const isBilateral = !!prescription.bilateral;

  const resetSide = useCallback(() => {
    sideIdxRef.current = 0;
    setActiveSideIdx(0);
  }, []);

  const stopTimer = useCallback(() => {
    setTimerPhase(null);
    setActiveSetIdx(null);
    phaseRef.current = null;
    setIdxRef.current = null;
    resetSide();
  }, [resetSide]);

  useEffect(() => { stopTimer(); }, [isBilateral, stopTimer]);

  const completeSet = useCallback((idx, reps=null) => {
    const finalReps = reps ?? liveRepsRef.current;
    const next = sets.map((s, i) => i===idx ? { ...s, done:true, reps:finalReps ?? s.reps, sidesDone:isBilateral ? [true, true] : s.sidesDone } : s);
    onSetsChange(next);
    if (finalReps != null && finalReps > (maxReps||0)) onMaxRepsChange(finalReps);
    const allDone = next.every(s => s.done);
    if (allDone) {
      stopTimer();
      onAllSetsComplete?.();
      return;
    }
    if (timersEnabled && idx < prescription.count - 1) {
      phaseRef.current = "rest";
      setIdxRef.current = idx;
      setActiveSetIdx(idx);
      setTimerPhase("rest");
      setTimerSecs(restSecs);
      warnedRef.current = { fifteen:false };
      resetSide();
      timerAlert("rest");
      announceCountdown(restSecs, restSecs <= TIMER_WARN_SECS ? 900 : 0);
    } else {
      stopTimer();
    }
  }, [sets, onSetsChange, maxReps, onMaxRepsChange, timersEnabled, restSecs, prescription.count, onAllSetsComplete, stopTimer, isBilateral, resetSide]);

  const armWorkInterval = useCallback((idx, sideIdx) => {
    sideIdxRef.current = sideIdx;
    setActiveSideIdx(sideIdx);
    phaseRef.current = "work";
    setIdxRef.current = idx;
    setActiveSetIdx(idx);
    setTimerPhase("work");
    setLiveReps(0);
    liveRepsRef.current = 0;
    const workDur = prescription.value || 30;
    announceCountdown(workDur, workDur <= TIMER_WARN_SECS ? 900 : 0);
    return workDur;
  }, [prescription.value]);

  const armSwitchInterval = useCallback(() => {
    sideIdxRef.current = 1;
    setActiveSideIdx(1);
    phaseRef.current = "switch";
    setTimerPhase("switch");
    timerAlert("switch", switchSpeechFor(prescription, 1));
    return TIMER_SWITCH_SECS;
  }, [prescription]);

  const finishWorkInterval = useCallback((idx, reps=null) => {
    if (isBilateral && sideIdxRef.current === 0) {
      setTimerSecs(TIMER_SWITCH_SECS);
      armSwitchInterval();
      return;
    }
    completeSet(idx, reps);
  }, [isBilateral, armSwitchInterval, completeSet]);

  useEffect(() => {
    if (!timerPhase) return;
    phaseRef.current = timerPhase;
    const id = setInterval(() => {
      // Read seconds from a ref and do all state changes here in the interval
      // callback — NOT inside a setState updater — so completing a set never
      // fires a parent setState during render.
      const next = timerSecsRef.current - 1;
      const phase = phaseRef.current;
      const idx = setIdxRef.current;
      const setSecs = v => { timerSecsRef.current = v; setTimerSecs(v); };

      if (phase === "prep") {
        if (next >= 1 && next <= TIMER_WARN_SECS) timerAlert("count", next);
        if (next <= 0) {
          timerAlert("begin");
          if (prescription.type === "time") { setSecs(armWorkInterval(idx, 0)); return; }
          stopTimer();
          return;
        }
        setSecs(next);
        return;
      }
      if (phase === "switch") {
        if (next >= 1 && next <= TIMER_WARN_SECS) timerAlert("count", next);
        if (next <= 0) {
          timerAlert("begin");
          setSecs(armWorkInterval(idx, 1));
          return;
        }
        setSecs(next);
        return;
      }
      if (phase === "work") {
        if (next >= 1 && next <= TIMER_WARN_SECS) timerAlert("count", next);
        if (next <= 0) {
          if (isBilateral && sideIdxRef.current === 0) { setSecs(armSwitchInterval()); return; }
          setSecs(0);
          completeSet(idx, liveRepsRef.current);
          return;
        }
        setSecs(next);
        return;
      }
      if (phase === "rest") {
        if (next === TIMER_REST_WARN_SECS && !warnedRef.current.fifteen) {
          warnedRef.current.fifteen = true;
          timerAlert("warn");
        }
        if (next >= 1 && next <= TIMER_WARN_SECS) timerAlert("count", next);
        if (next <= 0) {
          const nextIdx = idx + 1;
          timerAlert("begin");
          if (timersEnabled && prescription.type === "time") {
            resetSide();
            setSecs(armWorkInterval(nextIdx, 0));
            return;
          }
          stopTimer();
          return;
        }
        setSecs(next);
        return;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timerPhase, prescription, timersEnabled, isBilateral, armWorkInterval, armSwitchInterval, completeSet, stopTimer, resetSide]);

  useEffect(() => { liveRepsRef.current = liveReps; }, [liveReps]);
  useEffect(() => { timerSecsRef.current = timerSecs; }, [timerSecs]);

  useEffect(() => () => stopTimer(), [exercise?.id, stopTimer]);

  const startTimedSet = idx => {
    if (sets[idx]?.done) return;
    if (!timersEnabled) {
      toggleRepSet(idx);
      return;
    }
    resetSide();
    setIdxRef.current = idx;
    setActiveSetIdx(idx);
    setLiveReps(sets[idx]?.reps || 0);
    liveRepsRef.current = sets[idx]?.reps || 0;
    phaseRef.current = "prep";
    setTimerPhase("prep");
    setTimerSecs(TIMER_PREP_SECS);
    announceCountdown(TIMER_PREP_SECS);
  };

  const toggleRepSet = idx => {
    const s = sets[idx];
    if (!s) return;
    if (s.done) {
      onSetsChange(sets.map((x, i) => i===idx ? { ...x, done:false, sidesDone:isBilateral ? [false, false] : x.sidesDone } : x));
      stopTimer();
    } else if (isBilateral && !(s.sidesDone?.[0] && s.sidesDone?.[1])) {
      const sidesDone = s.sidesDone || [false, false];
      if (!sidesDone[0]) {
        onSetsChange(sets.map((x, i) => i===idx ? { ...x, sidesDone:[true, false] } : x));
        timerAlert("switch", switchSpeechFor(prescription, 1));
      } else {
        const reps = s.reps || 0;
        const next = sets.map((x, i) => i===idx ? { ...x, done:true, sidesDone:[true, true], reps } : x);
        onSetsChange(next);
        if (reps > (maxReps||0)) onMaxRepsChange(reps);
        if (next.every(x => x.done)) onAllSetsComplete?.();
        else if (timersEnabled && idx < prescription.count - 1) {
          setIdxRef.current = idx;
          setActiveSetIdx(idx);
          phaseRef.current = "rest";
          setTimerPhase("rest");
          setTimerSecs(restSecs);
          warnedRef.current = { fifteen:false };
          resetSide();
          timerAlert("rest");
          announceCountdown(restSecs, restSecs <= TIMER_WARN_SECS ? 900 : 0);
        }
      }
    } else {
      const next = sets.map((x, i) => i===idx ? { ...x, done:true } : x);
      onSetsChange(next);
      if (next.every(x => x.done)) onAllSetsComplete?.();
      else if (timersEnabled && idx < prescription.count - 1) {
        setIdxRef.current = idx;
        setActiveSetIdx(idx);
        phaseRef.current = "rest";
        setTimerPhase("rest");
        setTimerSecs(restSecs);
        warnedRef.current = { fifteen:false };
        resetSide();
        timerAlert("rest");
        announceCountdown(restSecs, restSecs <= TIMER_WARN_SECS ? 900 : 0);
      }
    }
  };

  const isTimed = prescription.type === "time";
  const baseTargetLabel = isTimed
    ? `${prescription.value}${prescription.maxValue ? `–${prescription.maxValue}` : ""}s`
    : prescription.value
      ? `${prescription.value}${prescription.maxValue ? `–${prescription.maxValue}` : ""} reps`
      : "complete";
  const targetLabel = isBilateral
    ? `${baseTargetLabel} each ${prescription.bilateral.unit}`
    : baseTargetLabel;

  const timerPhaseLabel = () => {
    if (timerPhase === "rest") return "Rest";
    if (timerPhase === "switch") return switchSpeechFor(prescription, activeSideIdx);
    const setNum = (activeSetIdx ?? 0) + 1;
    const side = exerciseSideLabel(prescription, activeSideIdx);
    if (timerPhase === "prep") return side ? `Set ${setNum} — ${side} — Get Ready` : `Set ${setNum} — Get Ready`;
    if (timerPhase === "work") return side ? `Set ${setNum} — ${side} — Go!` : `Set ${setNum} — Go!`;
    return "";
  };

  const timerPhaseStyle = timerPhase === "work" ? color : timerPhase === "rest" ? "#3b82f6" : timerPhase === "switch" ? "#f59e0b" : "rgba(255,255,255,0.12)";

  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:9 }}>
        <span style={{ fontSize:15 }}>📋</span>
        <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.18em",color:`${color}80`,textTransform:"uppercase" }}>
          Sets
        </span>
        <div style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:8 }}>
          {onBilateralChange && (
            <button type="button" onClick={()=>onBilateralChange(!bilateralOn)} aria-pressed={bilateralOn}
              title={bilateralOn ? "Right then left before rest — tap to do one side per set" : "Tap for right then left before rest"}
              style={{ padding:"4px 9px",borderRadius:999,flexShrink:0,
                border:`1px solid ${bilateralOn ? `${color}66` : "rgba(255,255,255,0.14)"}`,
                background:bilateralOn ? `${color}18` : "rgba(255,255,255,0.04)",
                color:bilateralOn ? color : "#64748b",
                fontSize:10,fontWeight:700,cursor:"pointer",
                display:"flex",alignItems:"center",gap:4,lineHeight:1 }}>
              <span style={{ fontSize:11,opacity:bilateralOn ? 1 : 0.55 }}>{bilateralOn ? "↔" : "•"}</span>
              {bilateralModeLabel(bilateralUnit, bilateralOn)}
            </button>
          )}
          {maxReps > 0 && isTimed && (
            <span style={{ fontSize:10,fontWeight:700,color:"#fbbf24",whiteSpace:"nowrap" }}>
              🏆 Best: {maxReps} reps
            </span>
          )}
        </div>
      </div>

      {timerPhase && (
        <div style={{ marginBottom:12,padding:"14px",borderRadius:12,textAlign:"center",
          background:timerPhase==="work" ? `${color}18` : timerPhase==="rest" ? "rgba(59,130,246,0.12)" : timerPhase==="switch" ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.06)",
          border:`1.5px solid ${timerPhaseStyle}` }}>
          <div style={{ fontSize:10,fontWeight:700,color:"var(--fkh-text-muted)",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4 }}>
            {timerPhaseLabel()}
          </div>
          <div style={{ fontFamily:"'DM Mono',monospace",fontSize:42,fontWeight:800,color:timerPhase==="work"?color:"var(--fkh-text)",lineHeight:1 }}>
            {fmtTimerSecs(timerSecs)}
          </div>
          {timerPhase==="work" && isTimed && (
            <div style={{ marginTop:10,display:"flex",alignItems:"center",justifyContent:"center",gap:12 }}>
              <button onClick={()=>setLiveReps(r=>{ const n=Math.max(0,r-1); liveRepsRef.current=n; return n; })}
                style={{ width:40,height:40,borderRadius:10,border:`1px solid ${color}44`,background:"rgba(0,0,0,0.2)",color:"#fff",fontSize:20,cursor:"pointer" }}>−</button>
              <div style={{ textAlign:"center",minWidth:70 }}>
                <div style={{ fontSize:24,fontWeight:800,color }}>{liveReps}</div>
                <div style={{ fontSize:9,color:"#64748b" }}>reps</div>
              </div>
              <button onClick={()=>setLiveReps(r=>{ const n=r+1; liveRepsRef.current=n; return n; })}
                style={{ width:40,height:40,borderRadius:10,border:"none",background:color,color:"#000",fontSize:20,fontWeight:800,cursor:"pointer" }}>+</button>
            </div>
          )}
          {timerPhase==="work" && (
            <button onClick={()=>finishWorkInterval(activeSetIdx, liveReps)}
              style={{ marginTop:10,padding:"8px 16px",borderRadius:8,border:`1px solid ${color}44`,background:"transparent",color,fontSize:11,fontWeight:700,cursor:"pointer" }}>
              {isBilateral && activeSideIdx === 0 ? "Finish Side Early" : "Finish Set Early"}
            </button>
          )}
          <button onClick={stopTimer}
            style={{ marginTop:8,padding:"6px 12px",borderRadius:6,border:"none",background:"rgba(255,255,255,0.08)",color:"#64748b",fontSize:10,cursor:"pointer" }}>
            Stop Timer
          </button>
        </div>
      )}

      <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
        {Array.from({ length: prescription.count }, (_, idx) => {
          const s = sets[idx] || { done:false };
          const isActive = activeSetIdx === idx && timerPhase;
          const sidesDone = s.sidesDone || [false, false];
          return (
            <div key={idx} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,
              background:s.done ? "rgba(34,197,94,0.08)" : isActive ? `${color}10` : SF,
              border:`1px solid ${s.done ? "rgba(34,197,94,0.25)" : isActive ? `${color}44` : "rgba(255,255,255,0.07)"}`,
              opacity:s.done ? 0.85 : 1 }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:800,color:"#475569",width:20 }}>{idx+1}</span>
              <div style={{ flex:1 }}>
                <span style={{ fontSize:12,fontWeight:600,color:s.done?"#22c55e":"var(--fkh-text)" }}>{targetLabel}</span>
                {isBilateral && !s.done && (sidesDone[0] || sidesDone[1]) && (
                  <div style={{ fontSize:9,color:"#64748b",marginTop:2 }}>
                    {exerciseSideLabel(prescription, 0)} {sidesDone[0] ? "✓" : "○"} · {exerciseSideLabel(prescription, 1)} {sidesDone[1] ? "✓" : "○"}
                  </div>
                )}
              </div>
              {isTimed ? (
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  {/* Reps stay editable before the set starts AND after it finishes —
                      not only during the live timer — so a count can always be
                      logged or corrected without stopping the exercise. */}
                  <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                    <button type="button" onClick={()=>{ const r=Math.max(0,(s.reps||0)-1); onSetsChange(sets.map((x,i)=>i===idx?{...x,reps:r}:x)); }}
                      style={{ width:26,height:26,borderRadius:6,border:`1px solid ${color}44`,background:"transparent",color,fontSize:14,cursor:"pointer" }}>−</button>
                    <div style={{ minWidth:32,textAlign:"center",lineHeight:1 }}>
                      <div style={{ fontSize:13,fontWeight:800,color }}>{s.reps||0}</div>
                      <div style={{ fontSize:8,color:"#64748b",marginTop:1 }}>reps</div>
                    </div>
                    <button type="button" onClick={()=>{ const r=(s.reps||0)+1; onSetsChange(sets.map((x,i)=>i===idx?{...x,reps:r}:x)); if (r>(maxReps||0)) onMaxRepsChange(r); }}
                      style={{ width:26,height:26,borderRadius:6,border:"none",background:color,color:"#000",fontSize:14,fontWeight:800,cursor:"pointer" }}>+</button>
                  </div>
                  {s.done ? (
                    <button type="button" onClick={()=>toggleRepSet(idx)}
                      style={{ width:32,height:32,borderRadius:8,border:"1px solid #22c55e",background:"#22c55e",color:"#fff",fontSize:14,fontWeight:800,cursor:"pointer" }}>✓</button>
                  ) : timersEnabled ? (
                    <button type="button" onClick={()=>startTimedSet(idx)} disabled={!!timerPhase}
                      style={{ padding:"6px 12px",borderRadius:8,border:"none",background:timerPhase?`${color}44`:color,color:timerPhase?"#64748b":"#000",fontSize:11,fontWeight:800,cursor:timerPhase?"default":"pointer" }}>
                      ▶ Start
                    </button>
                  ) : (
                    <button type="button" onClick={()=>{
                      const r=s.reps||0;
                      const next=sets.map((x,i)=>i===idx?{...x,done:true,reps:r,sidesDone:isBilateral?[true,true]:x.sidesDone}:x);
                      onSetsChange(next);
                      if (r>(maxReps||0)) onMaxRepsChange(r);
                      if (next.every(x=>x.done)) onAllSetsComplete?.();
                    }}
                      style={{ width:32,height:32,borderRadius:8,border:`1.5px solid ${color}60`,background:"transparent",color,fontSize:14,fontWeight:800,cursor:"pointer" }}>○</button>
                  )}
                </div>
              ) : (
                <button onClick={()=>toggleRepSet(idx)}
                  title={isBilateral && sidesDone[0] && !sidesDone[1] ? `Mark ${exerciseSideLabel(prescription, 1)} done` : isBilateral ? `Mark ${exerciseSideLabel(prescription, 0)} done` : undefined}
                  style={{ width:32,height:32,borderRadius:8,border:`1.5px solid ${s.done?"#22c55e":sidesDone[0]&&!s.done?`${color}aa`:color+"60"}`,background:s.done?"#22c55e":sidesDone[0]&&!s.done?`${color}33`:"transparent",color:s.done?"#fff":color,fontSize:14,fontWeight:800,cursor:"pointer" }}>
                  {s.done?"✓":sidesDone[0]&&!s.done?"½":"○"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════ EXERCISE DETAIL SHEET ════════════ */
export default function ExerciseDetailSheet({ exercise, color, bg2, brd, BG, SF, isDone, onToggle, onClose, onNext, completed, favored, onToggleFav, navLabel,
  programContext, setLog, onSetLogChange, maxRepsMap, onMaxRepsChange, bilateralPrefs, onBilateralPrefChange, settings, today, onAskCoach,
  sessionList, isSessionExerciseDone, totalXP, hasPendingCelebration, sessionXpEarned,
  isSignedIn, onSavePlayer }) {
  useWakeLock(true);

  /* Practice session summary — only meaningful for a real multi-exercise
     session, not a single drill opened via "learn about this exercise". */
  const session = useMemo(() => {
    if (!sessionList || sessionList.length < 2 || !isSessionExerciseDone) return null;
    const total = sessionList.length;
    const done = sessionList.filter(e => isSessionExerciseDone(e.id, programContext)).length;
    const minutes = Math.max(1, Math.round(
      sessionList.reduce((s, e) => s + (e.meta?.estimatedDuration || 180), 0) / 60,
    ));
    const xp = typeof sessionXpEarned === "number" && sessionXpEarned > 0
      ? sessionXpEarned
      : total * 5;
    return { total, done, minutes, xp, isLast: exercise && sessionList.at(-1)?.id === exercise.id };
  }, [sessionList, isSessionExerciseDone, programContext, exercise, sessionXpEarned]);

  const [showComplete, setShowComplete] = useState(false);
  const [completePending, setCompletePending] = useState(false);
  const triggerComplete = () => {
    if (hasPendingCelebration) setCompletePending(true);
    else setShowComplete(true);
  };
  useEffect(() => {
    if (completePending && !hasPendingCelebration) {
      setShowComplete(true);
      setCompletePending(false);
    }
  }, [completePending, hasPendingCelebration]);
  const streak = useMemo(() => {
    if (!completed) return 0;
    let s = 0, d = new Date();
    for (let i = 0; i < 60; i++) {
      const k = d.toLocaleDateString("en-CA");
      if (Object.keys(completed).some(c => c.startsWith(k) && completed[c])) { s++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return s;
  }, [completed]);
  const levelAfter = totalXP != null ? getLevel(totalXP + (session?.xp || 0)) : null;

  const meta      = exercise.meta || {};
  const cat       = exercise._cat || "speed";
  const catInfo   = CATS[cat] || { label:cat, emoji:"⚡" };

  /* Progress from completed ─────────────────────────────── */
  const timesCompleted = Object.keys(completed).filter(k => {
    const exId = k.split("-").slice(3).join("-");
    return exId === exercise.id && completed[k];
  }).length;

  const lastDate = Object.keys(completed)
    .filter(k => { const exId = k.split("-").slice(3).join("-"); return exId === exercise.id && completed[k]; })
    .map(k => k.split("-").slice(0,3).join("-"))
    .sort().at(-1);

  const fmtLast = lastDate
    ? new Date(lastDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})
    : null;

  const level = timesCompleted >= 10 ? "Advanced" : timesCompleted >= 4 ? "Building" : "Learning";

  /* Video player ─────────────────────────────────────────── */
  const [videoPlaying, setVideoPlaying] = useState(false);
  /* Adjust during render: via an effect the previous drill's player stays
     mounted for a frame after moving to the next exercise. */
  const [playingFor, setPlayingFor] = useState(exercise?.id);
  if (playingFor !== exercise?.id) { setPlayingFor(exercise?.id); setVideoPlaying(false); }
  useEffect(() => {
    if (!videoPlaying || !exercise?.id) return;
    track(ANALYTICS_EVENTS.VIDEO_PLAY, {
      exercise_id: exercise.id,
      source: exercise.videoSource === "fkh" ? "fkh" : "youtube",
    });
  }, [videoPlaying, exercise?.id, exercise?.videoSource]);

  /* Progression chain ────────────────────────────────────── */
  const chain       = getChainForExercise(exercise.id);
  const chainStatus = chain ? getChainStatus(chain, completed, ALL_EXERCISES) : null;

  /* Badges / labels ─────────────────────────────────────── */
  const diffColor = { beginner:"#22c55e", intermediate:"#f59e0b", advanced:"#ef4444" }[meta.difficulty] || "#64748b";
  const diffLabel = { beginner:"Beginner", intermediate:"Intermediate", advanced:"Advanced" }[meta.difficulty] || "All Levels";
  const mins      = meta.estimatedDuration ? Math.max(1,Math.round(meta.estimatedDuration/60)) : null;
  const eqLabel   = { none:"No Equipment", cones:"Cones", dumbbells:"Dumbbells", box:"Box / Step", bosu:"BOSU", jump_rope:"Jump Rope", ball:"Basketball", basketball:"Basketball", tennis_ball:"Tennis Ball", basketball_x2:"Two Basketballs", partner:"Partner", resistance_band:"Band" }[meta.equipment] || meta.equipment || "None";
  const spLabel   = { small:"Small Space", medium:"Medium Space", large:"Open Space" }[meta.spaceRequired] || meta.spaceRequired || "";

  const benefits = [...new Set(meta.basketballTransfer||[])].map(b=>BENEFIT_MAP[b]).filter(Boolean);

  /* Set tracking ─────────────────────────────────────────── */
  const rawPrescription = parseExerciseSets(exercise.sets);
  const bilateralOn = isBilateralEnabled(bilateralPrefs, exercise.id, rawPrescription);
  const bilateralUnit = bilateralPrefs?.[exercise.id]?.unit || rawPrescription?.bilateral?.unit || "hand";
  const prescription = resolvePrescription(rawPrescription, bilateralPrefs, exercise.id);
  const restSecs = parseRestSeconds(exercise.rest);
  const logKey = setLogKey(exercise.id, today, programContext);
  const currentSets = setLog?.[logKey]?.sets || [];
  const maxReps = maxRepsMap?.[exercise.id] || 0;
  const timersEnabled = settings?.workoutTimers !== false;

  const handleBilateralToggle = on => {
    onBilateralPrefChange?.(exercise.id, on, bilateralUnit);
  };

  const handleSetsChange = newSets => {
    onSetLogChange?.(logKey, { sets: newSets });
  };

  const handleAllSetsComplete = () => {
    if (!isDone) onToggle();
    if (onNext) setTimeout(() => onNext(), 600);
    else if (session) setTimeout(() => triggerComplete(), 500);
  };

  // Mirrors handleAllSetsComplete's existing auto-advance timing for the
  // plain (non-sets-tracking) footer button, so both paths feel continuous
  // instead of requiring a second "Next" tap.
  const handleMarkComplete = () => {
    const wasNotDone = !isDone;
    onToggle();
    if (!wasNotDone) return;
    if (onNext) setTimeout(() => onNext(), 900);
    else if (session) setTimeout(() => triggerComplete(), 500);
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:200,backdropFilter:"blur(3px)" }}/>

      {/* Panel */}
      <div style={{ position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:680,height:"93vh",zIndex:201,
        display:"flex",flexDirection:"column",
        borderRadius:"20px 20px 0 0",background:BG,
        border:`1px solid ${color}22`,overflow:"hidden" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",gap:10,
          padding:"14px 16px",borderBottom:`1px solid ${color}20`,
          background:BG,flexShrink:0 }}>
          <button onClick={onClose}
            style={{ padding:"6px 12px",borderRadius:8,border:`1px solid ${color}30`,
              background:`${color}14`,color,fontSize:12,fontWeight:700,cursor:"pointer" }}>
            ← Back
          </button>
          <span style={{ flex:1,fontSize:12,fontWeight:700,color:`${color}cc`,
            textAlign:"center",letterSpacing:"0.02em" }}>
            {navLabel || `${catInfo.emoji} ${catInfo.label}`}
          </span>
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            {onToggleFav&&(
              <button onClick={onToggleFav}
                style={{ padding:"4px 9px",borderRadius:8,
                  border:`1px solid ${favored?"rgba(250,204,21,0.45)":"rgba(250,204,21,0.22)"}`,
                  background:favored?"rgba(250,204,21,0.12)":"transparent",
                  color:favored?"#fbbf24":"rgba(250,204,21,0.5)",
                  fontSize:15,cursor:"pointer",lineHeight:1 }}>
                {favored?"⭐":"☆"}
              </button>
            )}
            {isDone
              ? <button onClick={onToggle} title="Tap to undo" style={{ fontSize:11,fontWeight:800,color:"#22c55e",
                  padding:"6px 12px",background:"rgba(34,197,94,0.12)",cursor:"pointer",
                  border:"1px solid rgba(34,197,94,0.3)",borderRadius:20,whiteSpace:"nowrap" }}>✓ Done</button>
              : <button onClick={onToggle} style={{ fontSize:12,fontWeight:800,color:"#0b1220",
                  padding:"7px 14px",background:"#22c55e",border:"none",borderRadius:20,cursor:"pointer",whiteSpace:"nowrap" }}>✓ Mark Done</button>}
          </div>
        </div>

        {/* Practice session progress — only when this is a real multi-drill
            session, not a single "learn about this drill" open. */}
        {session && (
          <div style={{ padding:"10px 16px", borderBottom:`1px solid ${color}14`, flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6, flexWrap:"wrap", gap:4 }}>
              <span style={{ fontSize:11, fontWeight:800, color, letterSpacing:"0.04em" }}>
                🏀 Today's Practice · {session.minutes} min · {session.total} exercises · +{session.xp} XP
              </span>
              <span style={{ fontSize:11, fontWeight:700, color:"var(--fkh-text-muted)" }}>
                {session.done} of {session.total} complete
              </span>
            </div>
            <div style={{ height:5, borderRadius:99, background:"rgba(255,255,255,0.06)" }}>
              <div style={{ height:"100%", width:`${(session.done / session.total) * 100}%`, borderRadius:99,
                background:color, transition:"width 0.35s" }} />
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div style={{ flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch" }}>

          {/* Video — inline player or thumbnail tap-to-play (only when a video exists) */}
          {(exercise.videoId || exercise.videoSource === "fkh") && (videoPlaying ? (
            /* ── Active Player ── */
            <div style={{ position:"relative",background:"#000",aspectRatio:"16/9",overflow:"hidden" }}>
              {exercise.videoSource === "fkh" ? (
                /* FKH / Supabase native video */
                <video
                  src={exercise.videoUrl}
                  controls autoPlay playsInline
                  style={{ width:"100%",height:"100%",objectFit:"contain",display:"block" }}
                />
              ) : (
                /* YouTube iframe embed */
                <iframe
                  src={youtubeEmbedUrl(exercise.videoId, { start: exercise.videoStart, end: exercise.videoEnd })}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  title={exercise.videoTitle || exercise.name}
                  style={{ width:"100%",height:"100%",border:"none",display:"block" }}
                />
              )}
              <button
                onClick={() => setVideoPlaying(false)}
                aria-label="Close video player"
                style={{ position:"absolute",top:8,left:8,background:"rgba(0,0,0,0.65)",
                  border:"none",color:"#fff",borderRadius:6,padding:"5px 11px",
                  fontSize:11,cursor:"pointer",fontWeight:700,lineHeight:1.4,zIndex:10 }}>
                ✕ Close
              </button>
            </div>
          ) : exercise.videoSource === "fkh" ? (
            /* ── FKH Thumbnail (tap to play inline) ── */
            <div onClick={() => setVideoPlaying(true)}
              role="button" tabIndex={0} aria-label={`Play ${exercise.name}`}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setVideoPlaying(true); }}
              style={{ display:"block",position:"relative",background:"#000",aspectRatio:"16/9",overflow:"hidden",cursor:"pointer" }}>
              {exercise.thumbnailUrl
                ? <img src={exercise.thumbnailUrl} alt={exercise.name}
                    style={{ width:"100%",height:"100%",objectFit:"cover",display:"block" }}/>
                : <div style={{ width:"100%",height:"100%",background:"linear-gradient(135deg,#0f2027,#203a43,#2c5364)",display:"flex",alignItems:"center",justifyContent:"center" }}>
                    <span style={{ fontSize:48 }}>🏀</span>
                  </div>
              }
              <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.6) 0%,transparent 55%)",pointerEvents:"none" }}/>
              <div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
                width:64,height:64,borderRadius:"50%",background:"rgba(0,0,0,0.72)",border:`2.5px solid ${color}`,
                display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
                <span style={{ color,fontSize:24,marginLeft:5 }}>▶</span>
              </div>
              <div style={{ position:"absolute",top:10,right:10,
                background:"linear-gradient(135deg,#16a34a,#15803d)",
                color:"#fff",fontSize:9,fontWeight:800,letterSpacing:"0.12em",
                padding:"4px 9px",borderRadius:6,textTransform:"uppercase",
                boxShadow:"0 2px 8px rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.2)",pointerEvents:"none" }}>
                ✦ {exercise.trainer || "FKH Original"}
              </div>
              <div style={{ position:"absolute",bottom:10,left:12,right:12,
                fontSize:11,color:"rgba(255,255,255,0.9)",fontWeight:600,
                textShadow:"0 1px 3px rgba(0,0,0,0.9)",pointerEvents:"none" }}>
                🎬 {exercise.name}
              </div>
            </div>
          ) : (
            /* ── YouTube Thumbnail (tap to play inline) ── */
            <div onClick={() => setVideoPlaying(true)}
              role="button" tabIndex={0} aria-label={`Play ${exercise.videoTitle || exercise.name}`}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setVideoPlaying(true); }}
              style={{ display:"block",position:"relative",background:"#000",aspectRatio:"16/9",overflow:"hidden",cursor:"pointer" }}>
              {ownThumbnail(exercise)
                ? <img src={ownThumbnail(exercise)} alt={exercise.videoTitle}
                    style={{ width:"100%",height:"100%",objectFit:"cover",display:"block",pointerEvents:"none" }}/>
                : <div aria-hidden="true" style={{ width:"100%",height:"100%",display:"block",pointerEvents:"none",
                    background:thumbBackdrop(exercise.videoId||exercise.name,color) }}/>}
              <div style={{ position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.55) 0%,transparent 55%)",pointerEvents:"none" }}/>
              <div style={{ position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
                width:64,height:64,borderRadius:"50%",background:"rgba(0,0,0,0.72)",border:`2.5px solid ${color}`,
                display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
                <span style={{ color,fontSize:24,marginLeft:5 }}>▶</span>
              </div>
              <div style={{ position:"absolute",bottom:10,left:12,right:12,
                fontSize:11,color:"rgba(255,255,255,0.85)",fontWeight:600,
                textShadow:"0 1px 3px rgba(0,0,0,0.9)",pointerEvents:"none" }}>
                📺 {exercise.videoTitle}
              </div>
            </div>
          ))}

          <div style={{ padding:"18px 18px 8px" }}>

            {/* Title + badges */}
            <div style={{ marginBottom:14 }}>
              <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:8,flexWrap:"wrap" }}>
                <span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:800,
                  background:`${color}18`,color,border:`1px solid ${color}30` }}>
                  {exercise.tag}
                </span>
                <span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,
                  background:`${diffColor}16`,color:diffColor,border:`1px solid ${diffColor}30` }}>
                  {diffLabel}
                </span>
                {mins&&<span style={{ fontSize:10,padding:"3px 10px",borderRadius:20,fontWeight:700,
                  background:"rgba(255,255,255,0.06)",color:"var(--fkh-text-muted)",border:"1px solid rgba(255,255,255,0.1)" }}>
                  🕐 {mins} min
                </span>}
              </div>
              <h2 style={{ fontSize:22,fontWeight:800,color:"var(--fkh-text)",margin:0,lineHeight:1.2 }}>
                {exercise.name}
              </h2>
            </div>

            {/* Stat chips */}
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:18 }}>
              {[
                { label:"Sets",  value:exercise.sets },
                { label:"Rest",  value:exercise.rest==="N/A"?"None":exercise.rest },
                { label:"Gear",  value:eqLabel },
                { label:"Space", value:spLabel },
              ].map(({ label, value }) => (
                <div key={label} style={{ background:SF,borderRadius:10,padding:"10px 6px",
                  textAlign:"center",border:"1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ fontSize:8,color:"#475569",fontFamily:"'DM Mono',monospace",
                    letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:10,fontWeight:700,color:"var(--fkh-text)",lineHeight:1.3 }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Set tracker */}
            {prescription && onSetLogChange && (
              <ExerciseSetTracker
                exercise={exercise}
                color={color}
                SF={SF}
                prescription={prescription}
                restSecs={restSecs}
                sets={currentSets.length === prescription.count
                  ? currentSets
                  : Array.from({ length: prescription.count }, (_, i) => currentSets[i] || { done:false })}
                onSetsChange={handleSetsChange}
                timersEnabled={timersEnabled}
                maxReps={maxReps}
                onMaxRepsChange={v => onMaxRepsChange?.(exercise.id, v)}
                onAllSetsComplete={handleAllSetsComplete}
                bilateralOn={bilateralOn}
                bilateralUnit={bilateralUnit}
                onBilateralChange={handleBilateralToggle}
              />
            )}

            {/* Description */}
            {exercise.desc&&(
              <p style={{ fontSize:13,color:"var(--fkh-text-muted)",lineHeight:1.65,margin:"0 0 18px" }}>
                {exercise.desc}
              </p>
            )}

            {/* Coach FKH Tips */}
            {exercise.cues?.length>0&&(
              <div style={{ marginBottom:18 }}>
                <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:9 }}>
                  <span style={{ fontSize:15 }}>🎓</span>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                    letterSpacing:"0.18em",color:`${color}80`,textTransform:"uppercase" }}>
                    Coach FKH Tips
                  </span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:9,
                  background:bg2,borderRadius:12,padding:"13px 14px",border:`1px solid ${brd}` }}>
                  {exercise.cues.map((cue,i)=>(
                    <div key={i} style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                      <span style={{ color,fontWeight:800,fontSize:13,flexShrink:0,lineHeight:1.55 }}>→</span>
                      <span style={{ fontSize:13,color:"var(--fkh-text)",lineHeight:1.55,fontWeight:500 }}>{cue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coach Tips (coachNotes — FKH first-party string) */}
            {exercise.coachNotes&&(
              <div style={{ marginBottom:18 }}>
                <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:9 }}>
                  <span style={{ fontSize:15 }}>💡</span>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                    letterSpacing:"0.18em",color:`${color}80`,textTransform:"uppercase" }}>
                    Coach Tips
                  </span>
                </div>
                <div style={{ background:`${color}0d`,borderRadius:12,padding:"13px 14px",
                  border:`1px solid ${color}28`,borderLeft:`3px solid ${color}` }}>
                  <p style={{ margin:0,fontSize:13,color:"var(--fkh-text)",lineHeight:1.65,fontWeight:500 }}>
                    {exercise.coachNotes}
                  </p>
                </div>
              </div>
            )}

            {/* Ask Coach FKH — always available, independent of coachNotes/cues coverage */}
            {onAskCoach && (
              <button type="button" onClick={()=>onAskCoach(exercise.id)}
                style={{ display:"flex",alignItems:"center",gap:8,width:"100%",marginBottom:18,
                  background:`${color}0d`,border:`1px solid ${color}28`,borderRadius:12,
                  padding:"11px 14px",cursor:"pointer",textAlign:"left" }}>
                <span style={{ fontSize:15 }}>🧠</span>
                <span style={{ fontSize:13,fontWeight:700,color,flex:1 }}>Ask Coach FKH about this drill</span>
                <span style={{ fontSize:13,fontWeight:700,color }}>→</span>
              </button>
            )}

            {/* Common Mistakes */}
            {exercise.commonMistakes?.length>0&&(
              <div style={{ marginBottom:18 }}>
                <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:9 }}>
                  <span style={{ fontSize:15 }}>⚠️</span>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                    letterSpacing:"0.18em",color:"#f59e0b80",textTransform:"uppercase" }}>
                    Common Mistakes
                  </span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:9,
                  background:"rgba(245,158,11,0.05)",borderRadius:12,padding:"13px 14px",
                  border:"1px solid rgba(245,158,11,0.18)" }}>
                  {exercise.commonMistakes.map((m,i)=>(
                    <div key={i} style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                      <span style={{ color:"#f59e0b",fontWeight:800,fontSize:13,flexShrink:0,lineHeight:1.55 }}>✕</span>
                      <span style={{ fontSize:13,color:"#fcd34d",lineHeight:1.55,fontWeight:500 }}>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How To Progress */}
            {exercise.progressionTips?.length>0&&(
              <div style={{ marginBottom:18 }}>
                <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:9 }}>
                  <span style={{ fontSize:15 }}>🚀</span>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                    letterSpacing:"0.18em",color:"#a78bfa80",textTransform:"uppercase" }}>
                    How To Progress
                  </span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:9,
                  background:"rgba(167,139,250,0.06)",borderRadius:12,padding:"13px 14px",
                  border:"1px solid rgba(167,139,250,0.2)" }}>
                  {exercise.progressionTips.map((tip,i)=>(
                    <div key={i} style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                      <span style={{ color:"#a78bfa",fontWeight:800,fontSize:13,flexShrink:0,lineHeight:1.55 }}>→</span>
                      <span style={{ fontSize:13,color:"#c4b5fd",lineHeight:1.55,fontWeight:500 }}>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Athlete Benefits */}
            {benefits.length>0&&(
              <div style={{ marginBottom:18 }}>
                <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:9 }}>
                  <span style={{ fontSize:15 }}>⚡</span>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                    letterSpacing:"0.18em",color:`${color}80`,textTransform:"uppercase" }}>
                    Athlete Benefits
                  </span>
                </div>
                <div style={{ display:"flex",flexWrap:"wrap",gap:7 }}>
                  {benefits.map((b,i)=>(
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:6,
                      padding:"7px 13px",borderRadius:20,
                      background:`${color}10`,border:`1px solid ${color}28` }}>
                      <span style={{ fontSize:14 }}>{b.emoji}</span>
                      <span style={{ fontSize:12,fontWeight:700,color }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress tracking */}
            <div style={{ marginBottom:18 }}>
              <div style={{ display:"flex",alignItems:"center",gap:7,marginBottom:9 }}>
                <span style={{ fontSize:15 }}>📈</span>
                <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                  letterSpacing:"0.18em",color:`${color}80`,textTransform:"uppercase" }}>
                  Your Progress
                </span>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8 }}>
                {[
                  { label:"Times Done", value:timesCompleted>0?`${timesCompleted}×`:"—" },
                  { label:"Last Done",  value:fmtLast||"—" },
                  { label:"Level",      value:level },
                ].map(({ label, value })=>(
                  <div key={label} style={{ background:SF,borderRadius:10,padding:"12px 8px",
                    textAlign:"center",border:"1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ fontFamily:"'DM Mono',monospace",fontSize:18,fontWeight:800,color,lineHeight:1 }}>
                      {value}
                    </div>
                    <div style={{ fontSize:8,color:"#334155",marginTop:4,
                      textTransform:"uppercase",letterSpacing:"0.08em" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Progression Track */}
            {chain && chainStatus ? (
              <div style={{ marginBottom:6 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}>
                  <span style={{ fontSize:15 }}>{chain.emoji}</span>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:9,
                    letterSpacing:"0.18em",color:"#475569",textTransform:"uppercase" }}>
                    {chain.name}
                  </span>
                  <span style={{ marginLeft:"auto",fontSize:9,color:"#334155",
                    fontFamily:"'DM Mono',monospace" }}>
                    {chainStatus.progress}/{chainStatus.total}
                  </span>
                </div>
                <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
                  {chainStatus.steps.map((step) => {
                    const isThis   = step.exId === exercise.id;
                    const lockPct  = step.unlocksAt > 0 ? Math.min(1, step.count / step.unlocksAt) : 1;
                    const stepName = step.ex?.name || step.exId;
                    return (
                      <div key={step.exId} style={{
                        borderRadius:10,padding:"10px 12px",
                        border: isThis ? `1.5px solid ${color}55`
                              : step.unlocked ? "1px solid rgba(255,255,255,0.08)"
                              : "1px dashed rgba(255,255,255,0.04)",
                        background: isThis ? `${color}0e`
                                  : step.unlocked ? "rgba(255,255,255,0.025)"
                                  : "rgba(0,0,0,0.2)",
                        opacity: step.unlocked ? 1 : 0.4,
                        transition:"all 0.2s",
                      }}>
                        <div style={{ display:"flex",alignItems:"flex-start",gap:9 }}>
                          <span style={{ fontSize:14,lineHeight:1.4,flexShrink:0 }}>
                            {!step.unlocked ? "🔒"
                              : step.mastered ? "✅"
                              : isThis ? "▶"
                              : "○"}
                          </span>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ display:"flex",alignItems:"center",gap:6,flexWrap:"wrap" }}>
                              <span style={{ fontSize:12,fontWeight:700,lineHeight:1.25,
                                color: isThis ? color
                                     : step.mastered ? "#22c55e"
                                     : step.unlocked ? "var(--fkh-text)"
                                     : "#475569" }}>
                                {stepName}
                              </span>
                              {isThis && (
                                <span style={{ fontSize:9,color,fontFamily:"'DM Mono',monospace",
                                  background:`${color}15`,padding:"1px 7px",borderRadius:20 }}>
                                  you are here
                                </span>
                              )}
                            </div>
                            {step.unlocked && !step.mastered && (
                              <div style={{ marginTop:6 }}>
                                <div style={{ height:3,background:"rgba(255,255,255,0.07)",
                                  borderRadius:99,overflow:"hidden",marginBottom:3 }}>
                                  <div style={{ height:"100%",borderRadius:99,
                                    background:isThis ? color : "#475569",
                                    width:`${lockPct*100}%`,transition:"width 0.6s ease" }}/>
                                </div>
                                <div style={{ fontSize:9,color:"#475569",
                                  fontFamily:"'DM Mono',monospace" }}>
                                  {step.count}/{step.unlocksAt} sessions → unlocks next
                                </div>
                              </div>
                            )}
                            {step.mastered && (
                              <div style={{ fontSize:9,color:"#22c55e",marginTop:2,
                                fontFamily:"'DM Mono',monospace" }}>
                                ✓ {step.count} sessions complete
                              </div>
                            )}
                            {!step.unlocked && (
                              <div style={{ fontSize:9,color:"#334155",marginTop:2 }}>
                                Complete the previous exercise to unlock
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ borderRadius:12,border:"1px dashed rgba(255,255,255,0.07)",
                background:"rgba(255,255,255,0.02)",padding:"11px 14px",opacity:0.5,marginBottom:6 }}>
                <div style={{ fontSize:10,color:"#334155" }}>
                  📈 This exercise isn't part of a tracked progression track yet.
                </div>
              </div>
            )}

          </div>
          <div style={{ height:20 }}/>
        </div>

        {/* Sticky footer */}
        <div style={{ padding:"12px 16px",
          paddingBottom:"calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop:`1px solid ${color}20`,background:BG,
          display:"flex",gap:10,flexShrink:0 }}>
          <button onClick={handleMarkComplete}
            style={{ flex:1,padding:"13px",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",
              background:isDone?"rgba(34,197,94,0.12)":color,
              border:isDone?"1px solid rgba(34,197,94,0.3)":"none",
              color:isDone?"#22c55e":"#000",transition:"all 0.2s" }}>
            {isDone?"✓ Completed — Undo?":"Mark Complete ✓  +5 XP"}
          </button>
          <button onClick={onNext||onClose}
            style={{ padding:"13px 18px",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",
              background:SF,border:"1px solid rgba(255,255,255,0.09)",color:"var(--fkh-text-muted)" }}>
            {onNext?"Next →":"Close"}
          </button>
        </div>

        {/* Practice-complete celebration — covers the panel once the last
            drill in a real multi-exercise session is marked done. */}
        {showComplete && session && (
          <div style={{ position:"absolute", inset:0, zIndex:5, background:BG,
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            padding:"32px 28px", textAlign:"center" }}>
            <div style={{ fontSize:56, marginBottom:12, animation:"fkh-bounce 0.6s ease-out 0.1s both" }}>🎉</div>
            <div style={{ fontSize:22, fontWeight:800, color:"var(--fkh-text)", marginBottom:18 }}>
              Today's Practice Complete
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, width:"100%", maxWidth:320, marginBottom:22 }}>
              {streak >= 2 && (
                <div style={{ padding:"10px 14px", borderRadius:12, background:"rgba(249,115,22,0.1)",
                  border:"1px solid rgba(249,115,22,0.3)", fontSize:14, fontWeight:700, color:"#f97316" }}>
                  🔥 {streak}-Day Streak Continues
                </div>
              )}
              <div style={{ padding:"12px 14px", borderRadius:14, background:`${color}14`,
                border:`1px solid ${color}33`, fontSize:15, fontWeight:800, color }}>
                +{session.xp} XP Earned
                {session.xp > session.total * 5 && (
                  <div style={{ fontSize:11, fontWeight:600, opacity:0.85, marginTop:4 }}>
                    Includes workout & challenge bonuses
                  </div>
                )}
              </div>
              {levelAfter && (
                <div style={{ fontSize:12, color:"var(--fkh-text-muted)" }}>
                  {levelAfter.xpNext != null
                    ? `One step closer to ${LEVELS.find(l => l.rank === levelAfter.rank + 1)?.name || "the next level"}`
                    : `${levelAfter.emoji} ${levelAfter.name} — the top of the mountain`}
                </div>
              )}
            </div>
            {!isSignedIn && onSavePlayer ? (
              <>
                <div style={{ fontSize:13, color:"var(--fkh-text-muted)", marginBottom:18, maxWidth:300 }}>
                  Save your player so you never lose your streak, badges, or XP.
                </div>
                <button onClick={onSavePlayer}
                  style={{ padding:"14px 28px", borderRadius:12, border:"none", background:color,
                    color:"#000", fontSize:15, fontWeight:800, cursor:"pointer" }}>
                  💾 Save My Player
                </button>
                <button onClick={onClose}
                  style={{ marginTop:10, padding:"8px 16px", borderRadius:10, border:"none",
                    background:"transparent", color:"var(--fkh-text-muted)", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  Not now
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize:13, color:"var(--fkh-text-muted)", marginBottom:22 }}>
                  See you tomorrow. 🏀
                </div>
                <button onClick={onClose}
                  style={{ padding:"13px 28px", borderRadius:12, border:"none", background:color,
                    color:"#000", fontSize:14, fontWeight:800, cursor:"pointer" }}>
                  Done
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════ DRILL CARD ═══════════════════════ */
