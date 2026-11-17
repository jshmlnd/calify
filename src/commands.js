import { useStore, isDesktopApp } from './store'
import { toggle, next, prev, seekBy, setShuffle, cycleRepeat, setVolume, pause } from './player'
import { importFiles, removeLocal } from './local'
import { dropTracks } from './prune'
import { supabase } from './supabase'
import { Capacitor } from '@capacitor/core'
import { checkForUpdate, installUpdate } from './updates'

const S = () => useStore.getState()

export function pickLocalFiles() {
  const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: 'audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.lrc' })
  input.onchange = async () => {
    if (!input.files.length) return
    S().toastMsg('Importing…')
    try {
      const { tracks, art, count } = await importFiles(input.files, (i, n) => S().toastMsg(`Importing ${i} of ${n}…`))
      useStore.setState(s => ({ local: tracks, localArt: { ...s.localArt, ...art } }))
      S().toastMsg(count ? `Added ${count} song${count > 1 ? 's' : ''} to Local Files` : 'No audio files found')
      if (count) S().go({ name: 'collection', kind: 'local', id: 'local' })
    } catch (e) { S().toastMsg('Import failed: ' + e.message) }
  }
  input.click()
}

export async function removeLocalTrack(id) {
  const t = S().local.find(x => x.id === id)
  if (!t || !confirm(`Remove "${t.title}" from Calify? The original file on your device is not touched.`)) return
  try {
    const rest = await removeLocal(id)
    if (S().current?.id === id) pause()
    const art = S().localArt[id]
    if (art) URL.revokeObjectURL(art)
    useStore.setState(s => {
      const localArt = { ...s.localArt }
      delete localArt[id]
      return { ...dropTracks(s, x => x.id === id, new Set()), local: rest, localArt }
    })
  } catch (e) { return S().toastMsg("Couldn't remove: " + e.message) }
  S().toastMsg('Removed from Calify')
}

const zoom = f => {
  const z = f === 1 ? 1 : Math.min(2, Math.max(0.5, Math.round((S().zoom + f) * 10) / 10))
  useStore.setState({ zoom: z })
  window.calify?.zoom(z)
}

export const cmd = {
  newPlaylist: () => S().createPlaylist(),
  privateSession: () => { useStore.setState(s => ({ privateSession: !s.privateSession })); S().toastMsg(S().privateSession ? 'Private session started' : 'Private session ended') },
  exit: () => window.calify?.quit(),
  search: () => { S().go({ name: 'search', q: '' }); setTimeout(() => document.getElementById('search-input')?.focus(), 0) },
  filter: () => { useStore.setState({ libCollapsed: false, libFilterOpen: true }); setTimeout(() => document.getElementById('lib-filter')?.focus(), 0) },
  prefs: () => S().go({ name: 'settings' }),
  volume: d => setVolume(S().volume + d),
  zoomIn: () => zoom(0.1), zoomOut: () => zoom(-0.1), zoomReset: () => zoom(1),
  about: () => useStore.setState({ dialog: 'about' }),
  bug: () => useStore.setState({ dialog: 'bug' }),
}

// "Check for updates". quiet = the startup check: it says nothing unless there is an update to offer.
export const canUpdate = () => !!window.calify?.updates || Capacitor.getPlatform() === 'android'
export async function checkUpdates(quiet) {
  const say = m => quiet || S().toastMsg(m)
  const desk = window.calify?.updates
  if (desk) {
    const r = await desk.check()
    if (r === 'none') say("You're up to date")
    else if (r === 'downloading') say('Downloading update…')
    else if (r === 'error') say("Couldn't check for updates. Try again later.")
    return   // 'ready': the update bar (onReady) already says so
  }
  try {
    const info = await checkForUpdate()
    if (!info) return say("You're up to date")
    if (quiet) useStore.setState({ update: info })   // the update bar offers it; never download unasked
    else await installAndroid(info)
  } catch { say("Couldn't check for updates. Try again later.") }
}
// Android: download the APK, then Android shows its install prompt.
export function installAndroid(info) {
  useStore.setState({ update: null })
  S().toastMsg('Downloading update…')
  return installUpdate(info).catch(() => S().toastMsg("Couldn't download the update. Try again later."))
}

const edit = c => () => {
  if (c === 'paste') navigator.clipboard?.readText().then(t => document.execCommand('insertText', false, t)).catch(() => {})
  else document.execCommand(c)
}

export const appMenu = () => [
  { label: 'File', sub: [
    { label: 'New Playlist', shortcut: 'Ctrl+N', onClick: cmd.newPlaylist },
    { label: 'Import Local Files…', onClick: pickLocalFiles },
    '-',
    { label: 'Private Session', checked: S().privateSession, onClick: cmd.privateSession },
    ...(isDesktopApp ? ['-', { label: 'Exit', shortcut: 'Ctrl+Shift+Q', onClick: cmd.exit }] : []),
  ] },
  { label: 'Edit', sub: [
    { label: 'Undo', shortcut: 'Ctrl+Z', onClick: edit('undo') },
    { label: 'Redo', shortcut: 'Ctrl+Y', onClick: edit('redo') },
    '-',
    { label: 'Cut', shortcut: 'Ctrl+X', onClick: edit('cut') },
    { label: 'Copy', shortcut: 'Ctrl+C', onClick: edit('copy') },
    { label: 'Paste', shortcut: 'Ctrl+V', onClick: edit('paste') },
    { label: 'Delete', shortcut: 'Del', onClick: edit('delete') },
    '-',
    { label: 'Select All', shortcut: 'Ctrl+A', onClick: edit('selectAll') },
    '-',
    { label: 'Search', shortcut: 'Ctrl+L', onClick: cmd.search },
    { label: 'Filter', shortcut: 'Ctrl+F', onClick: cmd.filter },
    '-',
    { label: 'Preferences…', shortcut: 'Ctrl+P', onClick: cmd.prefs },
  ] },
  { label: 'View', sub: [
    { label: 'Zoom In', shortcut: 'Ctrl+=', onClick: cmd.zoomIn, disabled: !isDesktopApp },
    { label: 'Zoom Out', shortcut: 'Ctrl+-', onClick: cmd.zoomOut, disabled: !isDesktopApp },
    { label: 'Reset Zoom', shortcut: 'Ctrl+0', onClick: cmd.zoomReset, disabled: !isDesktopApp },
  ] },
  { label: 'Playback', sub: [
    { label: S().playing ? 'Pause' : 'Play', shortcut: 'Space', onClick: toggle },
    '-',
    { label: 'Next', shortcut: 'Ctrl+Right Arrow', onClick: () => next() },
    { label: 'Previous', shortcut: 'Ctrl+Left Arrow', onClick: prev },
    { label: 'Seek Forward', shortcut: 'Shift+Right Arrow', onClick: () => seekBy(5) },
    { label: 'Seek Backward', shortcut: 'Shift+Left Arrow', onClick: () => seekBy(-5) },
    '-',
    { label: 'Shuffle', shortcut: 'Ctrl+S', checked: S().shuffle, onClick: () => setShuffle(!S().shuffle) },
    { label: 'Repeat', shortcut: 'Ctrl+R', checked: S().repeat !== 'off', onClick: cycleRepeat },
    '-',
    { label: 'Volume Up', shortcut: 'Ctrl+Up Arrow', onClick: () => cmd.volume(0.1) },
    { label: 'Volume Down', shortcut: 'Ctrl+Down Arrow', onClick: () => cmd.volume(-0.1) },
  ] },
  { label: 'Help', sub: [
    { label: 'Keyboard Shortcuts', onClick: () => useStore.setState({ dialog: 'keys' }) },
    ...(supabase ? [{ label: 'Report a bug', onClick: cmd.bug }] : []),
    '-',
    { label: 'About Calify', onClick: cmd.about },
  ] },
]

export function onKey(e) {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  let fn
  if (ctrl && e.shiftKey && k === 'q') fn = cmd.exit
  else if (ctrl && !e.shiftKey) {
    fn = {
      n: cmd.newPlaylist, l: cmd.search, f: cmd.filter, p: cmd.prefs,
      s: () => setShuffle(!S().shuffle), r: cycleRepeat,
      '=': cmd.zoomIn, '+': cmd.zoomIn, '-': cmd.zoomOut, 0: cmd.zoomReset,
      ...(!typing && {
        ArrowRight: () => next(), ArrowLeft: prev,
        ArrowUp: () => cmd.volume(0.1), ArrowDown: () => cmd.volume(-0.1),
      }),
    }[k]
  } else if (!typing && e.shiftKey && !ctrl) {
    fn = { ArrowRight: () => seekBy(5), ArrowLeft: () => seekBy(-5) }[k]
  } else if (!typing && !ctrl && k === ' ' && !/^(BUTTON|A)$/.test(e.target.tagName)) fn = toggle
  if (fn) { e.preventDefault(); fn() }
}
