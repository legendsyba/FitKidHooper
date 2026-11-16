import { useState, useEffect } from 'react'
import { athleteHasPriorUsage, PRACTICE_DONE_EVENT } from './lib/athleteExperience.js'

const DISMISSED_KEY = 'fkh-install-dismissed'
const OPENED_BEFORE_KEY = 'fkh-opened-before'

function isStandalone() {
  return (
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

/* True on the 2nd+ ever open of the app on this device. A kid who comes back has
   shown intent and is past the first-impression moment — the right time to ask
   them to install, and (critically) it reaches the ~97% who leave before ever
   finishing a drill, who otherwise never saw this prompt at all. Sets the marker
   on the first call so the very first open returns false. */
function readIsReturnVisit() {
  try {
    if (localStorage.getItem(OPENED_BEFORE_KEY)) return true
    localStorage.setItem(OPENED_BEFORE_KEY, new Date().toISOString())
    return false
  } catch {
    return false
  }
}

function isIOS() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(() => window._installPrompt || null)
  const [show, setShow] = useState(false)

  /* Eligible to be asked when the kid has shown intent — either trained (≥1 drill
     or a finished practice) OR come back for a 2nd+ visit. A brand-new kid on their
     very first open is NOT eligible: Home's one job is "start today's practice" and
     this used to cover it. The return-visit path is what reaches the ~97% who leave
     before finishing a drill — they just have to come back once. */
  const returnVisit = useState(readIsReturnVisit)[0]
  const [hasTrained, setHasTrained] = useState(() => athleteHasPriorUsage())
  useEffect(() => {
    if (hasTrained) return
    const onFirst = () => setHasTrained(true)
    window.addEventListener(PRACTICE_DONE_EVENT, onFirst)
    return () => window.removeEventListener(PRACTICE_DONE_EVENT, onFirst)
  }, [hasTrained])

  const eligible = hasTrained || returnVisit

  useEffect(() => {
    if (!eligible) return
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY)) return

    // If prompt was already captured before React mounted, show immediately
    if (window._installPrompt) {
      setDeferredPrompt(window._installPrompt)
      setShow(true)
      return
    }

    // iOS — show instructions after short delay
    if (isIOS()) {
      const t = setTimeout(() => setShow(true), 1500)
      return () => clearTimeout(t)
    }

    // Android — listen for prompt (fires on first load) or show fallback after delay
    const onPromptReady = () => {
      setDeferredPrompt(window._installPrompt)
      setShow(true)
    }
    window.addEventListener('installpromptready', onPromptReady)

    // Fallback: show manual instructions if prompt never fires (already installed
    // on this device, or browser policy delay)
    const fallback = setTimeout(() => setShow(true), 2000)

    return () => {
      window.removeEventListener('installpromptready', onPromptReady)
      clearTimeout(fallback)
    }
  }, [eligible])

  useEffect(() => {
    const handler = () => setShow(false)
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  const triggerInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    window._installPrompt = null
    setDeferredPrompt(null)
    setShow(false)
    if (outcome === 'accepted') localStorage.setItem(DISMISSED_KEY, '1')
  }

  if (!show || isStandalone()) return null

  const ios = isIOS()
  const hasNativePrompt = !!deferredPrompt

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
      left: 12,
      right: 12,
      zIndex: 200,
      background: '#0f1e35',
      border: '1px solid #f97316',
      borderRadius: 16,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <span style={{ fontSize: 28, flexShrink: 0 }}>🏀</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', marginBottom: 4 }}>
          Keep FKH one tap away
        </div>

        {ios && (
          <div style={{ fontSize: 12, color: 'var(--fkh-text-muted)', lineHeight: 1.6 }}>
            Add it to your home screen so you never lose your 🔥 streak and FKH is
            there every day. Tap <strong style={{ color: 'var(--fkh-text)' }}>Share</strong> ⎋ at the
            bottom of Safari, then <strong style={{ color: 'var(--fkh-text)' }}>Add to Home Screen</strong>.
          </div>
        )}

        {!ios && hasNativePrompt && (
          <>
            <div style={{ fontSize: 12, color: 'var(--fkh-text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
              Add it to your home screen so you never lose your 🔥 streak and FKH is there every day.
            </div>
            <button onClick={triggerInstall} style={{
              background: '#f97316',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}>
              Install App
            </button>
          </>
        )}

        {!ios && !hasNativePrompt && (
          <div style={{ fontSize: 12, color: 'var(--fkh-text-muted)', lineHeight: 1.6 }}>
            Add it to your home screen so you never lose your 🔥 streak and FKH is
            there every day. Tap the <strong style={{ color: 'var(--fkh-text)' }}>⋮ menu</strong> in
            Chrome, then <strong style={{ color: 'var(--fkh-text)' }}>Add to Home Screen</strong>.
          </div>
        )}
      </div>

      <button onClick={dismiss} style={{
        background: 'none',
        border: 'none',
        color: '#475569',
        fontSize: 18,
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        lineHeight: 1,
      }}>
        ✕
      </button>
    </div>
  )
}
