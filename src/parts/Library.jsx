import { useState } from 'react'
import { useStore, useRoute } from '../store'
import { Icon } from '../icons'
import { Art, routeOf, useMobile } from '../ui'
import { pickLocalFiles } from '../commands'
import { playItem } from '../player'

export function useLibraryItems(sort, q) {
  const { liked, local, playlists, recents, pinned, name } = useStore()
  let items = [
    { kind: 'liked', id: 'liked', name: 'Liked Songs', sub: `Playlist • ${liked.length} song${liked.length === 1 ? '' : 's'}` },
    ...(local.length ? [{ kind: 'local', id: 'local', name: 'Local Files', sub: `Playlist • ${local.length} songs` }] : []),
    ...playlists.map(p => ({ kind: 'playlist', id: p.id, name: p.name, sub: `Playlist • ${name}`, addedAt: p.createdAt })),
  ]
  if (q) items = items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()))
  const recentAt = it => recents.find(r => r.kind === it.kind && r.id === it.id)?.at || it.addedAt || 0
  const by = {
    recents: (a, b) => recentAt(b) - recentAt(a),
    added: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
    alpha: (a, b) => a.name.localeCompare(b.name),
  }[sort]
  return items.sort((a, b) => (pinned.includes(b.id) - pinned.includes(a.id)) || by(a, b))
}

export const createMenu = () => [
  { label: 'Playlist', icon: 'note', onClick: () => useStore.getState().createPlaylist() },
  { label: 'Import local files', icon: 'file', onClick: pickLocalFiles },
]

export function itemMenu(it) {
  const s = useStore.getState()
  const pinned = s.pinned.includes(it.id)
  return [
    { label: 'Play', icon: 'play', onClick: () => playItem(it) },
    { label: pinned ? 'Unpin' : 'Pin playlist', icon: 'pin', onClick: () => s.togglePin(it.id) },
    it.kind === 'playlist' && { label: 'Delete', icon: 'trash', onClick: () => s.deletePlaylist(it.id) },
  ].filter(Boolean)
}

const SORTS = { recents: 'Recents', added: 'Recently Added', alpha: 'Alphabetical' }

export function LibraryList({ big }) {
  const { libSort, libFilterOpen, go, openMenu, pinned } = useStore()
  const ctx = useStore(s => s.ctx)
  const playing = useStore(s => s.playing)
  const r = useRoute()
  const [q, setQ] = useState('')
  const items = useLibraryItems(libSort, q)
  const set = useStore.setState
  return (
    <>
      <div className="lib-tools">
        <div className={`lib-search ${libFilterOpen || q ? 'open' : ''}`}>
          <button className="icon-btn" aria-label="Search in Your Library" onClick={() => { set({ libFilterOpen: true }); setTimeout(() => document.getElementById('lib-filter')?.focus()) }}>
            <Icon name="search" size={16} />
          </button>
          <input id="lib-filter" placeholder="Search in Your Library" value={q} onChange={e => setQ(e.target.value)}
            onBlur={() => !q && set({ libFilterOpen: false })} />
        </div>
        <button className="lib-sort" onClick={e => openMenu(e, Object.entries(SORTS).map(([k, label]) => ({ label, checked: libSort === k, onClick: () => set({ libSort: k }) })))}>
          {SORTS[libSort]} <Icon name="list" size={16} />
        </button>
      </div>
      <div className={`lib-list ${big ? 'big' : ''}`}>
        {items.map(it => {
          const active = r.name === 'collection' && r.kind === it.kind && String(r.id) === String(it.id)
          const isCtx = ctx?.kind === it.kind && String(ctx?.id) === String(it.id)
          return (
            <div key={it.kind + it.id} className={`lib-item ${active ? 'active' : ''}`} role="link" tabIndex={0}
              onClick={() => go(routeOf(it))} onKeyDown={e => e.key === 'Enter' && go(routeOf(it))}
              onContextMenu={e => openMenu(e, itemMenu(it))}>
              <Art item={it} />
              <div className="lib-text">
                <span className={`lib-name ${isCtx ? 'green' : ''}`}>{it.name}</span>
                <span className="lib-sub">{pinned.includes(it.id) && <Icon name="pin" size={13} className="green" />}{it.sub}</span>
              </div>
              {isCtx && playing && <Icon name="volume" size={16} className="green lib-playing" />}
            </div>
          )
        })}
      </div>
    </>
  )
}

export function Library() {
  const { libCollapsed, go, openMenu } = useStore()
  const items = useLibraryItems(useStore(s => s.libSort))
  const mobile = useMobile()
  const set = useStore.setState
  if (libCollapsed && !mobile) return (
    <nav className="panel library rail" aria-label="Your Library">
      <button className="icon-btn" title="Expand Your Library" aria-label="Expand Your Library" onClick={() => set({ libCollapsed: false })}><Icon name="library" /></button>
      <button className="icon-btn rail-create" title="Create" aria-label="Create" onClick={e => openMenu(e, createMenu())}><Icon name="plus" size={20} /></button>
      <div className="rail-list">
        {items.map(it => (
          <button key={it.kind + it.id} className="rail-item" title={it.name} aria-label={it.name} onClick={() => go(routeOf(it))} onContextMenu={e => openMenu(e, itemMenu(it))}>
            <Art item={it} />
          </button>
        ))}
      </div>
    </nav>
  )
  return (
    <nav className="panel library" aria-label="Your Library">
      <header className="lib-head">
        <button className="lib-title" title="Collapse Your Library" onClick={() => set({ libCollapsed: true })}>
          <Icon name="collapse" size={20} className="lib-collapse-ico" />Your Library
        </button>
        <span className="grow" />
        <button className="pill-btn" title="Create a playlist or import files" onClick={e => openMenu(e, createMenu())}><Icon name="plus" size={16} />Create</button>
        <button className="icon-btn" title="Open Your Library" aria-label="Open Your Library" onClick={() => go({ name: 'library' })}><Icon name="expand" size={16} /></button>
      </header>
      <LibraryList />
    </nav>
  )
}
