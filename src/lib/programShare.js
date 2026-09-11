/**
 * Sharing a program as a link.
 *
 * The receiving half already exists: `?program=<id>` is parsed by
 * lib/notifications.js -> parseNavigationDeepLink() and opens that program's detail page
 * on cold start, then strips itself out of the URL. This module is the sending half —
 * building that link and handing it to the OS share sheet or the clipboard.
 *
 * No backend involved. The link is just the app URL plus a catalog id, so it keeps
 * working for a signed-out reader and needs nothing stored server-side.
 */

/** Absolute link that opens `programId`'s detail page. Empty string if there is no id. */
export function programShareUrl(programId) {
  if (!programId) return "";
  if (typeof window === "undefined") return "";
  /* BASE_URL is the Vite `base` ("/" in production on app.legendsyba.com, and under some dev
     setups), so this stays correct on Pages and on localhost without a hardcoded path. */
  const base = import.meta.env.BASE_URL || "/";
  const path = base.endsWith("/") ? base : `${base}/`;
  return `${window.location.origin}${path}?program=${encodeURIComponent(programId)}`;
}

/** Clipboard write with a fallback for non-secure contexts (e.g. testing over a LAN IP). */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Share a program. Prefers the OS share sheet (which is what a phone wants — it reaches
 * Messages, WhatsApp, AirDrop), and falls back to copying the link.
 *
 * Resolves to one of:
 *   { method: "shared" }    — handed off to the OS sheet
 *   { method: "copied", url } — link is on the clipboard
 *   { method: "dismissed" } — user backed out of the share sheet; say nothing
 *   { method: "failed", url } — neither worked; show the raw link so it can be copied by hand
 */
export async function shareProgram(prog) {
  const url = programShareUrl(prog?.id);
  if (!url) return { method: "failed", url: "" };

  const title = prog?.name ? `${prog.name} on Fit Kid Hooper` : "Fit Kid Hooper";
  const text = prog?.name ? `Train with me — ${prog.name} on Fit Kid Hooper.` : "Train with me on Fit Kid Hooper.";

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { method: "shared", url };
    } catch (err) {
      /* The user closing the sheet is not a failure and must not fall through to a
         clipboard write — that would silently clobber whatever they had copied. */
      if (err?.name === "AbortError") return { method: "dismissed", url };
      /* Any other share error (unsupported payload, permission) still deserves the copy. */
    }
  }

  const copied = await copyToClipboard(url);
  return { method: copied ? "copied" : "failed", url };
}
