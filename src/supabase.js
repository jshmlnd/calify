import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { useStore } from './store'
import { codeFrom } from './authcode'

const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
// No env (forks, local builds): social features hide; local playback is unaffected.
export const supabase = URL_ && KEY ? createClient(URL_, KEY, { auth: { flowType: 'pkce', detectSessionInUrl: false } }) : null

const native = Capacitor.isNativePlatform()
// Each must be in the Supabase redirect allow-list. Desktop: main.cjs catches 127.0.0.1:43821; Android: the calify://auth intent filter.
const redirectTo = window.calify ? 'http://127.0.0.1:43821/callback' : native ? 'calify://auth' : location.origin

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Sign-in isn’t set up in this build')
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } })
  if (error) throw error
  // IPC prefixes main's errors with "Error invoking remote method…"; show only main's own message.
  if (window.calify) return exchange(await window.calify.auth(data.url).catch(e => { throw new Error(e.message.replace(/^Error invoking remote method 'auth': (Error: )?/, '')) }))
  if (native) return Browser.open({ url: data.url }) // finishes in App.jsx's appUrlOpen → finishSignIn
  location.assign(data.url) // browser dev: comes back to location.origin?code=…, handled in initAuth
}

// Turns a callback URL/query into a session; onAuthStateChange then fills the store.
export async function exchange(query) {
  const { error } = await supabase.auth.exchangeCodeForSession(codeFrom(query))
  if (error) throw error
}

export async function finishSignIn(url) {
  try { await exchange(url) } finally { if (native) Browser.close().catch(() => {}) }
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

async function setUser(u) {
  if (!u) return useStore.setState({ user: null, profile: null })
  const m = u.user_metadata || {}
  useStore.setState({ user: { id: u.id, email: u.email, name: m.full_name || m.name || u.email, avatarUrl: m.avatar_url || m.picture || null } })
  // Offline: keep the persisted profile.
  const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle()
  if (data) useStore.setState({ profile: data })
}

export function initAuth() {
  if (!supabase) return
  // Supabase holds its auth lock during this callback, so query outside it.
  supabase.auth.onAuthStateChange((event, session) => event !== 'TOKEN_REFRESHED' && setTimeout(() => setUser(session?.user).catch(() => {})))
  if (!window.calify && !native && new URLSearchParams(location.search).has('code')) {
    const q = location.search
    history.replaceState(null, '', location.pathname)
    exchange(q).catch(e => useStore.getState().toastMsg(e.message))
  }
}
