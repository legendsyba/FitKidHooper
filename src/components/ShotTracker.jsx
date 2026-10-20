import { useState, useMemo, useRef } from "react";
import GuideNavButton from "./GuideNavButton.jsx";
import CoachNavButton from "./CoachNavButton.jsx";
import { StackedBars, Spark, Donut, CourtMap } from "./ShotCharts.jsx";
import { SHOT_TYPES, SHOT_COLORS } from "../lib/shotTypes.js";
import { todayKey, offsetDateKey, fmtDate, dayLabel } from "../lib/dateKeys.js";
import { chipStyle, actionBtnStyle } from "../lib/themeColors.js";
import { readShotLog, writeShotLog } from "../lib/shotLog.js";
import { trackShotSession } from "../lib/analytics.js";
import { SHOT_STYLES, getShotStyle, getLastShotStyle, setLastShotStyle } from "../lib/shotStyles.js";
import {
  computeShootingStats, computeLocationTypeStats, computeZoneTypeStats, ZONES,
} from "../lib/shootingStats.js";
import { getPeriodRange, LEADERBOARD_PERIODS } from "../lib/periodStats.js";

/** Now for today's log; noon for a back-dated day, so its shots sort inside that day. */
function shotTimestampFor(dayKey) {
  return dayKey === todayKey() ? Date.now() : new Date(`${dayKey}T12:00:00`).getTime();
}
import {
  getWeekShotGoal, getMonthShotGoal, getDayShotGoal,
  setWeekShotGoal, setMonthShotGoal, setDayShotGoal,
  getShotGoalPeriod, setShotGoalPeriod,
  getWeekMakesFromLog, getMonthMakesFromLog, getDayMakesFromLog,
  daysLeftInWeek, daysLeftInMonth,
} from "../lib/progressStats.js";

const STATS_RANGES = [
  { id:"today", label:"Today" },
  ...LEADERBOARD_PERIODS.map(p => ({ id:p.id, label:p.label.replace(/^This /, "") })),
];
const STATS_RANGE_SUFFIX = {
  today: "today", week: "this week", month: "this month",
  ytd: "YTD", all_time: "all-time",
};

/* ═══════════════════════ SHOT TRACKER ═══════════════════════ */
export default function ShotTracker({ P, S, BG, athleteName, settings, onLogChange, onOpenGuide, onOpenCoach }) {
  const [log, setLog] = useState(() => readShotLog());
  const [view, setView] = useState("log");
  const [activeType, setActiveType] = useState(null);
  const [activeLoc, setActiveLoc] = useState(null);
  const [lastShot, setLastShot] = useState(null);
  const [selDate, setSelDate] = useState(todayKey());
  const [logDate, setLogDate] = useState(todayKey());
  const [range, setRange] = useState(14);
  const [statsRange, setStatsRange] = useState("month");
  const [openLoc, setOpenLoc] = useState(null);
  const logDateRef = useRef(null);
  const [useCustom, setUseCustom] = useState(false);
  const [custStart, setCustStart] = useState("");
  const [custEnd, setCustEnd] = useState("");
  const [shotCount, setShotCount] = useState({made:0, missed:0});
  const [shotStyle, setShotStyle] = useState(() => getLastShotStyle());
  const [weekGoal, setWeekGoal] = useState(() => getWeekShotGoal());
  const [monthGoal, setMonthGoal] = useState(() => getMonthShotGoal());
  const [dayGoal, setDayGoal] = useState(() => getDayShotGoal());
  const [goalPeriod, setGoalPeriod] = useState(() => getShotGoalPeriod());
  const [editingGoal, setEditingGoal] = useState(false);

  const save = nl => {
    const normalized = writeShotLog(nl);
    setLog(normalized);
    onLogChange?.();
  };

  const saveGoal = g => {
    const v = Math.max(1, parseInt(g, 10) || 100);
    if (goalPeriod === "day") { setDayGoal(v); setDayShotGoal(v); }
    else if (goalPeriod === "month") { setMonthGoal(v); setMonthShotGoal(v); }
    else { setWeekGoal(v); setWeekShotGoal(v); }
  };

  const switchGoalPeriod = period => {
    setGoalPeriod(period);
    setShotGoalPeriod(period);
  };

  const pickShotStyle = (id) => {
    setShotStyle(id);
    setLastShotStyle(id);
  };

  const logBatch = (tid, loc, made, missed) => {
    if (made + missed === 0) return;
    const k = logDate;
    const ts = shotTimestampFor(k);
    const style = shotStyle;
    const entries = [
      ...Array(made).fill(null).map((_,i)  => ({ type:tid, location:loc||null, ts:ts+i,   made:true,  style })),
      ...Array(missed).fill(null).map((_,i) => ({ type:tid, location:loc||null, ts:ts+made+i, made:false, style })),
    ];
    const last = entries[entries.length-1];
    save({...log, [k]:[...(log[k]||[]), ...entries]});
    trackShotSession({ makes: made, misses: missed, shotType: tid, usedCourtMap: Boolean(loc && loc !== "__noloc__") });
    setLastShotStyle(style);
    setLastShot(last);
    setActiveType(null); setActiveLoc(null); setShotCount({made:0, missed:0});
  };

  const pickLogDate = (key) => {
    if (!key || key > todayKey()) return;
    setLogDate(key);
    setActiveType(null);
    setActiveLoc(null);
    setShotCount({ made:0, missed:0 });
    setLastShot(null);
  };


  const selectZone = (tid, courtLoc = undefined) => {
    const st = SHOT_TYPES.find(s => s.id === tid);
    setActiveType(tid);
    if (!st?.locations) {
      setActiveLoc("__noloc__");
    } else if (courtLoc && st.locations.includes(courtLoc)) {
      setActiveLoc(courtLoc);
    } else {
      setActiveLoc(null);
    }
    setShotCount({ made:0, missed:0 });
  };

  const undo = () => {
    const k = logDate;
    if (!(log[k]?.length)) return;
    save({ ...log, [k]: log[k].slice(0, -1) });
    setLastShot(null);
  };

  const today = todayKey();
  const todayShots = useMemo(() => log[today] || [], [log, today]);
  const logDayShots = log[logDate]||[];
  const logDayLabel = logDate === todayKey() ? "Today" : fmtDate(logDate);
  const logDayTotal = logDayShots.length;
  const allFlat = useMemo(()=>Object.values(log).flat(),[log]);
  const allByType = useMemo(()=>{ const c={}; allFlat.forEach(s=>{c[s.type]=(c[s.type]||0)+1}); return c; },[allFlat]);
  const allTotal = allFlat.length;
  const allTimeStats = useMemo(() => computeShootingStats(log), [log]);
  // Stats read a selected period, not all-time. Left all-time, every number
  // freezes after a few hundred shots and improvement stops showing up.
  const statsPeriod = useMemo(() => {
    if (statsRange === "all_time") return { start: null, end: null };
    if (statsRange === "today") { const t = todayKey(); return { start: t, end: t }; }
    return getPeriodRange(statsRange);
  }, [statsRange]);
  const rangeFlat = useMemo(() => Object.entries(log)
    .filter(([d]) => (!statsPeriod.start || d >= statsPeriod.start) && (!statsPeriod.end || d <= statsPeriod.end))
    .flatMap(([, s]) => Array.isArray(s) ? s : []), [log, statsPeriod]);
  const rangeByType = useMemo(()=>{ const c={}; rangeFlat.forEach(s=>{c[s.type]=(c[s.type]||0)+1}); return c; },[rangeFlat]);
  const rangeTotal = rangeFlat.length;
  const rangeStats = useMemo(() => computeShootingStats(log, statsPeriod), [log, statsPeriod]);
  const styleAccuracy = useMemo(() => rangeStats.styles, [rangeStats]);
  const zoneTypeStats = useMemo(() => computeZoneTypeStats(log, statsPeriod), [log, statsPeriod]);
  const locationTypeStats = useMemo(() => computeLocationTypeStats(log, statsPeriod), [log, statsPeriod]);
  const streak = useMemo(()=>{ let s=0,d=new Date(); while(true){const k=d.toLocaleDateString("en-CA");if((log[k]||[]).length>0){s++;d.setDate(d.getDate()-1)}else break} return s; },[log]);
  const todayTotal = todayShots.length;
  const todayMade = useMemo(()=>todayShots.filter(s=>s.made!==false).length,[todayShots]);
  const todayPct = todayTotal>0 ? Math.round((todayMade/todayTotal)*100) : 0;

  // Period makes: day (today), week (Mon→today) or month (1st→today)
  const periodMakes = useMemo(() => (
    goalPeriod === "day" ? getDayMakesFromLog(log)
      : goalPeriod === "month" ? getMonthMakesFromLog(log)
      : getWeekMakesFromLog(log)
  ), [log, goalPeriod]);
  const periodGoal = goalPeriod === "day" ? dayGoal : goalPeriod === "month" ? monthGoal : weekGoal;
  const daysLeftInPeriod = goalPeriod === "month" ? daysLeftInMonth() : daysLeftInWeek();
  const periodLabel = goalPeriod === "day" ? "day" : goalPeriod === "month" ? "month" : "week";
  // Right-hand side of the goal strip — "today" needs no countdown.
  const periodRemainLabel = goalPeriod === "day" ? "today" : `${daysLeftInPeriod}d left`;

  const histData = useMemo(()=>{
    const days=[];
    if (useCustom && custStart && custEnd) {
      let d = new Date(custStart+"T00:00:00"), end = new Date(custEnd+"T00:00:00");
      while (d<=end) {
        const k=d.toLocaleDateString("en-CA"), sh=log[k]||[], bst={};
        sh.forEach(s=>{bst[s.type]=(bst[s.type]||0)+1});
        const mk=sh.filter(s=>s.made!==false).length;
        days.push({key:k,label:dayLabel(k),total:sh.length,makes:mk,pct:sh.length?Math.round((100*mk)/sh.length):null,byShotType:bst});
        d.setDate(d.getDate()+1);
      }
    } else {
      for (let i=range-1;i>=0;i--) {
        const d=new Date(); d.setDate(d.getDate()-i);
        const k=d.toLocaleDateString("en-CA"), sh=log[k]||[], bst={};
        sh.forEach(s=>{bst[s.type]=(bst[s.type]||0)+1});
        const mk=sh.filter(s=>s.made!==false).length;
        days.push({key:k,label:dayLabel(k),total:sh.length,makes:mk,pct:sh.length?Math.round((100*mk)/sh.length):null,byShotType:bst});
      }
    }
    return days;
  },[log,range,useCustom,custStart,custEnd]);

  const selShots = log[selDate]||[];
  const selZoneStats = useMemo(() => computeShootingStats(log, { start:selDate, end:selDate }).zones, [log, selDate]);

  // This week vs last, so History answers "am I getting better?" rather than
  // "how many did I take?".
  const wow = useMemo(() => {
    const now = new Date();
    const thisMon = new Date(now); thisMon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
    const key = d => d.toLocaleDateString("en-CA");
    const tally = (start, end) => {
      let m = 0, a = 0, days = 0;
      for (const [date, shots] of Object.entries(log || {})) {
        if (date < start || date > end) continue;
        const list = Array.isArray(shots) ? shots : [];
        if (!list.length) continue;
        days += 1;
        for (const sh of list) { a += 1; if (sh.made !== false) m += 1; }
      }
      return { m, a, days, pct: a ? Math.round((100 * m) / a) : null };
    };
    return { cur: tally(key(thisMon), key(now)), prev: tally(key(lastMon), key(lastSun)) };
  }, [log]);
  const lbl = { fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.18em",color:`${P}80`,marginBottom:10,textTransform:"uppercase" };
  const bd = "rgba(255,255,255,0.07)";
  const sf = "rgba(255,255,255,0.028)";

  const TABS = [{id:"log",label:"📍 Log"},{id:"breakdown",label:"🍩 Stats"},{id:"history",label:"📈 History"}];

  return (
    <div style={{ background:BG,color:"var(--fkh-text)",maxWidth:680,margin:"0 auto",minHeight:"100vh",paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))",fontFamily:"'DM Sans','Helvetica Neue',sans-serif" }}>
      {/* One line, so the court — the actual tool — starts near the top of the
          screen instead of ~300px down. Same three numbers, read as a sentence. */}
      <div style={{ padding:"14px 20px 12px",borderBottom:`1px solid ${P}18` }}>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <div style={{ flex:1,minWidth:0 }}>
            <h2 style={{ fontSize:17,fontWeight:800,margin:0,letterSpacing:"-0.02em",lineHeight:1.15 }}>
              {athleteName}'s <span style={{ color:P }}>Shots</span>
            </h2>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:10.5,color:"#475569",marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
              <span style={{ fontSize:12,fontWeight:800,color:P }}>{todayMade}</span> today
              {" · "}<span style={{ fontSize:12,fontWeight:800,color:S }}>{todayPct}%</span> FG
              {" · "}<span style={{ fontSize:12,fontWeight:800,color:"#34d399" }}>{streak}</span> streak 🔥
            </div>
          </div>
          {onOpenCoach && <CoachNavButton compact P={P} onClick={onOpenCoach} />}
          {onOpenGuide && <GuideNavButton compact onClick={onOpenGuide} />}
        </div>
      </div>
      {/* ── Goal strip ─────────────────────────────────────────
          Was a ~110px widget above the court. Now one tappable line;
          everything it used to show permanently lives behind the caret. */}
      {(()=>{
        const pct      = Math.min(1, periodMakes / periodGoal);
        const reached  = periodMakes >= periodGoal;
        const barColor = reached
          ? "linear-gradient(90deg,#22c55e,#16a34a)"
          : pct >= 0.75
            ? `linear-gradient(90deg,${P},#22c55e)`
            : pct >= 0.4
              ? `linear-gradient(90deg,${P},${S})`
              : `linear-gradient(90deg,${P}cc,${P})`;
        const glowColor = reached ? "#22c55e" : P;
        const numColor  = reached ? "#22c55e" : pct >= 0.75 ? "#86efac" : "var(--fkh-text)";
        const goalPresets = goalPeriod === "day"
          ? [25, 50, 75, 100, 150, 200]
          : goalPeriod === "month"
            ? [200, 400, 600, 800, 1000, 1500]
            : [50, 100, 150, 200, 300, 500];
        const targetLabel = goalPeriod === "day" ? "Daily" : goalPeriod === "month" ? "Monthly" : "Weekly";

        return (
          <div style={{ borderBottom:`1px solid ${bd}` }}>
            <button type="button" onClick={()=>setEditingGoal(e=>!e)}
              aria-expanded={editingGoal}
              style={{ width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 16px",
                background:"transparent",border:"none",cursor:"pointer",textAlign:"left" }}>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:14,fontWeight:800,color:numColor,flexShrink:0,
                textShadow:reached?"0 0 12px #22c55e70":"none",transition:"color 0.4s" }}>
                {periodMakes}/{periodGoal}
              </span>
              <span style={{ flex:1,minWidth:0,height:7,borderRadius:99,background:"rgba(255,255,255,0.06)",overflow:"hidden" }}>
                <span style={{ display:"block",height:"100%",width:`${pct*100}%`,borderRadius:99,background:barColor,
                  boxShadow:`0 0 10px ${glowColor}60`,transition:"width 0.7s cubic-bezier(0.4,0,0.2,1)" }}/>
              </span>
              <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,flexShrink:0,
                color:reached?"#22c55e":"#475569" }}>
                {reached ? "goal 🎯" : periodRemainLabel}
              </span>
              <span style={{ fontSize:12,color:"#475569",flexShrink:0,lineHeight:1,
                transform:editingGoal?"rotate(90deg)":"none",transition:"transform 0.2s" }}>›</span>
            </button>

            {editingGoal && (
              <div style={{ padding:"0 16px 12px" }}>
                <div style={{ display:"flex",gap:6,marginBottom:10 }}>
                  {["day","week","month"].map(pd => (
                    <button key={pd} type="button" onClick={() => switchGoalPeriod(pd)}
                      style={{ flex:1,padding:"6px 4px",borderRadius:9,cursor:"pointer",fontSize:11,fontWeight:700,
                        textTransform:"capitalize",
                        border:`1px solid ${goalPeriod === pd ? P : bd}`,
                        background: goalPeriod === pd ? `${P}18` : "transparent",
                        color: goalPeriod === pd ? P : "#64748b" }}>
                      {pd}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:9 }}>
                  <span style={{ fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,color:glowColor }}>
                    {Math.round(pct*100)}%
                  </span>
                  <span style={{ fontSize:10,color:"#334155" }}>
                    {reached
                      ? "· Goal smashed! 🏀"
                      : `· ${periodGoal-periodMakes} makes to go ${goalPeriod === "day" ? "today" : `this ${periodLabel}`}`}
                  </span>
                </div>
                <div style={{ fontSize:9,color:"#475569",letterSpacing:"0.1em",
                  textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginBottom:8 }}>
                  {targetLabel} makes target
                </div>
                <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                  {goalPresets.map(n=>(
                    <button key={n} onClick={()=>{ saveGoal(n); setEditingGoal(false); }}
                      style={{ padding:"6px 13px",borderRadius:9,cursor:"pointer",fontSize:13,
                        fontWeight:periodGoal===n?800:500,
                        boxShadow:periodGoal===n?`0 0 8px ${P}40`:"none",
                        transition:"all 0.15s",
                        ...chipStyle(settings, periodGoal===n, P) }}>
                      {n}
                    </button>
                  ))}
                  <div style={{ display:"flex",alignItems:"center",gap:4,borderRadius:9,padding:"0 8px",...actionBtnStyle(settings) }}>
                    <input
                      type="number" inputMode="numeric" min="1"
                      placeholder="Custom"
                      style={{ width:60,background:"transparent",border:"none",outline:"none",
                        color:"var(--fkh-text-muted)",fontSize:13,padding:"6px 0",
                        WebkitAppearance:"none",MozAppearance:"textfield" }}
                      onKeyDown={e=>{
                        if (e.key==="Enter" && e.target.value) {
                          const v = Math.max(1, parseInt(e.target.value)||100);
                          saveGoal(v); setEditingGoal(false); e.target.value="";
                        }
                      }}
                    />
                    <span style={{ fontSize:9,color:"#334155" }}>↵</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ display:"flex",padding:"10px 14px",gap:6,borderBottom:`1px solid ${bd}` }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setView(t.id)} style={{ flex:1,padding:"8px 4px",borderRadius:10,border:`1px solid ${view===t.id?P:bd}`,background:view===t.id?`${P}18`:"transparent",color:view===t.id?P:"#475569",fontSize:11,fontWeight:600,cursor:"pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {view==="log" && (
        <div style={{ padding:"14px 16px 0" }}>
          <div style={{
            display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", position:"relative",
            marginBottom:12, padding:"8px 10px", borderRadius:10,
            background: logDate !== todayKey() ? `${P}10` : "transparent",
            border:`1px solid ${logDate !== todayKey() ? `${P}28` : bd}`,
          }}>
            {/* No label — the chips say what they are. */}
            {[["Today", todayKey()], ["Yesterday", offsetDateKey(-1)]].map(([label, key]) => (
              <button key={label} type="button" onClick={() => pickLogDate(key)} style={{
                padding:"5px 10px", borderRadius:99, fontSize:10, fontWeight:700, cursor:"pointer",
                border:`1px solid ${logDate === key ? P : bd}`,
                background: logDate === key ? `${P}20` : "transparent",
                color: logDate === key ? P : "#64748b",
              }}>{label}</button>
            ))}
            {(() => {
              const custom = logDate !== todayKey() && logDate !== offsetDateKey(-1);
              return (
                <>
                  <button type="button"
                    onClick={() => { const el = logDateRef.current; if (!el) return; el.showPicker ? el.showPicker() : el.click(); }}
                    style={{
                      padding:"5px 10px", borderRadius:99, fontSize:10, fontWeight:700, cursor:"pointer",
                      border:`1px solid ${custom ? P : bd}`,
                      background: custom ? `${P}20` : "transparent",
                      color: custom ? P : "#64748b",
                    }}>
                    📅 {custom ? fmtDate(logDate) : "Pick"}
                  </button>
                  <input
                    ref={logDateRef}
                    type="date"
                    value={logDate}
                    max={todayKey()}
                    onChange={e => pickLogDate(e.target.value)}
                    aria-label="Log for another day"
                    style={{ position:"absolute", width:1, height:1, opacity:0, pointerEvents:"none" }}
                  />
                </>
              );
            })()}
          </div>

          <div style={{ background:sf, border:`1px solid ${P}22`, borderRadius:14, padding:"12px 12px 14px", marginBottom:14 }}>
            {/* Style is set once per session, not re-asked at every spot — it
                already persists in localStorage between visits. No label: the
                chips say what they are, and the court says to tap it. */}
            <div style={{ display:"flex", gap:5, marginBottom:10 }}>
              {SHOT_STYLES.map(sty => (
                <button key={sty.id} type="button" onClick={() => pickShotStyle(sty.id)}
                  style={{
                    flex:1, minWidth:0, padding:"7px 4px", borderRadius:9, cursor:"pointer",
                    border:`1px solid ${shotStyle === sty.id ? P : bd}`,
                    background: shotStyle === sty.id ? `${P}1c` : "transparent",
                    color: shotStyle === sty.id ? P : "#64748b",
                    fontSize:10, fontWeight: shotStyle === sty.id ? 800 : 600,
                    lineHeight:1.2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                  }}>
                  {sty.label}
                </button>
              ))}
            </div>

            <CourtMap priColor={P} onZoneSelect={selectZone} lastShot={lastShot}/>

            {activeType && !activeLoc && (
              <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${bd}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:P, marginBottom:8 }}>
                  {SHOT_TYPES.find(s=>s.id===activeType)?.emoji}{" "}
                  {SHOT_TYPES.find(s=>s.id===activeType)?.label} — pick side
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {SHOT_TYPES.find(s=>s.id===activeType)?.locations?.map(loc=>(
                    <button key={loc} type="button" onClick={()=>setActiveLoc(loc)} style={{
                      padding:"7px 12px", borderRadius:10, border:`1px solid ${P}40`,
                      background:`${P}18`, color:P, fontSize:11, fontWeight:600, cursor:"pointer",
                    }}>{loc}</button>
                  ))}
                  <button type="button" onClick={()=>{ setActiveType(null); setActiveLoc(null); }} style={{
                    padding:"7px 10px", borderRadius:10, border:`1px solid ${bd}`,
                    background:"transparent", color:"#64748b", fontSize:11, cursor:"pointer",
                  }}>✕</button>
                </div>
              </div>
            )}

            {activeType && activeLoc && (() => {
              const st = SHOT_TYPES.find(s=>s.id===activeType);
              const loc = activeLoc === "__noloc__" ? null : activeLoc;
              const total = shotCount.made + shotCount.missed;
              const spotLabel = loc ? `${st?.label} · ${loc}` : st?.label;
              const stepBtn = (style) => ({
                width:40, height:40, borderRadius:10, border:"1px solid rgba(255,255,255,0.12)",
                background:"rgba(255,255,255,0.06)", color:"var(--fkh-text)", fontSize:20,
                fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
                ...style,
              });
              return (
                <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${bd}` }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:P }}>{st?.emoji} {spotLabel}</div>
                    <button type="button" onClick={()=>{ setActiveType(null); setActiveLoc(null); setShotCount({ made:0, missed:0 }); }}
                      style={{ background:"transparent", border:"none", color:"#64748b", fontSize:11, cursor:"pointer", padding:0 }}>
                      Change spot
                    </button>
                  </div>

                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#22c55e", width:62 }}>Made</span>
                    <button type="button" style={stepBtn()} onClick={()=>setShotCount(c=>({...c,made:Math.max(0,c.made-1)}))}>−</button>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={shotCount.made}
                      onChange={e=>setShotCount(c=>({...c,made:Math.max(0,parseInt(e.target.value)||0)}))}
                      onFocus={e=>e.target.select()}
                      style={{ width:48, textAlign:"center", fontSize:24, fontWeight:800, color:"#22c55e",
                        fontFamily:"'DM Mono',monospace", background:"transparent", border:"none",
                        outline:"none", WebkitAppearance:"none", MozAppearance:"textfield", padding:0 }}
                    />
                    <button type="button" style={stepBtn({ background:"#22c55e22", borderColor:"#22c55e44" })}
                      onClick={()=>setShotCount(c=>({...c,made:c.made+1}))}>+</button>
                    <button type="button" style={stepBtn({ background:"#22c55e18", borderColor:"#22c55e33", fontSize:14, fontWeight:800 })}
                      onClick={()=>setShotCount(c=>({...c,made:c.made+5}))}>+5</button>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:"#ef4444", width:62 }}>Miss</span>
                    <button type="button" style={stepBtn()} onClick={()=>setShotCount(c=>({...c,missed:Math.max(0,c.missed-1)}))}>−</button>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={shotCount.missed}
                      onChange={e=>setShotCount(c=>({...c,missed:Math.max(0,parseInt(e.target.value)||0)}))}
                      onFocus={e=>e.target.select()}
                      style={{ width:48, textAlign:"center", fontSize:24, fontWeight:800, color:"#ef4444",
                        fontFamily:"'DM Mono',monospace", background:"transparent", border:"none",
                        outline:"none", WebkitAppearance:"none", MozAppearance:"textfield", padding:0 }}
                    />
                    <button type="button" style={stepBtn({ background:"#ef444422", borderColor:"#ef444444" })}
                      onClick={()=>setShotCount(c=>({...c,missed:c.missed+1}))}>+</button>
                  </div>
                  <button
                    type="button"
                    disabled={total===0}
                    onClick={()=>logBatch(activeType, loc, shotCount.made, shotCount.missed)}
                    style={{ width:"100%", padding:"12px", borderRadius:10, border:`1px solid ${P}44`,
                      background:total>0?`${P}22`:"rgba(255,255,255,0.04)",
                      color:total>0?P:"#334155", fontSize:13, fontWeight:700,
                      cursor:total>0?"pointer":"default" }}>
                    {total>0
                      ? `Log ${total} shot${total!==1?"s":""} · ${Math.round((shotCount.made/total)*100)}% ✓`
                      : "Add makes or misses above"}
                  </button>
                </div>
              );
            })()}

            {!activeType && (
              <div style={{ textAlign:"center", fontSize:11, color:"#475569", marginTop:12, paddingTop:4 }}>
                Tap a zone on the court to start
              </div>
            )}
          </div>

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={lbl}>{logDayLabel}'s log ({logDayTotal})</div>
            {logDayTotal>0 && (
              <button type="button" onClick={undo} style={{
                padding:"5px 12px", borderRadius:8, border:"1px solid rgba(239,68,68,0.25)",
                background:"rgba(239,68,68,0.08)", color:"#f87171", fontSize:11, fontWeight:600, cursor:"pointer",
              }}>↩ Undo</button>
            )}
          </div>
          {logDayShots.length===0
            ? <div style={{ textAlign:"center", padding:"16px 0", color:"#334155", fontSize:12 }}>No shots for {logDayLabel.toLowerCase()} yet 🏀</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:200, overflowY:"auto", marginBottom:14 }}>
                {[...logDayShots].reverse().map((s,i)=>{ const def=SHOT_TYPES.find(t=>t.id===s.type),c=SHOT_COLORS[s.type]; const sty=getShotStyle(s.style); return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:sf, borderRadius:8, border:`1px solid ${c}1a` }}>
                    <span style={{ fontSize:13 }}>{def?.emoji}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, color:c, fontWeight:600 }}>{def?.label}{s.location?` · ${s.location}`:""}</div>
                      <div style={{ fontSize:10, color:"#64748b" }}>{sty.label}</div>
                    </div>
                    <span style={{ fontSize:12 }}>{s.made===false?"❌":"✅"}</span>
                  </div>
                );})}
              </div>
          }
        </div>
      )}

      {view==="history" && (
        <div style={{ padding:"14px 16px 0" }}>
          <div style={{ display:"flex",gap:5,marginBottom:10,flexWrap:"wrap" }}>
            {[7,14,30,60,90].map(n=>(
              <button key={n} onClick={()=>{setRange(n);setUseCustom(false);}} style={{ padding:"7px 12px",borderRadius:10,border:`1px solid ${!useCustom&&range===n?P:bd}`,background:!useCustom&&range===n?`${P}18`:"transparent",color:!useCustom&&range===n?P:"#475569",fontSize:12,fontWeight:600,cursor:"pointer" }}>{n}D</button>
            ))}
            <button onClick={()=>setUseCustom(v=>!v)} style={{ padding:"7px 12px",borderRadius:10,border:`1px solid ${useCustom?S:bd}`,background:useCustom?`${S}18`:"transparent",color:useCustom?S:"#475569",fontSize:12,fontWeight:600,cursor:"pointer" }}>📅 Custom</button>
          </div>
          {(()=>{
            const delta = (a, b) => (a == null || b == null) ? null : a - b;
            const cells = [
              { label:"FG%",   val: wow.cur.pct == null ? "—" : `${wow.cur.pct}%`, d: delta(wow.cur.pct, wow.prev.pct),
                was: wow.prev.pct == null ? null : `was ${wow.prev.pct}%` },
              { label:"Makes", val: wow.cur.m, d: wow.cur.m - wow.prev.m, was: null },
              { label:"Days",  val: wow.cur.days, d: wow.cur.days - wow.prev.days, was: null },
            ];
            return (
              <div style={{ display:"flex",gap:8,marginBottom:12 }}>
                {cells.map(c => (
                  <div key={c.label} style={{ flex:1,minWidth:0,background:sf,border:`1px solid ${bd}`,borderRadius:12,padding:"9px 10px" }}>
                    <div style={{ fontSize:8.5,color:"#475569",letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:"'DM Mono',monospace" }}>{c.label}</div>
                    <div style={{ display:"flex",alignItems:"baseline",gap:5,marginTop:3 }}>
                      <span style={{ fontFamily:"'DM Mono',monospace",fontSize:16,fontWeight:800,color:"var(--fkh-text)",lineHeight:1 }}>{c.val}</span>
                      {c.d != null && c.d !== 0 && (
                        <span style={{ fontSize:10,fontWeight:800,color:c.d > 0 ? "#22c55e" : "#f87171" }}>
                          {c.d > 0 ? "▲" : "▼"}{Math.abs(c.d)}
                        </span>
                      )}
                    </div>
                    {c.was && <div style={{ fontSize:9,color:"#334155",marginTop:2 }}>{c.was}</div>}
                  </div>
                ))}
              </div>
            );
          })()}
          {useCustom&&(
            <div style={{ display:"flex",gap:8,marginBottom:12,alignItems:"center" }}>
              <input type="date" value={custStart} onChange={e=>setCustStart(e.target.value)} style={{ flex:1,background:sf,border:`1px solid ${bd}`,borderRadius:8,padding:"7px 10px",color:"var(--fkh-text)",fontSize:12,outline:"none" }}/>
              <span style={{ color:"#334155" }}>→</span>
              <input type="date" value={custEnd} onChange={e=>setCustEnd(e.target.value)} style={{ flex:1,background:sf,border:`1px solid ${bd}`,borderRadius:8,padding:"7px 10px",color:"var(--fkh-text)",fontSize:12,outline:"none" }}/>
            </div>
          )}
          <div style={{ background:sf,border:`1px solid ${bd}`,borderRadius:14,padding:"14px 12px",marginBottom:14 }}>
            <div style={{ ...lbl,marginBottom:12 }}>Daily Volume &amp; FG% Trend</div>
            <StackedBars data={histData} priColor={P} height={160} selDate={selDate} onSelect={setSelDate}
              fgByDay={histData.map(d=>d.pct)}/>
            <div style={{ display:"flex",flexWrap:"wrap",gap:8,marginTop:12 }}>
              <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                <div style={{ width:12,height:2.5,borderRadius:2,background:"#22d3ee",flexShrink:0 }}/>
                <span style={{ fontSize:10,fontWeight:700,color:"#22d3ee" }}>FG%</span>
              </div>
              {SHOT_TYPES.filter(t=>histData.some(d=>(d.byShotType[t.id]||0)>0)).map(t=>(
                <div key={t.id} style={{ display:"flex",alignItems:"center",gap:5 }}>
                  <div style={{ width:9,height:9,borderRadius:2,background:SHOT_COLORS[t.id],flexShrink:0 }}/>
                  <span style={{ fontSize:10,fontWeight:600,color:P }}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background:`${P}08`,border:`1px solid ${P}1e`,borderRadius:14,padding:"14px",marginBottom:14 }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:9,color:"#334155",marginBottom:6 }}>{selDate===todayKey()?"TODAY":fmtDate(selDate).toUpperCase()}</div>
            {(() => {
              const attempts = selShots.length;
              const makes = selShots.filter(s => s.made !== false).length;
              const fg = attempts ? Math.round((makes / attempts) * 100) : 0;
              return (
                <>
                  <div style={{ fontSize:22,fontWeight:800,color:P,fontFamily:"'DM Mono',monospace",marginBottom:4 }}>
                    {fg}% <span style={{ fontSize:12,fontWeight:400,color:"#475569" }}>FG</span>
                  </div>
                  <div style={{ fontSize:11,color:"#64748b",marginBottom:10 }}>{makes}/{attempts} on this day</div>
                </>
              );
            })()}
            {selShots.length===0
              ? <div style={{ color:"#334155",fontSize:12 }}>No shots on this day</div>
              : <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  {ZONES.map(z=>{ const st=selZoneStats[z.id]; if(!st||!st.a) return null;
                    return (
                      <div key={z.id} style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <span style={{ fontSize:12,flexShrink:0 }}>{z.emoji}</span>
                        <span style={{ fontSize:11,color:"var(--fkh-text-muted)",flex:1,minWidth:0 }}>{z.label}</span>
                        <div style={{ width:56,height:5,borderRadius:99,background:"rgba(255,255,255,0.07)",overflow:"hidden",flexShrink:0 }}>
                          <div style={{ width:`${st.pct||0}%`,height:"100%",background:P }} />
                        </div>
                        <span style={{ fontSize:11,fontWeight:800,color:P,fontFamily:"'DM Mono',monospace",width:44,textAlign:"right" }}>{st.pct}%</span>
                        <span style={{ fontSize:10,color:"#475569",width:40,textAlign:"right" }}>{st.m}/{st.a}</span>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
          <div style={lbl}>Per-Type Trends</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
            {SHOT_TYPES.map(t=>{ const sp=histData.map(d=>(d.byShotType[t.id]||0)); if(sp.every(v=>v===0)) return null; return (
              <div key={t.id} style={{ background:sf,border:`1px solid ${SHOT_COLORS[t.id]}1e`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ fontSize:18 }}>{t.emoji}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:SHOT_COLORS[t.id],marginBottom:3 }}>{t.label}</div>
                  <Spark data={sp} color={SHOT_COLORS[t.id]} w={80} h={24}/>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:18,fontWeight:800,fontFamily:"'DM Mono',monospace",color:SHOT_COLORS[t.id],lineHeight:1 }}>{allByType[t.id]||0}</div>
                  <div style={{ fontSize:8,color:"#334155" }}>all time</div>
                </div>
              </div>
            );})}
          </div>
        </div>
      )}

      {view==="breakdown" && (
        <div style={{ padding:"14px 16px 0" }}>
          {/* Governs every section on this tab. */}
          <div style={{ display:"flex",gap:5,marginBottom:10,flexWrap:"wrap" }}>
            {STATS_RANGES.map(r=>(
              <button key={r.id} onClick={()=>setStatsRange(r.id)} style={{ padding:"7px 12px",borderRadius:10,border:`1px solid ${statsRange===r.id?P:bd}`,background:statsRange===r.id?`${P}18`:"transparent",color:statsRange===r.id?P:"#475569",fontSize:12,fontWeight:600,cursor:"pointer" }}>{r.label}</button>
            ))}
          </div>
          <div style={{ background:sf,border:`1px solid ${bd}`,borderRadius:14,padding:"16px",marginBottom:14,display:"flex",gap:16,alignItems:"center" }}>
            <Donut size={128} data={SHOT_TYPES.map(t=>({value:rangeByType[t.id]||0,color:SHOT_COLORS[t.id]}))}/>
            <div style={{ flex:1 }}>
              <div style={lbl}>Overall</div>
              <div style={{ fontFamily:"'DM Mono',monospace",fontSize:28,fontWeight:800,color:P,lineHeight:1,marginBottom:2 }}>
                {rangeStats.pct != null ? `${rangeStats.pct}%` : "—"}
              </div>
              <div style={{ fontSize:10,color:"#475569",marginBottom:8 }}>
                {rangeStats.makes}/{rangeStats.attempts} FG% {STATS_RANGE_SUFFIX[statsRange]}
              </div>
              <div style={{ fontSize:10,color:"#475569" }}>
                {statsRange !== "all_time" && allTimeStats.pct != null
                  ? `${allTimeStats.pct}% · ${allTimeStats.makes}/${allTimeStats.attempts} all-time`
                  : `${allTotal} attempts logged`}
              </div>
            </div>
          </div>
          <div style={{ background:sf,border:`1px solid ${bd}`,borderRadius:14,padding:"14px",marginBottom:14 }}>
            <div style={lbl}>By creation type</div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {SHOT_STYLES.map(st => {
                const s = styleAccuracy[st.id];
                const has = s?.a > 0;
                return (
                  <div key={st.id} style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <span style={{ fontSize:11,color:"var(--fkh-text-muted)",flex:1,minWidth:0 }}>{st.label}</span>
                    <div style={{ flex:1,height:6,borderRadius:99,background:"rgba(255,255,255,0.07)",overflow:"hidden" }}>
                      <div style={{ width:`${has ? s.pct : 0}%`,height:"100%",background:P }} />
                    </div>
                    <span style={{ fontSize:11,fontWeight:800,color:has?P:"#475569",fontFamily:"'DM Mono',monospace",width:72,textAlign:"right" }}>
                      {has ? `${s.pct}%` : "—"}
                    </span>
                    <span style={{ fontSize:10,color:"#475569",width:36,textAlign:"right" }}>{has ? `${s.m}/${s.a}` : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ background:sf,border:`1px solid ${bd}`,borderRadius:14,padding:"14px",marginBottom:14 }}>
            <div style={lbl}>By court zone</div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {zoneTypeStats.length === 0
                ? <div style={{ color:"#334155",fontSize:12,textAlign:"center",padding:"8px 0" }}>Log shots from the court map</div>
                : zoneTypeStats.map(z => {
                  const c = SHOT_COLORS[z.id] || P;
                  return (
                    <div key={z.id} style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:11,color:"var(--fkh-text-muted)",flex:1,minWidth:0 }}>{z.label}</span>
                      <div style={{ width:56,height:5,borderRadius:99,background:"rgba(255,255,255,0.07)",overflow:"hidden" }}>
                        <div style={{ width:`${z.pct || 0}%`,height:"100%",background:c }} />
                      </div>
                      <span style={{ fontSize:11,fontWeight:800,color:c,fontFamily:"'DM Mono',monospace",width:44,textAlign:"right" }}>{z.pct}%</span>
                      <span style={{ fontSize:10,color:"#475569",width:40,textAlign:"right" }}>{z.m}/{z.a}</span>
                    </div>
                  );
                })}
            </div>
          </div>
          {/* By location and Spot detail were the same data with and without
              shot type — one section, tap a location to split it by type. */}
          <div style={{ background:sf,border:`1px solid ${bd}`,borderRadius:14,padding:"14px",marginBottom:14 }}>
            <div style={lbl}>By location &amp; type</div>
            {locationTypeStats.length === 0
              ? <div style={{ color:"#334155",fontSize:12,textAlign:"center",padding:"12px 0" }}>Locations appear when you tap specific court zones</div>
              : <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  {locationTypeStats.map(loc => {
                    const open = openLoc === loc.label;
                    const splits = loc.types.length > 1;
                    return (
                      <div key={loc.label}>
                        <button type="button"
                          onClick={() => splits && setOpenLoc(open ? null : loc.label)}
                          aria-expanded={splits ? open : undefined}
                          style={{ width:"100%",display:"flex",alignItems:"center",gap:8,padding:0,
                            background:"transparent",border:"none",textAlign:"left",
                            cursor:splits?"pointer":"default" }}>
                          <span style={{ fontSize:11,color:"var(--fkh-text-muted)",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                            {splits && <span style={{ color:"#475569",marginRight:4,display:"inline-block",width:8,
                              transform:open?"rotate(90deg)":"none",transition:"transform 0.2s" }}>›</span>}
                            {loc.label}
                          </span>
                          <span style={{ width:56,height:5,borderRadius:99,background:"rgba(255,255,255,0.07)",overflow:"hidden",flexShrink:0 }}>
                            <span style={{ display:"block",width:`${loc.pct || 0}%`,height:"100%",background:S }} />
                          </span>
                          <span style={{ fontSize:11,fontWeight:800,color:S,fontFamily:"'DM Mono',monospace",width:44,textAlign:"right" }}>{loc.pct}%</span>
                          <span style={{ fontSize:10,color:"#475569",width:40,textAlign:"right" }}>{loc.m}/{loc.a}</span>
                        </button>
                        {open && (
                          <div style={{ display:"flex",flexDirection:"column",gap:5,margin:"6px 0 2px 12px",
                            paddingLeft:10,borderLeft:`1px solid ${bd}` }}>
                            {loc.types.map(t => {
                              const c = SHOT_COLORS[t.id] || P;
                              return (
                                <div key={t.id} style={{ display:"flex",alignItems:"center",gap:8 }}>
                                  <span style={{ fontSize:10.5,color:"#64748b",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.label}</span>
                                  <div style={{ width:44,height:4,borderRadius:99,background:"rgba(255,255,255,0.07)",overflow:"hidden" }}>
                                    <div style={{ width:`${t.pct || 0}%`,height:"100%",background:c }} />
                                  </div>
                                  <span style={{ fontSize:10.5,fontWeight:800,color:c,fontFamily:"'DM Mono',monospace",width:40,textAlign:"right" }}>{t.pct}%</span>
                                  <span style={{ fontSize:9.5,color:"#475569",width:38,textAlign:"right" }}>{t.m}/{t.a}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
            }
          </div>
          <div style={lbl}>Volume by zone</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
            {SHOT_TYPES.map(t=>{ const total=rangeByType[t.id]||0,pct=rangeTotal>0?Math.round((total/rangeTotal)*100):0;
              const wk7=Array.from({length:7}).map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return(log[d.toLocaleDateString("en-CA")]||[]).filter(s=>s.type===t.id).length;});
              return (<div key={t.id} style={{ background:`${SHOT_COLORS[t.id]}0a`,border:`1px solid ${SHOT_COLORS[t.id]}20`,borderRadius:12,padding:"12px" }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
                  <div><div style={{ fontSize:18,marginBottom:2 }}>{t.emoji}</div><div style={{ fontSize:11,fontWeight:700,color:SHOT_COLORS[t.id],lineHeight:1.2 }}>{t.label}</div></div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"'DM Mono',monospace",fontSize:22,fontWeight:800,color:SHOT_COLORS[t.id],lineHeight:1 }}>{total}</div>
                    <div style={{ fontSize:9,color:"#334155" }}>{pct}% of all</div>
                  </div>
                </div>
                <Spark data={wk7} color={SHOT_COLORS[t.id]} w={120} h={22}/>
                <div style={{ fontSize:8,color:"#334155",marginTop:3,fontFamily:"'DM Mono',monospace" }}>7-DAY TREND</div>
              </div>);
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ BADGE CELEBRATION ════════════════ */
