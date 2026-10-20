import { countProgramSessionsDone, programCompletionCount } from "./programProgress.js";
import { PROGRESSION_CHAINS, getChainStatus } from "./progressionChains.js";
import { countShotMakes, readShotLog } from "./shotLog.js";
import { parseStoredObject } from "./storageParse.js";

export const BADGE_CATS = {
  progression: { label:"Progression Tracks", emoji:"📈" },
  streak:      { label:"Streaks",            emoji:"🔥" },
  shooting:    { label:"Shooting",           emoji:"🏀" },
  milestone:   { label:"Workout Milestones", emoji:"🏋️" },
  program:     { label:"Programs",           emoji:"📋" },
};

export const BADGES_DEF = [
  { id:"prog-pogo",     cat:"progression", name:"Pogo Mastery",       emoji:"🦘", desc:"Complete the full Pogo Mastery chain",        color:"#fb923c" },
  { id:"prog-jump",     cat:"progression", name:"Jump Power",         emoji:"💥", desc:"Complete the full Jump Power chain",           color:"#ef4444" },
  { id:"prog-landing",  cat:"progression", name:"Landing Control",    emoji:"🛑", desc:"Complete the full Landing Control chain",      color:"#60a5fa" },
  { id:"prog-sl",       cat:"progression", name:"Single-Leg Strength",emoji:"🦵", desc:"Complete the Single-Leg Strength chain",       color:"#34d399" },
  { id:"prog-strength", cat:"progression", name:"Strength Foundation",emoji:"💪", desc:"Complete the Strength Foundation chain",       color:"#22c55e" },
  { id:"prog-footwork", cat:"progression", name:"Footwork Foundation",emoji:"👟", desc:"Complete the Footwork Foundation chain",       color:"#a78bfa" },
  { id:"prog-agility",  cat:"progression", name:"Agility Speed",      emoji:"⚡", desc:"Complete the Agility Speed chain",             color:"#facc15" },
  { id:"prog-defense",  cat:"progression", name:"Defensive Movement", emoji:"🛡️", desc:"Complete the Defensive Movement chain",       color:"#e879f9" },
  { id:"streak-3",  cat:"streak", name:"3 Day Streak",  emoji:"🔥", desc:"Train 3 days in a row",  color:"#fb923c" },
  { id:"streak-7",  cat:"streak", name:"Week Warrior",  emoji:"⚡", desc:"Train 7 days in a row",  color:"#facc15" },
  { id:"streak-14", cat:"streak", name:"14 Day Streak", emoji:"🌟", desc:"Train 14 days in a row", color:"#a78bfa" },
  { id:"streak-30", cat:"streak", name:"30 Day Streak", emoji:"👑", desc:"Train 30 days in a row", color:"#f59e0b" },
  { id:"shots-100",  cat:"shooting", name:"100 Makes Club", emoji:"🏀", desc:"Make 100 shots all-time",    color:"#60a5fa" },
  { id:"shots-1k",   cat:"shooting", name:"1K Shooter",     emoji:"🎯", desc:"Make 1,000 shots all-time",  color:"#f43f5e" },
  { id:"shots-2500", cat:"shooting", name:"2.5K Shooter",   emoji:"🔮", desc:"Make 2,500 shots all-time",  color:"#8b5cf6" },
  { id:"shots-5k",   cat:"shooting", name:"5K Shooter",     emoji:"🌠", desc:"Make 5,000 shots all-time",  color:"#06b6d4" },
  { id:"shots-10k",  cat:"shooting", name:"10K Shooter",    emoji:"🏆", desc:"Make 10,000 shots all-time", color:"#f97316" },
  { id:"workouts-1",   cat:"milestone", name:"First Workout", emoji:"🌱", desc:"Complete your first workout",  color:"#22c55e" },
  { id:"workouts-10",  cat:"milestone", name:"10 Workouts",   emoji:"⭐", desc:"Complete 10 workout days",     color:"#60a5fa" },
  { id:"workouts-25",  cat:"milestone", name:"25 Workouts",   emoji:"🌟", desc:"Complete 25 workout days",     color:"#a78bfa" },
  { id:"workouts-50",  cat:"milestone", name:"50 Workouts",   emoji:"🏆", desc:"Complete 50 workout days",     color:"#f59e0b" },
  { id:"workouts-100", cat:"milestone", name:"100 Workouts",  emoji:"👑", desc:"Complete 100 workout days",    color:"#f43f5e" },
  { id:"pgm-jump-higher",    cat:"program", name:"Vertical Unlocked", emoji:"⬆️", desc:"Complete the Jump Higher program",           color:"#f97316" },
  { id:"pgm-jump-higher-2",  cat:"program", name:"Sky High",          emoji:"🚀", desc:"Complete Jump Higher II",                    color:"#ea580c" },
  { id:"pgm-guard-handles",  cat:"program", name:"Guard Certified",   emoji:"🎮", desc:"Complete Handle Like a Guard",               color:"#06b6d4" },
  { id:"pgm-become-shooter", cat:"program", name:"Pure Shooter",      emoji:"🎯", desc:"Complete Become a Shooter",                  color:"#8b5cf6" },
  { id:"pgm-first-step",     cat:"program", name:"First Step Elite",  emoji:"⚡", desc:"Complete First Step Explosion",              color:"#f43f5e" },
  { id:"pgm-complete-hooper",cat:"program", name:"Complete Hooper",   emoji:"🏆", desc:"Complete the Complete Hooper program",       color:"#f59e0b" },
  { id:"pgm-bodyweight",     cat:"program", name:"Bodyweight Beast",  emoji:"💪", desc:"Complete the Bodyweight Beast program",      color:"#22c55e" },
  { id:"pgm-bodyweight-2",   cat:"program", name:"Beast Mode",        emoji:"🦍", desc:"Complete Bodyweight Beast II",              color:"#16a34a" },
  { id:"pgm-jump-rope",      cat:"program", name:"Rope Rhythm",       emoji:"🪢", desc:"Complete Jump Rope Basics",                  color:"#ec4899" },
  { id:"pgm-jump-rope-2",    cat:"program", name:"Speed Rope",        emoji:"⚡", desc:"Complete Jump Rope Speed",                   color:"#db2777" },
  { id:"pgm-band-strength",  cat:"program", name:"Band Strong",       emoji:"🎗️", desc:"Complete Band Strength",                     color:"#8b5cf6" },
  { id:"pgm-own-the-glass",  cat:"program", name:"Glass Cleaner",     emoji:"🪃", desc:"Complete the Own the Glass program",          color:"#22c55e" },
  { id:"pgm-step-back-legends", cat:"program", name:"Step Back Legend", emoji:"↩️", desc:"Complete the Step Back Legends program",   color:"#7c3aed" },
  { id:"pgm-lockdown-defender", cat:"program", name:"Lockdown Defender", emoji:"🛡️", desc:"Complete the Lockdown Defender program",    color:"#0ea5e9" },
  { id:"pgm-passing-fundamentals", cat:"program", name:"Passing Certified", emoji:"🤝", desc:"Complete Passing Fundamentals",          color:"#14b8a6" },
  { id:"pgm-floor-general",  cat:"program", name:"Floor General",     emoji:"🧠", desc:"Complete the Floor General program",           color:"#6366f1" },
  { id:"pgm-smooth-handles", cat:"program", name:"Smooth Operator",  emoji:"🌊", desc:"Complete the Smooth Handles program",         color:"#38bdf8" },
  { id:"pgm-cramer-29",      cat:"program", name:"29 Days Straight", emoji:"🔥", desc:"Complete the Cramer 29 Day Challenge",       color:"#f97316" },
];

const CHAIN_BADGE_MAP = {
  "prog-pogo":     "pogo-mastery",
  "prog-jump":     "jump-power",
  "prog-landing":  "landing-control",
  "prog-sl":       "single-leg",
  "prog-strength": "strength-found",
  "prog-footwork": "footwork-found",
  "prog-agility":  "agility-speed",
  "prog-defense":  "defensive-movement",
};

export function getEarnedBadges(completed, programProgress = {}, programs = []) {
  const done = parseStoredObject(completed, {});
  const progress = parseStoredObject(programProgress, {});
  const earned = new Set();

  for (const [badgeId, chainId] of Object.entries(CHAIN_BADGE_MAP)) {
    const chain = PROGRESSION_CHAINS.find(c => c.id === chainId);
    if (chain) {
      const { progress: chainProgress, total } = getChainStatus(chain, done);
      if (chainProgress === total) earned.add(badgeId);
    }
  }

  const days = [...new Set(
    Object.keys(done).filter(k => done[k])
      .map(k => k.split("-").slice(0, 3).join("-"))
  )].sort();
  let maxStreak = 0, st = 0;
  for (let i = 0; i < days.length; i++) {
    if (i === 0) { st = 1; }
    else {
      const diff = (new Date(days[i] + "T12:00:00") - new Date(days[i - 1] + "T12:00:00")) / 86400000;
      if (diff <= 1.5) st++; else st = 1;
    }
    if (st > maxStreak) maxStreak = st;
  }
  if (maxStreak >= 3)  earned.add("streak-3");
  if (maxStreak >= 7)  earned.add("streak-7");
  if (maxStreak >= 14) earned.add("streak-14");
  if (maxStreak >= 30) earned.add("streak-30");

  try {
    const makes = countShotMakes(readShotLog());
    if (makes >= 100)   earned.add("shots-100");
    if (makes >= 1000)  earned.add("shots-1k");
    if (makes >= 2500)  earned.add("shots-2500");
    if (makes >= 5000)  earned.add("shots-5k");
    if (makes >= 10000) earned.add("shots-10k");
  } catch { /* ignore */ }

  const workoutDays = new Set(
    Object.keys(done).filter(k => done[k])
      .map(k => k.split("-").slice(0, 3).join("-"))
  ).size;
  if (workoutDays >= 1)   earned.add("workouts-1");
  if (workoutDays >= 10)  earned.add("workouts-10");
  if (workoutDays >= 25)  earned.add("workouts-25");
  if (workoutDays >= 50)  earned.add("workouts-50");
  if (workoutDays >= 100) earned.add("workouts-100");

  for (const prog of programs) {
    if (programCompletionCount(prog, progress) >= 1) earned.add(prog.badgeId);
  }

  return [...earned];
}

export function getBadgeProgress(badge, completed, programProgress = {}, programs = []) {
  const done = parseStoredObject(completed, {});
  const progress = parseStoredObject(programProgress, {});
  const days = [...new Set(
    Object.keys(done).filter(k => done[k]).map(k => k.split("-").slice(0, 3).join("-"))
  )];
  const workoutDays = days.length;
  let streak = 0; const dw = new Date();
  for (let i = 0; i < 60; i++) {
    const k = dw.toLocaleDateString("en-CA");
    if (days.includes(k)) { streak++; dw.setDate(dw.getDate() - 1); } else break;
  }
  let makes = 0;
  try { makes = countShotMakes(readShotLog()); } catch { /* ignore */ }
  const MAP = {
    "workouts-1":{cur:workoutDays,target:1},"workouts-10":{cur:workoutDays,target:10},
    "workouts-25":{cur:workoutDays,target:25},"workouts-50":{cur:workoutDays,target:50},
    "workouts-100":{cur:workoutDays,target:100},
    "streak-3":{cur:streak,target:3},"streak-7":{cur:streak,target:7},
    "streak-14":{cur:streak,target:14},"streak-30":{cur:streak,target:30},
    "shots-100":{cur:makes,target:100},"shots-1k":{cur:makes,target:1000},
    "shots-2500":{cur:makes,target:2500},"shots-5k":{cur:makes,target:5000},
    "shots-10k":{cur:makes,target:10000},
  };
  if (MAP[badge.id]) return MAP[badge.id];
  const prog = programs.find(p => p.badgeId === badge.id);
  if (prog) {
    const totalSessions = prog.weeks.reduce((s, w) => s + w.sessions.length, 0);
    if (programCompletionCount(prog, progress) >= 1) return { cur: totalSessions, target: totalSessions };
    const doneSessions = countProgramSessionsDone(prog, progress);
    return { cur: doneSessions, target: totalSessions };
  }
  return { cur:0, target:1 };
}
