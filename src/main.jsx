import { createRoot } from 'react-dom/client'
import { repairStoredObjectKeys } from './lib/storageParse.js'
import { migrateAvatarOutOfSettings } from './lib/avatarStorage.js'
import { getHandoff } from './lib/legendsHandoff.js'
import './index.css'
import App from './App.jsx'

try {
  repairStoredObjectKeys()
  migrateAvatarOutOfSettings()
} catch (e) {
  console.error('[fkh] pre-boot repair failed', e)
}

/* Spend the Legends portal token before anything renders. It has to come out of
   the URL on every load, not only when the onboarding sheet mounts — a returning
   athlete lands straight in the app and would otherwise leave the token sitting
   in the address bar. Fire and forget; whoever needs the answer awaits it. */
getHandoff()

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<App />)
}
