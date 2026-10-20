import { test, expect } from "@playwright/test";
import {
  seedAthleteStorage,
  TINY_AVATAR_DATA_URL,
  supabaseAuthStorageKey,
} from "./helpers/athleteStorage.js";
import { mockSignedInAthlete } from "./helpers/mockSupabase.js";

function attachRuntimeGuards(page) {
  page.on("pageerror", (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && /ReferenceError|TypeError/.test(msg.text())) {
      throw new Error(`Console error: ${msg.text()}`);
    }
  });
}

const nav = (page) => page.locator("div").filter({ has: page.getByRole("button", { name: "☀️ Today" }) }).last();

async function expectAppBooted(page) {
  await expect(page.getByText("Couldn't start the app")).toHaveCount(0, { timeout: 20_000 });
  await expect(nav(page).getByRole("button", { name: "☀️ Today" })).toBeVisible({ timeout: 20_000 });
}

async function openMeTab(page) {
  await nav(page).getByRole("button", { name: "⭐ Me" }).click();
  await expect(page.getByRole("heading", { name: "⭐ Me" })).toBeVisible();
}

// The gear button's accessible name comes from its aria-label ("Settings"),
// not its visible "⚙" glyph — a bare-glyph locator never matches.
async function openMeSettings(page) {
  await openMeTab(page);
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  // Settings is split by audience now: My Look is open, the parent-facing
  // groups are shut. Workout Timers leads App & Data, so it takes one tap.
  await expect(page.getByText("My Look")).toBeVisible();
  await page.getByRole("button", { name: /App & Data/ }).click();
  await expect(page.getByText("Workout Timers")).toBeVisible();
}

test.describe("FKH pre-deploy smoke", () => {
  test.beforeEach(({ page }) => {
    attachRuntimeGuards(page);
  });

  test("guest athlete boot renders Today home", async ({ page }) => {
    await seedAthleteStorage(page);
    await page.goto("/");
    await expectAppBooted(page);
    await expect(page.locator("#fkh-boot-shell")).toBeHidden();
  });

  // First run is one screen: a name, then Home with today's practice — no
  // birthday, no account, no Coach intro in between.
  test("new kid goes from welcome to Today in one screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Welcome, hooper!")).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder("First name").fill("Jordan");
    await page.getByRole("button", { name: "Let's train →" }).click();
    await expectAppBooted(page);
    await expect(page.getByText("Welcome, hooper!")).toHaveCount(0);
    await expect(page.getByText("Jordan").first()).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("s_onboarded"))).toBe("1");
  });

  test("signed-in boot with squad notifications renders nav badge", async ({ page }) => {
    test.skip(!supabaseAuthStorageKey(), "VITE_SUPABASE_URL must match the built bundle");

    await seedAthleteStorage(page);
    await mockSignedInAthlete(page);
    await page.goto("/");

    await expectAppBooted(page);
    await nav(page).getByRole("button", { name: "👥 Squad" }).click();
    await expect(page.getByText("Couldn't start the app")).toHaveCount(0);
    await expect(nav(page).getByRole("button", { name: "👥 Squad" })).toBeVisible();
  });

  test("Me progress hides the identity form until Edit, then shows it", async ({ page }) => {
    // The My Player form is one-time setup, so it sits behind an Edit pill on
    // the athlete card rather than occupying the second screenful of a screen
    // people open to check progress (see MeView.jsx). Nothing is removed --
    // one tap reveals the whole form, photo picker included.
    await seedAthleteStorage(page, { "fkh-avatar": TINY_AVATAR_DATA_URL });
    await page.goto("/");
    await expectAppBooted(page);
    await openMeTab(page);
    await expect(page.getByPlaceholder("First name")).toHaveCount(0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: "📷 Choose Photo" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByPlaceholder("First name")).toHaveValue("Braylen");
  });

  test("Me settings sheet opens", async ({ page }) => {
    await seedAthleteStorage(page);
    await page.goto("/");
    await expectAppBooted(page);
    await openMeSettings(page);
  });

  test("core tabs render without boot crash", async ({ page }) => {
    await seedAthleteStorage(page);
    await page.goto("/");
    await expectAppBooted(page);

    for (const tab of ["📋 Programs", "🏆 Challenges", "🏀 Shots", "⭐ Me"]) {
      await nav(page).getByRole("button", { name: tab }).click();
      await expect(page.getByText("Couldn't start the app")).toHaveCount(0);
    }
  });

  test("daily mission stays stable after completing a drill", async ({ page }) => {
    const today = new Date().toLocaleDateString("en-CA");
    await seedAthleteStorage(page, {
      s_onboarded: "1",
      "fkh-tour-v1-complete": "1",
      "fkh-tour-prompt-dismissed": "1",
      "fkh-last-seen-release": "2026.07.1",
      "fkh-analytics-first-exercise": new Date().toISOString(),
      // Pre-seed a frozen mission so we can assert it doesn't flip mid-session.
      "fkh-missions": JSON.stringify({
        [today]: {
          mission: {
            date: today,
            title: "🧪 Frozen Mission",
            bonusXP: 50,
            tasks: [
              {
                id: "task-workout",
                type: "category",
                label: "Complete 3 Ball Handling exercises",
                exercises: ["bh-pound", "bh-crossover", "bh-between"],
                target: 3,
                required: true,
                category: "ballhandling",
              },
            ],
          },
        },
      }),
    });
    await page.goto("/");
    await expectAppBooted(page);

    await expect(page.getByText("🧪 Frozen Mission")).toBeVisible({ timeout: 10_000 });

    // Mark a mission drill done via localStorage + reload — mirrors completed-state change
    // that used to regenerate the mission.
    await page.evaluate((day) => {
      const done = JSON.parse(localStorage.getItem("s_done") || "{}");
      done[`${day}-bh-pound`] = true;
      localStorage.setItem("s_done", JSON.stringify(done));
    }, today);
    await page.reload();
    await expectAppBooted(page);

    await expect(page.getByText("🧪 Frozen Mission")).toBeVisible({ timeout: 10_000 });
    const missions = await page.evaluate(() => JSON.parse(localStorage.getItem("fkh-missions") || "{}"));
    expect(missions[today]?.mission?.title).toBe("🧪 Frozen Mission");
  });

  test("brand-new athlete does not auto-open What's New", async ({ page }) => {
    await seedAthleteStorage(page, {
      s_onboarded: "1",
      "fkh-tour-v1-complete": "1",
      "fkh-tour-prompt-dismissed": "1",
      s_done: "{}",
    });
    // Clear any prior-usage markers the seed might share
    await page.addInitScript(() => {
      localStorage.removeItem("fkh-analytics-first-exercise");
      localStorage.removeItem("fkh-last-seen-release");
      localStorage.setItem("s_done", "{}");
    });
    await page.goto("/");
    await expectAppBooted(page);
    await expect(page.getByText("July update — Ask Coach FKH")).toHaveCount(0);
  });
});
