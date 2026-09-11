# Cutover assets — old origin → Legends

Phase 2 (cutover) of the Legends handover. Nothing here is wired into the build.

| File | Status | Job |
|---|---|---|
| `email-we-moved.md` | **the live plan** | One-off send to the 9 known addresses |
| `index.html` | shelved | "We've moved" page for the old origin, with install steps and a local-data escape hatch |
| `sw.js` | shelved | Kill-switch service worker: clears caches, stops serving the stale app, keeps push alive |

The two shelved files are kept because they remain the right answer if the old origin is
ever serveable again, and as the pattern for any future origin move. Both already name
`https://app.legendsyba.com/`.

## Status: the kill-switch door is closed

**These two files can no longer be deployed, and the reason is worth recording.**

Setting the custom domain on the Pages site made GitHub 301 *everything* under the old
origin — including `sw.js`:

```
GET https://rcarrier32.github.io/FitKidHooper/sw.js
  → 301 https://app.legendsyba.com/sw.js
```

A service worker script cannot be updated across a redirect; the spec rejects it. So the
old service worker can never be replaced, and nothing new can be served at the old origin
while the custom domain is set. The window this was written for closed the moment the
domain went live, one step earlier than the plan assumed.

## What that actually costs

Less than it sounds. The old installs are frozen, not broken:

- They serve their precached shell and keep talking to the same Supabase project, which
  is not moving. Everything still works; it just never updates again.
- They still call the Legends eligibility endpoint from the old origin, which is why
  `https://rcarrier32.github.io` stays in the allow-list in that repo's
  `app/api/fkh/verify/route.ts`.
- Push still reaches them. The subscription is tied to the origin and the VAPID keypair,
  both unchanged, and `send-push` now sends absolute `app.legendsyba.com` links.

So the way to move someone off a frozen install is to ask them to: open the new address,
re-add it, delete the old icon. That is exactly what the email says.

## If you ever need the kill-switch anyway

Remove the custom domain from Pages, deploy these two files, wait for each device to open
the app once, then re-add the domain and let the certificate reissue. Only worth it if a
meaningful number of people are stuck on old installs and not reachable by email — which
is not the case today.

## Order of operations

1. ~~New address live and verified.~~ Done — `app.legendsyba.com`, 11 Sep 2026.
2. ~~Deploy the kill-switch.~~ No longer possible; see above.
3. **Send the email** to the 9 addresses. This is now the whole of the cutover.
4. Optionally fire one push to the single old-origin subscriber, as a test of the channel
   rather than as outreach.
5. **Then** transfer the repo and the Supabase project. Neither is user-visible.

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
