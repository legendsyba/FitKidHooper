const GEAR_LABELS = {
  basketball: "🏀 Ball",
  hoop: "🥅 Hoop",
  wall: "🧱 Wall",
  cones: "🔺 Cones",
  jump_rope: "🪢 Jump rope",
  two_basketballs: "🏀🏀 2 balls",
  tennis_ball: "🎾 Tennis ball",
  box: "📦 Box",
  partner: "🤝 Partner",
  dumbbells: "🏋️ Dumbbells",
};

const label = (item) => GEAR_LABELS[item] || item;

/** What a kid needs to grab for a program, ready to show: main gear, plus a few-drills extra. */
export function programGearSummary(prog) {
  const main = (prog?.equipment || []).map(label);
  const few = (prog?.equipmentFew || []).map(label);
  return {
    none: main.length === 0 && few.length === 0,
    main: main.join(" · "),
    few: few.join(" · "),
  };
}
