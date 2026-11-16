import { test, expect } from "@playwright/test";
import {
  seedAthleteStorage,
  TINY_AVATAR_DATA_URL,
  supabaseAuthStorageKey,
} from "./helpers/athleteStorage.js";
import { mockSignedInAthlete } from "./helpers/mockSupabase.js";
import { RELEASE_ID } from "../src/lib/changelog.js";

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

  // Regression: the first-rep "First Workout" badge (earned on the very first drill) was marked
  // celebrated at queue-time while the drill sheet covered the overlay, so the celebration never
  // showed and was lost on reload. The fix persists celebratedBadges on DISMISS, not on queue.
  // Here: an earned-but-not-yet-celebrated badge must actually render its overlay on boot, and
  // once dismissed must stay dismissed across a reload (not re-fire, not re-swallow).
  test("first-rep badge celebration shows and does not re-fire after dismiss", async ({ page }) => {
    const today = new Date().toLocaleDateString("en-CA");
    await seedAthleteStorage(page, {
      s_onboarded: "1",
      "fkh-tour-v1-complete": "1",
      "fkh-tour-prompt-dismissed": "1",
      // Suppress the unrelated What's New sheet, which otherwise covers the overlay at boot.
      "fkh-last-seen-release": RELEASE_ID,
      // One real completion → getEarnedBadges yields workouts-1 ("First Workout").
      s_done: JSON.stringify({ [`${today}-bh-pound`]: true }),
      // NB: deliberately do NOT seed "fkh-celebrated-badges". The seed runs via addInitScript,
      // which re-applies on every reload — seeding "[]" here would wipe what the app persists on
      // dismiss and make the reload step pass for the wrong reason (it would always re-fire). With
      // the key unseeded it defaults empty on first boot, and the app's persisted value survives
      // the reload, so the no-re-fire assertion actually tests the fix.
    });
    await page.goto("/");
    await expectAppBooted(page);

    // The overlay — not a badge shelf — is proven by its own controls: the "Badge Unlocked!"
    // kicker and the "Awesome! 🎉" dismiss button exist nowhere else. (The overlay is emitted
    // once per view, so the role resolves to more than one node — assert on the first.)
    const dismiss = page.getByRole("button", { name: "Awesome! 🎉" });
    await expect(dismiss.first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Badge Unlocked!").first()).toBeVisible();
    await expect(page.getByText("First Workout").first()).toBeVisible();

    // THE REGRESSION GUARD. The bug marked the badge celebrated at QUEUE time (persisting it the
    // instant it was shown), so a reload before the kid ever dismissed it found it already
    // "celebrated" and never showed it again — which on the real drill-completion path, where a
    // sheet covered the overlay, meant the first-rep celebration was seen zero times. The fix
    // persists only on dismiss, so an undismissed celebration must survive a reload and show again.
    await page.reload();
    await expectAppBooted(page);
    await expect(dismiss.first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("First Workout").first()).toBeVisible();

    // Now dismiss it. The overlay is emitted once per mounted view, so several identical copies
    // stack at the same z-index; they share one onDismiss, so clicking the topmost clears them all.
    for (let i = 0; i < 6 && (await dismiss.count()); i++) {
      await dismiss.last().click();
      await page.waitForTimeout(300);
    }
    await expect(dismiss).toHaveCount(0);

    // Dismiss persisted the badge as celebrated…
    const celebrated = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("fkh-celebrated-badges") || "[]"));
    expect(celebrated).toContain("workouts-1");

    // …so NOW a reload must NOT re-show it (dismissed-and-seen stays seen).
    await page.reload();
    await expectAppBooted(page);
    await page.waitForTimeout(1500); // give the celebration effect a chance to (wrongly) re-queue
    await expect(page.getByRole("button", { name: "Awesome! 🎉" })).toHaveCount(0);
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

  // Install-prompt reach: ~97% of kids leave before finishing a drill, and the banner used to be
  // gated behind that — so it never reached the kids whose retention it exists to fix. It now also
  // shows on a return visit. These lock that reach without re-covering a brand-new kid's first open.
  test("install banner shows for a returning kid who hasn't trained", async ({ page }) => {
    await seedAthleteStorage(page, {
      s_onboarded: "1", "fkh-tour-v1-complete": "1", "fkh-tour-prompt-dismissed": "1",
      s_done: "{}", // never completed a drill
      "fkh-opened-before": new Date(Date.now() - 86_400_000).toISOString(), // 2nd+ open
    });
    await page.goto("/");
    await expectAppBooted(page);
    // Desktop test browser: no iOS, no native beforeinstallprompt → manual path after the fallback.
    await expect(page.getByText("Keep FKH one tap away")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/never lose your .*streak/)).toBeVisible();
  });

  test("install banner stays hidden on a brand-new kid's first open", async ({ page }) => {
    await seedAthleteStorage(page, {
      s_onboarded: "1", "fkh-tour-v1-complete": "1", "fkh-tour-prompt-dismissed": "1",
      s_done: "{}",
    });
    await page.addInitScript(() => localStorage.removeItem("fkh-opened-before"));
    await page.goto("/");
    await expectAppBooted(page);
    await page.waitForTimeout(3000); // past the banner's own fallback delay
    await expect(page.getByText("Keep FKH one tap away")).toHaveCount(0);
  });
});
