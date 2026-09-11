# Auth & Membership Architecture

**Status:** Phase 1 live · Phase 2 planned  
**Last verified:** 2026-09-01 (`main` @ `f59c1e1`)  
**Goal:** Legends remains the source of truth for who belongs to the club. FKH stores derived entitlements and gates premium features without breaking the public try-before-signup experience.

---

## 1. Where we are today (verified against code)

**FKH** — Supabase project `jjwaspyuldkwasfyrqbw`, GitHub Pages SPA at `app.legendsyba.com` (`base: /`).

### Auth & identity

- **Auth** = standard Supabase email/password wearing a "username + 6‑digit passcode" costume. Recovery email is mandatory at signup. Username→email resolution via `public.auth_usernames` + `get_email_for_username`. — `src/lib/auth.js`, `supabase/auth_usernames.sql`.
- **Two-tier identity:** anonymous device UUID (`fkh-athlete-id` in localStorage) for local-first use, promoted to authenticated `auth.users` id on sign-in (`linkDeviceProfileOnAuth`, `claim_device_stats`). Every auth user auto-gets an `athlete_profiles` row via `on_auth_user_created_profile`.
- **Admin gate (pattern to copy for premium):** `?admin=<key>` reveals the dashboard shell; real authorization is `public.admin_allowlist` + `is_fkh_admin()` inside RLS. — `supabase/analytics.sql`, `founder_seed.sql`.

### Training access — fully open

All core training (Daily Mission, practice, programs, shot tracker, XP/badges, Progress Journey) is open to anonymous and signed-in users alike. No premium tier is enforced anywhere in the app yet.

### Signup gate — Legends verify (live, warn-only in prod)

At account creation, both signup paths call `checkLegendsAccess()` in `src/lib/legendsAccess.js`:

| Path | File | Email check | Invite code |
|---|---|---|---|
| Sign-in sheet | `AuthSheet.jsx` | Parent/recovery email | Yes |
| Onboarding sheet | `OnboardingSheet.jsx` | Parent/recovery email | No (email only) |

The gate POSTs to `https://www.legendsyba.com/api/fkh/verify` (override: `VITE_LEGENDS_VERIFY_URL`).

**Mode** (`VITE_LEGENDS_GATE_MODE`, default **`warn`**):

| Mode | Behavior |
|---|---|
| `warn` | Check and log; never block signup. **Production default** — deploy workflow does not set this env var. |
| `block` | Enforce — unknown emails need a valid invite code. |
| `off` | Skip the network call entirely. |

**Four-way access logic** (client-side, signup only):

| Verify result | Signup allowed (block mode) | `videoEligible` hint |
|---|---|---|
| Registered family (`via: "family"`) | Yes | Yes |
| Valid invite code (`via: "invite"`) | Yes | No |
| Interest-list / known (`via: "interest"` or `known: true`) | Yes | No |
| Unknown (`not_found`) | No — needs invite code | No |

> **Prod caveat:** Legends verify currently returns `not_found` for unknown emails. Interest-list families are distinguished from strangers only when Legends sends `via: "interest"` or `known: true`. Until that ships on the Legends side, block mode cannot safely tell interest-list from stranger for bare `not_registered` responses — FKH fails closed in block mode and logs a warning.

`rememberLegendsAccess()` writes a **localStorage hint only** (`fkh-legends-video-eligible`). Authoritative video enforcement is server-side: `can_video_with()` requires mutual friendship + parental consent + video verification. — `supabase/buddy_video_consent.sql`, `src/lib/videoConsent.js`.

### Parent consent & COPPA (live)

**Consent is gated on age, not applied to everyone.** `needsParentConsent(dob)` — defined in `src/lib/periodStats.js`, re-exported from `src/lib/parentConsent.js` — returns true below `CONSENT_AGE` (13). It gates the signup sheet (`AuthSheet` `parentConsent` prop), the onboarding account step, and the "grab a grown-up" hand-off in `SettingsSheet`. At 13+ the athlete supplies their own email, sees no guardian checkboxes, and **no `parental_consent` row is written** — there is no guardian to record.

A **null birthday returns true**. A self-declared date is not proof of age, so unknown fails safe. Guarded by `npm run verify:consent-age` (CI step), which also asserts every `AGE_GROUPS` id is one the DB `CHECK` constraint accepts.

- **`parental_consent`** — account consent + optional video intent. — `supabase/parental_consent.sql`
- **`parent_consent_requests`** — one-time signing links (30-day TTL, token is the only key). — `supabase/parent_consent_link.sql`
- **UI:** `ParentConsentPage` (`?consent={token}`), in-app invite via `ParentConsentInvite` (mailto / SMS / copy link).
- **Delete:** `delete_athlete_via_consent(token)` — token-scoped account deletion offered on the consent page. — `supabase/parent_delete_account.sql`
- **Bulk email:** `supabase/functions/send-consent-email/` — deployed; manual invoke with `PUSH_SECRET` + `recipients[]`. See [Parent Consent Email ops](../operations/PARENT_CONSENT_EMAIL.md).

**Statuses:** `pending` → `signed` (parent approved) or `deleted` (parent chose removal). `not_required` marks a request that should never have been raised — the athlete is 13+, or consent already exists on another row. Those tokens are inert.

**Sep 2026 send:** 5 emails, sent from `Legends YBA <info@legendsyba.com>` via a local script posting directly to the Resend API — **not** through `send-consent-email`, which is deployed but was not the path used. All five returned HTTP 200 (accepted by Resend; acceptance is not delivery confirmation). Tokens expire 2026-10-01.

Three athletes were deliberately excluded, all now `not_required`: one whose consent was already signed on another row, and two aged 17 and 29 who self-consent under the age gate. Before the gate existed, both were queued to have a guardian asked to approve them.

Track signatures via `parent_consent_requests.status = 'signed'` and new `parental_consent` rows (`method = 'parent_signed_link'`).

### Founding members (schema live, not wired to gating)

`athlete_entitlements.founding_member` + `is_founding_member()` exist and backfill all pre-monetization accounts. — `supabase/founding_members.sql`

**No JS or RLS calls this yet.** When Phase 2 lands, founding members fold into the unified premium check alongside Legends membership.

### Not built yet

| Planned | Status |
|---|---|
| `fkh_organizations` / `fkh_org_memberships` | Not in schema |
| `fkh_has_premium()` | Not in schema |
| `useEntitlements()` hook | Not in codebase |
| Premium RLS on social / Coach Agent / messaging | Social tables still use permissive MVP policies |
| Claim-link redeem bridge | Not built |
| Donor-email eligibility | Product decision pending |

**Legends YBA** — Supabase project `gfbpswzflmzogheotmow`, Next.js on Vercel. Separate project by design. Canonical athlete record = `legends_registrations` with `status='registered'`. The FKH↔Legends join is email + server-to-server verify, not shared user IDs.

---

## 2. Two gates — don't conflate them

| Gate | When | Status | Purpose |
|---|---|---|---|
| **Signup gate** | Account creation | **Live** (warn-only prod) | Keep the club roster honest; funnel strangers toward invite codes |
| **Premium gate** | Feature access (social, AI, depth) | **Not built** | Lock premium surfaces to verified members |

The signup gate must never block the anonymous try experience — guests train without an account. Block mode only affects people attempting to **create** an account.

---

## 3. Product decisions (founder, Sep 2026)

These guide Phase 2 implementation:

1. **Hybrid model (Option C):** Legends verify stays authoritative. FKH stores a derived entitlement record (`fkh_org_memberships` or equivalent). No duplicate PII; no merged databases.
2. **Both guardian emails:** Legends should know both guardians on a family record. FKH still stores one `parent_email` at signup today — dual-guardian matching is a Legends-side enrichment, then reflected in verify responses.
3. **Donor emails:** FKH/Legends Zeffy donor addresses should eventually allow signup/access. Tier treatment (app access vs premium) is a product call — not implemented.
4. **Preserve try-FKH:** Core training stays free; warn-only gate until roster coverage is proven; interest-list families welcome in the app.
5. **Founding members:** Already recorded in `athlete_entitlements`. Unify into `fkh_has_premium()` at Phase 2 launch — no separate client checks.
6. **Premium boundary:** Gate the social + AI layer (§6 table below). Core training stays the hook.

---

## 4. Design principles (unchanged)

1. **Legends stays the source of truth for membership.** FKH never owns "who is a real athlete."
2. **Additive & local-first preserving.** Public preview = the app almost exactly as it works today. Add locks to a premium subset; don't take away the free experience.
3. **Two enforcement layers; RLS is authoritative.** Client gates are UX only. Real gates are RLS + edge functions — exactly like admin today.
4. **Org-agnostic core.** Legends is organization #1. Adding a future org = one data row + one issuer adapter.
5. **No PII in URLs, no cross-DB coupling.** Bridging is server-to-server with a shared secret and opaque one-time tokens.

---

## 5. The three access levels (target state)

| Level | Who | How they get in | What they see |
|---|---|---|---|
| **Preview** | Anonymous public visitor | Nothing — open the app | Full local-first training, premium features shown **locked** + CTA |
| **Free account** | Signed-in, no active membership | Username + passcode signup (as today) | Preview + cloud sync & continuity |
| **Premium** | Signed-in + active membership | Redeem Legends claim link / verified entitlement | Everything unlocked |

| Feature area | Recommended tier | Rationale |
|---|---|---|
| Exercises, Daily Mission, shot tracker, history, badges/XP, Progress Journey | **Preview (free)** | The hook that spreads the app |
| Cross-device cloud sync | **Free account** | Requires account anyway |
| Leaderboards · Friends · Community · Messaging | **Premium** | Verified club roster = safety + value |
| Coach Agent (AI) | **Premium** | Per-use cost; natural member perk |
| Train Like Legends depth · advanced programs | **Premium** | Club membership depth |

---

## 6. Phase 2 data model (planned, FKH project)

Three new tables + `fkh_has_premium()`, mirroring the `admin_allowlist` / `is_fkh_admin()` idiom. **Not shipped.**

```sql
-- Organizations FKH can be gated by. Legends is row #1.
create table if not exists public.fkh_organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,          -- 'legends'
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.fkh_org_memberships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid not null references public.fkh_organizations(id) on delete cascade,
  external_ref text,                         -- legends_people.id (opaque)
  role         text not null default 'athlete'
                 check (role in ('athlete','guardian','coach')),
  status       text not null default 'active'
                 check (status in ('active','expired','revoked')),
  granted_via  text,                         -- 'claim_link' | 'verify' | 'staff' | 'grandfather'
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  metadata     jsonb,
  unique (user_id, org_id)
);

create or replace function public.fkh_has_premium(p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fkh_org_memberships m
    join public.fkh_organizations o on o.id = m.org_id
    where m.user_id = p_uid and m.status = 'active' and o.is_active
      and (m.expires_at is null or m.expires_at > now())
  )
  or exists (
    select 1 from public.athlete_entitlements
    where athlete_id = p_uid and founding_member
  );
$$;
```

> **Founding members:** Pre-monetization accounts are already flagged in `athlete_entitlements`. Phase 2 unifies them inside `fkh_has_premium()` rather than a separate org row — the SQL above shows the intended shape.

---

## 7. The bridge — Legends athlete → FKH member (planned)

Server-to-server with a shared secret. Opaque one-time grant exchanged at redeem time.

### Issue (Legends side)

When a registration becomes `registered`, Legends mints an opaque `grant_id` and delivers:

```
https://app.legendsyba.com/?claim=<grant_id>
```

Surfaces: registration confirmation email, guardian portal "Get the FKH app" button, admin bulk invite.

### Redeem (FKH side)

FKH edge function `redeem-membership` (not built) calls Legends `POST /api/fkh/redeem`, upserts `fkh_org_memberships`, replay-guards via `fkh_membership_grants`.

### Revoke / expire

Passive: `expires_at` at season end. Active (optional): scheduled reconcile against Legends `/api/fkh/members`.

### Email auto-match (optional accelerator)

Recovery email matches guardian household email → auto-grant after server verification. Convenience, not proof — ship claim-link first.

---

## 8. Enforcement in the app (planned)

**Client:** `useEntitlements()` hook → `{ loading, isPremium, orgs }` via `fkh_has_premium()` RPC. Premium entry points render feature or `<LockedFeature org="legends" />`. UX only.

**Server:** RLS + edge functions call `fkh_has_premium(auth.uid())` for messaging, feed, challenges, `coach-agent`. Tighten permissive MVP policies carefully so preview path stays intact.

---

## 9. Phased rollout

| Phase | What | Status |
|---|---|---|
| **0 — Consent & signup gate** | Parent consent links, `send-consent-email`, Legends verify at signup, founding-member table | **Done** |
| **1 — Entitlement schema** | §6 tables + `fkh_has_premium()` including founding-member union | Not started |
| **2 — Redeem bridge** | FKH `redeem-membership` + Legends `/api/fkh/redeem` | Not started |
| **3 — Premium gating** | `useEntitlements()` + RLS on premium surfaces; flip signup gate to `block` when roster ready | Not started |
| **4 — Lifecycle (optional)** | Reconcile job, donor tier, dual-guardian verify enrichment | TBD |

---

## 10. Open decisions

1. ~~**Premium boundary**~~ — ✅ Gate social + AI (§5 table).
2. ~~**Grandfather existing users**~~ — ✅ `athlete_entitlements.founding_member` backfill live.
3. **Donor tier** — App access only, or premium? Needs founder call before verify rules change.
4. **Dual-guardian verify** — Which email(s) clear signup in block mode when both guardians exist?
5. **Grant granularity** — Per-child claim link (recommended) vs one family link?
6. **Block mode timing** — Flip `VITE_LEGENDS_GATE_MODE=block` only after Legends sends `via:"interest"` and roster coverage is validated in warn logs.
7. **FKH Resend deliverability** — Shared Resend account with Legends; FKH has no suppression webhook yet. `send-consent-email` does not check suppressions before send.

---

## Related docs

- [Parent Consent Email ops](../operations/PARENT_CONSENT_EMAIL.md) — bulk send runbook, tracking signatures
- [Product Principles](../product/PRODUCT_PRINCIPLES.md) — athlete-first, habit-building philosophy
- [Development Workflow](../product/DEVELOPMENT_WORKFLOW.md) — engineering process

*Cross-repo: Phase 2+ touches both `FTHFitKidHooper` (schema, edge fn, gating) and `legendsyba` (grant issuance, verify enrichment, `/api/fkh/*`).*
