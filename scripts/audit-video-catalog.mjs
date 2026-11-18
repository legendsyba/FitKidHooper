/**
 * Video library audit — the knowledge layer vs the video.
 *
 * A trusted channel can still hand a FOOTWORK drill an NBA stepback-JUMPER clip (the "Jab Step
 * Series" bug). Channel trust never catches that; the move/area does. For every catalogued
 * exercise this cross-checks the exercise's own skill AREA (the category a kid sees it under)
 * against what the video's title is actually about, and flags the ones that don't line up:
 *
 *   cross-area   the title is clearly about a DIFFERENT area and says nothing about this one
 *                (footwork drill → a shooting clip). The experience-ruining case.
 *   unrelated    the title names neither the exercise's move nor its area at all.
 *   highlight    the title reads like a highlight/mixtape, not a teaching demo.
 *
 * Tier-1 (metadata only) — it narrows 304 videos to the handful worth watching. Run:
 *   node scripts/audit-video-catalog.mjs            # ranked flags
 *   node scripts/audit-video-catalog.mjs --area footwork   # one area
 */
import { WORKOUTS } from "../src/data/trainingCatalog.js";

const args = process.argv.slice(2);
const onlyArea = args.includes("--area") ? args[args.indexOf("--area") + 1] : null;

// Each WORKOUTS category → a skill area (the knowledge layer's top level).
const CAT_AREA = {
  speed:"athleticism", balance:"athleticism", strength:"athleticism", explosion:"athleticism",
  conditioning:"athleticism", jumprope:"athleticism", bands:"athleticism", coordination:"athleticism",
  deceleration:"athleticism", athletic:"athleticism",
  handles:"handles", ballhandling:"handles", game_handles:"handles",
  shooting:"shooting", shootingdrills:"shooting", shooting_lab:"shooting",
  footwork:"footwork", footwork_lab:"footwork",
  finishing:"finishing", finishing_school:"finishing", postmoves:"finishing",
  passing:"passing", rebounding:"rebounding", defense:"defense",
  basketball_iq:"iq", partner_games:"iq",
};

// The BASKETBALL-SKILL areas where seeing the wrong skill genuinely confuses a kid. The athletic
// family (speed/agility/strength/coordination/…) is intentionally NOT cross-checked: those drills
// legitimately borrow footwork/defense/agility vocabulary, so cross-flagging them is all noise.
const CORE = new Set(["handles", "shooting", "finishing", "footwork", "passing", "defense", "rebounding"]);

// Strong, move-specific terms per skill. Single ambiguous words ("cross", "jump", "shot") are left
// out or made specific ("crossover", "jump shot"); matched on word boundaries so "cross body" does
// not read as "crossover".
const AREA_WORDS = {
  handles:["dribble","dribbling","crossover","pound dribble","hesitation","between the legs",
    "behind the back","in and out","stutter","ball handling","ballhandling","handle the ball"],
  shooting:["shooting","jumper","jump shot","form shooting","catch and shoot","three point","3-point",
    "free throw","step back","stepback","pull up","pull-up","fadeaway","fade away","shot mechanics","shoot the"],
  finishing:["layup","lay up","floater","euro step","eurostep","reverse layup","around the rim","mikan","finish at the rim"],
  footwork:["footwork","pivot","jab step","triple threat","jump stop","stride stop","drop step","inside foot"],
  passing:["pass","passing","chest pass","bounce pass","outlet pass","no look pass","dish"],
  defense:["defense","defensive","closeout","close out","defensive slide","defensive stance","on-ball defense","lockdown","deflection"],
  rebounding:["rebound","rebounding","box out","boxout","put back","putback"],
};

const HIGHLIGHT = ["highlights","mixtape"," mix "," mix|","best plays","top 10 plays","game winner","career high","ankle breaker"];

const norm = (s) => String(s || "").toLowerCase();
const hit = (title, w) => w.includes(" ") || w.includes("-")
  ? title.includes(w)
  : new RegExp(`\\b${w}\\b`).test(title);
const hits = (title, words) => (words || []).filter((w) => hit(title, w)).length;

const rows = [];
for (const [cat, list] of Object.entries(WORKOUTS)) {
  const area = CAT_AREA[cat] || "other";
  if (onlyArea && area !== onlyArea) continue;
  if (!CORE.has(area)) continue; // only the basketball-skill areas
  for (const ex of list) {
    if (!ex.videoId) continue;
    const title = norm(ex.videoTitle || ex.name);
    const own = hits(title, AREA_WORDS[area]);
    // Strongest OTHER core skill the title points at.
    let bestOther = null, bestN = 0;
    for (const a of CORE) {
      if (a === area) continue;
      const n = hits(title, AREA_WORDS[a]);
      if (n > bestN) { bestN = n; bestOther = a; }
    }
    const isHighlight = HIGHLIGHT.some((w) => title.includes(w));

    let severity = 0, reason = null;
    if (own === 0 && bestN >= 2) { severity = 3; reason = `title is about ${bestOther} (${bestN} cues), not ${area}`; }
    else if (own === 0 && bestN === 1 && isHighlight) { severity = 2; reason = `${bestOther} + highlight-style, no ${area} cues`; }
    else if (own === 0 && isHighlight) { severity = 2; reason = `highlight-style, no ${area} cues`; }
    else if (own === 0 && bestN === 1) { severity = 1; reason = `a ${bestOther} cue and no ${area} cue — check it` ; }
    if (severity) rows.push({ severity, cat, area, name: ex.name, title: ex.videoTitle || "", channel: ex.videoChannel || ex.trainer || "", reason });
  }
}

rows.sort((a, b) => b.severity - a.severity || a.area.localeCompare(b.area));
const label = { 3: "HIGH", 2: "MED ", 1: "LOW " };
console.log(`${rows.length} flagged of ${Object.values(WORKOUTS).flat().filter(e=>e.videoId).length} videos (Tier-1 metadata). HIGH = likely wrong area.\n`);
for (const r of rows) {
  console.log(`${label[r.severity]} [${r.cat}] ${r.name}`);
  console.log(`       → "${r.title}" (${r.channel}) — ${r.reason}`);
}
const high = rows.filter(r=>r.severity===3).length;
console.log(`\n${high} HIGH (watch these first), ${rows.filter(r=>r.severity===2).length} MED, ${rows.filter(r=>r.severity===1).length} LOW.`);
