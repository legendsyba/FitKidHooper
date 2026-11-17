import { useState, useEffect, useMemo } from "react";
import { bg, surf, textPri, textMuted } from "../lib/themeColors.js";
import { loadBuddyNames, saveBuddyNames, loadBuddyBest, saveBuddyBest, partnerFit } from "../lib/partnerMode.js";

/**
 * Buddy Mode — two kids, one phone, head-to-head on a drill.
 *
 * Mastery-framed by design (see partnerMode.js): both players are celebrated,
 * the number we chase is the TEAM'S combined total ("beat your combined best"),
 * and nothing stores one kid beating the other. A finished game counts as a
 * completed training session via `onCount()` (the app's normal per-drill toggle),
 * so it feeds streak, XP and badges exactly like a solo rep.
 *
 * Props:
 *   drill     — the exercise object (needs .id, .name, ._cat)
 *   settings  — theme settings (for themeColors helpers)
 *   color     — Player 1 accent (the user's theme primary)
 *   onClose() — dismiss the sheet
 *   onCount() — count this drill as done today (parent: () => toggle(drill.id, "buddy"))
 */
const P2_ACCENT = "#f59e0b"; // amber — Player 2, distinct from any theme primary

const TARGETS = [5, 7, 11];

function unitFor(cat) {
  if (cat === "rebounding") return "boards";
  if (cat === "shooting" || cat === "shootingdrills" || cat === "shooting_lab") return "makes";
  if (cat === "passing") return "catches";
  return "points";
}

export default function BuddyModeSheet({ drill, settings, color, onClose, onCount }) {
  const BG = bg(settings), SF = surf(settings), TP = textPri(settings), TM = textMuted(settings);
  const unit = useMemo(() => unitFor(drill?._cat), [drill]);
  const needsPartner = partnerFit(drill) === "needs";

  const [names, setNames] = useState(loadBuddyNames);
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [target, setTarget] = useState(5);
  const [round, setRound] = useState(1);
  const [best, setBest] = useState(() => loadBuddyBest(drill?.id));
  const [finished, setFinished] = useState(null); // { combined, teamBest }

  // Persist names as they're edited (debounce-free; cheap and bounded).
  useEffect(() => { saveBuddyNames(names); }, [names]);

  const leader = a === b ? null : a > b ? 0 : 1;
  const someoneWon = a >= target || b >= target;

  function bump(player, delta) {
    if (finished) return;
    const set = player === 0 ? setA : setB;
    set((v) => Math.max(0, v + delta));
  }

  function newRound() {
    setA(0); setB(0); setRound((r) => r + 1);
  }

  function finish() {
    const combined = a + b;
    const teamBest = saveBuddyBest(drill.id, combined);
    setBest((prev) => Math.max(prev, combined));
    try { onCount?.(); } catch { /* counting is best-effort — never block the celebration */ }
    setFinished({ combined, teamBest });
  }

  const nameInput = (i) => (
    <input
      value={names[i]}
      onChange={(e) => setNames((n) => (i === 0 ? [e.target.value, n[1]] : [n[0], e.target.value]))}
      maxLength={14}
      aria-label={`Player ${i + 1} name`}
      style={{
        width: "100%", textAlign: "center", background: "transparent", border: "none",
        color: i === 0 ? color : P2_ACCENT, fontSize: 18, fontWeight: 800, padding: "2px 0",
        outline: "none",
      }}
    />
  );

  const scoreCard = (player) => {
    const accent = player === 0 ? color : P2_ACCENT;
    const val = player === 0 ? a : b;
    const isLeader = leader === player;
    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {nameInput(player)}
        <button
          type="button"
          onClick={() => bump(player, +1)}
          disabled={!!finished}
          aria-label={`Add a point for ${names[player]}`}
          style={{
            position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 22,
            background: `${accent}1c`, border: `2px solid ${accent}${isLeader ? "" : "55"}`,
            boxShadow: isLeader ? `0 0 0 3px ${accent}33` : "none",
            color: accent, fontSize: "clamp(56px, 18vw, 92px)", fontWeight: 900, lineHeight: 1,
            cursor: finished ? "default" : "pointer", transition: "box-shadow .15s, border-color .15s",
          }}
        >
          {val}
          <span style={{ position: "absolute", bottom: 10, left: 0, right: 0, fontSize: 12, fontWeight: 700, color: `${accent}bb`, textTransform: "uppercase", letterSpacing: 0.5 }}>
            tap to +1
          </span>
        </button>
        <button
          type="button"
          onClick={() => bump(player, -1)}
          disabled={!!finished || val === 0}
          aria-label={`Remove a point from ${names[player]}`}
          style={{
            alignSelf: "center", width: 44, height: 36, borderRadius: 10,
            background: "transparent", border: `1.5px solid ${accent}55`, color: accent,
            fontSize: 22, fontWeight: 800, cursor: val === 0 || finished ? "default" : "pointer",
            opacity: val === 0 ? 0.4 : 1,
          }}
        >−</button>
      </div>
    );
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 300 }} />
      <div
        role="dialog"
        aria-label="Buddy Mode"
        style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 680, height: "93vh", zIndex: 301,
          borderRadius: "20px 20px 0 0", background: BG, color: TP,
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ position: "sticky", top: 0, background: BG, padding: "14px 16px 10px", borderBottom: `1px solid ${SF}`, display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: TM, fontSize: 16, fontWeight: 700, cursor: "pointer", padding: "4px 6px" }}>← Back</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: 1 }}>🤝 Buddy Mode</div>
            <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{drill?.name}</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* How-to + target */}
          <div style={{ background: SF, borderRadius: 14, padding: "12px 14px", fontSize: 13, color: TM, lineHeight: 1.45 }}>
            Take turns on <b style={{ color: TP }}>{drill?.name}</b>. Tap your square each time you get a {unit.replace(/s$/, "")}. {needsPartner ? "You'll need a partner for this one." : "No partner? Race the clock and beat your own combined best."} First to the target takes the round — but you're both leveling up.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TM }}>First to</span>
            {TARGETS.map((t) => (
              <button key={t} type="button" onClick={() => setTarget(t)} disabled={!!finished}
                style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: finished ? "default" : "pointer",
                  background: t === target ? `${color}20` : "transparent",
                  border: `1.5px solid ${t === target ? color : `${TM}44`}`,
                  color: t === target ? color : TM,
                }}>{t}</button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: TM }}>Round {round}</span>
          </div>

          {/* Scoreboards */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {scoreCard(0)}
            <div style={{ alignSelf: "center", fontSize: 18, fontWeight: 900, color: TM, paddingTop: 28 }}>vs</div>
            {scoreCard(1)}
          </div>

          {/* Round-won banner (celebratory, not a ranking) */}
          {someoneWon && !finished && (
            <div style={{ textAlign: "center", background: `${(leader === 1 ? P2_ACCENT : color)}18`, border: `1.5px solid ${(leader === 1 ? P2_ACCENT : color)}66`, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>🏀 {names[leader]} takes Round {round}!</div>
              <div style={{ fontSize: 13, color: TM, marginTop: 2 }}>Great battle — {a + b} {unit} between you. Go again or finish up.</div>
            </div>
          )}

          {/* Team best */}
          <div style={{ textAlign: "center", fontSize: 13, color: TM }}>
            🥇 Team best on this drill: <b style={{ color: TP }}>{Math.max(best, finished?.combined || 0) || "—"}</b>{best ? ` ${unit}` : ""}
          </div>

          {/* Actions */}
          {!finished ? (
            <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
              <button type="button" onClick={newRound}
                style={{ flex: 1, padding: "14px", borderRadius: 14, background: "transparent", border: `1.5px solid ${color}66`, color, fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                New Round
              </button>
              <button type="button" onClick={finish} disabled={a + b === 0}
                style={{ flex: 1, padding: "14px", borderRadius: 14, background: a + b === 0 ? `${color}55` : color, border: "none", color: "#06101c", fontSize: 15, fontWeight: 900, cursor: a + b === 0 ? "default" : "pointer", opacity: a + b === 0 ? 0.6 : 1 }}>
                Finish ✓
              </button>
            </div>
          ) : (
            <div style={{ textAlign: "center", background: `${color}14`, border: `1.5px solid ${color}55`, borderRadius: 16, padding: "20px 16px", marginTop: "auto" }}>
              <div style={{ fontSize: 40 }}>🔥</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>Great battle!</div>
              <div style={{ fontSize: 14, color: TM, marginTop: 6 }}>
                {names[0]} and {names[1]} put up <b style={{ color: TP }}>{finished.combined} {unit}</b> together.
              </div>
              {finished.teamBest && (
                <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 8 }}>🥇 New team best!</div>
              )}
              <button type="button" onClick={onClose}
                style={{ marginTop: 16, width: "100%", padding: "14px", borderRadius: 14, background: color, border: "none", color: "#06101c", fontSize: 16, fontWeight: 900, cursor: "pointer" }}>
                Done 🎉
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
