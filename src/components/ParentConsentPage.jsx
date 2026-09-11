import { useState, useEffect } from "react";
import {
  getConsentRequest,
  submitParentConsent,
  deleteAthleteViaConsent,
  consentTokenFromUrl,
} from "../lib/parentConsent.js";

/**
 * Parent-facing consent page (opened from the link the athlete sends).
 *
 * Rendered INSTEAD of the app when the URL carries ?consent=TOKEN — the parent
 * is not a logged-in athlete and should never land in the kid's UI. Light and
 * document-like on purpose: an adult skimming on a phone needs legibility and a
 * sense that this is the serious part, not the game part.
 *
 * The two asks are deliberately separate. The account consent is required; the
 * video pre-approval is OPTIONAL, defaults off, and declining it changes
 * nothing about the account. Consent has to be specific to each practice, so
 * these can never collapse into one "I agree".
 */

const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";
const ORANGE = "#ea7317";

const page = {
  minHeight: "100dvh", background: "#f8fafc", color: INK,
  fontFamily: "system-ui, -apple-system, sans-serif",
  display: "flex", flexDirection: "column", alignItems: "center",
};
const card = {
  width: "100%", maxWidth: 480, background: "#fff", padding: "24px 20px 32px",
  boxSizing: "border-box", flex: 1,
};
const label = { display: "block", fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 6 };
const input = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
  border: `1px solid ${LINE}`, background: "#fff", color: INK, fontSize: 16, // 16px: iOS won't zoom
  fontFamily: "inherit",
};
const checkRow = {
  display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
  fontSize: 14, lineHeight: 1.5,
};

function Shell({ children }) {
  return (
    <div style={page}>
      <div style={{
        width: "100%", background: "#0b1220", color: "#fff", padding: "14px 20px",
        boxSizing: "border-box", display: "flex", justifyContent: "center",
      }}>
        <div style={{ width: "100%", maxWidth: 480, display: "flex", alignItems: "center", gap: 10 }}>
          <img src="legends-crest.png" alt="Legends Youth Basketball"
               width="30" height="23" style={{ display: "block", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2 }}>
              🏀 FKH <span style={{ color: ORANGE }}>Fit Kid Hooper</span>
            </div>
            {/* A parent approving their child's account should be able to see
                whose programme they are approving, not just the app's name. */}
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
              A Legends Youth Basketball program
            </div>
          </div>
        </div>
      </div>
      <div style={card}>{children}</div>
    </div>
  );
}

function Notice({ emoji, title, children, footer }) {
  return (
    <Shell>
      <div style={{ textAlign: "center", padding: "32px 8px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{emoji}</div>
        <h1 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 10px" }}>{title}</h1>
        <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{children}</p>
      </div>
      {footer}
    </Shell>
  );
}

/**
 * The only place in the product where a donation ask reaches a verified adult
 * at a moment of intent. It is deliberately not in the app: everyone in there
 * is a child, and asking a kid for money -- or to go and ask a parent -- is not
 * something a nonprofit training app should teach. A parent who has just
 * approved an account is the one person for whom this is a fair question.
 */
function SupportLegends() {
  const donateUrl = import.meta.env.VITE_DONATE_URL || null;
  if (!donateUrl) return null;
  return (
    <div style={{
      marginTop: 24, padding: "16px 18px", borderRadius: 12,
      background: "#fff7ed", border: "1px solid #fed7aa",
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: INK, marginBottom: 6 }}>
        🧡 Support Legends Youth Basketball
      </div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 12px" }}>
        Fit Kid Hooper is built and run by Legends YBA, a nonprofit. It is free for
        every athlete, and always will be. Donations fund training, camps and gym
        time for kids who could not otherwise get them.
      </p>
      <a href={donateUrl} target="_blank" rel="noopener noreferrer"
        style={{
          display: "inline-block", padding: "10px 18px", borderRadius: 999,
          background: "#f97316", color: "#fff", fontSize: 13, fontWeight: 800,
          textDecoration: "none",
        }}>
        Donate
      </a>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
        Entirely optional — the account is already approved either way.
      </div>
    </div>
  );
}

export default function ParentConsentPage() {
  const token = consentTokenFromUrl();
  // A missing token is knowable at first render — no effect round-trip for it.
  const [state, setState] = useState(() => (token ? { loading: true } : { loading: false, error: "not_found" }));
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [email, setEmail] = useState("");
  const [attest, setAttest] = useState(false);
  const [video, setVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);

  // index.html paints a boot shell that only the athlete app's error boundary
  // clears — without this the parent stares at "Loading your training…".
  useEffect(() => {
    const el = document.getElementById("fkh-boot-shell");
    if (el) el.style.display = "none";
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getConsentRequest(token).then(r => {
      if (cancelled) return;
      setState({ loading: false, ...(r.ok ? { data: r } : { error: r.error || "not_found" }) });
    });
    return () => { cancelled = true; };
  }, [token]);

  const athlete = state.data?.athlete_label || "your athlete";

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!attest) { setErr("Please confirm you're the parent or legal guardian."); return; }
    if (!relationship) { setErr("Please tell us your relationship to " + athlete + "."); return; }
    /* Neither checkbox is pre-ticked, so an unticked optional feature might be
       a decision or might be an oversight. Ask once rather than guess -- and
       never by defaulting it on, which would not be consent. */
    if (!video && !confirmSkip) { setConfirmSkip(true); return; }
    setBusy(true);
    const r = await submitParentConsent(token, {
      parentName: name, relationship, parentEmail: email, videoOptIn: video,
    });
    setBusy(false);
    if (r.ok) setDone({ video: !!r.video });
    else setErr({
      name_required: "Please enter your full name.",
      email_required: "Please enter a valid email address.",
      expired: "This link has expired — ask your athlete to send a new one.",
      not_found: "This link isn't valid — ask your athlete to send a new one.",
    }[r.error] || "Something went wrong. Please try again.");
  };

  const runDelete = async () => {
    setErr(null);
    setBusy(true);
    const r = await deleteAthleteViaConsent(token);
    setBusy(false);
    if (r.ok) setDeleted(true);
    else setErr("Could not delete the account. Reply to this email and we'll take care of it.");
  };

  if (deleted)
    return <Notice emoji="🗑" title="Account deleted">
      {athlete}&apos;s account and training history have been removed. Nothing is kept.
      If this was a mistake, they can start again any time.
    </Notice>;

  if (state.loading) return <Notice emoji="🏀" title="Loading…">One moment.</Notice>;

  if (state.error === "expired")
    return <Notice emoji="⏳" title="This link has expired">
      For safety, approval links expire after 30 days. Ask your athlete to send a fresh one from the app.
    </Notice>;

  if (state.error)
    return <Notice emoji="🔍" title="We couldn't find this request">
      The link may be incomplete or already used. Ask your athlete to send a new one from the app.
    </Notice>;

  if (done || state.data?.status === "signed")
    return <Notice emoji="✅" title="Thank you — you're all set" footer={<SupportLegends />}>
      {athlete}&apos;s account is approved{done?.video ? ", and you've pre-approved video workouts with friends you approve" : ""}.
      You can change or withdraw this at any time from Settings in the app, or by replying to any email we send you.
    </Notice>;

  return (
    <Shell>
      <h1 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 8px", lineHeight: 1.3 }}>
        Approve {athlete}&apos;s account
      </h1>
      <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: "0 0 20px" }}>
        Fit Kid Hooper is a basketball training app for young athletes. We need a parent or
        guardian&apos;s permission before we save {athlete}&apos;s account. This takes about 30 seconds.
      </p>

      <div style={{
        background: "#f8fafc", border: `1px solid ${LINE}`, borderRadius: 12,
        padding: "14px 16px", marginBottom: 22, fontSize: 13, color: MUTED, lineHeight: 1.6,
      }}>
        <strong style={{ color: INK }}>What we save:</strong> a nickname, a passcode, your email, and their
        training progress. <strong style={{ color: INK }}>What we never do:</strong> show your child&apos;s real
        name publicly, sell their information, or use it to target advertising at them. You can withdraw
        permission and delete the account at any time.
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={label} htmlFor="pc-name">Your full name</label>
          <input id="pc-name" style={input} value={name} autoComplete="name"
                 onChange={e => setName(e.target.value)} placeholder="Jane Doe" required />
        </div>

        <div>
          <label style={label} htmlFor="pc-rel">You are their</label>
          <select id="pc-rel" style={input} value={relationship} onChange={e => setRelationship(e.target.value)}>
            <option value="">Select…</option>
            <option value="mother">Mother</option>
            <option value="father">Father</option>
            <option value="guardian">Legal guardian</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label style={label} htmlFor="pc-email">Your email</label>
          <input id="pc-email" style={input} value={email} type="email" autoComplete="email"
                 onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 6 }}>
            Yours, not your child&apos;s — it&apos;s how we reach you about the account.
          </div>
        </div>

        <label style={{ ...checkRow, paddingTop: 4 }}>
          <input type="checkbox" checked={attest} onChange={e => setAttest(e.target.checked)}
                 style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: ORANGE }} />
          <span>
            I am {athlete}&apos;s parent or legal guardian, I am over 18, and I give permission for this
            account.
          </span>
        </label>

        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, letterSpacing: 0.6, marginBottom: 10 }}>
            OPTIONAL — YOU CAN CHANGE THIS ANYTIME
          </div>
          <label style={checkRow}>
            <input type="checkbox" checked={video} onChange={e => setVideo(e.target.checked)}
                   style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: ORANGE }} />
            <span>
              <strong>Live video workouts.</strong> {athlete} could train over video only with friends
              you have already approved — never strangers, and never random matching.
              <span style={{ display: "block", color: MUTED, fontSize: 12.5, marginTop: 4 }}>
                This feature isn&apos;t available yet. We&apos;ll confirm with you before it ever turns on,
                and leaving this unchecked doesn&apos;t affect the account at all.
              </span>
            </span>
          </label>
        </div>

        {confirmSkip && !video && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
            padding: "12px 14px", fontSize: 13, lineHeight: 1.6, color: INK,
          }}>
            <strong>Just checking — live video workouts are off.</strong>
            <div style={{ color: MUTED, marginTop: 4 }}>
              {athlete}&apos;s account will be approved either way. Without this, {athlete} won&apos;t be
              able to train over video with friends you approve, once that feature exists.
              You can turn it on later in Settings.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" onClick={() => { setVideo(true); setConfirmSkip(false); }}
                style={{
                  padding: "9px 14px", borderRadius: 999, border: `1px solid ${ORANGE}`,
                  background: "#fff", color: ORANGE, fontSize: 13, fontWeight: 800, cursor: "pointer",
                }}>
                Turn it on
              </button>
              <button type="submit" style={{
                padding: "9px 14px", borderRadius: 999, border: `1px solid ${LINE}`,
                background: "#fff", color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}>
                Approve without it
              </button>
            </div>
          </div>
        )}

        {err && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c",
            borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.5,
          }}>{err}</div>
        )}

        <button type="submit" disabled={busy} style={{
          width: "100%", padding: "15px 20px", borderRadius: 12, border: "none",
          background: busy ? "#cbd5e1" : ORANGE, color: busy ? "#64748b" : "#fff",
          fontSize: 16, fontWeight: 800, cursor: busy ? "default" : "pointer", marginTop: 4,
        }}>
          {busy ? "Saving…" : `Approve ${athlete}'s account`}
        </button>

        <p style={{ fontSize: 11.5, color: MUTED, textAlign: "center", lineHeight: 1.6, margin: 0 }}>
          By approving you agree to our{" "}
          <a href="privacy.html" style={{ color: ORANGE }}>privacy notice</a>.
          Questions? Reply to any email we send you.
        </p>

        {/* The other answer. A consent request that can only be accepted is not
            really a request, and without this the only way to decline was to
            reply to an email and wait for a human. */}
        <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 16, textAlign: "center" }}>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)}
              style={{
                background: "none", border: "none", color: MUTED, fontSize: 12.5,
                textDecoration: "underline", cursor: "pointer", padding: 4,
              }}>
              I&apos;d rather delete {athlete}&apos;s account
            </button>
          ) : (
            <div style={{
              background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
              padding: "14px 16px", textAlign: "left",
            }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "#b91c1c", marginBottom: 6 }}>
                Delete {athlete}&apos;s account?
              </div>
              <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: "0 0 12px" }}>
                This removes the account and all training history straight away. It cannot be undone,
                and it does not need our help — it happens the moment you tap.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={runDelete} disabled={busy}
                  style={{
                    padding: "10px 16px", borderRadius: 999, border: "none",
                    background: busy ? "#cbd5e1" : "#dc2626", color: "#fff",
                    fontSize: 13, fontWeight: 800, cursor: busy ? "default" : "pointer",
                  }}>
                  {busy ? "Deleting…" : "Yes, delete it"}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)}
                  style={{
                    padding: "10px 16px", borderRadius: 999, border: `1px solid ${LINE}`,
                    background: "#fff", color: MUTED, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  }}>
                  Keep the account
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </Shell>
  );
}
