# Parent Consent Email — Operations

**Status:** Deployed and used (Sep 2026 initial blast)  
**Function:** `supabase/functions/send-consent-email/`  
**Project:** FKH Supabase `jjwaspyuldkwasfyrqbw`

---

## What it does

Sends one approval email per athlete to a parent/guardian inbox. Each email contains a signing link:

```
https://app.legendsyba.com/?consent={token}
```

The parent signs on their own device. Account consent is required; live video workouts are a separate optional checkbox. Declining video does not affect the account.

This is separate from `send-parent-email`, which only targets parents who **already** consented (re-engagement queue).

---

## Prerequisites

Edge function secrets on FKH Supabase:

| Secret | Purpose |
|---|---|
| `PUSH_SECRET` | Auth gate — required on every invoke |
| `RESEND_API_KEY` | Resend API (shared account with Legends YBA) |
| `FKH_BROADCAST_FROM` or `FKH_FROM_EMAIL` | From address |
| `FKH_BROADCAST_REPLY` | Optional reply-to |

Tokens must already exist in `parent_consent_requests` (minted per athlete via `create_consent_request()` RPC or equivalent admin SQL).

---

## Invoke

```bash
curl -X POST \
  "https://jjwaspyuldkwasfyrqbw.supabase.co/functions/v1/send-consent-email" \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "<PUSH_SECRET>",
    "recipients": [
      { "email": "parent@example.com", "athlete": "Alex", "token": "<64-hex-token>" }
    ]
  }'
```

**Dry run** (reports config presence, never sends):

```json
{ "secret": "<PUSH_SECRET>", "dry_run": true, "recipients": [...] }
```

Subject line: `A quick approval for {athlete}'s Fit Kid Hooper account`

---

## After sending — track signatures

**Pending vs signed** (Supabase SQL editor):

```sql
-- Overview. Statuses: pending → signed (approved) or deleted (parent removed
-- the account); not_required marks a request that should not have been raised
-- (athlete is 13+, or consent already exists on another row).
select status, count(*) from parent_consent_requests group by status;

-- Still waiting (not expired)
select pcr.token, pcr.created_at, pcr.expires_at, ap.display_name
from parent_consent_requests pcr
join athlete_profiles ap on ap.id = pcr.athlete_id
where pcr.status = 'pending' and pcr.expires_at > now()
order by pcr.created_at;

-- Signed (consent on file)
select pcr.signed_at, pcr.parent_email, ap.display_name
from parent_consent_requests pcr
join athlete_profiles ap on ap.id = pcr.athlete_id
where pcr.status = 'signed'
order by pcr.signed_at desc;
```

Successful signing creates/updates `parental_consent` with `method = 'parent_signed_link'`.

Tokens expire **30 days** after creation. Re-minting via `create_consent_request()` reuses an existing pending token so parents aren't mid-sign when a reminder goes out.

---

## Deliverability & bounces

Resend is **shared** between FKH and Legends YBA.

| Where to check | What you see |
|---|---|
| [Resend dashboard](https://resend.com/emails) | Delivery status for all sends |
| Legends Admin → Broadcasts → Deliverability | Bounces/suppressions if webhook wired to `legendsyba.com/api/webhooks/resend` |

FKH does **not** have its own deliverability admin UI. FKH consent events may appear in Legends deliverability when the shared webhook is active.

`send-consent-email` does **not** check suppression lists before sending — verify bounces manually before a re-send blast.

---

## Sep 2026 initial send

- **5 emails**, one per athlete under 13 with an address on file. Sent from
  `Legends YBA <info@legendsyba.com>`, reply-to the same.
- Sent by a **local script posting straight to the Resend API**, spaced ~20s
  apart — *not* through `send-consent-email`. That function is deployed and
  works, but was not the path used, so don't read this entry as proof of it.
- All five returned **HTTP 200 = accepted by Resend**. Acceptance is not
  delivery; check the Resend dashboard for actual delivery and bounces.
- Tokens expire **2026-10-01**.

**Who was left out, and why.** Three athletes had `pending` rows that should
never have been raised — one already signed on another row, and two aged 17
and 29 who self-consent under the age gate. All three are now `not_required`
and their tokens are inert. Filter the "still waiting" query below by age
before any future send, or you will ask a guardian to approve an adult.

**Before a re-send, check the recipient still needs consent:**

```sql
select coalesce(p.first_name, p.display_name) as who,
       date_part('year', age(p.date_of_birth))::int as age,
       r.status, r.expires_at::date
from parent_consent_requests r
join athlete_profiles p on p.id = r.athlete_id
where r.status = 'pending'
order by age nulls last;   -- a null age still needs a parent: unknown fails safe
```

- **Next:** parents sign at `?consent={token}`; monitor `parent_consent_requests.status` and follow up non-responders before token expiry.

---

## In-app alternative (no bulk send)

Athletes can invite a parent from the app via `ParentConsentInvite` — mailto, SMS, or copy link. Same token/`create_consent_request()` flow; no Resend involved.
