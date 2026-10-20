// FKH parent re-engagement email — "your athlete hasn't trained in a while".
// Deploy: supabase functions deploy send-parent-email
//
// Gated by PUSH_SECRET (same as send-push), so only the cron job / server can
// call it. Sends via Resend. INERT until three things exist:
//   1. RESEND_API_KEY  — Edge Function secret (from resend.com)
//   2. FKH_FROM_EMAIL  — a verified Resend sender, e.g. "Fit Kid Hooper <coach@yourdomain>"
//   3. consented parents in parent_reengagement_queue (empty today)
// Without the key it no-ops cleanly and reports skipped:"no RESEND_API_KEY".
//
// Runs weekly from pg_cron (fkh-parent-reengagement, see parent_reengagement.sql).
// { dry_run: true } lists who WOULD be emailed (no addresses) without sending.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty */ }
  if (payload.secret !== Deno.env.get("PUSH_SECRET")) return json({ ok: false, error: "unauthorized" }, 401);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("FKH_FROM_EMAIL");
  // Same reply-to as the consent email, so "reply to stop" reaches a person.
  const REPLY_TO = Deno.env.get("FKH_BROADCAST_REPLY") || undefined;
  if (!RESEND_API_KEY || !FROM) {
    return json({ ok: true, sent: 0, skipped: "email not configured (RESEND_API_KEY / FKH_FROM_EMAIL)" });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows, error } = await supabase.from("parent_reengagement_queue").select("*").limit(200);
  if (error) return json({ ok: false, error: error.message }, 500);
  /* Legends' bounce/spam list. The shared Resend account's webhook records
     suppressions only in the Legends database, so a parent whose address
     bounced a Legends email would otherwise still get ours. Asked once per run
     (legendsyba.com/api/fkh/email-suppressions). If Legends can't be reached
     the run goes ahead — FKH's own last-email check below still applies. */
  const suppressedByLegends = new Set<string>();
  let legendsChecked = false;
  const LEGENDS_SECRET = Deno.env.get("LEGENDS_SERVER_SECRET");
  if (LEGENDS_SECRET && rows?.length) {
    try {
      const res = await fetch("https://www.legendsyba.com/api/fkh/email-suppressions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LEGENDS_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ emails: rows.map((r: any) => r.parent_email) }),
      });
      if (res.ok) {
        for (const e of (await res.json())?.suppressed ?? []) suppressedByLegends.add(String(e).toLowerCase());
        legendsChecked = true;
      }
    } catch { /* unreachable — proceed */ }
  }
  const isSuppressed = (r: any) => suppressedByLegends.has(String(r.parent_email || "").trim().toLowerCase());

  if (payload.dry_run) {
    return json({
      ok: true, dry_run: true, candidates: rows?.length ?? 0, has_reply_to: Boolean(REPLY_TO), legends_checked: legendsChecked,
      would_email: (rows ?? []).map((r: any) => ({ athlete: r.athlete_name, days_inactive: r.days_inactive, ever_trained: r.ever_trained, suppressed: isSuppressed(r) })),
    });
  }

  const appUrl = "https://app.legendsyba.com/";
  let sent = 0, failed = 0, suppressed = 0;
  for (const r of rows ?? []) {
    if (isSuppressed(r)) {
      await supabase.from("parental_consent")
        .update({ reengagement_opt_out_at: new Date().toISOString() })
        .eq("athlete_id", r.athlete_id);
      suppressed++;
      continue;
    }
    // The Resend account is shared with Legends YBA: if our last email to this
    // parent bounced or was marked spam, stop for good instead of sending again.
    if (r.last_reengagement_email_id) {
      try {
        const prev = await fetch(`https://api.resend.com/emails/${encodeURIComponent(r.last_reengagement_email_id)}`, {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
        });
        const last = prev.ok ? (await prev.json())?.last_event : null;
        if (last === "bounced" || last === "complained") {
          await supabase.from("parental_consent")
            .update({ reengagement_opt_out_at: new Date().toISOString() })
            .eq("athlete_id", r.athlete_id);
          suppressed++;
          continue;
        }
      } catch { /* lookup failed — fall through and send as usual */ }
    }
    const plainName = r.athlete_name || "your athlete";
    // The name is what the kid typed — never put it into HTML unescaped.
    const name = String(plainName).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <h2 style="color:#f97316;margin:0 0 8px">🏀 ${name} is missing their reps</h2>
        <p>${r.ever_trained
          ? `It's been about ${r.days_inactive} days since ${name} last trained on Fit Kid Hooper.
           A quick 5-minute session keeps their streak — and their momentum — alive.`
          : `${name} joined Fit Kid Hooper ${r.days_inactive} days ago but hasn't done a practice yet.
           The first one takes about 5 minutes — today's is ready and waiting.`}</p>
        <p><a href="${appUrl}" style="display:inline-block;background:#f97316;color:#000;font-weight:800;
           text-decoration:none;padding:12px 20px;border-radius:10px">${r.ever_trained ? "Get back to training" : "Start training"} →</a></p>
        <p style="font-size:12px;color:#64748b">You're receiving this because you're the parent/guardian on
           ${name}'s Fit Kid Hooper account (Legends Youth Basketball). At most once every two weeks —
           reply "stop" and we won't send these again.</p>
      </div>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: r.parent_email,
          ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
          subject: r.ever_trained
            ? `${plainName} hasn't trained in ${r.days_inactive} days 🏀`
            : `${plainName}'s first practice is waiting 🏀`,
          html,
        }),
      });
      if (res.ok) {
        sent++;
        const { id } = await res.json().catch(() => ({}));
        await supabase.from("parental_consent")
          .update({ last_reengagement_email_at: new Date().toISOString(), last_reengagement_email_id: id ?? null })
          .eq("athlete_id", r.athlete_id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return json({ ok: true, candidates: rows?.length ?? 0, sent, failed, suppressed, legends_checked: legendsChecked });
});
