/**
 * Arriving from the Legends parent portal already identified.
 *
 * A parent who clicks through from legendsyba.com/portal is signed in there. The
 * link carries a short-lived token that Legends signed; we trade it back for the
 * address and whether their household has a season registration. They get a
 * prefilled signup instead of being asked to prove, again, something they just
 * proved.
 *
 * Three things worth knowing:
 *
 *   - The token is not an email address. Legends mints and verifies it; we only
 *     carry it. That is deliberate — putting a parent's address in a URL leaks it
 *     into CDN logs, browser history and referrer headers.
 *   - It is a hint, not an authority. It prefills a field and can satisfy the
 *     eligibility gate, which is what it is for. It does not create an account,
 *     grant anything, or bypass parental consent.
 *   - We strip it from the URL the moment it is read, so a shared screenshot or a
 *     back-button does not hand it to someone else.
 */

const HANDOFF_URL =
  import.meta.env.VITE_LEGENDS_HANDOFF_URL || "https://www.legendsyba.com/api/fkh/handoff";

/** Read the token and remove it from the address bar in the same breath. */
export function takeHandoffToken() {
  if (typeof window === "undefined") return null;
  let token;
  try {
    const params = new URLSearchParams(window.location.search);
    token = params.get("handoff");
    if (!token) return null;
    params.delete("handoff");
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", url);
  } catch {
    return null;
  }
  return token && token.length <= 512 ? token : null;
}

/**
 * Exchange a token for { email, firstName, eligible, via }.
 * Returns null on anything at all going wrong — a failed handoff must degrade to
 * the ordinary signup form, never to a blocked one.
 */
export async function redeemHandoff(token) {
  if (!token) return null;
  try {
    const res = await fetch(HANDOFF_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok || typeof data.email !== "string" || !data.email.includes("@")) return null;
    return {
      email: data.email,
      firstName: typeof data.firstName === "string" ? data.firstName : null,
      eligible: data.eligible === true,
      via: data.eligible === true ? "family" : null,
    };
  } catch {
    return null;
  }
}

/**
 * The single, memoized handoff for this page load.
 *
 * Started from the app's entry point so the token leaves the URL the moment we
 * boot — not when some sheet happens to mount. An athlete arriving mid-flow may
 * never open the onboarding sheet at all, and a token left sitting in the address
 * bar is precisely what this design exists to avoid: it survives a screenshot, a
 * shared link and the back button.
 *
 * Callers get the same promise, so the exchange happens once however many
 * components ask.
 */
let pending = null;

export function getHandoff() {
  if (!pending) {
    const token = takeHandoffToken();
    pending = token ? redeemHandoff(token) : Promise.resolve(null);
  }
  return pending;
}
