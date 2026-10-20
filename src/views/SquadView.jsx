import { useState } from "react";
import BoardView from "../components/BoardView.jsx";
import CountBadge from "../components/CountBadge.jsx";
import GuideNavButton from "../components/GuideNavButton.jsx";
import CoachNavButton from "../components/CoachNavButton.jsx";

/* Stable identity — BoardView effects depend on it. */
const SQUAD_MODES = ["friends"];

export default function SquadView({
  settings,
  completed,
  missionLog,
  getCategory,
  earnedBadges,
  ledger,
  personalChallenges,
  currentLevel,
  xpData,
  P,
  BG,
  SF,
  bd,
  lbl,
  initialInviteCode,
  isSignedIn,
  onOpenAuth,
  focusFriendsTick,
  onPushSuccess,
  unreadMessages = 0,
  friendRequests = 0,
  squadNotifications = 0,
  feedActivity = 0,
  challengeActivity = 0,
  onSquadTabSeen,
  onUnreadRefresh,
  openMessagesInbox = false,
  onMessagesInboxOpened,
  onOpenGuide,
  onOpenCoach,
  shellOverlays,
  renderBottomNav,
}) {
  // Adding a friend used to live only on the fourth sub-tab. It is a header
  // control now, visible from every Squad tab.
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:BG,color:"var(--fkh-text)",minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      {shellOverlays}

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${P}14`,position:"sticky",top:0,background:BG,backdropFilter:"blur(10px)",zIndex:10 }}>
        <h1 style={{ fontSize:16,fontWeight:800,margin:0,color:P,display:"flex",alignItems:"center",gap:8 }}>
          <span>👥 Squad</span>
          {(squadNotifications > 0) && <CountBadge count={squadNotifications} P={P} />}
        </h1>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <button type="button" onClick={() => setAddOpen(o => !o)} aria-expanded={addOpen}
            style={{ padding:"6px 12px",borderRadius:99,border:`1px solid ${P}`,
              background:addOpen?`${P}30`:`${P}18`,color:P,fontSize:11,fontWeight:800,cursor:"pointer",flexShrink:0 }}>
            + Add
          </button>
          {onOpenCoach && <CoachNavButton compact P={P} onClick={onOpenCoach} />}
          {onOpenGuide && <GuideNavButton compact onClick={() => onOpenGuide("explore")} />}
          {!isSignedIn && (
          <button type="button" onClick={onOpenAuth}
            style={{ padding:"6px 12px",borderRadius:8,border:`1px solid ${P}44`,background:`${P}14`,color:P,fontSize:11,fontWeight:700,cursor:"pointer" }}>
            Save player
          </button>
        )}
        </div>
      </div>

      {!isSignedIn && (
        <div style={{ margin:"12px 20px 0",padding:"12px 14px",borderRadius:12,border:`1px solid ${P}33`,background:`${P}0c`,fontSize:12,color:"#94a3b8",lineHeight:1.5 }}>
          🔒 Save your player to message friends, accept requests, and compete in squad challenges.
        </div>
      )}

      <BoardView
        modes={SQUAD_MODES}
        settings={settings}
        completed={completed}
        missionLog={missionLog}
        getCategory={getCategory}
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
        initialInviteCode={initialInviteCode}
        isSignedIn={isSignedIn}
        onOpenAuth={onOpenAuth}
        focusFriendsTick={focusFriendsTick}
        onPushSuccess={onPushSuccess}
        unreadMessages={unreadMessages}
        friendRequests={friendRequests}
        feedActivity={feedActivity}
        challengeActivity={challengeActivity}
        onSquadTabSeen={onSquadTabSeen}
        onUnreadRefresh={onUnreadRefresh}
        openMessagesInbox={openMessagesInbox}
        onMessagesInboxOpened={onMessagesInboxOpened}
        addOpen={addOpen}
        onOpenAdd={() => setAddOpen(true)}
      />

      {renderBottomNav()}
    </div>
  );
}
