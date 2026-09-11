# Cutover assets — old origin → Legends

Drafts for phase 2 (cutover) of the Legends handover. Nothing here is wired into the build; these
files are deployed by hand to the **old** origin as its final release.

| File | Where it goes | Job |
|---|---|---|
| `index.html` | `/FitKidHooper/index.html` on the old origin | The "we've moved" page, with install steps and a local-data escape hatch |
| `sw.js` | `/FitKidHooper/sw.js` on the old origin | Replaces the Workbox service worker: clears caches, stops serving the stale app, keeps push alive |
| `email-we-moved.md` | Resend | One-off send to the 9 known addresses, after the new address is live |

Set the new address in **three** places before deploying: `NEW_APP_URL` in `sw.js`, and
`NEW_APP_URL` plus the `<a class="cta">` href in `index.html`.

## Why this exists

FKH is a PWA. An installed copy serves its own precached shell and only talks to the
network for data — and the data lives in Supabase, which is *not* moving. So after the
repo transfer the old app does not break loudly; it keeps working against the same
database, forever, on an unmaintained build. Worse, a service worker script cannot be
updated across a cross-origin redirect, so once the old origin 301s to the new domain the
old SW can never be replaced.

That is the window this closes: ship the kill-switch while the old origin still serves
its own SW same-origin.

## Order of operations

1. **New address live and verified.** Don't announce anything that isn't working.
2. **Push first, if you're using it.** The kill-switch SW rewrites the push handler to
   the "we moved" notification, so any migration push must go out *before or after* this
   deploy — decide which, and note that a later `unregister()` release would kill the
   subscription for good. (Reach today: 1 device.)
3. **Deploy these two files** to the old origin, replacing the built app. Everyone who
   opens the old icon now lands on the moved page instead of the zombie app.
4. **Send the email** to the 9 addresses.
5. **Then** transfer the repo and the Supabase project. Neither is user-visible once the
   address has moved.

## Verifying the kill-switch

On a device with the old app already installed, before deploy:

1. Open the installed app, confirm it loads its cached shell offline.
2. Deploy, then open the installed app again — it should land on the moved page on the
   first or second open (the browser byte-compares `sw.js` on navigation).
3. In DevTools → Application: Cache Storage empty, service worker active with no fetch
   handler.

If it stubbornly serves the old shell, the SW update didn't run — check that `sw.js` is
being served with a short cache lifetime and that it is not behind a redirect yet.

## Data safety

All 9 known accounts have a row in `athlete_save`, updated within the last 90 days — so
signing in on the new origin restores everything, and the origin change costs them
nothing. The backup button in `index.html` exists only for anyone who used the app
without ever creating an account; their data lives in origin-scoped `localStorage` and
would otherwise be unreachable. Its key list mirrors `CANONICAL_SAVE_KEYS` in
`src/lib/canonicalSave.js` — keep the two in sync.
