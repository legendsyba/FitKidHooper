#!/usr/bin/env node
/**
 * The one-off "Fit Kid Hooper has moved" send.
 *
 *   node scripts/send-moved-email.mjs                  # dry run — who, and what they'd get
 *   node scripts/send-moved-email.mjs --to you@ex.com  # one real send, to yourself
 *   node scripts/send-moved-email.mjs --send           # the real thing
 *
 * Dry run is the default and --send is the only way past it, because this is a
 * message to real families that cannot be recalled. Do the --to test first, on a
 * phone, and actually complete the four steps before sending to anyone else.
 *
 * Recipients come from the database at run time: every account email plus any
 * consent parent not already among them. Addresses are never written to disk and
 * are printed masked unless you ask for --show-addresses.
 *
 * Reads RESEND_API_KEY / BROADCAST_FROM / BROADCAST_REPLY_TO from .env.local, and
 * uses the Supabase CLI (already authenticated as legendsyba) for the lookup.
 * Copy lives in migration/email-we-moved.md — edit there, not here.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = "https://app.legendsyba.com/";
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const SEND = has("--send");
const ONE = valueOf("--to");
const SHOW = has("--show-addresses");

function env(name) {
  const line = readFileSync(join(ROOT, ".env.local"), "utf8")
    .split("\n").reverse()
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : null;
}

const RESEND_API_KEY = env("RESEND_API_KEY");
const FROM = env("BROADCAST_FROM");
const REPLY_TO = env("BROADCAST_REPLY_TO");
if (!RESEND_API_KEY || !FROM) {
  console.error("Missing RESEND_API_KEY / BROADCAST_FROM in .env.local.");
  process.exit(1);
}

function recipients() {
  if (ONE) return [ONE];
  const out = execFileSync("supabase", [
    "db", "query", "--linked",
    `select lower(email) as email from auth.users where email is not null and email <> ''
     union
     select lower(parent_email) from parental_consent where parent_email is not null`,
  ], { encoding: "utf8", cwd: ROOT });
  const json = out.match(/\[\s*\{[\s\S]*?\}\s*\]/);
  if (!json) { console.error("Could not read recipients from the database."); process.exit(1); }
  return JSON.parse(json[0]).map((r) => r.email).filter(Boolean).sort();
}

const mask = (e) => SHOW ? e : e.replace(/^(.).*(.)@(.).*$/, "$1***$2@$3***");

const subject = "Fit Kid Hooper has a new home — one quick step";

const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6">
  <p>Hi,</p>
  <p>Fit Kid Hooper is now run by <strong>Legends Youth Basketball Association</strong>, and it has moved
     to a new address:</p>
  <p style="text-align:center;padding:6px 0">
    <a href="${APP_URL}" style="display:inline-block;background:#ea7317;color:#fff;font-weight:800;
       text-decoration:none;padding:13px 26px;border-radius:10px">Open Fit Kid Hooper</a></p>
  <p style="text-align:center;font-size:13px;color:#64748b;margin-top:-6px">${APP_URL}</p>
  <p>Everything your athlete has done is safe — workouts, streaks, badges, shot logs and settings are
     saved to their account, not to the phone. Signing in on the new app brings all of it back.</p>
  <p><strong>What to do, once:</strong></p>
  <ol style="padding-left:20px">
    <li>Open <a href="${APP_URL}" style="color:#ea7317">${APP_URL}</a> on the phone or tablet you normally use.</li>
    <li>Add it to the home screen — on iPhone or iPad tap <strong>Share → Add to Home Screen</strong>;
        on Android tap the menu → <strong>Install app</strong>.</li>
    <li>Sign in with the same username and PIN as always.</li>
    <li><strong>Delete the old Fit Kid Hooper icon.</strong> The new one looks identical, and opening
        the old one by mistake is the only thing that causes confusion here.</li>
  </ol>
  <p>The old address stops working, so step 4 matters more than it sounds.</p>
  <p>Nothing else changes — same app, same coaches, same training. If anything looks wrong after you
     sign in, just reply to this email and we'll sort it out.</p>
  <p style="font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px;margin-top:22px">
     Legends Youth Basketball Association · <a href="mailto:info@legendsyba.com" style="color:#64748b">info@legendsyba.com</a></p>
</div>`;

const list = recipients();

console.log(`\nFrom:     ${FROM}`);
console.log(`Reply-to: ${REPLY_TO || "(none)"}`);
console.log(`Subject:  ${subject}`);
console.log(`Sending:  ${list.length} recipient(s)\n`);
list.forEach((e) => console.log(`  ${mask(e)}`));

if (!SEND && !ONE) {
  console.log(`\nDry run. Nothing sent.`);
  console.log(`  Test on yourself:  node scripts/send-moved-email.mjs --to you@example.com`);
  console.log(`  Then, for real:    node scripts/send-moved-email.mjs --send\n`);
  process.exit(0);
}

const results = [];
for (const to of list) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}), subject, html }),
    });
    results.push({ to, ok: res.ok, status: res.status });
    console.log(`  ${res.ok ? "sent" : `FAILED ${res.status}`}  ${mask(to)}`);
  } catch (e) {
    results.push({ to, ok: false, status: String(e) });
    console.log(`  FAILED  ${mask(to)}  ${e}`);
  }
  // Resend rate-limits bursts; nine recipients can afford to be polite.
  await new Promise((r) => setTimeout(r, 600));
}

const sent = results.filter((r) => r.ok).length;
console.log(`\n${sent}/${results.length} accepted by Resend.`);
console.log(`Accepted is not delivered — check the Resend dashboard for bounces,`);
console.log(`and follow up by text with anyone who bounces.\n`);
