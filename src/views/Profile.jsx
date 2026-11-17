import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Spinner, Shelf, useAsync, TrackList, fmtLong } from '../ui'
import { Icon } from '../icons'
import { Avatar } from '../parts/TopBar'
import { THEMES, ACCENTS, accentVars, readableAccent } from '../theme'
import { inviteUser } from '../together/session'
import { getProfile, counts as getCounts, follow, unfollow, isFollowing, saveProfile, publicPlaylists, publicPlaylist, uploadImage, removeImage, useImageUrl } from '../social'
import { resizeImage } from '../image'

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export function Profile({ id }) {
  const user = useStore(s => s.user), mine = useStore(s => s.user?.id === id && s.profile)
  const viewerTheme = useStore(s => s.user && s.profile?.theme) // what App.jsx applies
  const res = useAsync(() => user ? getProfile(id) : Promise.reject(new Error('Sign in to see profiles')), [id, user?.id])
  const counts = useAsync(() => user ? getCounts(id) : Promise.resolve(null), [id, user?.id])
  const [edit, setEdit] = useState(false)
  const [delta, setDelta] = useState(0) // followers change from this viewer's own follow/unfollow
  const p = mine || res.data
  const bg = useImageUrl(p?.background_path)
  if (!p && res.loading) return <div className="view"><Spinner /></div>
  if (!p) return <div className="view empty"><h2>Couldn't open that profile</h2><p>{res.error?.message || "You may be offline."}</p></div>
  const own = user?.id === id, go = useStore.getState().go, c = counts.data
  // Owner's accent, made readable for this viewer's theme, scoped to this page only.
  const vars = { ...accentVars(p.accent, viewerTheme), '--c': 'color-mix(in srgb, var(--accent) 50%, #000)' }
  return (
    <div className="view scroll-y coll prof" style={vars}>
      <header className={`coll-head prof-head ${bg ? 'has-bg' : ''}`} style={bg ? { '--bg-img': `url("${bg}")` } : undefined}>
        <div className="coll-art prof-photo"><Avatar p={p} size={232} /></div>
        <div className="coll-info">
          <span className="coll-type">Profile</span>
          <h1 className={p.name?.length > 22 ? 'long' : ''}>{p.name}</h1>
          {p.bio && <p className="coll-desc">{p.bio}</p>}
          {c && <p className="coll-meta">{plural(c.playlists, 'public playlist')} · <a onClick={() => go({ name: 'people', id, which: 'followers' })}>{plural(c.followers + delta, 'follower')}</a> · <a onClick={() => go({ name: 'people', id, which: 'following' })}>{c.following} following</a></p>}
        </div>
      </header>
      <div className="coll-body">
        <div className="action-bar">
          {own ? <button className="outline-btn" onClick={() => setEdit(true)}><Icon name="edit" size={16} /> Edit</button>
            : <FollowButton id={id} onChange={d => setDelta(x => x + d)} />}
        </div>
        {p.last_played?.title && <LastPlayed lp={p.last_played} />}
        <PublicPlaylists id={id} />
        <div className="view-foot" />
      </div>
      {edit && <EditProfile p={p} onClose={() => setEdit(false)} />}
    </div>
  )
}

// Optimistic: flips at once, reverts with a toast if the write fails.
function FollowButton({ id, onChange }) {
  const st = useAsync(() => isFollowing(id), [id])
  const [on, setOn] = useState(null), [busy, setBusy] = useState(false)
  const v = on ?? st.data
  if (v === undefined) return null
  const click = async () => {
    setBusy(true); setOn(!v); onChange(v ? -1 : 1)
    try { await (v ? unfollow : follow)(id) } catch (e) { setOn(v); onChange(v ? 1 : -1); useStore.getState().toastMsg(e.message) }
    setBusy(false)
  }
  return <>
    <button className="outline-btn" disabled={busy} aria-pressed={v} onClick={click}>{v ? 'Following' : 'Follow'}</button>
    {v && <InviteButton id={id} />}
  </>
}

// Listen together: the host invites people it follows (the server checks both); the invite counts as approval.
function InviteButton({ id }) {
  const show = useStore(s => s.together?.role === 'host' && !s.together.members.some(m => m.id === id))
  const [st, setSt] = useState(null) // 'busy' | 'sent'
  if (!show) return null
  const click = () => {
    setSt('busy')
    inviteUser(id).then(() => { setSt('sent'); useStore.getState().toastMsg('Invite sent') }, e => { setSt(null); useStore.getState().toastMsg(e.message) })
  }
  return <button className="outline-btn" disabled={!!st} onClick={click}>{st === 'sent' ? 'Invited' : 'Invite'}</button>
}

// Shown, not playable.
function LastPlayed({ lp }) {
  const art = useImageUrl(lp.art_path)
  return (
    <section className="shelf prof-sec">
      <header className="shelf-head"><h2>Last played</h2></header>
      <div className="lp-row">
        {art ? <img className="art" src={art} alt="" /> : <div className="art art-empty"><Icon name="note" size="40%" /></div>}
        <div className="q-text"><b>{lp.title}</b><small>{lp.artist}</small></div>
      </div>
    </section>
  )
}

function PublicPlaylists({ id }) {
  const res = useAsync(() => publicPlaylists(id), [id])
  const go = useStore.getState().go
  if (!res.data?.length) return null
  return (
    <Shelf title="Public playlists">
      <div className="card-row">{res.data.map(p => <PlaylistCard key={p.id} p={p} onClick={() => go({ name: 'pplaylist', id: p.id })} />)}</div>
    </Shelf>
  )
}
function PlaylistCard({ p, onClick }) {
  const art = useImageUrl(p.cover_path)
  return (
    <div className="card" role="link" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="card-art">{art ? <img className="art" src={art} alt="" /> : <div className="art art-empty"><Icon name="note" size="40%" /></div>}</div>
      <div className="card-title">{p.name}</div>
      <div className="card-sub">Playlist</div>
    </div>
  )
}

// Someone's public playlist: header and table only, nothing playable.
export function PublicPlaylist({ id }) {
  const user = useStore(s => s.user), go = useStore.getState().go
  const res = useAsync(() => user ? publicPlaylist(id) : Promise.reject(new Error('Sign in to see playlists')), [id, user?.id])
  const owner = useAsync(() => res.data ? getProfile(res.data.owner) : Promise.resolve(null), [res.data?.owner])
  const art = useImageUrl(res.data?.cover_path)
  if (res.loading) return <div className="view"><Spinner /></div>
  const p = res.data
  if (!p) return <div className="view empty"><h2>Couldn't open that</h2><p>{res.error?.message || 'It may have been made private, or you are offline.'}</p></div>
  const tracks = p.tracks.map((t, i) => ({ ...t, id: `${p.id}:${i}` }))
  const total = tracks.reduce((a, t) => a + (t.duration || 0), 0)
  return (
    <div className="view scroll-y coll" style={{ '--c': 'hsl(24 22% 18%)' }}>
      <header className="coll-head">
        <div className="coll-art">{art ? <img className="art" src={art} alt="" /> : <div className="art art-empty"><Icon name="note" size="40%" /></div>}</div>
        <div className="coll-info">
          <span className="coll-type">Public playlist</span>
          <h1 className={p.name.length > 22 ? 'long' : ''}>{p.name}</h1>
          <p className="coll-meta">{owner.data && <><a onClick={() => go({ name: 'profile', id: p.owner })}><b>{owner.data.name}</b></a> • </>}{plural(tracks.length, 'song')}{total > 0 && `, ${fmtLong(total)}`}</p>
        </div>
      </header>
      <div className="coll-body">
        {tracks.length > 0 && <TrackList tracks={tracks} readOnly />}
        <div className="view-foot" />
      </div>
    </div>
  )
}

// Picks an image, shows it resized, uploads only on Save.
function useImagePick(max) {
  const [pick, setPick] = useState(null) // { blob, url }
  useEffect(() => () => pick && URL.revokeObjectURL(pick.url), [pick])
  const onChange = e => {
    const f = e.target.files[0]
    e.target.value = ''
    if (f) resizeImage(f, max).then(blob => setPick({ blob, url: URL.createObjectURL(blob) }), err => useStore.getState().toastMsg(err.message))
  }
  return [pick, onChange]
}

function EditProfile({ p, onClose }) {
  const [name, setName] = useState(p.name || '')
  const [bio, setBio] = useState(p.bio || '')
  const [theme, setTheme] = useState(p.theme || 'calico')
  const [accent, setAccent] = useState(p.accent || ACCENTS[0])
  const [photo, pickPhoto] = useImagePick(512)
  const [back, pickBack] = useImagePick()
  const [busy, setBusy] = useState(false)
  const photoNow = useImageUrl(p.avatar_path), backNow = useImageUrl(p.background_path)
  const save = async e => {
    e.preventDefault()
    setBusy(true)
    try {
      const patch = { name, bio, theme, accent: readableAccent(accent, theme) }
      if (photo) patch.avatar_path = await uploadImage('avatar', photo.blob)
      if (back) patch.background_path = await uploadImage('background', back.blob)
      await saveProfile(patch) // App.jsx re-applies the theme from the saved profile
      if (photo) removeImage(p.avatar_path)
      if (back) removeImage(p.background_path)
      onClose()
    } catch (err) { useStore.getState().toastMsg(err.message); setBusy(false) }
  }
  return (
    <div className="dialog-scrim" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <form className="dialog prof-edit" role="dialog" aria-modal="true" aria-label="Edit profile" onSubmit={save}>
        <header><h2>Edit profile</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button></header>
        <div className="pe-images">
          <label className="pe-photo" title="Choose photo">
            {photo?.url || photoNow ? <img src={photo?.url || photoNow} alt="" /> : <Icon name="user" size={40} />}
            <input type="file" accept="image/*" onChange={pickPhoto} aria-label="Choose photo" />
          </label>
          <label className="pe-back" title="Choose background" style={back || backNow ? { backgroundImage: `url("${back?.url || backNow}")` } : undefined}>
            <span>{back || backNow ? 'Change background' : 'Add background'}</span>
            <input type="file" accept="image/*" onChange={pickBack} aria-label="Choose background" />
          </label>
        </div>
        <label className="field"><span>Name</span><input autoFocus required value={name} maxLength={40} onChange={e => setName(e.target.value)} /></label>
        <label className="field"><span>Bio</span><textarea value={bio} maxLength={160} placeholder="Say something about you" onChange={e => setBio(e.target.value)} /></label>
        <fieldset className="field pe-set"><legend>Theme</legend>
          <div className="pe-themes">{THEMES.map(t => (
            <label key={t}><input type="radio" name="theme" value={t} checked={theme === t} onChange={() => setTheme(t)} />{t[0].toUpperCase() + t.slice(1)}</label>
          ))}</div>
        </fieldset>
        <fieldset className="field pe-set"><legend>Accent</legend>
          <div className="swatches">
            {ACCENTS.map(a => <button key={a} type="button" className={`swatch ${accent === a ? 'on' : ''}`} style={{ background: a }} aria-label={a} aria-pressed={accent === a} onClick={() => setAccent(a)} />)}
            <input type="color" className="swatch custom" value={accent} aria-label="Custom accent" onChange={e => setAccent(e.target.value)} />
          </div>
        </fieldset>
        <button className="white-btn right" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  )
}
