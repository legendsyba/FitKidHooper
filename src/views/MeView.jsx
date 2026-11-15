import { useState } from "react";
import ProfileView from "../components/ProfileView.jsx";
import ProgressJourney from "../components/ProgressJourney.jsx";
import IdentityEditor from "../components/IdentityEditor.jsx";
import ProgressionView from "../components/ProgressionView.jsx";
import CoachNavButton from "../components/CoachNavButton.jsx";
import SettingsSheet from "../components/SettingsSheet.jsx";
import ViewErrorBoundary from "../components/ViewErrorBoundary.jsx";
import HomeCollapsibleSection from "../components/HomeCollapsibleSection.jsx";
import GrowthCard from "../components/GrowthCard.jsx";
import { getStreak, getTrainingDays } from "../lib/progressStats.js";
import { shootingSnapshot } from "../lib/shootingStats.js";
import { readShotLog } from "../lib/shotLog.js";

export default function MeView({
  settings,
  onSkillCheck,
  progressTab,
  setProgressTab,
  xpData,
  currentLevel,
  journey,
  onStartPractice,
  earnedBadges,
  completed,
  programProgress,
  badgeDates,
  totalBadges,
  tracksComplete,
  totalTracks,
  programs,
  allExercises,
  progressCtx,
  ledgerSet,
  ledger,
  benchmarkPBs,
  growthLog,
  lockerBadgesOpen,
  setLockerBadgesOpen,
  P,
  S,
  ST,
  BG,
  SF,
  bd,
  lbl,
  shellOverlays,
  BadgesView,
  ProgressStatsPanel,
  setSettings,
  onOpenGuide,
  onOpenFeedback,
  onOpenWhatsNew,
  onOpenAuth,
  onCloudSync,
  cloudSyncStatus,
  cloudSyncDetail,
  onLogout,
  avatarUrl,
  onAvatarChange,
  isSignedIn,
  signedInUsername,
  onViewHistory,
  onOpenSchedule,
  onViewReport,
  onViewLeaderboard,
  pushError,
  onLogBenchmark,
  onEquipTitle,
  onEquipCosmetic,
  onUnequipSlot,
  onLogHeight,
  onOpenPlayerHighlight,
  onOpenExercise,
  onOpenShots,
  onOpenCoach,
  renderBottomNav,
}) {
  /* Settings is a visible pill, not just a gear: the gear used to set a tab
     the pill row had no pill for, so all four went dark and the user lost
     their place. Skills merged into Badges — both pills rendered the same
     component. */
  const subTabs = [
    { id:"overview", label:"Progress" },
    { id:"locker",   label:"🏅 Badges" },
    { id:"stats",    label:"Stats" },
    { id:"settings", label:"⚙ Settings" },
  ];
  const inSettings = progressTab === "settings";
  // Anyone whose stored tab is the retired Skills pill lands on Badges.
  const activeTab = progressTab === "skills" ? "locker" : progressTab;
  const [editingPlayer, setEditingPlayer] = useState(false);
  const statTile = (label, value) => (
    <div style={{ flex:1,minWidth:120,background:SF,border:`1px solid ${bd}`,borderRadius:14,padding:"12px 14px" }}>
      <div style={{ fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase" }}>{label}</div>
      <div style={{ fontSize:18,fontWeight:800,color:P,marginTop:3,fontFamily:"'DM Mono',monospace" }}>{value}</div>
    </div>
  );
  const statBtn = (label, onClick) => (
    <button onClick={onClick} style={{ flex:1,padding:"12px 10px",borderRadius:12,border:`1px solid ${P}33`,background:`${P}0c`,color:P,fontSize:13,fontWeight:800,cursor:"pointer" }}>{label}</button>
  );

  return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:BG,color:"var(--fkh-text)",minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      {shellOverlays}

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${P}14`,position:"sticky",top:0,background:BG,backdropFilter:"blur(10px)",zIndex:10 }}>
        <h1 style={{ fontSize:16,fontWeight:800,margin:0,color:P,display:"flex",alignItems:"center",gap:8 }}>
          ⭐ Me
        </h1>
        <div style={{ display:"flex",gap:8 }}>
          {onOpenCoach && <CoachNavButton P={P} onClick={onOpenCoach} />}
          <button onClick={() => onOpenGuide?.("explore")}
            style={{ background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,color:"var(--fkh-text-muted)",fontSize:12,fontWeight:700,cursor:"pointer",padding:"5px 10px" }}>
            📖 Guide
          </button>
          <button onClick={() => setProgressTab(inSettings ? "overview" : "settings")}
            aria-label="Settings" title="Settings"
            style={{ background:inSettings?`${P}20`:"rgba(255,255,255,0.05)",border:`1px solid ${inSettings?P:"rgba(255,255,255,0.12)"}`,borderRadius:8,color:inSettings?P:"var(--fkh-text-muted)",fontSize:14,fontWeight:700,cursor:"pointer",padding:"5px 10px" }}>
            ⚙
          </button>
        </div>
      </div>

      <div style={{ display:"flex",gap:6,padding:"12px 18px 6px",overflowX:"auto" }}>
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setProgressTab(t.id)} style={{
            flexShrink:0,padding:"7px 14px",borderRadius:999,fontSize:12,fontWeight:800,cursor:"pointer",
            border:`1px solid ${activeTab===t.id?P:bd}`,
            background:activeTab===t.id?`${P}20`:"transparent",
            color:activeTab===t.id?P:"#64748b",
            display:"inline-flex",alignItems:"center",gap:6,
          }}>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          {/* Seeing yourself, then editing yourself — adjacent (Braylen: the
              problem wasn't finding his player, it was editing it). Card first,
              then the editable My Player block directly beneath it, then the
              progress cards (Challenges, Badges). */}
          <ProfileView
            variant="card"
            settings={settings}
            totalXP={xpData.total}
            currentLevel={currentLevel}
            P={P}
          />
          {/* One-time setup, so it sits behind Edit rather than filling the
              second and third screenful of a screen people open to check
              progress. Nothing is removed — the whole form is one tap away. */}
          <div style={{ display:"flex",justifyContent:"flex-end",padding:"0 18px",margin:"-6px 0 10px" }}>
            <button type="button" onClick={() => setEditingPlayer(e => !e)}
              aria-expanded={editingPlayer}
              style={{ padding:"5px 13px",borderRadius:99,cursor:"pointer",fontSize:11.5,fontWeight:800,
                border:`1px solid ${P}55`,background:`${P}14`,color:P }}>
              {editingPlayer ? "Done" : "Edit"}
            </button>
          </div>
          {editingPlayer && (
            <IdentityEditor
              settings={settings}
              setSettings={setSettings}
              avatarUrl={avatarUrl}
              onAvatarChange={onAvatarChange}
              onSkillCheck={onSkillCheck}
            />
          )}
          <ProgressJourney
            journey={journey}
            currentLevel={currentLevel}
            totalXP={xpData.total}
            P={P}
            SF={SF}
            bd={bd}
            onStartPractice={onStartPractice}
          />
          {/* Progress cards — Challenges + Badges & Path below the growth story. */}
          <ProfileView
            variant="progress"
            settings={settings}
            earnedBadges={earnedBadges}
            totalBadges={totalBadges}
            tracksComplete={tracksComplete}
            totalTracks={totalTracks}
            P={P}
            onViewBadges={() => setProgressTab("locker")}
            onViewLeaderboard={onViewLeaderboard}
            pushError={pushError}
          />
          {/* Coach lives in the header on every tab; Feedback lives in Settings. */}
        </>
      )}

      {activeTab === "locker" && (
        <div style={{ padding:"0 18px 4px" }}>
          <div style={{ fontSize:11,color:"#64748b",margin:"2px 2px 10px",lineHeight:1.5 }}>
            🔓 Earned badges are lit up. <b style={{ color:P }}>Locked</b> ones show what to do to earn them.
          </div>
          <HomeCollapsibleSection title={`🏅 My Badges (${earnedBadges.length})`} open={lockerBadgesOpen}
            onToggle={() => setLockerBadgesOpen(o => !o)} labelStyle={lbl} accentColor={P}>
            <BadgesView
              earnedBadges={earnedBadges}
              badgeDates={badgeDates}
              completed={completed}
              programProgress={programProgress}
              programs={programs}
              allExercises={allExercises}
              P={P}
              S={S}
              BG={BG}
              SF={SF}
              bd={bd}
              lbl={lbl}
            />
          </HomeCollapsibleSection>
        </div>
      )}

      {activeTab === "locker" && (
        <ProgressionView
          tab="skills"
          settings={settings}
          ledgerIds={ledgerSet}
          ledger={ledger}
          ctx={progressCtx}
          P={P}
          benchmarkPBs={benchmarkPBs}
          onLogBenchmark={onLogBenchmark}
          onEquipTitle={onEquipTitle}
          onEquipCosmetic={onEquipCosmetic}
          onUnequipSlot={onUnequipSlot}
          allExercises={allExercises}
          onOpenExercise={onOpenExercise}
          onOpenPlayerHighlight={onOpenPlayerHighlight}
          onOpenShots={onOpenShots}
        />
      )}

      {activeTab === "locker" && (
        <ProgressionView
          tab="locker"
          settings={settings}
          ledgerIds={ledgerSet}
          ledger={ledger}
          ctx={progressCtx}
          P={P}
          benchmarkPBs={benchmarkPBs}
          onLogBenchmark={onLogBenchmark}
          onEquipTitle={onEquipTitle}
          onEquipCosmetic={onEquipCosmetic}
          onUnequipSlot={onUnequipSlot}
          allExercises={allExercises}
          onOpenExercise={onOpenExercise}
          onOpenPlayerHighlight={onOpenPlayerHighlight}
          onOpenShots={onOpenShots}
        />
      )}

      {activeTab === "settings" && (
        <ViewErrorBoundary
          label="Settings"
          title="Settings couldn't load"
          message="Profile and theme settings hit a bug. Try again or clear cache — your training log is safe."
          P={P}
        >
          <SettingsSheet
            embedded
            settings={settings}
            setSettings={setSettings}
            onOpenFeedback={onOpenFeedback}
            onOpenWhatsNew={onOpenWhatsNew}
            onOpenAuth={onOpenAuth}
            isSignedIn={isSignedIn}
            signedInUsername={signedInUsername}
            onCloudSync={onCloudSync}
            cloudSyncStatus={cloudSyncStatus}
            cloudSyncDetail={cloudSyncDetail}
            onLogout={onLogout}
          />
        </ViewErrorBoundary>
      )}

      {progressTab === "stats" && (
        <div style={{ padding:"4px 18px 16px" }}>
          <div style={{ display:"flex",flexWrap:"wrap",gap:10,marginBottom:14 }}>
            {statTile("Level", `${currentLevel?.emoji||""} ${currentLevel?.name||"Rookie"}`)}
            {statTile("Total XP", (xpData?.total||0).toLocaleString())}
            {statTile("Streak", `${getStreak(completed)}d 🔥`)}
            {statTile("Training Days", getTrainingDays(completed))}
            {statTile("Shots Made", (progressCtx.makes||0).toLocaleString())}
            <button onClick={() => setProgressTab("locker")} style={{ flex:1,minWidth:120,textAlign:"left",cursor:"pointer",background:`${P}0c`,border:`1px solid ${P}33`,borderRadius:14,padding:"12px 14px" }}>
              <div style={{ fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase" }}>Badges ›</div>
              <div style={{ fontSize:18,fontWeight:800,color:P,marginTop:3,fontFamily:"'DM Mono',monospace" }}>{earnedBadges.length}</div>
            </button>
          </div>
          {/* Shooting used to be a full card here: overall and this-week FG%,
              per-zone, by-type and accuracy-by-spot — the same data Shots ›
              Stats shows, except that tab now filters by period and this one
              could not. Two homes for one dataset, and this was the stale one.
              One line and a handoff instead. */}
          {(() => {
            const snap = shootingSnapshot(readShotLog());
            const has = snap.allTime.attempts > 0;
            return (
              <button type="button" onClick={() => onOpenShots?.()}
                style={{ width:"100%",display:"flex",alignItems:"center",gap:10,marginBottom:14,
                  padding:"12px 14px",borderRadius:14,cursor:"pointer",textAlign:"left",
                  background:SF,border:`1px solid ${bd}` }}>
                <span style={{ fontSize:16,flexShrink:0 }}>🎯</span>
                <span style={{ flex:1,minWidth:0 }}>
                  <span style={{ display:"block",fontSize:13,fontWeight:800,color:"var(--fkh-text)" }}>
                    Shooting accuracy
                  </span>
                  <span style={{ display:"block",fontSize:11,color:"#64748b",marginTop:2 }}>
                    {has
                      ? `${snap.allTime.pct}% all-time · ${snap.allTime.makes}/${snap.allTime.attempts} — filter by period on Shots`
                      : "Log shots to see your accuracy by zone and period"}
                  </span>
                </span>
                <span style={{ fontSize:12,color:"#475569",flexShrink:0 }}>›</span>
              </button>
            );
          })()}
          <GrowthCard log={growthLog} onLog={onLogHeight} P={P} SF={SF} bd={bd} />
          <ProgressStatsPanel
            totalXP={xpData?.total||0}
            xpData={xpData}
            currentLevel={currentLevel}
            P={P}
            ST={ST}
            SF={SF}
            bd={bd}
            lbl={lbl}
          />
          <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
            {statBtn("📊 Training History", onViewHistory)}
            {statBtn("🗓 Training Calendar", onOpenSchedule)}
            {statBtn("🧠 Coach Report", onViewReport)}
          </div>
        </div>
      )}

      {renderBottomNav()}
    </div>
  );
}
