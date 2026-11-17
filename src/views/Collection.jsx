import { useState } from 'react'
import { useStore } from '../store'
import { Art, BigPlay, Spinner, TrackList, TrackArt, fmtLong, useAsync, useMobile } from '../ui'
import { useColor } from '../color'
import { Icon } from '../icons'
import { setShuffle, addToQueue } from '../player'
import { itemMenu } from '../parts/Library'
import { pickLocalFiles } from '../commands'
import { CaliCat } from '../parts/CaliCat'

function useCollection(kind, id) {
  const s = useStore()
  const owner = { owner: s.name }
  switch (kind) {
    case 'liked': return { kind, id, name: 'Liked Songs', type: 'Playlist', tracks: s.liked, ...owner }
    case 'local': return { kind, id, name: 'Local Files', type: 'Playlist', tracks: s.local, ...owner, description: 'Music files on this device' }
    case 'history': return { kind, id, name: 'Recently played', type: 'Playlist', tracks: s.history, ...owner }
    case 'playlist': {
      const p = s.playlists.find(x => x.id === id)
      return p ? { kind, id, name: p.name, description: p.description, type: p.public ? 'Public playlist' : 'Playlist', public: !!p.public, tracks: p.tracks, editable: true, ...owner } : { missing: true }
    }
    default: return { missing: true }
  }
}

export function Collection({ kind, id }) {
  const c = useCollection(kind, id)
  const [scrolled, setScrolled] = useState(false)
  const [edit, setEdit] = useState(false)
  const [find, setFind] = useState(false)
  const { openMenu, shuffle, updatePlaylist, deletePlaylist } = useStore()
  const mobile = useMobile()
  const signedIn = useStore(s => !!s.user)
  const cover = c.art || c.tracks?.find(t => t.art)?.art
  const color = useColor(kind === 'liked' ? null : cover, kind === 'liked' ? 'liked' : c.name, 0.34, 0.6)
  const bg = kind === 'liked' ? 'hsl(24 62% 36%)' : kind === 'local' ? 'hsl(24 22% 18%)' : color
  if (c.loading) return <div className="view"><Spinner /></div>
  if (c.error || c.missing) return <div className="view empty"><h2>Couldn't open that</h2><p>{c.error?.message || "It may have been removed, or you're offline."}</p></div>
  const item = { kind, id, name: c.name, art: cover, sub: c.sub || `${c.type} • ${c.owner || ''}` }
  const total = c.tracks.reduce((a, t) => a + (t.duration || 0), 0)
  const menu = e => openMenu(e, [
    { label: 'Add to queue', icon: 'queue', onClick: () => addToQueue(c.tracks) },
    c.editable && { label: 'Edit details', icon: 'edit', onClick: () => setEdit(true) },
    c.editable && signedIn && { label: c.public ? 'Make private' : 'Make public', onClick: () => updatePlaylist(id, { public: !c.public }) },
    c.editable && { label: 'Delete', icon: 'trash', onClick: () => confirm(`Delete "${c.name}"? This can't be undone.`) && deletePlaylist(id) },
    kind === 'local' && { label: 'Import more files', icon: 'file', onClick: pickLocalFiles },
    ...(['liked', 'playlist', 'local'].includes(kind) ? itemMenu(item).slice(1) : []),
  ].filter(Boolean))
  return (
    <div className="view scroll-y coll" style={{ '--c': bg }} onScroll={e => setScrolled(e.currentTarget.scrollTop > (mobile ? 240 : 300))}>
      <div className={`sticky-head ${scrolled ? 'show' : ''}`}>
        <BigPlay item={item} size={48} /><h3>{c.name}</h3>
      </div>
      <header className="coll-head">
        <div className="coll-art" onClick={() => c.editable && setEdit(true)}>
          <Art item={{ ...item, art: cover }} />
        </div>
        <div className="coll-info">
          <span className="coll-type">{c.type}</span>
          <h1 className={c.name.length > 22 ? 'long' : ''} onClick={() => c.editable && setEdit(true)}>{c.name}</h1>
          {c.description && <p className="coll-desc">{c.description}</p>}
          <p className="coll-meta">
            {c.owner && <b>{c.owner}</b>}{c.owner && ' • '}{c.tracks.length} song{c.tracks.length === 1 ? '' : 's'}{total > 0 && `, ${fmtLong(total)}`}
          </p>
        </div>
      </header>
      <div className="coll-body">
        <div className="action-bar">
          {c.tracks.length > 0 && <BigPlay item={item} />}
          {c.tracks.length > 0 && (
            <button className={`icon-btn tog ${shuffle ? 'on' : ''}`} aria-label="Shuffle" title="Shuffle" onClick={() => setShuffle(!shuffle)}><Icon name="shuffle" size={28} /></button>
          )}
          <button className="icon-btn" aria-label="More options" onClick={menu}><Icon name="dots" size={32} /></button>
        </div>
        {c.tracks.length > 0 && (
          <TrackList tracks={c.tracks} ctx={item} playlistId={c.editable ? id : undefined} showAdded={['liked', 'playlist', 'local'].includes(kind)} />
        )}
        {c.tracks.length === 0 && kind === 'local' && (
          <div className="empty"><Icon name="file" size={48} /><h2>Add your own music</h2><p>Import MP3, M4A, FLAC, WAV or OGG files. Drop .lrc files in too for synced lyrics.</p>
            <button className="white-btn" onClick={pickLocalFiles}>Import files</button></div>
        )}
        {c.tracks.length === 0 && kind === 'liked' && (
          <div className="empty"><CaliCat size={96} state="asleep" /><h2>Songs you like will appear here</h2><p>Save songs by tapping the plus icon.</p></div>
        )}
        {c.editable && (c.tracks.length === 0 || find) ? <FindSongs pid={id} onClose={c.tracks.length ? () => setFind(false) : null} />
          : c.editable && <button className="mini-link pad" onClick={() => setFind(true)}>Find more</button>}
        <div className="view-foot" />
      </div>
      {edit && <EditDialog p={c} onSave={(name, description) => { updatePlaylist(id, { name: name || c.name, description }); setEdit(false) }} onClose={() => setEdit(false)} />}
    </div>
  )
}

function FindSongs({ pid, onClose }) {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const { addToPlaylist, local } = useStore()
  const res = useAsync(async () => {
    if (!query) return []
    return local.filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase()))
  }, [query])
  return (
    <section className="find">
      <header>
        <h2>Let's find something for your playlist</h2>
        {onClose && <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>}
      </header>
      <form onSubmit={e => { e.preventDefault(); setQuery(q.trim()) }} className="find-input">
        <Icon name="search" size={18} />
        <input placeholder="Search for songs" value={q} onChange={e => setQ(e.target.value)} onBlur={() => setQuery(q.trim())} />
      </form>
      {res.data?.slice(0, 12).map(t => (
        <div key={t.id} className="find-row">
          <TrackArt track={t} size={40} />
          <div className="q-text"><b>{t.title}</b><small>{t.artist}</small></div>
          <span className="find-album">{t.album}</span>
          <button className="outline-btn sm" onClick={() => addToPlaylist(pid, [t])}>Add</button>
        </div>
      ))}
    </section>
  )
}

function EditDialog({ p, onSave, onClose }) {
  const [name, setName] = useState(p.name)
  const [desc, setDesc] = useState(p.description || '')
  return (
    <div className="dialog-scrim" onPointerDown={e => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={e => { e.preventDefault(); onSave(name.trim(), desc.trim()) }}>
        <header><h2>Edit details</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button></header>
        <label className="field"><span>Name</span><input autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)} /></label>
        <label className="field"><span>Description</span><textarea value={desc} maxLength={300} placeholder="Add an optional description" onChange={e => setDesc(e.target.value)} /></label>
        <button className="white-btn right">Save</button>
      </form>
    </div>
  )
}
