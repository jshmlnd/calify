import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { dropAudius, dropSpotify } from './migrate'

const uid = () => Math.random().toString(36).slice(2, 10)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const dedupe = (item, list, max) => [item, ...list.filter(x => !(x.kind === item.kind && x.id === item.id))].slice(0, max)

let toastTimer
const HOST_ONLY = "This song is on the host's device, so it can't be saved here"
export const useStore = create(persist((set, get) => ({
  // ---- library
  name: 'You',
  lastSeenVersion: null,
  playlists: [],        // { id, name, description, tracks: [], createdAt }
  liked: [],            // tracks, newest first
  pinned: ['liked'],
  recents: [],          // collection items: { kind, id, name, art, sub }
  recentSearches: [],   // collection items or { kind: 'track', track }
  history: [],          // recently played tracks
  local: [], localArt: {}, // loaded from IndexedDB at boot (not persisted)

  // ---- account (src/supabase.js; persisted so theme/profile show before the network)
  user: null,           // { id, email, name, avatarUrl }
  profile: null,        // profiles row

  // ---- player
  current: null, playing: false,
  ctx: null, ctxTracks: [], order: [], pos: -1, upNext: [],
  shuffle: false, repeat: 'off', volume: 0.8, muted: false,

  // ---- ui
  nav: [{ name: 'home' }], navI: 0,
  panel: null,            // 'np' | 'queue' | 'devices' | 'together'
  libCollapsed: false, libWidth: 340, libSort: 'recents', libFilter: null,
  privateSession: false, mini: false, fullscreen: false, npOpen: false, zoom: 1,
  toast: null, menu: null, dialog: null,
  together: null,         // Listen together session (src/together/session.js); never persisted
  invite: null,           // { code, from, name }: a Listen together invite waiting for Join / Not now

  go: route => set(s => {
    if (same(s.nav[s.navI], route)) return { npOpen: false }
    return { nav: [...s.nav.slice(0, s.navI + 1), route].slice(-50), navI: Math.min(s.navI + 1, 49), npOpen: false }
  }),
  back: () => set(s => ({ navI: Math.max(0, s.navI - 1) })),
  fwd: () => set(s => ({ navI: Math.min(s.nav.length - 1, s.navI + 1) })),
  setPanel: p => set(s => ({ panel: s.panel === p ? null : p })),
  toastMsg: text => {
    clearTimeout(toastTimer)
    set({ toast: text })
    toastTimer = setTimeout(() => set({ toast: null }), 2600)
  },
  openMenu: (e, items) => {
    e.preventDefault(); e.stopPropagation()
    // Right-click opens at the pointer; button menus drop below their button so the top-bar ones
    // clear the native window controls (they cover the top 64px on the right).
    const r = e.currentTarget?.getBoundingClientRect?.()
    const atPointer = e.type === 'contextmenu' || !r
    const x = atPointer ? e.clientX : r.left, y = atPointer ? e.clientY : r.bottom + 8
    set({ menu: { x, y, items } })
  },

  toggleLike: t => {
    if (t.fromHost) return get().toastMsg(HOST_ONLY)
    const has = get().liked.some(x => x.id === t.id)
    set(s => ({ liked: has ? s.liked.filter(x => x.id !== t.id) : [{ ...t, addedAt: Date.now() }, ...s.liked] }))
    get().toastMsg(has ? 'Removed from Liked Songs' : 'Added to Liked Songs')
  },
  createPlaylist: (tracks = [], meta = {}) => {
    if (tracks.some(t => t.fromHost)) return get().toastMsg(HOST_ONLY)
    const id = uid()
    const n = get().playlists.length + 1
    set(s => ({ playlists: [{ id, name: meta.name || `My Playlist #${n}`, description: meta.description || '', tracks: tracks.map(t => ({ ...t, addedAt: Date.now() })), createdAt: Date.now() }, ...s.playlists] }))
    get().go({ name: 'collection', kind: 'playlist', id })
    return id
  },
  updatePlaylist: (id, patch) => set(s => ({ playlists: s.playlists.map(p => p.id === id ? { ...p, ...patch } : p) })),
  deletePlaylist: id => {
    const p = get().playlists.find(x => x.id === id)
    if (p?.public && p.public !== get().user?.id) return get().toastMsg('Sign in to delete a public playlist, or make it private first')
    set(s => ({ playlists: s.playlists.filter(p => p.id !== id), recents: s.recents.filter(r => r.id !== id) }))
    get().go({ name: 'home' })
    get().toastMsg('Removed from Your Library')
  },
  addToPlaylist: (id, tracks) => {
    if (tracks.some(t => t.fromHost)) return get().toastMsg(HOST_ONLY)
    const p = get().playlists.find(x => x.id === id)
    const fresh = tracks.filter(t => !p.tracks.some(x => x.id === t.id))
    get().updatePlaylist(id, { tracks: [...p.tracks, ...fresh.map(t => ({ ...t, addedAt: Date.now() }))] })
    get().toastMsg(fresh.length ? `Added to ${p.name}` : `Already in ${p.name}`)
  },
  removeFromPlaylist: (id, trackId) => {
    const p = get().playlists.find(x => x.id === id)
    get().updatePlaylist(id, { tracks: p.tracks.filter(t => t.id !== trackId) })
  },
  togglePin: id => set(s => ({ pinned: s.pinned.includes(id) ? s.pinned.filter(x => x !== id) : [...s.pinned, id] })),
  addRecent: item => !get().privateSession && item && set(s => ({ recents: dedupe({ ...item, at: Date.now() }, s.recents, 30) })),
  addRecentSearch: item => set(s => ({ recentSearches: dedupe(item, s.recentSearches, 10) })),
  pushHistory: t => !get().privateSession && set(s => ({ history: [t, ...s.history.filter(x => x.id !== t.id)].slice(0, 50) })),
}), {
  name: 'calify',
  version: 3,
  // 1.0 Spotify users: also delete the leftover login token
  migrate: (s, v) => { if (v < 2) s = dropAudius(s); if (v < 3) { s = dropSpotify(s); try { localStorage.removeItem('calify.spotify') } catch {} } return s },
  // A Listen together listener's `current` mirrors the host's song (metadata only): persist their own track instead.
  partialize: s => Object.fromEntries(Object.entries({ ...s, current: s.together?.role === 'listener' ? s.together.saved : s.current }).filter(([k, v]) => typeof v !== 'function' && ![
    'local', 'localArt', 'playing', 'panel', 'nav', 'navI', 'toast', 'menu', 'dialog', 'mini', 'fullscreen', 'npOpen', 'together', 'invite',
  ].includes(k))),
}))

export const route = () => { const s = useStore.getState(); return s.nav[s.navI] }
export const useRoute = () => useStore(s => s.nav[s.navI])
export const useArt = t => useStore(s => t && (t.art || s.localArt[t.id]))
export const isDesktopApp = !!window.calify
