// FKH parent re-engagement email — "your athlete hasn't trained in a while".
// Deploy: supabase functions deploy send-parent-email
//
// Gated by PUSH_SECRET (same as send-push), so only the cron job / server can
// call it. Sends via Resend. INERT until three things exist:
//   1. RESEND_API_KEY  — Edge Function secret (from resend.com)
//   2. FKH_FROM_EMAIL  — a verified Resend sender, e.g. "Fit Kid Hooper <coach@yourdomain>"
//   3. consented parents in parent_reengagement_queue (empty today)
// Without the key it no-ops cleanly and reports skipped:"no RESEND_API_KEY".
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
  if (!RESEND_API_KEY || !FROM) {
    return json({ ok: true, sent: 0, skipped: "email not configured (RESEND_API_KEY / FKH_FROM_EMAIL)" });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows, error } = await supabase.from("parent_reengagement_queue").select("*").limit(200);
  if (error) return json({ ok: false, error: error.message }, 500);

  const appUrl = "https://app.legendsyba.com/";
  let sent = 0, failed = 0;
  for (const r of rows ?? []) {
    const name = r.athlete_name || "your athlete";
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
        <h2 style="color:#f97316;margin:0 0 8px">🏀 ${name} is missing their reps</h2>
        <p>It's been about ${r.days_inactive} days since ${name} last trained on Fit Kid Hooper.
           A quick 5-minute session keeps their streak — and their momentum — alive.</p>
        <p><a href="${appUrl}" style="display:inline-block;background:#f97316;color:#000;font-weight:800;
           text-decoration:none;padding:12px 20px;border-radius:10px">Get back to training →</a></p>
        <p style="font-size:12px;color:#64748b">You're receiving this because you're the parent/guardian on
           ${name}'s Fit Kid Hooper account (Legends Youth Basketball).</p>
      </div>`;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: r.parent_email,
          subject: `${name} hasn't trained in ${r.days_inactive} days 🏀`,
          html,
        }),
      });
      if (res.ok) {
        sent++;
        await supabase.from("parental_consent")
          .update({ last_reengagement_email_at: new Date().toISOString() })
          .eq("athlete_id", r.athlete_id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return json({ ok: true, candidates: rows?.length ?? 0, sent, failed });
});
