import AthleteCard from "./AthleteCard.jsx";
import { getAgeGroup, getAgeGroupLabel, calcAge } from "../lib/periodStats.js";

function isBirthday(dob) {
  if (!dob) return false;
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  return birth.getMonth() === today.getMonth() && birth.getDate() === today.getDate();
}

/**
 * ProfileView renders the athlete's Me › Overview identity + progress cards.
 * `variant` splits it so the Overview can place the editable "My Player" editor
 * directly under the card (identity), with the progress cards (Challenges,
 * Badges) below it:
 *   "card"     — Athlete Card + age only
 *   "progress" — Challenges + Badges & Path only
 *   undefined  — both (full view, back-compat)
 */
export default function ProfileView({
  settings, totalXP, currentLevel, earnedBadges,
  totalBadges, tracksComplete, totalTracks,
  P, onViewBadges, onViewLeaderboard, pushError,
  variant,
}) {
  const showCard = variant !== "progress";
  const showProgress = variant !== "card";
  return (
    <div style={{ padding:"0 20px 16px" }}>
      {showCard && (
      <div style={{ padding:"20px 0 16px" }}>
        <AthleteCard settings={settings} currentLevel={currentLevel} totalXP={totalXP} variant="full" P={P} />
        {settings.dateOfBirth ? (
          <div style={{ fontSize:12,color:"#475569",textAlign:"center",marginTop:10 }}>
            {isBirthday(settings.dateOfBirth)
              ? <span style={{ color:P,fontWeight:700 }}>🎂 Happy Birthday! Age {calcAge(settings.dateOfBirth)}</span>
              : `Age ${calcAge(settings.dateOfBirth)}`}
          </div>
        ) : (
          <div style={{ fontSize:11,color:"#334155",textAlign:"center",marginTop:10 }}>Tap Edit to add your birthday</div>
        )}
      </div>
      )}

      {showProgress && (<>
      <div style={{ background:`${P}08`,border:`1px solid ${P}1c`,borderRadius:14,padding:"14px 16px",marginBottom:16 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
          <span style={{ fontSize:13,fontWeight:700,color:P }}>🏆 Challenges</span>
          <button onClick={onViewLeaderboard} style={{ background:"none",border:"none",color:"#64748b",fontSize:12,cursor:"pointer",fontWeight:700 }}>Open Challenges →</button>
        </div>
        <p style={{ fontSize:11,color:"#64748b",margin:"0 0 10px",lineHeight:1.5 }}>
          {settings.dateOfBirth
            ? `Stats sync to the ${getAgeGroupLabel(getAgeGroup(settings.dateOfBirth))} board automatically.`
            : "Stats sync to Challenges automatically. Set your birthday for the right age group."}
        </p>
        {pushError && <div style={{ fontSize:11,color:"#f87171",marginBottom:8 }}>{pushError}</div>}
      </div>

      <button onClick={onViewBadges}
        style={{ width:"100%",borderRadius:14,padding:"14px 16px",
          background:`${P}08`,border:`1px solid ${P}1c`,cursor:"pointer",
          textAlign:"left",marginBottom:4 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
          <span style={{ fontSize:13,fontWeight:700,color:P }}>🏅 Badges & Path</span>
          <span style={{ fontSize:13,color:"#475569" }}>→</span>
        </div>
        <div style={{ display:"flex",gap:10 }}>
          <div style={{ flex:1,background:`${P}12`,borderRadius:10,padding:"10px 0",textAlign:"center" }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:24,fontWeight:800,color:P,lineHeight:1 }}>
              {earnedBadges.length}
            </div>
            <div style={{ fontSize:9,color:"#475569",marginTop:3 }}>of {totalBadges} badges</div>
          </div>
          <div style={{ flex:1,background:`${P}12`,borderRadius:10,padding:"10px 0",textAlign:"center" }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:24,fontWeight:800,color:P,lineHeight:1 }}>
              {tracksComplete}
            </div>
            <div style={{ fontSize:9,color:"#475569",marginTop:3 }}>of {totalTracks} tracks</div>
          </div>
        </div>
      </button>
      </>)}
    </div>
  );
}
