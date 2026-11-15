// Per-device video clip overrides, layered over the catalog's bundled
// videoStart/videoEnd. Ported from fit-tracker's clipFor/saveClip idea: a clip
// is tied to its video src ("yt:<id>" / "fkh:<url>") so it is silently ignored
// if the exercise's video is later swapped (a stale start/end never mis-applies
// to a different clip). The founder/coach sets clips in the app (exercise sheet
// → ✂ Clip); they live on that device until promoted into trainingCatalog.js
// as videoStart/videoEnd to ship to everyone.

const STORE_KEY = "fkh-video-clips"; // { [src]: { start, end } }
const FLAG_KEY = "fkh-clip-tool"; // "1" once the clip tool is enabled on this device

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function writeStore(obj) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  } catch {
    /* storage unavailable (private mode / disabled) — clip just won't persist */
  }
}

/** "yt:<videoId>" or "fkh:<videoUrl>" — the stable key a clip is tied to, or null. */
export function clipSrc(exercise) {
  if (!exercise) return null;
  if (exercise.videoSource === "fkh" && exercise.videoUrl) return "fkh:" + exercise.videoUrl;
  if (exercise.videoId) return "yt:" + exercise.videoId;
  return null;
}

/**
 * Effective clip for this exercise's CURRENT video as { start, end, mine }, or
 * null for "play whole". A per-device clip wins; otherwise the catalog's bundled
 * videoStart/videoEnd. Either layer only applies to the current src.
 */
export function clipFor(exercise) {
  const src = clipSrc(exercise);
  if (!src) return null;
  const mine = readStore()[src];
  if (mine && (Number(mine.start) || Number(mine.end))) {
    return { start: Number(mine.start) || 0, end: Number(mine.end) || 0, mine: true };
  }
  const s = Number(exercise.videoStart) || 0;
  const e = Number(exercise.videoEnd) || 0;
  if (s || e) return { start: s, end: e, mine: false };
  return null;
}

/** Save (seconds) this device's clip, or remove it when start == null. */
export function saveClip(exercise, start, end) {
  const src = clipSrc(exercise);
  if (!src) return;
  const store = readStore();
  if (start == null) {
    delete store[src];
  } else {
    store[src] = {
      start: Math.round((Number(start) || 0) * 10) / 10,
      end: Math.round((Number(end) || 0) * 10) / 10,
    };
  }
  writeStore(store);
}

/** Does this device have its own (not-yet-shipped) clip for this video? */
export function hasDeviceClip(exercise) {
  const src = clipSrc(exercise);
  if (!src) return false;
  const c = readStore()[src];
  return !!(c && (Number(c.start) || Number(c.end)));
}

// ── Clip-tool gate ───────────────────────────────────────────────────────────
// The clip tool is an authoring aid, not a kid feature. It stays hidden unless
// enabled on this specific device via ?clip=1 (or #clip=1); ?clip=0 turns it off.
// The flag persists in localStorage so the founder enables it once per device.
// (The admin dashboard gate can't be reused — it routes away from the athlete
// app, which is exactly where the clip tool must live.)
export function isClipToolEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const fromSearch = new URLSearchParams(window.location.search).get("clip");
    const rawHash = window.location.hash.replace(/^#\/?/, "");
    const fromHash = rawHash ? new URLSearchParams(rawHash).get("clip") : null;
    const provided = fromSearch != null ? fromSearch : fromHash;
    if (provided === "1") {
      localStorage.setItem(FLAG_KEY, "1");
      return true;
    }
    if (provided === "0") {
      localStorage.removeItem(FLAG_KEY);
      return false;
    }
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}
