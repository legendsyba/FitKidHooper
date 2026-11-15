import { useState, useMemo } from "react";
import { WANT_TO_WORK_OPTIONS, questionsFor, scoreAssessment } from "../lib/skillAssessment.js";
import { tierLabel } from "../lib/skillLevels.js";

/**
 * The kid-facing skill self-check. Pick what you want to work on → answer a few game-pressure
 * questions → it classifies your level per skill and hands the result back via onDone(scored),
 * which the parent persists to settings.skillLevels (what drives drill selection). No history
 * needed — this is how a raw 3rd grader and an ahead-of-age kid both start at the right rung.
 */
export default function SkillCheckSheet({ P = "#f97316", SF = "#0d1526", onClose, onDone, initialAreas = [], zIndex = 420 }) {
  const [step, setStep] = useState("pick"); // pick | quiz | result
  const [areas, setAreas] = useState(initialAreas);
  const [answers, setAnswers] = useState({});

  const quiz = useMemo(() => questionsFor(areas), [areas]);
  const allQuestions = quiz.flatMap((a) => a.questions);
  const answered = allQuestions.filter((q) => answers[q.id]).length;
  const scored = useMemo(() => scoreAssessment(answers), [answers]);

  const toggleArea = (a) => setAreas((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const pick = (qid, tier) => setAnswers((p) => ({ ...p, [qid]: tier }));

  const card = { width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", background: SF, borderRadius: 20, padding: 20, color: "#e2e8f0" };
  const H = { fontSize: 20, fontWeight: 800, margin: "0 0 4px", color: "#fff" };
  const sub = { fontSize: 13, color: "#94a3b8", margin: "0 0 16px" };
  const primaryBtn = (ok) => ({ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: ok ? P : "#334155", color: ok ? "#000" : "#64748b", fontSize: 15, fontWeight: 800, cursor: ok ? "pointer" : "not-allowed", marginTop: 8 });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={card}>
        {step === "pick" && (
          <>
            <h2 style={H}>What do you want to get better at?</h2>
            <p style={sub}>Pick one or more. We'll ask a few quick questions and set you up at the right level.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {WANT_TO_WORK_OPTIONS.map((o) => {
                const on = areas.includes(o.area);
                return (
                  <button key={o.area} onClick={() => toggleArea(o.area)}
                    style={{ padding: "16px 12px", borderRadius: 14, border: `2px solid ${on ? P : "#2a3550"}`, background: on ? `${P}1f` : "transparent", color: on ? "#fff" : "#cbd5e1", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 22, display: "block", marginBottom: 4 }}>{o.emoji}</span>{o.label}
                  </button>
                );
              })}
            </div>
            <button disabled={!areas.length} onClick={() => setStep("quiz")} style={primaryBtn(areas.length > 0)}>
              Start skill check →
            </button>
            <button onClick={onClose} style={{ width: "100%", padding: 10, marginTop: 6, background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer" }}>Maybe later</button>
          </>
        )}

        {step === "quiz" && (
          <>
            <h2 style={H}>Quick skill check</h2>
            <p style={sub}>Be honest — this just picks your starting level. {answered}/{allQuestions.length} answered</p>
            {quiz.map((a) => (
              <div key={a.area} style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: P, margin: "0 0 8px" }}>{a.emoji} {a.label}</p>
                {a.questions.map((q) => (
                  <div key={q.id} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 14, color: "#e2e8f0", margin: "0 0 6px", fontWeight: 600 }}>{q.q}</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      {q.options.map((o) => {
                        const on = answers[q.id] === o.tier;
                        return (
                          <button key={o.label} onClick={() => pick(q.id, o.tier)}
                            style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: `1.5px solid ${on ? P : "#2a3550"}`, background: on ? P : "transparent", color: on ? "#000" : "#cbd5e1", fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1.2 }}>
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <button disabled={answered === 0} onClick={() => setStep("result")} style={primaryBtn(answered > 0)}>
              See my levels →
            </button>
            <button onClick={() => setStep("pick")} style={{ width: "100%", padding: 10, marginTop: 6, background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer" }}>← Back</button>
          </>
        )}

        {step === "result" && (
          <>
            <h2 style={H}>Here's where you're starting 🏀</h2>
            <p style={sub}>Your plan will meet you here and level up as you get better.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {Object.entries(scored).map(([area, tier]) => {
                const o = WANT_TO_WORK_OPTIONS.find((x) => x.area === area);
                return (
                  <div key={area} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: "#0b1322", border: "1px solid #1e293b" }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{o?.emoji} {o?.label || area}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: P, textTransform: "capitalize" }}>{tierLabel(tier)}</span>
                  </div>
                );
              })}
            </div>
            <button onClick={() => { onDone?.(scored); onClose?.(); }} style={primaryBtn(true)}>Build my plan →</button>
            <button onClick={() => setStep("quiz")} style={{ width: "100%", padding: 10, marginTop: 6, background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer" }}>← Change answers</button>
          </>
        )}
      </div>
    </div>
  );
}
