/**
 * Fails when eslint findings rise above the recorded budget.
 *
 * CI ran verify:imports, settings-merge, schema, build and smoke — but never
 * eslint. So rules that catch real defects were only ever seen by whoever
 * happened to run lint locally. react-hooks/static-components, for one,
 * is what surfaced the report view rebuilding its whole subtree on every
 * render; nothing in the pipeline would have.
 *
 * A hard zero would mean either suppressing 42 findings that are genuine
 * design questions, or blocking every deploy. A budget lets the number fall
 * over time and blocks it rising. Lower BUDGET whenever you clear some.
 */
import { execFileSync } from "node:child_process";

const BUDGET = 36;

// eslint exits non-zero whenever it reports an error, so read stdout off the
// thrown result rather than treating a non-zero exit as a failure to run.
let raw;
try {
  raw = execFileSync("npx", ["eslint", "src/", "-f", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  raw = e.stdout;
  if (!raw) {
    console.error("Could not run eslint:", e.stderr || e.message);
    process.exit(1);
  }
}
const files = JSON.parse(raw);
const total = files.reduce((n, f) => n + f.messages.length, 0);

if (total > BUDGET) {
  const byRule = {};
  for (const f of files) {
    for (const m of f.messages) byRule[m.ruleId] = (byRule[m.ruleId] || 0) + 1;
  }
  console.error(`Lint findings rose to ${total}, budget is ${BUDGET}.`);
  console.error("By rule:");
  for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${n.toString().padStart(4)}  ${rule}`);
  }
  console.error("\nFix the new findings, or lower nothing — the budget only moves down.");
  process.exit(1);
}

console.log(`Lint findings ${total} (budget ${BUDGET}).`);
if (total < BUDGET) {
  console.log(`Budget can be lowered to ${total} in scripts/verify-lint-budget.mjs.`);
}
