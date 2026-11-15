// Spotify: PKCE sign-in, library (Feb-2026 dev-mode endpoints) and the Web Playback SDK.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { useStore } from './store'

const ACCOUNTS = 'https://accounts.spotify.com'
const API = 'https://api.spotify.com/v1'
const SCOPES = 'streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative user-library-read user-read-playback-state user-modify-playback-state'
const KEY = 'calify.spotify'
const LoopbackAuth = registerPlugin('LoopbackAuth')
export const native = Capacitor.isNativePlatform()

let tok = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || null } catch { return null } })()
const saveTok = t => { tok = t; try { t ? localStorage.setItem(KEY, JSON.stringify(t)) : localStorage.removeItem(KEY) } catch { /* private mode */ } }
const S = () => useStore.getState()
// A PKCE Client ID isn't a secret, so it can ship inside the app (VITE_SPOTIFY_CLIENT_ID in .env).
// Then people only ever see Spotify's own login page; the Settings field is a fallback for builds without one.
export const BUILT_IN_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').trim()
const clientId = () => BUILT_IN_ID || S().spotifyClientId.trim()

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// ---------- sign-in
async function tokenRequest(params) {
  const r = await fetch(ACCOUNTS + '/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), ...params }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error_description || d.error || `Spotify sign-in failed (${r.status})`)
  saveTok({ access: d.access_token, refresh: d.refresh_token || tok?.refresh, expires: Date.now() + (d.expires_in - 60) * 1000 })
}

export async function login() {
  if (!clientId()) throw new Error('Add your Spotify Client ID first')
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = b64(crypto.getRandomValues(new Uint8Array(12)))
  const url = redirect => `${ACCOUNTS}/authorize?${new URLSearchParams({
    client_id: clientId(), response_type: 'code', redirect_uri: redirect, scope: SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge, state,
  })}`

  let redirect, query
  if (window.calify?.auth) {
    // Electron main listens on a free 127.0.0.1 port and opens the system browser.
    ;({ redirect, query } = await window.calify.auth(url('__REDIRECT__')))
  } else if (native) {
    const { port } = await LoopbackAuth.listen()
    redirect = `http://127.0.0.1:${port}/callback`
    await Browser.open({ url: url(redirect) })
    ;({ query } = await LoopbackAuth.waitForCode())
    Browser.close().catch(() => {})
  } else {
    // Browser dev: full-page redirect back to this page (serve it from 127.0.0.1; Spotify rejects "localhost").
    sessionStorage.setItem('calify.pkce', JSON.stringify({ verifier, state }))
    location.assign(url(location.origin + location.pathname))
    return
  }
  await finish(new URLSearchParams(query), redirect, verifier, state)
}

async function finish(q, redirect, verifier, state) {
  if (q.get('error')) throw new Error(q.get('error') === 'access_denied' ? 'Spotify sign-in was cancelled' : q.get('error'))
  if (q.get('state') !== state) throw new Error('Spotify sign-in failed a security check. Try again.')
  await tokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirect, code_verifier: verifier })
  await refreshLibrary()
}

export async function handleRedirect() {
  const q = new URLSearchParams(location.search)
  const saved = sessionStorage.getItem('calify.pkce')
  if (!saved || !(q.get('code') || q.get('error'))) return
  sessionStorage.removeItem('calify.pkce')
  history.replaceState(null, '', location.pathname)
  const { verifier, state } = JSON.parse(saved)
  await finish(q, location.origin + location.pathname, verifier, state)
}

export function logout() {
  saveTok(null)
  likedCache = null
  player?.disconnect()
  player = null; deviceId = null
  useStore.setState({ spotifyUser: null, spotifyPlaylists: [] })
}

async function accessToken() {
  if (!tok) throw new Error('Connect Spotify in Settings')
  if (Date.now() > tok.expires) {
    try { await tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh }) } catch (e) {
      logout()
      throw new Error('Your Spotify session expired. Connect again in Settings.', { cause: e })
    }
  }
  return tok.access
}

// ---------- Web API
async function api(path, { method = 'GET', body, retried } = {}) {
  const r = await fetch(path.startsWith('http') ? path : API + path, {
    method, headers: { Authorization: 'Bearer ' + await accessToken(), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  })
  if (r.status === 401 && !retried) { tok.expires = 0; return api(path, { method, body, retried: true }) }
  if (r.status === 204 || r.status === 202) return null
  // Dev-mode refusals come back as plain text ("Check settings on developer.spotify.com/dashboard, the user may not be registered."), not JSON.
  const raw = await r.text()
  let d = null
  try { d = raw ? JSON.parse(raw) : null } catch { /* plain-text error body */ }
  if (!r.ok) {
    const reason = d?.error?.message || raw.trim().slice(0, 200)
    const err = new Error(r.status === 429 ? 'Spotify is rate-limiting Calify. Try again in a minute.' : `Spotify error ${r.status}${reason ? `: ${reason}` : ''}`)
    err.status = r.status
    throw err
  }
  return d
}
async function all(path, max) {
  const out = []
  for (let url = path; url && out.length < max;) {
    const d = await api(url)
    out.push(...d.items)
    url = d.next
  }
  return out
}

export const toTrack = t => ({
  id: 's:' + t.id, source: 'spotify', uri: t.uri,
  title: t.name, artist: t.artists.map(a => a.name).join(', '), album: t.album?.name || '',
  art: (t.album?.images?.find(i => i.width && i.width <= 640) || t.album?.images?.[0])?.url || null,
  duration: t.duration_ms / 1000,
})
const usable = t => t && t.type === 'track' && !t.is_local

export const connected = () => !!tok
export const openLink = url => (native ? Browser.open({ url }) : window.open(url, '_blank', 'noreferrer'))

export async function refreshLibrary() {
  likedCache = null
  let me
  try { me = await api('/me') } catch (e) {
    if (e.status !== 403) throw e
    logout()
    throw new Error(`Spotify let you sign in but refused your account access (403). On your app in the Spotify developer dashboard: tick Web API (Spotify requires the app owner to have Premium), and add this Spotify account's email under User Management. Then log in again. (Spotify said: ${e.message.replace(/^Spotify error 403:?\s*/, '') || 'no reason given'})`, { cause: e })
  }
  const lists = await all('/me/playlists?limit=50', 300)
  useStore.setState({
    spotifyUser: { id: me.id, name: me.display_name || me.id, art: me.images?.[0]?.url || null },
    spotifyPlaylists: lists.filter(Boolean).map(p => ({
      kind: 'splaylist', id: p.id, name: p.name, art: p.images?.[0]?.url || null,
      sub: `Playlist • ${p.owner.display_name || p.owner.id}`, owner: p.owner.display_name || p.owner.id,
      readable: p.owner.id === me.id || p.collaborative, description: p.description,
    })),
  })
}

// Cached: Home and the Liked Songs page both read it; refreshLibrary/logout clear it.
let likedCache = null
export const liked = () => (likedCache ||= all('/me/tracks?limit=50', 2000)
  .then(l => l.map(x => x.track).filter(usable).map(toTrack))
  .catch(e => { likedCache = null; throw e }))

export async function playlistTracks(id) {
  try {
    // Feb-2026 dev mode: /tracks → /items, entry.track → entry.item, and only own/collaborative playlists return items.
    return (await all(`/playlists/${id}/items?limit=50`, 3000)).map(x => x.item || x.track).filter(usable).map(toTrack)
  } catch (e) {
    if (e.status === 403 || e.status === 404) throw new Error("Spotify only lets Calify open playlists you own or collaborate on.", { cause: e })
    throw e
  }
}

export const search = async q => ((await api(`/search?${new URLSearchParams({ q, type: 'track', limit: 10 })}`)).tracks?.items || []).filter(usable).map(toTrack)

// ---------- playback (Web Playback SDK, needs Premium + Widevine)
let player = null, deviceId = null, sdkLoad = null
const listeners = new Set()
export const onState = fn => listeners.add(fn)

function loadSdk() {
  return (sdkLoad ||= new Promise((res, rej) => {
    window.onSpotifyWebPlaybackSDKReady = res
    const s = Object.assign(document.createElement('script'), { src: 'https://sdk.scdn.co/spotify-player.js' })
    s.onerror = () => { sdkLoad = null; rej(new Error("Couldn't load the Spotify player. Check your connection.")) }
    document.head.appendChild(s)
  }))
}

async function ensurePlayer() {
  if (deviceId) return deviceId
  await loadSdk()
  player = new window.Spotify.Player({ name: 'Calify', getOAuthToken: cb => accessToken().then(cb, () => {}), volume: S().muted ? 0 : S().volume })
  const ready = new Promise((res, rej) => {
    player.addListener('ready', ({ device_id }) => res(device_id))
    player.addListener('initialization_error', () => rej(new Error(window.calify
      ? "This Calify build can't decode Spotify audio yet. It needs the Widevine version of Electron (see README)."
      : "This browser can't play Spotify audio.")))
    player.addListener('authentication_error', () => rej(new Error('Spotify rejected the sign-in. Connect again in Settings.')))
    player.addListener('account_error', () => rej(new Error('Playing full songs from Spotify needs a Premium account.')))
    setTimeout(() => rej(new Error('The Spotify player took too long to start.')), 20000)
  })
  player.addListener('player_state_changed', s => listeners.forEach(f => f(s)))
  player.addListener('playback_error', ({ message }) => S().toastMsg("Spotify couldn't play this song" + (message ? `: ${message}` : '')))
  await player.connect()
  try { deviceId = await ready } catch (e) { player.disconnect(); player = null; throw e }
  return deviceId
}

export async function playTrack(track) {
  if (native) {
    // Android: the SDK isn't supported in app WebViews, so hand the song to the Spotify app/site.
    await Browser.open({ url: `https://open.spotify.com/track/${track.uri.split(':').pop()}` })
    return
  }
  const id = await ensurePlayer()
  await player.activateElement?.()
  await api(`/me/player/play?device_id=${id}`, { method: 'PUT', body: { uris: [track.uri] } })
}

export async function resumeOrPlay(track) {
  const s = await player?.getCurrentState()
  if (s?.track_window.current_track?.uri === track.uri) return player.resume()
  return playTrack(track)
}

export const sdk = {
  pause: () => player?.pause(),
  resume: () => player?.resume(),
  seek: ms => player?.seek(Math.round(ms)),
  volume: v => player?.setVolume(v),
  state: () => player?.getCurrentState() ?? Promise.resolve(null),
}
