# "We've moved" email

Send **after** the new address is live and verified, not before. One send, to every
address in `auth.users` plus any `parental_consent.parent_email` not already covered
(9 distinct addresses as of 10 Sep 2026).

From: `Legends YBA <info@legendsyba.com>` — same sender and reply-to as the consent
emails, so it lands in an already-trusted thread rather than looking like a phish.

Replace `{{APP_URL}}` with the final address before sending.

---

**Subject:** Fit Kid Hooper has a new home — one quick step

**Preview text:** Same app, same progress, new address. Takes about a minute.

---

Hi,

Fit Kid Hooper is now run by **Legends Youth Basketball Association**, and it has moved
to a new address:

**{{APP_URL}}**

Everything your athlete has done is safe — workouts, streaks, badges, shot logs and
settings are saved to their account, not to the phone. Signing in on the new app brings
all of it back.

**What to do, once:**

1. Open **{{APP_URL}}** on the phone or tablet you normally use.
2. Add it to the home screen — on iPhone or iPad tap **Share → Add to Home Screen**; on
   Android tap the menu → **Install app**.
3. Sign in with the same username and PIN as always.
4. **Delete the old Fit Kid Hooper icon.** The new one looks identical, and opening the
   old one by mistake is the only thing that causes confusion here.

The old address stops working, so step 4 matters more than it sounds.

Nothing else changes — same app, same coaches, same training. If anything looks wrong
after you sign in, just reply to this email and we'll sort it out.

— Legends Youth Basketball Association
info@legendsyba.com

---

## Sending notes

- Reuse the direct-to-Resend script pattern from the September consent send rather than
  the `send-consent-email` edge function — this is a one-off list, not a triggered send.
- Resend returning HTTP 200 is acceptance, not delivery. Check the Resend dashboard for
  bounces afterwards and follow up by text for anyone who bounces.
- Send to yourself first and complete all four steps on a real phone before the real send.
