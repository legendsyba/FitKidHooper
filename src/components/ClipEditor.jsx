import { useEffect, useRef, useState } from "react";
import { clipFor, saveClip } from "../lib/videoClips.js";

// Loads the YouTube IFrame Player API once and resolves when YT is ready. Unlike
// a plain embed, the API player exposes getCurrentTime()/seekTo(), which is what
// lets us "set start/end here" and loop-preview a segment.
let apiPromise = null;
function loadYT() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

function fmt(t) {
  t = Math.max(0, Math.round(Number(t) || 0));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * In-app clip tool for a YouTube-backed exercise. Scrub the video, mark start/end
 * from the current time, preview the loop, and save to this device. Saving writes
 * a per-device clip (videoClips.saveClip) that the normal player then honors;
 * the catalog is untouched until the clip is promoted to videoStart/videoEnd.
 */
export default function ClipEditor({ exercise, color = "#f59e0b", onClose }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const loopRef = useRef(null);
  const existing = clipFor(exercise);
  const [start, setStart] = useState(existing ? existing.start : 0);
  const [end, setEnd] = useState(existing ? existing.end : 0);
  const [cur, setCur] = useState(0);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadYT()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        playerRef.current = new YT.Player(hostRef.current, {
          videoId: exercise.videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
          events: { onReady: () => !cancelled && setReady(true) },
        });
      })
      .catch(() => {});
    const tick = setInterval(() => {
      const p = playerRef.current;
      if (p && p.getCurrentTime) {
        try {
          setCur(p.getCurrentTime());
        } catch {
          /* player not ready */
        }
      }
    }, 200);
    return () => {
      cancelled = true;
      clearInterval(tick);
      if (loopRef.current) clearInterval(loopRef.current);
      try {
        if (playerRef.current && playerRef.current.destroy) playerRef.current.destroy();
      } catch {
        /* already gone */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.videoId]);

  const dirty = () => setSaved(false);
  const seek = (t) => {
    try {
      playerRef.current.seekTo(Math.max(0, Number(t) || 0), true);
    } catch {
      /* ignore */
    }
  };
  const markStart = () => {
    setStart(Math.round(cur * 10) / 10);
    dirty();
  };
  const markEnd = () => {
    setEnd(Math.round(cur * 10) / 10);
    dirty();
  };
  const preview = () => {
    seek(start);
    try {
      playerRef.current.playVideo();
    } catch {
      /* ignore */
    }
    if (loopRef.current) clearInterval(loopRef.current);
    loopRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      try {
        if (end && p.getCurrentTime() >= end) seek(start);
      } catch {
        /* ignore */
      }
    }, 200);
  };
  const doSave = () => {
    saveClip(exercise, start || 0, end || 0);
    setSaved(true);
  };
  const doClear = () => {
    saveClip(exercise, null);
    setStart(0);
    setEnd(0);
    setSaved(false);
  };

  const valid = !end || end > start;
  const btn = {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    borderRadius: 7,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1.3,
  };

  return (
    <div style={{ background: "#000" }}>
      <div style={{ position: "relative", aspectRatio: "16/9", background: "#000" }}>
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
        {!ready && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            Loading clip editor…
          </div>
        )}
      </div>

      <div style={{ padding: "11px 13px", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", color, textTransform: "uppercase" }}>
            ✂ Clip · {exercise.name}
          </span>
          <span style={{ fontSize: 12, color: "#cbd5e1", fontVariantNumeric: "tabular-nums" }}>
            now {fmt(cur)}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={markStart} disabled={!ready}>
            Set start = {fmt(cur)}
          </button>
          <button style={btn} onClick={markEnd} disabled={!ready}>
            Set end = {fmt(cur)}
          </button>
        </div>

        <div style={{ fontSize: 13, color: "#e2e8f0", display: "flex", gap: 14, fontVariantNumeric: "tabular-nums" }}>
          <span>
            Start <b style={{ color }}>{fmt(start)}</b>
          </span>
          <span>
            End <b style={{ color }}>{end ? fmt(end) : "—"}</b>
          </span>
          {!valid && <span style={{ color: "#f87171", fontWeight: 700 }}>end must be after start</span>}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={preview} disabled={!ready}>
            ▶ Preview loop
          </button>
          <button
            style={{ ...btn, background: color, color: "#111827", borderColor: color, opacity: valid ? 1 : 0.5 }}
            onClick={doSave}
            disabled={!ready || !valid}
          >
            {saved ? "✓ Saved to this device" : "Save clip"}
          </button>
          <button style={btn} onClick={doClear} disabled={!ready}>
            Clear
          </button>
          <button style={{ ...btn, marginLeft: "auto" }} onClick={onClose}>
            Done
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 10.5, color: "#64748b", lineHeight: 1.5 }}>
          Saved on this device only. To ship it to everyone, tell Claude the exercise id + start/end to
          write into <code>trainingCatalog.js</code>.
        </p>
      </div>
    </div>
  );
}
