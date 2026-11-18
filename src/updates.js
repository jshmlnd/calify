import { APP_VERSION } from './changelog.js'

// Releases live on GitHub; the desktop app uses electron-updater (main process), Android uses this.
const REPO = 'jshmlnd/calify'

const parts = v => String(v).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0)
export const isNewer = (latest, current) => {
  const a = parts(latest), b = parts(current)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

// Android: the newest non-prerelease GitHub release, if it is newer and carries an APK.
export async function checkForUpdate() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`GitHub returned ${r.status}`)
  const rel = await r.json()
  const apk = rel.assets?.find(a => a.name.endsWith('.apk'))
  return apk && isNewer(rel.tag_name, APP_VERSION) ? { version: rel.tag_name.replace(/^v/i, ''), apkUrl: apk.browser_download_url } : null
}

// Downloads the APK and opens Android's install prompt (native ApkInstallerPlugin). Loaded lazily so node tests can import this file.
export async function installUpdate(info) {
  const { registerPlugin } = await import('@capacitor/core')
  return registerPlugin('ApkInstaller').install({ url: info.apkUrl })
}
