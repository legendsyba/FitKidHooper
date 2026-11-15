/**
 * Video length audit — a one-move drill should not open a four-minute breakdown.
 *
 * Each exercise plays its video WHOLE unless it carries a clip (videoStart/videoEnd). A long,
 * un-clipped video on a single-move drill is the problem: the kid waits through intros, multiple
 * moves and talking before (or instead of) the one rep they came for. This fetches every video's
 * real length (videos.list contentDetails — 1 unit per 50, NOT the search quota) and flags the
 * long ones that aren't already trimmed, so they can be clipped or swapped.
 *
 *   node scripts/audit-video-length.mjs            # flags, longest first
 *   node scripts/audit-video-length.mjs --min 180  # custom threshold (seconds)
 */
import { ALL_EXERCISES } from "../src/data/trainingCatalog.js";

if (!process.env.YOUTUBE_API_KEY) { try { process.loadEnvFile(".env.local"); } catch {} }
const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error("YOUTUBE_API_KEY required (.env.local)."); process.exit(1); }
const args = process.argv.slice(2);
const MIN = args.includes("--min") ? +args[args.indexOf("--min") + 1] : 180; // flag whole videos longer than this

const parseISO = (iso) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "") || []; return (+(m[1]||0))*3600 + (+(m[2]||0))*60 + (+(m[3]||0)); };
const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

// FKH videos only (not our own filmed clips, which are already cut to length).
const exs = Object.values(ALL_EXERCISES).filter((e) => e.videoId && e.videoSource !== "fkh");
const ids = [...new Set(exs.map((e) => e.videoId))];
const dur = {};
for (let i = 0; i < ids.length; i += 50) {
  const url = `https://www.googleapis.com/youtube/v3/videos?` + new URLSearchParams({ part: "contentDetails", id: ids.slice(i, i+50).join(","), key: KEY });
  const d = await (await fetch(url)).json();
  if (d.error) { console.error(d.error.message); process.exit(1); }
  for (const it of d.items || []) dur[it.id] = parseISO(it.contentDetails.duration);
}

const flagged = [];
for (const e of exs) {
  const len = dur[e.videoId];
  if (len == null) continue;                               // deleted / private — skip
  const clipped = e.videoStart != null || e.videoEnd != null;
  const clipLen = clipped ? (e.videoEnd ?? len) - (e.videoStart ?? 0) : len;
  if (clipped && clipLen <= MIN) continue;                 // already trimmed to a sane length
  if (len <= MIN) continue;
  flagged.push({ name: e.name, id: e.id, len, clipped, drill: e.estimatedDuration || null, title: e.videoTitle || "", channel: e.videoChannel || e.trainer || "" });
}
flagged.sort((a, b) => b.len - a.len);

console.log(`${flagged.length} of ${ids.length} videos are longer than ${fmt(MIN)} and play whole (un-clipped).\n`);
for (const f of flagged) {
  const sev = f.len >= 300 ? "VERY LONG" : f.len >= 240 ? "LONG " : "over " + fmt(MIN);
  console.log(`${fmt(f.len).padStart(5)}  ${sev.padEnd(9)} ${f.name}${f.drill ? ` (drill ~${f.drill}s)` : ""}`);
  console.log(`         "${f.title}" — ${f.channel}`);
}
const vlong = flagged.filter(f=>f.len>=240).length;
console.log(`\n${vlong} are 4 min or longer — clip or swap these first.`);
