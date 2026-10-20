const GEAR_LABELS = {
  basketball: "🏀 Ball",
  hoop: "🥅 Hoop",
  wall: "🧱 Wall",
  cones: "🔺 Cones",
  jump_rope: "🪢 Jump rope",
  two_basketballs: "🏀🏀 2 balls",
  tennis_ball: "🎾 Tennis ball",
  box: "📦 Box",
  chair: "🪑 Sturdy chair",
  partner: "🤝 Partner",
  dumbbells: "🏋️ Dumbbells",
  bosu: "BOSU ball",
};

/* Drill data spells gear several ways ("basketball_x2", "2 basketballs", "basketball + hoop");
   this is the one vocabulary for drills and programs alike. */
const GEAR_ALIASES = {
  basketball: "basketball", hoop: "hoop", wall: "wall", cones: "cones", box: "box", partner: "partner",
  jump_rope: "jump_rope", dumbbells: "dumbbells", bosu: "bosu", chair: "chair",
  basketball_x2: "two_basketballs", "2 basketballs": "two_basketballs",
  tennis_ball: "tennis_ball", "tennis ball": "tennis_ball", "full court": "hoop",
};

const label = (item) => GEAR_LABELS[item] || item;

/** "basketball + hoop" → ["basketball", "hoop"]; "none"/missing → []. Unknown pieces pass through. */
export function drillGearItems(equipment) {
  if (!equipment || equipment === "none") return [];
  return equipment.split("+").map(x => GEAR_ALIASES[x.trim().toLowerCase()] || x.trim());
}

/** Kid-readable gear for one drill, e.g. "🏀 Ball · 🥅 Hoop", or "No equipment". */
export function drillGearLabel(equipment) {
  const items = drillGearItems(equipment);
  return items.length ? items.map(label).join(" · ") : "No equipment";
}

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
