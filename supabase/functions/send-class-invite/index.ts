// FKH — emails a class invite to athletes the coach picked.
//
// The point of this being a function rather than a client call: the coach's
// browser never learns anybody's email address. It sends athlete IDS; this
// resolves them to addresses with the service role and sends. A coach can
// invite a family without being handed their contact details, which is the
// right default in an app full of children.
//
// Authorisation is two-sided, and both sides are checked here:
//   • The CALLER's own JWT is forwarded to i_coach_this_class(), so the
//     database decides whether they coach this class. Passing someone else's
//     coach id proves nothing because auth.uid() is not theirs to set.
//   • Only then does the service-role client read email addresses, and only
//     for the ids given.
//
// Env: RESEND_API_KEY, FKH_BROADCAST_FROM (or FKH_FROM_EMAIL), optional
// FKH_BROADCAST_REPLY. Call with { dry_run: true } for a config probe that
// reports presence only, never values.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://app.legendsyba.com/";
const LOGO = `${APP_URL}legends-crest.png`;

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inviteHtml(opts: {
  athleteName: string; coachName: string; title: string;
  description: string | null; whenText: string | null; link: string;
}) {
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.6">
  <div style="text-align:center;padding:8px 0 18px">
    <img src="${LOGO}" alt="Legends Youth Basketball" width="120" style="display:block;margin:0 auto 10px;height:auto">
    <div style="font-size:15px;font-weight:800;color:#0f172a">Fit Kid Hooper</div>
    <div style="font-size:12px;color:#64748b">A Legends Youth Basketball program</div>
  </div>
  <p>Hi &mdash; ${esc(opts.coachName)} has invited ${esc(opts.athleteName)} to a live training session.</p>
  <p style="background:#f8fafc;border-left:3px solid #ea7317;padding:12px 14px;margin:16px 0">
    <strong style="font-size:16px">${esc(opts.title)}</strong>
    ${opts.whenText ? `<br><span style="color:#64748b;font-size:13px">${esc(opts.whenText)}</span>` : ""}
    ${opts.description ? `<br><br>${esc(opts.description)}` : ""}
  </p>
  <p style="text-align:center;padding:6px 0">
    <a href="${opts.link}" style="display:inline-block;background:#ea7317;color:#fff;font-weight:800;
       text-decoration:none;padding:13px 26px;border-radius:10px">Open the session</a></p>
  <p style="font-size:13px;color:#475569">
    Your athlete watches and types in the chat &mdash; <strong>their camera stays off</strong>.
    Only the coach is on video, and nothing is recorded.</p>
  <p style="font-size:13px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:14px;margin-top:22px">
     Fit Kid Hooper is a free training app from Legends Youth Basketball, a nonprofit.
     <a href="${APP_URL}privacy.html" style="color:#ea7317">Privacy notice</a>.</p>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("FKH_BROADCAST_FROM") || Deno.env.get("FKH_FROM_EMAIL");
  const REPLY_TO = Deno.env.get("FKH_BROADCAST_REPLY") || undefined;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  let payload: any = {};
  try { payload = await req.json(); } catch { /* empty */ }

  if (payload.dry_run) {
    return json({
      ok: true, dry_run: true,
      has_resend_key: Boolean(RESEND_API_KEY),
      has_from: Boolean(FROM),
      has_service_key: Boolean(SERVICE_KEY),
      has_supabase_env: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
    });
  }

  if (!RESEND_API_KEY || !FROM) return json({ ok: false, error: "not_configured" }, 503);
  if (!SERVICE_KEY) return json({ ok: false, error: "no_service_key" }, 503);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

  const classId = String(payload.class_id || "").trim();
  const athleteIds: string[] = Array.isArray(payload.athlete_ids) ? payload.athlete_ids : [];
  if (!classId) return json({ ok: false, error: "class_id required" }, 400);
  if (!athleteIds.length) return json({ ok: false, error: "no recipients" }, 400);

  // ── Is the caller the coach of this class? Asked as the caller. ────────────
  const asCaller = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asCaller.auth.getUser();
  const me = userData?.user?.id;
  if (!me) return json({ ok: false, error: "unauthorized" }, 401);

  const { data: mine } = await asCaller.rpc("i_coach_this_class", { p_class_id: classId });
  if (mine !== true) return json({ ok: false, error: "not_your_class" }, 403);

  // ── Only now, with the coach established, look up addresses. ───────────────
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY!);

  const { data: cls } = await admin
    .from("video_classes")
    .select("id, title, description, scheduled_at, coach_id")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) return json({ ok: false, error: "not_found" }, 404);

  const { data: coach } = await admin
    .from("athlete_profiles").select("display_name").eq("id", cls.coach_id).maybeSingle();

  const { data: profiles } = await admin
    .from("athlete_profiles")
    .select("id, first_name, display_name")
    .in("id", athleteIds);

  const link = `${APP_URL}?class=${cls.id}`;
  const whenText = cls.scheduled_at
    ? new Date(cls.scheduled_at).toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      })
    : null;

  let sent = 0;
  const failed: string[] = [];
  // Resend's rejection reason, surfaced to the caller. Without it a coach sees
  // only "email didn't send", which is not something anyone can act on. It
  // carries a status and message, never a key or an address.
  let detail: string | null = null;

  for (const id of athleteIds) {
    // auth.users is not queryable through PostgREST; the admin API is how an
    // athlete's account email is resolved.
    const { data: u, error: uErr } = await admin.auth.admin.getUserById(id);
    const email = u?.user?.email;
    if (!email) {
      failed.push(id);
      detail = detail || `no address on file${uErr ? ` (${uErr.message})` : ""}`;
      continue;
    }

    const prof = (profiles || []).find((p: any) => p.id === id);
    const athleteName = prof?.first_name || prof?.display_name || "your athlete";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: email,
        ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
        subject: `${coach?.display_name || "Coach"}: ${cls.title}`,
        html: inviteHtml({
          athleteName,
          coachName: coach?.display_name || "Your coach",
          title: cls.title,
          description: cls.description,
          whenText,
          link,
        }),
      }),
    });
    if (res.ok) {
      sent++;
    } else {
      failed.push(id);
      if (!detail) {
        let why = "";
        try { why = JSON.stringify(await res.json()).slice(0, 200); }
        catch { why = (await res.text()).slice(0, 200); }
        detail = `resend ${res.status}: ${why}`;
      }
    }
    // Resend rate-limits bursts; a small gap costs nothing on a class-sized
    // list and avoids a 429 that looks like a broken feature.
    await new Promise((r) => setTimeout(r, 600));
  }

  // Ids, never addresses — the caller must not learn who has an email on file.
  return json({ ok: true, sent, failed: failed.length, detail });
});
