// Deployed Supabase Edge Function (verify_jwt = false; gated by PUSH_SECRET).
// Sends web-push notifications for a category to eligible subscribers. Called by
// pg_cron (daily reminder) and the friend_requests trigger.
//
// Secrets live in Supabase Edge Function secrets, NOT in source:
//   supabase secrets set VAPID_PRIVATE=... PUSH_SECRET=...
// The public VAPID key is safe to ship (it's sent to browsers to subscribe).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC = "BC63C8Q7EhvzNVenK402rXcfq1EbgZq5v5fTPl5Mf7bKzGpzVhuCJt87qGMLjLeY6kUL0_RDMyTNHtFNSxuYCn0";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const PUSH_SECRET = Deno.env.get("PUSH_SECRET")!;
const APP_ORIGIN = "https://app.legendsyba.com";

function toAbsoluteAppUrl(url?: string | null): string {
  const fallback = `${APP_ORIGIN}/?mission=1`;
  if (!url) return fallback;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return APP_ORIGIN + (url.startsWith("/") ? url : `/${url.replace(/^\//, "")}`);
}

webpush.setVapidDetails("mailto:info@legendsyba.com", VAPID_PUBLIC, VAPID_PRIVATE);

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
  const { secret, category = "dailyMission", title, body, url, onlyUserId = null } = payload;
  if (secret !== PUSH_SECRET) return json({ ok: false, error: "unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let q = supabase.from("push_subscriptions").select("endpoint,p256dh,auth,user_id,prefs");
  if (onlyUserId) q = q.eq("user_id", onlyUserId);
  const { data: subs, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 500);

  let targets = (subs ?? []).filter((s: any) => s.prefs?.[category] !== false);

  if (category === "dailyMission" || category === "streakRisk") {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const { data: active } = await supabase
      .from("events").select("athlete_id")
      .eq("event_name", "session_start")
      .gte("created_at", midnight.toISOString());
    const activeSet = new Set((active ?? []).map((r: any) => r.athlete_id));
    targets = targets.filter((s: any) => !activeSet.has(s.user_id));
  }

  const iconUrl = "https://app.legendsyba.com/pwa-192.png";
  const msg = JSON.stringify({
    title: title || "🏀 Time to train",
    body: body || "Your daily mission is waiting — go get a rep in!",
    url: toAbsoluteAppUrl(url),
    icon: iconUrl,
    tag: category,
  });

  let sent = 0, removed = 0;
  await Promise.all(targets.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, msg);
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      }
    }
  }));

  return json({ ok: true, category, candidates: targets.length, sent, removed });
});
