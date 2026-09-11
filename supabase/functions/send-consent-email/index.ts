// FKH parent consent request — sends one approval link per athlete via Resend.
//
// Separate from send-parent-email because that one reads
// parent_reengagement_queue, a view over parental_consent: by definition it
// only contains parents who have ALREADY consented, which is precisely the
// people this needs to exclude. This takes an explicit recipient list instead.
//
// Gated by PUSH_SECRET like the others. Nothing sends without it.
//
// Env: RESEND_API_KEY, and a from address under either name --
// FKH_BROADCAST_FROM or FKH_FROM_EMAIL. Reply-to is optional
// (FKH_BROADCAST_REPLY). Call with { dry_run: true } to report what it can see
// without sending; it reports presence only, never values.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://app.legendsyba.com/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty */ }
  if (payload.secret !== Deno.env.get("PUSH_SECRET")) return json({ ok: false, error: "unauthorized" }, 401);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("FKH_BROADCAST_FROM") || Deno.env.get("FKH_FROM_EMAIL");
  const REPLY_TO = Deno.env.get("FKH_BROADCAST_REPLY") || undefined;

  // Presence only — never echo a secret back over HTTP.
  const config = {
    has_resend_key: Boolean(RESEND_API_KEY),
    from_source: Deno.env.get("FKH_BROADCAST_FROM") ? "FKH_BROADCAST_FROM"
      : Deno.env.get("FKH_FROM_EMAIL") ? "FKH_FROM_EMAIL" : null,
    has_reply_to: Boolean(REPLY_TO),
  };

  if (payload.dry_run) return json({ ok: true, dry_run: true, config, would_send: (payload.recipients ?? []).length });
  if (!RESEND_API_KEY || !FROM) return json({ ok: false, error: "email not configured", config }, 400);

  const recipients: Array<{ email: string; athlete: string; token: string }> = payload.recipients ?? [];
  if (!recipients.length) return json({ ok: false, error: "no recipients" }, 400);

  const results: Array<{ email: string; ok: boolean; error?: string }> = [];
  for (const r of recipients) {
    const link = `${APP_URL}?consent=${encodeURIComponent(r.token)}`;
    const who = r.athlete || "your athlete";
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6">
        <p>Hi — this is Ryhan from Fit Kid Hooper.</p>
        <p><strong>${who}</strong> has an account, and we're making sure we have a parent or guardian's
           approval on file for every young athlete using the app. If you set the account up, this just
           confirms it properly.</p>
        <p>It takes about 30 seconds:</p>
        <p><a href="${link}" style="display:inline-block;background:#ea7317;color:#fff;font-weight:800;
           text-decoration:none;padding:12px 22px;border-radius:10px">Review and approve</a></p>
        <p>You'll confirm you're the parent or guardian. Live video workouts are a separate, optional
           choice — declining doesn't affect the account. If you'd rather the account was deleted,
           there's a one-tap option on that same page.</p>
        <p style="font-size:13px;color:#64748b">Fit Kid Hooper is free. We never show your child's real
           name publicly, sell their information, or show them ads.</p>
      </div>`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: r.email,
          ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
          subject: `A quick approval for ${who}'s Fit Kid Hooper account`,
          html,
        }),
      });
      results.push(res.ok ? { email: r.email, ok: true } : { email: r.email, ok: false, error: `resend ${res.status}` });
    } catch (e) {
      results.push({ email: r.email, ok: false, error: String(e) });
    }
  }

  return json({ ok: true, config, sent: results.filter(r => r.ok).length, results });
});
