import { useState, useRef } from "react";
import { readStoredAvatar } from "../lib/avatarStorage.js";
import { saveAvatarLocally } from "../lib/avatarCloud.js";
import AvatarCropSheet from "./AvatarCropSheet.jsx";
import PlayerPicker from "./PlayerPicker.jsx";
import { normalizeJerseyNumber, POSITIONS } from "../lib/identity.js";
import { calcAge } from "../lib/periodStats.js";
import { pri, chipStyle } from "../lib/themeColors.js";
import DateOfBirthField from "./DateOfBirthField.jsx";

function isBirthday(dob) {
  if (!dob) return false;
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  return birth.getMonth() === today.getMonth() && birth.getDate() === today.getDate();
}

const GOAL_OPTIONS = [
  ["explosion", "💥 Jump Higher"], ["speed", "⚡ Quick Feet"], ["conditioning", "🔥 Conditioning"],
  ["handles", "🤲 Ball Handling"], ["shooting", "🎯 Shooting"], ["strength", "💪 Strength"],
  ["defense", "🛡 Defense"], ["coordination", "🎶 Coordination"],
];
const EXPERIENCE = [["beginner", "🌱 Beginner"], ["intermediate", "⚡ Intermediate"], ["advanced", "🔥 Advanced"]];

const sectionLabel = {
  fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: "0.18em",
  color: "#334155", marginBottom: 12, textTransform: "uppercase",
};
const fieldLabel = { fontSize: 11, color: "#475569", marginBottom: 6, fontWeight: 600 };

/**
 * IdentityEditor — the athlete's editable "My Player" identity, moved out of
 * Settings (where a kid couldn't find it) and into the Me › Overview dashboard.
 * Everything about *who the player is* lives here: avatar, name, jersey, who
 * they play like (first-class), goals, position, experience, birthday.
 *
 * Presentation + local avatar-crop state only; all identity data reads/writes
 * flow through the same `settings`/`setSettings` the rest of the app uses, so
 * nothing about persistence, sync, or progression changes.
 */
export default function IdentityEditor({ settings, setSettings, avatarUrl, onAvatarChange }) {
  const P = pri(settings);
  const fileRef = useRef(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarSaveNote, setAvatarSaveNote] = useState(null);
  const [cropSource, setCropSource] = useState(null);

  const input = {
    width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.05)",
    border: `1.5px solid ${P}44`, borderRadius: 10, padding: "8px 12px",
    fontSize: 14, color: "var(--fkh-text)", outline: "none",
  };

  const today = new Date();
  // Matches dobBounds() in OnboardingSheet — adults train here too, and a
  // picker that stops at 18 leaves them with no age at all.
  const maxDOB = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate()).toLocaleDateString("en-CA");
  const minDOB = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate()).toLocaleDateString("en-CA");
  const age = settings.dateOfBirth ? calcAge(settings.dateOfBirth) : null;
  const bday = settings.dateOfBirth && isBirthday(settings.dateOfBirth);

  return (
    <>
      <AvatarCropSheet
        open={Boolean(cropSource)}
        imageSrc={cropSource}
        accent={P}
        busy={avatarSaving}
        onCancel={() => { setCropSource(null); setAvatarSaving(false); }}
        onConfirm={async (cropped) => {
          setAvatarSaving(true);
          const result = await saveAvatarLocally(cropped);
          setAvatarSaving(false);
          setCropSource(null);
          if (result.ok) { setAvatarSaveNote("Photo saved ✓"); onAvatarChange?.(); }
          else setAvatarSaveNote("Couldn't save photo — try a smaller picture");
        }}
      />

      <div style={{ padding: "0 20px 4px" }}>
        <div style={{ ...sectionLabel, color: P, letterSpacing: "0.14em", fontSize: 10 }}>🏀 My Player</div>

        {/* Avatar + name + jersey */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 }}>
          <div onClick={() => fileRef.current?.click()}
            style={{ width: 72, height: 72, borderRadius: "50%", background: `${P}18`, border: `3px solid ${P}`, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            {(avatarUrl || readStoredAvatar())
              ? <img src={avatarUrl || readStoredAvatar()} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 30 }}>👤</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
              const f = e.target.files?.[0]; if (!f) return;
              e.target.value = "";
              setAvatarSaving(true); setAvatarSaveNote(null);
              const reader = new FileReader();
              reader.onload = ev => { setAvatarSaving(false); setCropSource(ev.target.result); };
              reader.onerror = () => { setAvatarSaving(false); setAvatarSaveNote("Couldn't read that photo"); };
              reader.readAsDataURL(f);
            }} />
            <button onClick={() => fileRef.current?.click()} disabled={avatarSaving}
              style={{ display: "block", padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${P}`, background: "transparent", fontSize: 12, fontWeight: 600, cursor: avatarSaving ? "wait" : "pointer", color: P, marginBottom: 8, opacity: avatarSaving ? 0.7 : 1 }}>
              {avatarSaving ? "Saving photo…" : "📷 Choose Photo"}
            </button>
            {avatarSaveNote && <div style={{ fontSize: 11, color: avatarSaveNote.includes("✓") ? P : "#f87171", marginBottom: 8 }}>{avatarSaveNote}</div>}
            <input value={settings.athleteName || ""} onChange={e => setSettings(p => ({ ...p, athleteName: e.target.value }))}
              placeholder="First name" style={{ ...input, fontWeight: 700, color: P, borderColor: `${P}44`, marginBottom: 8 }} />
            <input value={settings.lastName || ""} onChange={e => setSettings(p => ({ ...p, lastName: e.target.value }))}
              placeholder="Last name (optional)" style={{ ...input, fontWeight: 700, color: P, borderColor: `${P}44`, marginBottom: 6 }} />
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
              Friends see your first name + last initial on Challenges leaderboards.
            </div>
            <div style={{ maxWidth: 120 }}>
              <div style={fieldLabel}>Jersey #</div>
              <input type="number" min={0} max={99} value={settings.jerseyNumber ?? ""} placeholder="—"
                onChange={e => setSettings(p => ({ ...p, jerseyNumber: normalizeJerseyNumber(e.target.value) }))}
                style={input} />
            </div>
          </div>
        </div>

        {/* Who I play like — first-class */}
        <div style={{ background: `${P}0c`, border: `1px solid ${P}30`, borderRadius: 14, padding: "14px 14px 10px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: P, marginBottom: 3 }}>🐐 Who I Play Like</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12, lineHeight: 1.45 }}>
            Pick your player — it shapes your Train Like Legends journey.
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={fieldLabel}>Plays like 🎯</div>
            <PlayerPicker value={settings.favoritePlayLike || ""} onChange={v => setSettings(p => ({ ...p, favoritePlayLike: v }))}
              pool="both" placeholder="e.g. Curry — picks your journey" accent={P} maxInlineResults={18} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={fieldLabel}>Favorite player right now</div>
            <PlayerPicker value={settings.favoriteCurrent || ""} onChange={v => setSettings(p => ({ ...p, favoriteCurrent: v }))}
              pool="active" placeholder="Current NBA star" accent={P} maxInlineResults={16} />
          </div>
          <div>
            <div style={fieldLabel}>All-time favorite 🐐</div>
            <PlayerPicker value={settings.favoriteAllTime || ""} onChange={v => setSettings(p => ({ ...p, favoriteAllTime: v }))}
              pool="legends" placeholder="Legend since 1990" accent={P} maxInlineResults={16} />
          </div>
        </div>

        {/* Goals */}
        <div style={{ marginBottom: 16 }}>
          <div style={fieldLabel}>My Goals <span style={{ fontSize: 10, fontWeight: 400 }}>(pick up to 3)</span></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {GOAL_OPTIONS.map(([val, lbl]) => {
              const sel = (settings.goals || []).includes(val);
              return (
                <button key={val} onClick={() => setSettings(p => {
                  const g = p.goals || [];
                  return { ...p, goals: sel ? g.filter(x => x !== val) : g.length < 3 ? [...g, val] : g };
                })}
                  style={{ padding: "6px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: sel ? `${P}20` : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${sel ? P : "rgba(255,255,255,0.1)"}`, color: sel ? P : "#64748b" }}>
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>

        {/* Position */}
        <div style={{ marginBottom: 16 }}>
          <div style={fieldLabel}>Position</div>
          <div style={{ display: "flex", gap: 6 }}>
            {POSITIONS.map(pos => (
              <button key={pos.id} onClick={() => setSettings(p => ({ ...p, playStyle: pos.id }))}
                style={{ flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  ...chipStyle(settings, settings.playStyle === pos.id, P) }}>
                {pos.emoji} {pos.label}
              </button>
            ))}
          </div>
        </div>

        {/* Experience */}
        <div style={{ marginBottom: 16 }}>
          <div style={fieldLabel}>Experience Level</div>
          <div style={{ display: "flex", gap: 6 }}>
            {EXPERIENCE.map(([val, lbl]) => (
              <button key={val} onClick={() => setSettings(p => ({ ...p, experience: val }))}
                style={{ flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  ...chipStyle(settings, settings.experience === val, P) }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Birthday */}
        <div style={{ marginBottom: 8 }}>
          <div style={fieldLabel}>Birthday</div>
          <DateOfBirthField value={settings.dateOfBirth || ""} min={minDOB} max={maxDOB} P={P}
            onChange={v => setSettings(p => ({ ...p, dateOfBirth: v || null }))}
            selectStyle={{ ...input, marginBottom: 0, colorScheme: "dark" }} />
          <div style={{ marginTop: 7 }}>
            {age !== null
              ? <span style={{ fontSize: 12, color: "var(--fkh-text-muted)" }}>
                  {bday ? <span style={{ color: P, fontWeight: 700 }}>🎂 Happy Birthday! Age {age}</span>
                        : `Age ${age} — updates automatically every birthday`}
                </span>
              : <span style={{ fontSize: 11, color: "#475569" }}>Add your birthday for the right age group</span>}
          </div>
        </div>
      </div>
    </>
  );
}
