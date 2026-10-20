import BoardView from "../components/BoardView.jsx";
import GuideNavButton from "../components/GuideNavButton.jsx";
import CoachNavButton from "../components/CoachNavButton.jsx";

/* Stable identity — BoardView effects depend on it. */
const CHALLENGE_MODES = ["challenges", "rankings"];

export default function ChallengesView({
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
  onAddFriends,
  focusFriendsTick,
  onPushSuccess,
  onOpenGuide,
  onOpenCoach,
  shellOverlays,
  renderBottomNav,
}) {



  return (
    <div style={{ fontFamily:"'DM Sans','Helvetica Neue',sans-serif",background:BG,color:"var(--fkh-text)",minHeight:"100vh",maxWidth:680,margin:"0 auto",paddingBottom:"calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      {shellOverlays}

      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${P}14`,position:"sticky",top:0,background:BG,backdropFilter:"blur(10px)",zIndex:10 }}>
        <h1 style={{ fontSize:16,fontWeight:800,margin:0,color:P }}>🏆 Challenges</h1>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          {onOpenCoach && <CoachNavButton compact P={P} onClick={onOpenCoach} />}
          {onOpenGuide && <GuideNavButton compact onClick={() => onOpenGuide("explore")} />}
        </div>
      </div>

      <BoardView
        modes={CHALLENGE_MODES}
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
        onAddFriends={onAddFriends}
        focusFriendsTick={focusFriendsTick}
        onPushSuccess={onPushSuccess}
      />

      {renderBottomNav()}
    </div>
  );
}
