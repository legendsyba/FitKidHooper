/** Notification helpers — local nudges + server-sent web push. */
import { getSupabaseClient } from "./supabaseClient.js";

const NOTIFY_PREF_KEY = "fkh-notify-mission";
const NOTIFY_PROMPT_KEY = "fkh-notify-prompted";
const NOTIFY_PROMPT_DISMISS_KEY = "fkh-notify-prompt-dismissed";
const PREFS_KEY = "fkh-notify-prefs";

// Public VAPID key (safe to ship). Private key is a Supabase secret used by the
// send-push edge function.
const VAPID_PUBLIC_KEY = "BC63C8Q7EhvzNVenK402rXcfq1EbgZq5v5fTPl5Mf7bKzGpzVhuCJt87qGMLjLeY6kUL0_RDMyTNHtFNSxuYCn0";

// Notification categories — all default ON; the athlete can uncheck any.
export const NOTIFICATION_CATEGORIES = [
  { key: "dailyMission",   label: "Daily mission",    desc: "When today's mission is still undone" },
  { key: "streakRisk",     label: "Streak at risk",   desc: "Before your training streak resets" },
  { key: "messages",       label: "Messages",         desc: "When a friend sends you a message" },
  { key: "mentions",       label: "Mentions",         desc: "When a friend @mentions you in a comment" },
  { key: "friendRequest",  label: "Friend requests",  desc: "When someone wants to add you" },
  { key: "friendActivity", label: "Friend activity",  desc: "When a friend logs a workout or earns a badge" },
  { key: "challenges",     label: "Challenges",       desc: "New challenges and results" },
  { key: "weeklyRecap",    label: "Weekly recap",     desc: "Your weekly training summary" },
];

export function dismissNotificationPrompt() {
  try { localStorage.setItem(NOTIFY_PROMPT_DISMISS_KEY, "1"); } catch { /* ignore */ }
}

/** Signed-in athletes who haven't enabled push on this device (and didn't dismiss the banner). */
export function shouldShowNotificationPrompt() {
  try {
    if (localStorage.getItem(NOTIFY_PROMPT_DISMISS_KEY)) return false;
    if (!localStorage.getItem("s_onboarded")) return false;
    if (!isPushSupported()) return false;
    if (canUseNotifications() && Notification.permission === "denied") return false;
    return true;
  } catch {
    return false;
  }
}

/** True when the Today banner should offer to turn on notifications. */
export async function needsNotificationSubscription() {
  if (!shouldShowNotificationPrompt()) return false;
  const sub = await getPushSubscription();
  return !sub;
}

export function getNotifyPrefs() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { /* ignore */ }
  const prefs = {};
  for (const c of NOTIFICATION_CATEGORIES) prefs[c.key] = stored[c.key] !== false; // default true
  return prefs;
}

export function setNotifyPref(key, on) {
  const prefs = getNotifyPrefs();
  prefs[key] = !!on;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  // Reflect onto any existing push subscriptions so the send job filters correctly.
  const sb = getSupabaseClient();
  if (sb) sb.rpc("update_push_prefs", { p_prefs: prefs }).then(() => {}, () => {});
  return prefs;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator
    && "PushManager" in window && "Notification" in window;
}

export function notificationIconUrl() {
  if (typeof window === "undefined") return undefined;
  try {
    return new URL("pwa-192.png", window.location.origin + import.meta.env.BASE_URL).href;
  } catch {
    return undefined;
  }
}

export async function getPushSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

/** Subscribe this device to push and persist it (requires sign-in). */
export async function subscribeToPush() {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, reason: "not_configured" };
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return { ok: false, reason: "not_signed_in" };

  const perm = await requestNotificationPermission();
  if (perm !== "granted") return { ok: false, reason: perm };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  const { error } = await sb.rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_prefs: getNotifyPrefs(),
    p_ua: navigator.userAgent.slice(0, 200),
  });
  if (error) return { ok: false, reason: error.message };
  setNotificationPref(true);
  return { ok: true };
}

export async function unsubscribeFromPush() {
  const sb = getSupabaseClient();
  const sub = await getPushSubscription();
  if (sub) {
    if (sb) await sb.rpc("delete_push_subscription", { p_endpoint: sub.endpoint }).then(() => {}, () => {});
    try { await sub.unsubscribe(); } catch { /* ignore */ }
  }
  setNotificationPref(false);
  return { ok: true };
}

export function getNotificationPref() {
  try {
    return localStorage.getItem(NOTIFY_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotificationPref(on) {
  try {
    localStorage.setItem(NOTIFY_PREF_KEY, on ? "1" : "0");
  } catch { /* ignore */ }
}

export function canUseNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission() {
  if (!canUseNotifications()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try { localStorage.setItem(NOTIFY_PROMPT_KEY, "1"); } catch { /* ignore */ }
  const result = await Notification.requestPermission();
  if (result === "granted") setNotificationPref(true);
  return result;
}

/** In-app alert when a new message arrives (backup when push/SW is stale). */
export function notifyNewMessage({ preview } = {}) {
  if (!canUseNotifications() || Notification.permission !== "granted") return false;
  if (!getNotifyPrefs().messages) return false;
  try {
    new Notification("💬 New message", {
      body: preview ? String(preview).slice(0, 80) : "A friend sent you a message",
      icon: notificationIconUrl(),
      tag: "fkh-message",
      data: { url: buildAppUrl("messages=1") },
    });
    return true;
  } catch {
    return false;
  }
}

/** Show a local notification nudging back to today's mission. */
export function notifyMissionReminder({ athleteName, missionTitle } = {}) {
  if (!canUseNotifications() || Notification.permission !== "granted") return false;
  if (!getNotificationPref()) return false;

  try {
    const title = "🏀 Daily Mission waiting";
    const body = missionTitle
      ? `${athleteName || "Hooper"}, finish "${missionTitle}" today!`
      : `${athleteName || "Hooper"}, your daily mission is ready.`;
    new Notification(title, {
      body,
      icon: notificationIconUrl(),
      tag: "fkh-mission",
      data: { url: buildAppUrl("mission=1") },
    });
    return true;
  } catch {
    return false;
  }
}

/** Call on app load — if ?mission=1, consumer should expand mission section. */
export function consumeMissionDeepLink() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("mission") === "1") {
    params.delete("mission");
    const qs = params.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState({}, "", path);
    return true;
  }
  return false;
}

export function consumeInviteDeepLink() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("invite");
  if (code) {
    params.delete("invite");
    const qs = params.toString();
    const path = window.location.pathname + (qs ? `?${qs}` : "");
    window.history.replaceState({}, "", path);
    return code.toUpperCase();
  }
  return null;
}

/** Build an absolute in-app URL for push / notification deep links. */
export function buildAppUrl(query = "") {
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  const base = typeof window !== "undefined"
    ? (window.location.origin + import.meta.env.BASE_URL)
    : "https://app.legendsyba.com/";
  try {
    return new URL(q || ".", base).href;
  } catch {
    const root = base.endsWith("/") ? base : `${base}/`;
    return q ? `${root}${q.replace(/^\?/, "")}` : root;
  }
}

function searchParamsFromInput(input) {
  if (input == null || input === "") return null;
  const s = String(input);
  try {
    if (s.includes("://") || s.startsWith("/")) {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://app.legendsyba.com";
      return new URL(s, origin).searchParams;
    }
  } catch { /* fall through */ }
  return new URLSearchParams(s.startsWith("?") ? s.slice(1) : s);
}

/**
 * Parse ?view=, ?messages=, ?friends=, ?program= navigation deep links
 * (push / notification / emailed invite).
 * Returns { tab, openMessages?, openFriends?, openProgram? } or null.
 *
 * ?program=<id> opens that program's detail page directly, which is what an emailed
 * invite wants — landing on the Programs tab still asks the reader to go hunting.
 * An unknown id is harmless: ProgramsView guards on the lookup and falls back to the
 * normal list, so a typo'd link degrades to "the app opened" rather than a blank screen.
 */
export function parseNavigationDeepLink(input) {
  const params = searchParamsFromInput(input);
  if (!params) return null;
  const view = params.get("view");
  const messages = params.get("messages") === "1";
  const friends = params.get("friends") === "1";
  const program = params.get("program");
  const klass = params.get("class");

  let tab = null;
  let openMessages = false;
  let openFriends = false;

  if (view === "me" || view === "progress") tab = "progress";
  else if (view === "boards" || view === "challenges") tab = "boards";
  else if (view === "home" || view === "today") tab = "home";
  else if (view === "squad") tab = "squad";
  else if (view === "shots") tab = "shots";
  else if (view === "programs") tab = "programs";
  else if (view === "messages" || messages) { tab = "squad"; openMessages = true; }
  else if (friends) { tab = "squad"; openFriends = true; }

  /* A bare ?program= link carries no ?view=, so it implies the Programs tab. */
  if (program && !tab) tab = "programs";
  /* A shared class link lands on Today; the class opens over it, so the tab is
     only what sits behind. */
  if (klass && !tab) tab = "home";

  if (!tab) return null;
  return { tab, openMessages, openFriends, openProgram: program || null, openClass: klass || null };
}

function stripNavigationParamsFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  const messages = params.get("messages") === "1";
  const friends = params.get("friends") === "1";
  const program = params.get("program");
  const klass = params.get("class");
  if (!view && !messages && !friends && !program && !klass) return;
  if (view) params.delete("view");
  if (messages) params.delete("messages");
  if (friends) params.delete("friends");
  if (program) params.delete("program");
  // Stripped like the rest: left on the URL, a shared class link would reopen
  // the sheet on every refresh, including after the athlete dismissed it.
  if (klass) params.delete("class");
  const qs = params.toString();
  const path = window.location.pathname + (qs ? `?${qs}` : "");
  window.history.replaceState({}, "", path);
}

/** Consume navigation params from the current URL (cold start / openWindow). */
export function consumeNavigationDeepLink() {
  if (typeof window === "undefined") return null;
  const link = parseNavigationDeepLink(window.location.search);
  if (!link) return null;
  stripNavigationParamsFromLocation();
  return link;
}

/** Listen for notification-click routing from the service worker. */
export function listenForNotificationNavigation(onNavigate) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const onMsg = (event) => {
    const data = event.data;
    if (!data || data.type !== "FKH_NAV") return;
    const link = parseNavigationDeepLink(data.url || data.search || "");
    if (link) onNavigate(link);
  };
  navigator.serviceWorker.addEventListener("message", onMsg);
  return () => navigator.serviceWorker.removeEventListener("message", onMsg);
}

/** Schedule a one-shot evening reminder if mission incomplete (call once per session). */
export function scheduleMissionReminder({ missionComplete, missionTitle, athleteName, hour = 18 } = {}) {
  if (missionComplete || !getNotificationPref()) return;
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target <= now) return;
  const ms = target.getTime() - now.getTime();
  setTimeout(() => {
    notifyMissionReminder({ athleteName, missionTitle });
  }, Math.min(ms, 4 * 3600000));
}
