import { useState } from 'react'
import { useStore } from '../store'
import { Art, BigPlay, Card, Eq, Shelf, routeOf, useAsync, useMobile } from '../ui'
import { useColor } from '../color'
import { playContext } from '../player'
import { Avatar } from '../parts/TopBar'
import { Icon } from '../icons'
import { pickLocalFiles, pickPlaylistCsv } from '../commands'
import * as sp from '../spotify'

const trackCard = t => ({ kind: 'track', id: t.id, track: t, name: t.title, sub: t.artist, art: t.art })

// Every shelf on Home; reused by "Show all" pages. Built only from your library: local files, Calify playlists and Spotify.
export function useShelves() {
  const { recents, history, local, liked, spotifyUser, spotifyPlaylists } = useStore()
  const sLiked = useAsync(() => (spotifyUser ? sp.liked() : Promise.resolve([])), [spotifyUser?.id])
  const tracksShelf = (list, ctx) => ({ items: (list || []).map(trackCard), play: i => playContext(list, i, { ...ctx, art: list.find(t => t.art)?.art }) })
  return {
    recents: { title: 'Jump back in', type: 'playlists', items: recents.slice(0, 20) },
    spotify: { title: 'Your Spotify playlists', type: 'playlists', items: spotifyPlaylists },
    sliked: { title: 'From your Spotify Liked Songs', type: 'music', ...tracksShelf(sLiked.data?.slice(0, 30), { kind: 'sliked', id: 'sliked', name: 'Liked Songs' }) },
    history: { title: 'Recently played', type: 'music', ...tracksShelf(history, { kind: 'history', id: 'history', name: 'Recently played' }) },
    local: { title: 'Your local files', type: 'music', ...tracksShelf(local, { kind: 'local', id: 'local', name: 'Local Files' }) },
    liked: { title: 'From your Liked Songs', type: 'music', ...tracksShelf(liked, { kind: 'liked', id: 'liked', name: 'Liked Songs' }) },
  }
}

export function ShelfCards({ shelf, wrap }) {
  return (
    <div className={wrap ? 'card-grid' : 'card-row'}>
      {shelf.items.map((it, i) => <Card key={it.kind + it.id + i} item={it} onClick={shelf.play && (() => shelf.play(i))} />)}
    </div>
  )
}

function Shortcut({ item, onHover }) {
  const go = useStore(s => s.go)
  const playing = useStore(s => s.playing && s.ctx?.kind === item.kind && String(s.ctx?.id) === String(item.id))
  return (
    <div className="shortcut" role="link" tabIndex={0} onClick={() => go(routeOf(item))} onKeyDown={e => e.key === 'Enter' && go(routeOf(item))}
      onMouseEnter={() => onHover(item)}>
      <Art item={item} />
      <span className="sc-name">{item.name}</span>
      {playing && <span className="sc-eq"><Eq /></span>}
      <BigPlay item={item} size={32} className="sc-play" />
    </div>
  )
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

export function Home() {
  const [filter, setFilter] = useState('all')
  const [hover, setHover] = useState(null)
  const go = useStore(s => s.go)
  const recents = useStore(s => s.recents)
  const mobile = useMobile()
  const sh = useShelves()
  const shortcuts = [{ kind: 'liked', id: 'liked', name: 'Liked Songs' }, ...recents.filter(r => r.kind !== 'liked'), ...sh.spotify.items]
    .filter((it, i, all) => all.findIndex(x => x.kind === it.kind && x.id === it.id) === i).slice(0, 8)
  const first = hover || shortcuts.find(s => s.art)
  const color = useColor(first?.art, first?.name || 'calify', 0.3, 0.5)
  const show = key => (filter === 'all' || sh[key].type === filter) && sh[key].items.length > 0
  const order = ['recents', 'spotify', 'sliked', 'local', 'history', 'liked']
  const empty = !order.some(k => sh[k].items.length)
  return (
    <div className="view scroll-y home" style={{ '--c': color }}>
      <div className="home-bg" />
      <div className="chips home-chips">
        {mobile && <button className="chip-av" onClick={() => go({ name: 'settings' })} aria-label="Settings"><Avatar /></button>}
        {[['all', 'All'], ['music', 'Music'], ['playlists', 'Playlists']].map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {mobile && <h1 className="greeting">{greeting()}</h1>}
      {filter === 'all' && <div className="shortcuts">{shortcuts.map(it => <Shortcut key={it.kind + it.id} item={it} onHover={setHover} />)}</div>}
      {empty && <Welcome />}
      {order.filter(show).map(key => (
        <Shelf key={key} title={sh[key].title} items={sh[key].items} onShowAll={() => go({ name: 'section', key })}>
          <ShelfCards shelf={sh[key]} />
        </Shelf>
      ))}
      <div className="view-foot" />
    </div>
  )
}

// First run: nothing in the library yet, so point at the three ways music gets in.
function Welcome() {
  const spotifyUser = useStore(s => s.spotifyUser)
  const login = () => sp.login().catch(e => { useStore.setState({ spotifyError: e.message }); useStore.getState().go({ name: 'settings' }) })
  return (
    <section className="welcome">
      <h2>Let's fill up your library</h2>
      <p>Calify plays your own music files and your Spotify library.</p>
      <div className="welcome-actions">
        <button className="welcome-card" onClick={pickLocalFiles}><Icon name="file" size={28} /><b>Import music files</b><small>MP3, M4A, FLAC, WAV or OGG from this device</small></button>
        {!spotifyUser && <button className="welcome-card" onClick={sp.BUILT_IN_ID ? login : () => useStore.getState().go({ name: 'settings' })}><Icon name="user" size={28} /><b>Log in with Spotify</b><small>Your playlists and Liked Songs (Premium)</small></button>}
        <button className="welcome-card" onClick={pickPlaylistCsv}><Icon name="list" size={28} /><b>Import a Spotify playlist</b><small>From a CSV export, no Premium needed</small></button>
      </div>
    </section>
  )
}

export function Section({ k }) {
  const sh = useShelves()
  const shelf = sh[k]
  if (!shelf) return null
  return (
    <div className="view scroll-y pad-view">
      <h1 className="section-title">{shelf.title}</h1>
      <ShelfCards shelf={shelf} wrap />
      <div className="view-foot" />
    </div>
  )
}
