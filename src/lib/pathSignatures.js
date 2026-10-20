/**
 * Path stage signature drills + logged shot types — required reps for each legend rung.
 */
import { getShotStyle } from "./shotStyles.js";
import { ALL_EXERCISES } from "../data/trainingCatalog.js";

export function computeExCounts(completed) {
  const counts = {};
  for (const key of Object.keys(completed || {})) {
    if (!completed[key]) continue;
    const exId = key.split("-").slice(3).join("-");
    counts[exId] = (counts[exId] || 0) + 1;
  }
  return counts;
}

export function getSignatureProgress(stage, ctx) {
  const items = [];
  for (const { exId, min } of stage?.signatureDrills || []) {
    const current = ctx.exCounts?.[exId] || 0;
    items.push({
      kind: "drill",
      exId,
      min,
      current,
      pct: min > 0 ? Math.min(100, Math.round((current / min) * 100)) : 100,
      met: current >= min,
    });
  }
  for (const { style, min } of stage?.signatureShots || []) {
    const current = ctx.styleMakes?.[style] || 0;
    const label = getShotStyle(style).label;
    items.push({
      kind: "shot",
      style,
      label,
      min,
      current,
      pct: min > 0 ? Math.min(100, Math.round((current / min) * 100)) : 100,
      met: current >= min,
    });
  }
  return items;
}

export function allSignaturesMet(stage, ctx) {
  const prog = getSignatureProgress(stage, ctx);
  return !prog.length || prog.every(s => s.met);
}

export function signatureStagePct(stage, ctx) {
  const prog = getSignatureProgress(stage, ctx);
  if (!prog.length) return 100;
  return Math.min(...prog.map(s => s.pct));
}

/** One-line summary for Progress Rail (worst incomplete signature goal). */
export function formatSignatureSummary(signatureProgress, nameForExId) {
  if (!signatureProgress?.length) return "";
  const pending = signatureProgress.filter(s => !s.met);
  if (!pending.length) return "Signature goals ✓";
  const first = pending[0];
  const more = pending.length > 1 ? ` · +${pending.length - 1} more` : "";
  if (first.kind === "shot") {
    return `${first.label} ${first.current}/${first.min} makes${more}`;
  }
  /* Progress Rail and the Path view call this without a resolver; kids were reading raw ids
     like "slab catch shoot". Fall back to the catalog name. */
  const name = nameForExId?.(first.exId) || ALL_EXERCISES[first.exId]?.name || first.exId.replace(/-/g, " ");
  return `${name} ${first.current}/${first.min}${more}`;
}

export function playerDisplayName(stage) {
  return (stage?.inspo || "").replace(/\s+Conquest$/i, "").trim();
}

export function playerHighlightVideoId(stage) {
  return stage?.highlightVideoId || null;
}
