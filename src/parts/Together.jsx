// Listen together: the session panel (right panel on desktop, full-screen sheet on phones) and the invite prompt.
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../store'
import { Icon } from '../icons'
import { TrackArt, Spinner } from '../ui'
import { supabase } from '../supabase'
import { removeFromUpNext } from '../player'
import { startSession, joinSession, answerJoin, sendChat, requestQueue, requestLibrary, leaveSession } from '../together/session'
import { cleanChat, MAX_CHAT } from '../together/rules'
import { Avatar, signInCmd } from './TopBar'

const toast = m => useStore.getState().toastMsg(m)
const useJoining = create(() => ({ on: false }))   // a join is waiting for the host
export const joinLink = code => `https://calify.zjkm.tech/calify/join?c=${code}`

// Join by code, link or invite; the panel shows "Asking the host…" meanwhile.
export async function join(input, opts) {
  useStore.setState({ panel: 'together', npOpen: false, invite: null })
  if (!supabase || !useStore.getState().user) return toast('Sign in to listen together')
  useJoining.setState({ on: true })
  try { await joinSession(input, opts) } catch (e) { toast(e.message) } finally { useJoining.setState({ on: false }) }
}

export function TogetherPanel({ onClose }) {
  const t = useStore(s => s.together), user = useStore(s => s.user)
  return (
    <div className="rp-scroll tg">
      <header className="rp-head">
        <h3>{t ? `Listening together · ${t.code}` : 'Listen together'}</h3>
        <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}><Icon name="close" size={16} /></button>
      </header>
      {!supabase ? <p className="tg-note">Listen together isn't available in this build.</p>
        : !user ? <div className="tg-idle"><p>Sign in to listen with friends.</p><button className="white-btn" onClick={signInCmd}>Sign in with Google</button></div>
        : t ? <Session t={t} me={user.id} /> : <Idle />}
    </div>
  )
}

function Idle() {
  const joining = useJoining(s => s.on)
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false)
  if (joining) return <div className="tg-idle"><Spinner /><p>Asking the host to let you in…</p><button className="outline-btn" onClick={leaveSession}>Cancel</button></div>
  const start = () => { setBusy(true); startSession().catch(e => toast(e.message)).finally(() => setBusy(false)) }
  return (
    <div className="tg-idle">
      <p>Listen with up to 4 friends. You control the music, everyone hears the same moment, and you can chat.</p>
      <button className="white-btn" disabled={busy} onClick={start}>Start a session</button>
      <form className="tg-join" onSubmit={e => { e.preventDefault(); join(code) }}>
        <label className="field"><span>Join with a code</span><input value={code} placeholder="CALI-0000" autoComplete="off" spellCheck="false" onChange={e => setCode(e.target.value)} /></label>
        <button className="outline-btn" disabled={!code.trim()}>Join</button>
      </form>
    </div>
  )
}

function Session({ t, me }) {
  const host = t.role === 'host'
  const [tab, setTab] = useState('session')
  const copy = () => navigator.clipboard.writeText(joinLink(t.code)).then(() => toast('Link copied'), () => toast(joinLink(t.code)))
  return <>
    {!host && (
      <div className="rp-head tabs tg-tabs">
        <button className={tab === 'session' ? 'on' : ''} onClick={() => setTab('session')}>Session</button>
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>Host's library</button>
      </div>
    )}
    {tab === 'library' && !host ? <HostLibrary t={t} /> : <>
      <div className="tg-body scroll-y">
        <div className="tg-members">
          {t.members.map(m => (
            <span key={m.id} className="tg-member"><Avatar p={m} size={28} /><span>{m.name}{m.id === me && ' (You)'}{m.id === t.hostId && <small> · Host</small>}</span></span>
          ))}
        </div>
        {host && t.pending.map(r => (
          <div key={r.id} className="tg-pending" role="alert">
            <span><b>{r.name}</b> wants to join</span>
            <button className="outline-btn sm" onClick={() => answerJoin(r.id, true)}>Allow</button>
            <button className="mini-link" onClick={() => answerJoin(r.id, false)}>Deny</button>
          </div>
        ))}
        <NowAndNext t={t} host={host} />
        <Chat t={t} me={me} />
      </div>
      <ChatInput />
    </>}
    <div className="tg-actions">
      <button className="outline-btn sm" onClick={copy}>Copy link</button>
      <button className="outline-btn sm" onClick={leaveSession}>{host ? 'End session' : 'Leave'}</button>
    </div>
  </>
}

function NowAndNext({ t, host }) {
  const current = useStore(s => s.current), upNext = useStore(s => s.upNext)
  const next = host ? upNext : t.hostNow?.next || []
  return <>
    <h4 className="tg-h">Now playing</h4>
    {current ? <div className="q-row"><div className="q-art"><TrackArt track={current} /></div><div className="q-text"><b>{current.title}</b><small>{current.artist}</small></div></div>
      : <p className="tg-note">Nothing yet.</p>}
    {next.length > 0 && <>
      <h4 className="tg-h">Next</h4>
      {next.map((x, i) => (
        <div key={i} className="q-row">
          <div className="q-text grow"><b>{x.title}</b><small>{x.artist}{x.addedBy && ` · added by ${x.addedBy}`}</small></div>
          {host && <button className="icon-btn" aria-label={`Remove ${x.title}`} title="Remove" onClick={() => removeFromUpNext(i)}><Icon name="close" size={16} /></button>}
        </div>
      ))}
    </>}
  </>
}

function Chat({ t, me }) {
  const end = useRef()
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [t.chat.length])
  return (
    <div className="tg-chat" aria-live="polite">
      {t.chat.map((m, i) => m.kind === 'event' ? <p key={i} className="tg-event">{m.text}</p>
        : <p key={i}><b>{m.from === me ? 'You' : m.name}</b> {m.text}</p>)}
      <i ref={end} />
    </div>
  )
}

function ChatInput() {
  const [text, setText] = useState('')
  const ok = !!cleanChat(text)
  return (
    <form className="tg-input" onSubmit={e => { e.preventDefault(); if (ok) { sendChat(text); setText('') } }}>
      <input value={text} maxLength={MAX_CHAT} placeholder="Message…" aria-label="Message" onChange={e => setText(e.target.value)} />
      <button className="outline-btn sm" disabled={!ok}>Send</button>
    </form>
  )
}

const SHOWN = 200   // rows rendered at once; search narrows a big library
function HostLibrary({ t }) {
  const [q, setQ] = useState('')
  useEffect(() => { if (!t.hostLibrary && !t.libError) requestLibrary() }, [])
  if (t.libError) return <div className="tg-idle"><p>Couldn't load the host's library.</p><button className="outline-btn" onClick={requestLibrary}>Try again</button></div>
  if (!t.hostLibrary) return <Spinner />
  const k = q.trim().toLowerCase()
  const hits = k ? t.hostLibrary.filter(x => `${x.title} ${x.artist} ${x.album}`.toLowerCase().includes(k)) : t.hostLibrary
  return (
    <div className="tg-body scroll-y">
      <label className="find-input tg-find"><Icon name="search" size={16} /><input value={q} placeholder="Search the host's library" onChange={e => setQ(e.target.value)} /></label>
      {hits.slice(0, SHOWN).map(x => (
        <div key={x.id} className="q-row">
          <div className="q-text grow"><b>{x.title}</b><small>{x.artist}</small></div>
          <button className="outline-btn sm" onClick={() => requestQueue(x.id)}>Add to queue</button>
        </div>
      ))}
      {hits.length > SHOWN && <p className="tg-note">Showing {SHOWN} of {hits.length}. Search to find more.</p>}
      {!hits.length && <p className="tg-note">{t.hostLibrary.length ? 'No matches.' : "The host's library is empty."}</p>}
    </div>
  )
}

// "Mia invited you to listen together — Join / Not now"
export function InvitePrompt() {
  const inv = useStore(s => s.invite)
  if (!inv) return null
  const no = () => useStore.setState({ invite: null })
  return (
    <div className="dialog-scrim" onPointerDown={e => e.target === e.currentTarget && no()}>
      <div className="dialog tg-invite" role="dialog" aria-modal="true" aria-label="Listen together invite">
        <p><b>{inv.name}</b> invited you to listen together</p>
        <div className="tg-row">
          <button className="outline-btn" onClick={no}>Not now</button>
          <button className="white-btn" autoFocus onClick={() => join(inv.code, { invited: true })}>Join</button>
        </div>
      </div>
    </div>
  )
}
