import { test, expect } from "@playwright/test";
import { seedAthleteStorage } from "./helpers/athleteStorage.js";
import { PROGRAMS } from "../src/data/trainingCatalog.js";

/* Program lifecycle: finishing retires a program to history (badge kept, even for kids
   who finished before a rebuild), Home offers the next step, and rope owners warm up
   with the rope. Storage is seeded once per page load, so these tests don't reload. */

const nav = (page) => page.locator("div").filter({ has: page.getByRole("button", { name: "☀️ Today" }) }).last();

const QUIET_RETURNING_ATHLETE = {
  s_onboarded: "1",
  "fkh-tour-v1-complete": "1",
  "fkh-tour-prompt-dismissed": "1",
  "fkh-last-seen-release": "2099.01.1",
  "fkh-analytics-first-exercise": new Date().toISOString(),
};

/** Every session of a program checked off, using the pre-rebuild drill list where one exists. */
function finishedProgramStorage(programId, { daysAgo = 25 } = {}) {
  const prog = PROGRAMS.find((p) => p.id === programId);
  const startedAt = Date.now() - daysAgo * 86400000;
  const startDate = new Date(startedAt).toLocaleDateString("en-CA");
  const entry = { _meta: { enrollmentStartedAt: startedAt } };
  for (const week of prog.weeks) {
    week.sessions.forEach((s, si) => {
      entry[`${week.week}-${si}`] = Object.fromEntries(
        (s.was || s.exercises).map((id) => [id, { d: startDate, t: startedAt + 1 }]),
      );
    });
  }
  return {
    "fkh-programs": JSON.stringify({ [programId]: { startDate, startedAt } }),
    "fkh-program-progress": JSON.stringify({ [programId]: entry }),
    "fkh-celebrated-badges": JSON.stringify([prog.badgeId]),
  };
}

test.describe("program lifecycle", () => {
  test.beforeEach(({ page }) => {
    page.on("pageerror", (error) => { throw new Error(`Uncaught page error: ${error.message}`); });
  });

  test("a finished program moves to history and Home offers the next level", async ({ page }) => {
    await seedAthleteStorage(page, { ...QUIET_RETURNING_ATHLETE, ...finishedProgramStorage("bodyweight-beast") });
    await page.goto("/");

    await expect(page.getByText("You finished Bodyweight Beast!")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("You unlocked the next level:")).toBeVisible();

    const stored = await page.evaluate(() => ({
      enrolled: Object.keys(JSON.parse(localStorage.getItem("fkh-programs") || "{}")),
      meta: JSON.parse(localStorage.getItem("fkh-program-progress") || "{}")["bodyweight-beast"]?._meta,
    }));
    expect(stored.enrolled).not.toContain("bodyweight-beast");
    expect(stored.meta?.retiredAt).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Start Bodyweight Beast II →" }).click();
    await expect(page.getByText("Bodyweight Beast II").first()).toBeVisible();
    await expect(page.getByText(/Session due/)).toBeVisible();
    await expect(page.getByText("You finished Bodyweight Beast!")).toHaveCount(0);

    await page.getByRole("button", { name: "← Programs" }).click();
    await page.getByRole("button", { name: "Completed" }).click();
    await expect(page.getByText("Bodyweight Beast", { exact: true })).toBeVisible();
    await expect(page.getByText("✓ DONE")).toBeVisible();
  });

  test("dismissing the next-step card clears it", async ({ page }) => {
    await seedAthleteStorage(page, { ...QUIET_RETURNING_ATHLETE, ...finishedProgramStorage("bodyweight-beast") });
    await page.goto("/");
    await expect(page.getByText("You finished Bodyweight Beast!")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(page.getByText("You finished Bodyweight Beast!")).toHaveCount(0);
  });

  test("rope owners warm up with the rope; everyone else doesn't", async ({ page }) => {
    const startedAt = Date.now();
    const startDate = new Date(startedAt).toLocaleDateString("en-CA");
    const enrolled = { "bodyweight-beast": { startDate, startedAt } };
    const progress = { "bodyweight-beast": { _meta: { enrollmentStartedAt: startedAt } } };

    await seedAthleteStorage(page, {
      ...QUIET_RETURNING_ATHLETE,
      "fkh-programs": JSON.stringify(enrolled),
      "fkh-program-progress": JSON.stringify(progress),
    });
    await page.goto("/");
    const myPrograms = page.getByText("My Programs", { exact: true }).locator("..");
    await expect(myPrograms.getByText("Jumping Jacks")).toBeVisible({ timeout: 20_000 });
    await expect(myPrograms.getByText("Jump Rope: Basic Bounce")).toHaveCount(0);

    const ropePage = await page.context().newPage();
    await seedAthleteStorage(ropePage, {
      ...QUIET_RETURNING_ATHLETE,
      "fkh-programs": JSON.stringify(enrolled),
      "fkh-program-progress": JSON.stringify({
        ...progress,
        "jump-rope-basics": { _meta: { enrollmentStartedAt: startedAt - 86400000 } },
      }),
    });
    await ropePage.goto("/");
    const ropePrograms = ropePage.getByText("My Programs", { exact: true }).locator("..");
    await expect(ropePrograms.getByText("Jump Rope: Basic Bounce").first()).toBeVisible({ timeout: 20_000 });
    await expect(ropePrograms.getByText("Jumping Jacks")).toHaveCount(0);
    await expect(nav(ropePage).getByRole("button", { name: "☀️ Today" })).toBeVisible();
  });
});
