import { useState } from "react";
import {
  isAuthConfigured,
  getLastUsername,
  signUpWithUsername,
  signInWithUsername,
  sendRecoveryCode,
  resetPasscodeWithCode,
  verifySignupEmail,
  recordParentalConsent,
  usernameRevealsRealName,
} from "../lib/auth.js";
import { checkLegendsAccess, rememberLegendsAccess } from "../lib/legendsAccess.js";
import { calcAge, needsParentConsent } from "../lib/periodStats.js";
import DateOfBirthField from "./DateOfBirthField.jsx";

const inputStyle = (P) => ({
  width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
  border: `1px solid ${P}44`, background: "rgba(255,255,255,0.05)",
  color: "var(--fkh-text)", fontSize: 14, marginBottom: 10,
});

const btnPrimary = (P, disabled) => ({
  width: "100%", padding: 14, borderRadius: 12, border: "none",
  background: disabled ? `${P}66` : P, color: "#000",
  fontSize: 14, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer",
});

const btnGhost = (P) => ({
  width: "100%", padding: 10, marginTop: 8, background: "transparent",
  border: `1px solid ${P}33`, borderRadius: 10, color: P,
  fontSize: 12, fontWeight: 700, cursor: "pointer",
});

export default function AuthSheet({ P, SF, onClose, onSignedIn, initialMode = "signin", zIndex = 350, parentConsent: consentFromProfile = true, firstName = "", lastName = "", askBirthday = false, onBirthday }) {
  const [mode, setMode] = useState(initialMode);
  /* Onboarding no longer asks for a birthday, so a kid saving their player
     may not have one yet. It decides who signs off on the account, so it is
     asked here, and the form follows it as soon as it is entered. */
  const [dob, setDob] = useState("");
  const parentConsent = askBirthday && dob ? needsParentConsent(dob) : consentFromProfile;
  const [username, setUsername] = useState(getLastUsername());
  const [passcode, setPasscode] = useState("");
  const [passcode2, setPasscode2] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingUsername, setPendingUsername] = useState("");
  const [isParent, setIsParent] = useState(false);
  const [readPrivacy, setReadPrivacy] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const configured = isAuthConfigured();
  const today = new Date();
  const dobMax = new Date(today.getFullYear() - 5, today.getMonth(), today.getDate()).toLocaleDateString("en-CA");
  const dobMin = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate()).toLocaleDateString("en-CA");

  // In the athlete app, creating an account means a kid saving their player —
  // so it collects a PARENT's email + consent (COPPA). Admin sign-in passes
  // parentConsent={false} to keep the plain form.
  const nameLabel = parentConsent ? "Jersey Name" : "username";
  const consentOk = !parentConsent || (isParent && readPrivacy);

  const isError = status && !status.includes("sent") && !status.includes("Check") && !status.includes("created");

  const finish = async () => {
    await onSignedIn?.();
    onClose?.();
  };

  const handleSignIn = async e => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await signInWithUsername({ username, passcode });
      await finish();
    } catch (err) {
      setStatus(err.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async e => {
    e.preventDefault();
    if (askBirthday) {
      const age = calcAge(dob);
      if (!dob) { setStatus("Enter your birthday first"); return; }
      if (age < 5 || age > 100) { setStatus("Check that birthday — it doesn't look right"); return; }
    }
    if (passcode !== passcode2) {
      setStatus("Passcodes do not match");
      return;
    }
    if (parentConsent && !consentOk) {
      setStatus("A parent or guardian needs to check both boxes to continue.");
      return;
    }
    if (usernameRevealsRealName(username, firstName, lastName)) {
      setStatus("Your Jersey Name can't include your real name — try a nickname or something creative!");
      return;
    }
    /* A real first name is required before an account exists. Three of the
       first nine accounts have none, so their parent approval reads "Approve
       beastmode23's account" — a parent should not have to decode a handle to
       know which child they are consenting for. firstName comes from the
       athlete's profile, which onboarding already asks for; this catches the
       path where someone reaches signup without it. */
    const realFirstName = String(firstName || "").trim();
    if (parentConsent && (!realFirstName || realFirstName === "Champ")) {
      setStatus("Add your first name in Me → Progress → Edit first — a grown-up needs to know who they're approving.");
      return;
    }
    if (askBirthday) onBirthday?.(dob);
    setBusy(true);
    setStatus(null);
    try {
      // Legends access gate: a registered Legends family (by the parent email) OR a one-time
      // invite code an admin generated. Shared with the onboarding signup path so the two
      // can't drift; honors VITE_LEGENDS_GATE_MODE (warn-only by default).
      setStatus("Checking your Legends access…");
      const gate = await checkLegendsAccess({ email: recoveryEmail, code: inviteCode });
      // The gate never runs again after signup — write its answer down.
      rememberLegendsAccess(gate);
      if (!gate.allow) {
        setStatus(gate.message);
        setBusy(false);
        return;
      }
      const result = await signUpWithUsername({ username, passcode, recoveryEmail });
      if (result.needsEmailVerification) {
        setPendingEmail(result.email);
        setPendingUsername(result.username);
        setMode("verify");
        setStatus(`Enter the 6-digit code sent to ${result.email}`);
      } else {
        await finish();
      }
    } catch (err) {
      setStatus(err.message || "Sign-up failed");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySignup = async e => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      await verifySignupEmail({ email: pendingEmail, code: otpCode, username: pendingUsername });
      // Account now exists + parent email verified → record the consent
      // (the verified email IS the parent's email). Non-fatal if it fails;
      // the account is still created.
      if (parentConsent) {
        try { await recordParentalConsent({ parentEmail: pendingEmail }); } catch { /* non-fatal */ }
      }
      await finish();
    } catch (err) {
      setStatus(err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSendRecovery = async e => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const { email } = await sendRecoveryCode(username || recoveryEmail);
      setPendingEmail(email);
      setMode("reset");
      setStatus(`Code sent to ${email}`);
    } catch (err) {
      setStatus(err.message || "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPasscode = async e => {
    e.preventDefault();
    if (passcode !== passcode2) {
      setStatus("Passcodes do not match");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await resetPasscodeWithCode({ email: pendingEmail, code: otpCode, newPasscode: passcode });
      setStatus("Passcode updated — sign in with your new code");
      setMode("signin");
      setPasscode("");
      setPasscode2("");
      setOtpCode("");
    } catch (err) {
      setStatus(err.message || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const title = {
    signin: "Sign In",
    signup: parentConsent ? "Save My Player" : "Create Account",
    forgot: "Forgot Passcode",
    verify: parentConsent ? "One step for a grown-up" : "Verify Email",
    reset: "New Passcode",
  }[mode];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        background: SF || "#0d1526", borderRadius: "22px 22px 0 0",
        width: "100%", maxWidth: 680, padding: "20px 20px 32px", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--fkh-text)" }}>{title}</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ fontSize: 12, color: "var(--fkh-text-muted)", lineHeight: 1.55, marginBottom: 16 }}>
          {mode === "signin" && "Back up progress, sync across devices, and add friends on Challenges."}
          {mode === "signup" && (parentConsent
            ? "Save your player so you never lose your streak, badges, or XP. Pick a Jersey Name and passcode — then a parent finishes one quick step."
            : "Pick a username and 6-digit passcode. Add a recovery email in case you forget.")}
          {mode === "forgot" && "Enter your Jersey Name or parent email. We'll send a 6-digit code."}
          {mode === "verify" && (parentConsent
            ? "We sent a 6-digit code to the parent's email. Enter it to save this player."
            : "Check your recovery email for a 6-digit code.")}
          {mode === "reset" && "Enter the code from your email and choose a new 6-digit passcode."}
        </p>

        {!configured ? (
          <p style={{ fontSize: 12, color: "#f87171" }}>Supabase is not configured for this build.</p>
        ) : mode === "signin" ? (
          <form onSubmit={handleSignIn}>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={nameLabel}
              autoCapitalize="none"
              autoCorrect="off"
              style={inputStyle(P)}
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={passcode}
              onChange={e => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit passcode"
              style={inputStyle(P)}
            />
            <button type="submit" disabled={busy} style={btnPrimary(P, busy)}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button type="button" onClick={() => { setMode("signup"); setStatus(null); }} style={btnGhost(P)}>
              {parentConsent ? "New here? Save your player" : "Create account"}
            </button>
            <button type="button" onClick={() => { setMode("forgot"); setStatus(null); }} style={btnGhost(P)}>
              Forgot passcode?
            </button>
          </form>
        ) : mode === "signup" ? (
          <form onSubmit={handleSignUp}>
            {askBirthday && (
              <>
                <div style={{ fontSize: 11, color: "var(--fkh-text-muted)", fontWeight: 600, marginBottom: 6 }}>Birthday</div>
                <DateOfBirthField value={dob} onChange={setDob} min={dobMin} max={dobMax} P={P}
                  selectStyle={{ ...inputStyle(P), marginBottom: 0, colorScheme: "dark" }} />
              </>
            )}
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={nameLabel}
              autoCapitalize="none"
              autoCorrect="off"
              style={inputStyle(P)}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={passcode}
              onChange={e => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit passcode"
              style={inputStyle(P)}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={passcode2}
              onChange={e => setPasscode2(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="confirm passcode"
              style={inputStyle(P)}
            />
            <input
              type="email"
              value={recoveryEmail}
              onChange={e => setRecoveryEmail(e.target.value)}
              placeholder={parentConsent ? "Parent / guardian email" : "recovery email"}
              style={inputStyle(P)}
            />
            <input
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              placeholder="Legends invite code (only if not a registered family)"
              autoCapitalize="characters"
              autoCorrect="off"
              style={inputStyle(P)}
            />
            {parentConsent && (
              <div style={{ display: "grid", gap: 10, margin: "2px 0 14px" }}>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 12.5, color: "var(--fkh-text-muted)", lineHeight: 1.45 }}>
                  <input type="checkbox" checked={isParent} onChange={e => setIsParent(e.target.checked)}
                    style={{ accentColor: P, width: 17, height: 17, flexShrink: 0, marginTop: 1 }} />
                  <span>I'm the parent or guardian, and I give permission for my athlete to use Fit Kid Hooper.</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", fontSize: 12.5, color: "var(--fkh-text-muted)", lineHeight: 1.45 }}>
                  <input type="checkbox" checked={readPrivacy} onChange={e => setReadPrivacy(e.target.checked)}
                    style={{ accentColor: P, width: 17, height: 17, flexShrink: 0, marginTop: 1 }} />
                  <span>I've read the <a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener noreferrer" style={{ color: P, fontWeight: 700 }}>privacy notice</a> — what we collect and why.</span>
                </label>
              </div>
            )}
            <button type="submit" disabled={busy || !consentOk} style={btnPrimary(P, busy || !consentOk)}>
              {busy ? "Saving…" : parentConsent ? "Save My Player" : "Create account"}
            </button>
            <button type="button" onClick={() => { setMode("signin"); setStatus(null); }} style={btnGhost(P)}>
              {parentConsent ? "Already have a player? Log in" : "Already have an account? Sign in"}
            </button>
          </form>
        ) : mode === "forgot" ? (
          <form onSubmit={handleSendRecovery}>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="username or recovery email"
              autoCapitalize="none"
              style={inputStyle(P)}
            />
            <button type="submit" disabled={busy} style={btnPrimary(P, busy)}>
              {busy ? "Sending…" : "Send code"}
            </button>
            <button type="button" onClick={() => { setMode("signin"); setStatus(null); }} style={btnGhost(P)}>
              Back to sign in
            </button>
          </form>
        ) : mode === "verify" ? (
          <form onSubmit={handleVerifySignup}>
            <input
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              style={inputStyle(P)}
            />
            <button type="submit" disabled={busy} style={btnPrimary(P, busy)}>
              {busy ? "Verifying…" : "Verify & finish"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPasscode}>
            <input
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="code from email"
              style={inputStyle(P)}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={passcode}
              onChange={e => setPasscode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="new 6-digit passcode"
              style={inputStyle(P)}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={passcode2}
              onChange={e => setPasscode2(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="confirm new passcode"
              style={inputStyle(P)}
            />
            <button type="submit" disabled={busy} style={btnPrimary(P, busy)}>
              {busy ? "Saving…" : "Save new passcode"}
            </button>
          </form>
        )}

        {status && (
          <p style={{ fontSize: 12, color: isError ? "#f87171" : "#22c55e", marginTop: 12, lineHeight: 1.45 }}>{status}</p>
        )}
      </div>
    </div>
  );
}
