/**
 * Pick the IDEAL video for a drill, from all the signals at once.
 *
 * The knowledge layer says what the drill trains; this searches YouTube for that move and ranks
 * the candidates on everything that makes a good drill video for a kid:
 *   move-match   the title is about THIS move (not a cousin, not a highlight)
 *   length-fit   short enough to be "quick explanation, then the drill in action" — ~40-180s is
 *                ideal; a 6-minute breakdown is penalised hard
 *   prominence   views + channel subscribers + like-rate — proven, not obscure
 * Search is biased to short videos (videoDuration=short, under 4 min). Proposes the top pick per
 * drill with the numbers; nothing is written — a human lands the swap.
 *
 *   node scripts/resource-videos.mjs                 # the worst flagged drills
 *   node scripts/resource-videos.mjs fin-euro pm-spin  # specific exercise ids
 */
import { ALL_EXERCISES } from "../src/data/trainingCatalog.js";

if (!process.env.YOUTUBE_API_KEY) { try { process.loadEnvFile(".env.local"); } catch {} }
const KEYS = [process.env.YOUTUBE_API_KEY, process.env.YOUTUBE_API_KEY_2].filter(Boolean);
if (!KEYS.length) { console.error("YOUTUBE_API_KEY required."); process.exit(1); }
let ki = 0; const dead = new Set();
async function yt(path, params) {
  for (let n = 0; n < KEYS.length; n++) {
    if (dead.has(ki)) { ki = (ki+1)%KEYS.length; continue; }
    const d = await (await fetch(`https://www.googleapis.com/youtube/v3/${path}?`+new URLSearchParams({...params,key:KEYS[ki]}))).json();
    if (!d.error) return d;
    if (/quota|dailyLimit|rateLimit/i.test(JSON.stringify(d.error))) { dead.add(ki); ki=(ki+1)%KEYS.length; continue; }
    throw new Error(d.error.message);
  }
  throw Object.assign(new Error("all keys out of quota"), { quota: true });
}

// Good search queries for the worst offenders; any other id falls back to its name.
const QUERY = {
  "bh-attack-cross":"attacking crossover dribble move drill", "fw-shot-fake":"shot fake footwork move basketball",
  "fin-euro":"euro step layup tutorial", "fin-wrong-foot":"wrong foot layup tutorial",
  "pm-spin":"post spin move tutorial basketball", "gh-dribble-drive":"dribble drive attack move drill",
  "bh-combo":"basketball dribbling combo moves drill", "fw-rip-through":"rip through move basketball tutorial",
  "sh-knee-roll":"form shooting roll ups drill", "fs-power-finish":"two foot power layup finish drill",
  "slab-corner-3":"corner three point shooting form", "fast-feet":"fast feet footwork quickness drill basketball",
  "fw-triple-threat":"triple threat stance basketball fundamentals youth", "flab-triple-threat":"triple threat position footwork youth drill",
  "gh-change-pace":"change of pace dribble move youth drill", "bh-in-out":"in and out dribble move tutorial youth",
};
const TARGETS = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(QUERY);

const PROMO = ["subscribe","link in","my program","day challenge"];
const HIGHLIGHT = ["highlights","mixtape","mix ","career","1 hour","full game","best plays",
  "knocking down","during his","drops ","buzzer","game winner","vs.","scrimmage"];
// Pure highlight / game-footage channels — their clips are not teaching demos. Exact names for the
// short ones (so "Jr. NBA" is NOT caught), substring for the distinctive multi-word ones.
const HILITE_EXACT = ["nba","wnba","espn","fiba","the nba"];
const HILITE_SUB = ["house of highlights","bleacher report","overtime","ballislife","golden state warriors"];
const GAMING = ["nba 2k","2k26","2k25","2k24","2k23","gameplay","video game","nba2k","2k mobile","mycareer"];
const AVOID = ["kakabasketball","no excuse","billy clapper","hoop dreams","clutch & culture","good drill"];
const PREFERRED = ["cramer","championship productions","hoopstudy","shotmechanics","shot mechanics",
  "get handles","dre baldwin","pgc","jr. nba","jr nba","pro skills","ilovebasketball","by any means","the film room"];
const has = (t,list) => list.some(w=>t.includes(w));
const parseISO = (iso) => { const m=/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso||"")||[]; return (+(m[1]||0))*3600+(+(m[2]||0))*60+(+(m[3]||0)); };
const L = (x) => Math.log10((x||0)+1);
const toks = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>2 && !["the","and","for","drill","basketball","how","move","series","step"].includes(w));
const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

// length-fit: long enough to explain AND show the move, short enough to hold a kid. Ideal 30-150s.
function lenFit(s){ if(s<20) return .35; if(s<30) return .65; if(s<=150) return 1; if(s<=210) return .75; if(s<=270) return .5; if(s<=360) return .3; return .12; }

for (const id of TARGETS) {
  const ex = ALL_EXERCISES[id];
  if (!ex) { console.log(`?? unknown id ${id}`); continue; }
  const q = QUERY[id] || `${ex.name} basketball drill`;
  const moveT = [...new Set(toks(ex.name + " " + q))];
  let search;
  try { search = await yt("search", { part:"snippet", type:"video", maxResults:"15", videoDuration:"short", q }); }
  catch (e) { console.log(e.quota ? "\n! search quota exhausted on both keys — stopping." : "\n! "+e.message); break; }
  const ids = (search.items||[]).map(it=>it.id.videoId).filter(Boolean);
  if (!ids.length) { console.log(`\n${ex.name}: no candidates`); continue; }
  const meta = {}; const vids = await yt("videos", { part:"contentDetails,status,statistics,snippet", id: ids.join(",") });
  for (const it of vids.items||[]) meta[it.id] = { s:parseISO(it.contentDetails.duration), e:it.status.embeddable,
    views:+(it.statistics?.viewCount)||0, likes:+(it.statistics?.likeCount)||0, ch:it.snippet?.channelId, title:it.snippet?.title, channel:it.snippet?.channelTitle };
  const chIds=[...new Set(Object.values(meta).map(m=>m.ch).filter(Boolean))]; const subs={};
  const ch = await yt("channels", { part:"statistics", id: chIds.join(",") });
  for (const it of ch.items||[]) subs[it.id]=+(it.statistics?.subscriberCount)||0;

  const scored = ids.map(vid=>{
    const m=meta[vid]; if(!m||m.e===false||m.s>600) return null;
    const t=(m.title||"").toLowerCase();
    const ch=(m.channel||"").toLowerCase();
    if (has(t,HIGHLIGHT) || has(t,GAMING)) return null;   // not a demo / a video game
    if (has(ch,AVOID)) return null;                        // avoid-list channel
    if (HILITE_EXACT.includes(ch) || has(ch,HILITE_SUB)) return null; // highlight / game-footage channel
    const mv = moveT.filter(w=>t.includes(w)).length / Math.max(1,moveT.length);
    if (mv < 0.34) return null;
    const sub=subs[m.ch]||0;
    const prom = +((L(m.views)+L(sub)+(m.views?Math.min(0.5,(m.likes/m.views)*10):0))/12).toFixed(2);
    const lf = lenFit(m.s);
    const promo = has(t,PROMO) ? -0.2 : 0;
    const pref = has(ch,PREFERRED) ? 0.3 : 0;             // a trusted/partner channel
    const score = +(mv*1.2 + lf*1.0 + prom*0.8 + pref + promo).toFixed(2);
    return { vid, score, mv:+mv.toFixed(2), lf, s:m.s, views:m.views, subs:sub, prom, pref:!!pref, title:m.title, channel:m.channel };
  }).filter(Boolean).sort((a,b)=>b.score-a.score);

  const cur = ALL_EXERCISES[id];
  console.log(`\n■ ${ex.name}  [${id}]  — current: ${fmt(0)} "${cur.videoTitle}" (${cur.videoChannel||cur.trainer})`);
  if (!scored.length) { console.log("   no suitable short candidate found"); continue; }
  for (const c of scored.slice(0,3)) {
    const vk=(c.views>=1e6?(c.views/1e6).toFixed(1)+"M":c.views>=1e3?Math.round(c.views/1e3)+"k":c.views);
    const sk=(c.subs>=1e6?(c.subs/1e6).toFixed(1)+"M":c.subs>=1e3?Math.round(c.subs/1e3)+"k":c.subs);
    console.log(`   ${c===scored[0]?"➤":" "} ${String(c.score).padStart(4)}  ${fmt(c.s).padStart(5)}  ${String(vk).padStart(5)}v ${String(sk).padStart(4)}s  move:${c.mv}  — ${c.title.slice(0,46)} (${c.channel})`);
    if (c===scored[0]) console.log(`        videoId:"${c.vid}", videoChannel:"${c.channel}", videoTitle:"${c.title}"`);
  }
}
