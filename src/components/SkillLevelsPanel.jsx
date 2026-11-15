import { SKILL_AREAS } from "../lib/skillGraph.js";
import { tierLabel } from "../lib/skillLevels.js";

/**
 * "My Skill Levels" — shows the kid's current level at each skill area so the per-skill progression
 * is visible, not invisible. Each area reads beginner / intermediate / advanced with a 3-segment
 * meter; these are the levels that drive which drills the kid gets, and they climb on their own as
 * the kid masters each skill. `levels` is the map from getSkillLevels().
 */
export default function SkillLevelsPanel({ levels = {}, P = "#f97316", onSkillCheck }) {
  const order = ["handles", "shooting", "finishing", "footwork", "passing", "defense", "rebounding", "athleticism"];
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800, color: "#94a3b8" }}>
          My Skill Levels
        </div>
        {onSkillCheck && (
          <button onClick={onSkillCheck} style={{ background: "none", border: "none", color: P, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
            Re-check →
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {order.map((area) => {
          const a = SKILL_AREAS[area];
          if (!a) return null;
          const tier = Math.max(1, Math.min(3, levels[area] || 1));
          return (
            <div key={area} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: "#0b1322", border: "1px solid #1e293b" }}>
              <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{a.emoji}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{a.label}</span>
              {/* 3-segment meter: filled up to the kid's tier. */}
              <span style={{ display: "flex", gap: 3 }}>
                {[1, 2, 3].map((t) => (
                  <span key={t} style={{ width: 16, height: 6, borderRadius: 3, background: t <= tier ? P : "#24304a" }} />
                ))}
              </span>
              <span style={{ width: 78, textAlign: "right", fontSize: 11, fontWeight: 800, color: P, textTransform: "capitalize" }}>{tierLabel(tier)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
