import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Art, Spinner, TrackList, useAsync, useMobile } from '../ui'
import { playContext } from '../player'
import { Icon } from '../icons'
import { CaliCat } from '../parts/CaliCat'
import { PersonCard } from './People'
import { searchPeople } from '../social'

function useDebounced(v, ms) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

export function Search({ q = '' }) {
  const query = useDebounced(q.trim(), 300)
  const [tab, setTab] = useState('all')
  const { local, addRecentSearch } = useStore(), signedIn = useStore(s => !!s.user)
  const mobile = useMobile()
  const res = useAsync(async () => {
    if (!query) return null
    const ql = query.toLowerCase()
    const people = signedIn && query.length >= 2 ? await searchPeople(query).catch(() => []) : []
    return { tracks: local.filter(t => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(ql)), people }
  }, [query, signedIn])

  if (!q.trim()) return (
    <div className="view scroll-y pad-view">
      {mobile && <MobileSearchInput q={q} />}
      <div className="empty"><CaliCat size={96} state="asleep" /><h2>Search your music files</h2>
        <p>Type a song, artist or album from your Local Files.</p></div>
      <div className="view-foot" />
    </div>
  )

  const r = res.data
  const top = r?.tracks[0]
  const playTrack = (list, i) => { addRecentSearch({ kind: 'track', id: list[i].id, name: list[i].title, track: list[i] }); playContext(list, i) }
  return (
    <div className="view scroll-y pad-view search">
      {mobile && <MobileSearchInput q={q} />}
      <div className="chips">
        {[['all', 'All'], ['songs', 'Songs']].map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {(res.loading || query !== q.trim()) && !r && <Spinner />}
      {r && !r.tracks.length && !r.people.length && (
        <div className="empty"><CaliCat size={96} state="asleep" /><h2>No results found for "{query}"</h2>
          <p>Please make sure your words are spelled correctly, or use fewer or different keywords.</p></div>
      )}
      {r?.people.length > 0 && (
        <section className="shelf"><header className="shelf-head"><h2>People</h2></header>
          <div className="card-row">{r.people.map(p => <PersonCard key={p.id} p={p} />)}</div></section>
      )}
      {r && tab === 'all' && (top || r.tracks.length > 0) && (
        <div className="top-row">
          {top && (
            <section className="top-result">
              <h2>Top result</h2>
              <div className="top-card" onClick={() => playTrack(r.tracks, 0)}>
                <Art item={{ art: top.art }} track={top} size={92} />
                <h3>{top.title}</h3>
                <p><span className="tag">Song</span>{top.artist}</p>
                <span className="top-play big-play" style={{ width: 48, height: 48 }}><Icon name="play" size={20} /></span>
              </div>
            </section>
          )}
          <section className="top-songs">
            <h2>Songs</h2>
            <TrackListSearch tracks={r.tracks.slice(0, 4)} onPlay={i => playTrack(r.tracks, i)} />
          </section>
        </div>
      )}
      {r && tab === 'songs' && <TrackListSearch tracks={r.tracks} onPlay={i => playTrack(r.tracks, i)} full />}
      <div className="view-foot" />
    </div>
  )
}

function TrackListSearch({ tracks, onPlay, full }) {
  return <TrackList tracks={tracks} header={!!full} showAlbum={!!full} onPlay={onPlay} />
}

function MobileSearchInput({ q }) {
  const go = useStore(s => s.go)
  const setQ = v => useStore.setState(s => { const nav = [...s.nav]; nav[s.navI] = { name: 'search', q: v }; return { nav } })
  return (
    <>
      <h1 className="m-title">Search</h1>
      <label className="m-search">
        <Icon name="search" size={22} />
        <input placeholder="What do you want to listen to?" value={q} onChange={e => (q === undefined ? go({ name: 'search', q: e.target.value }) : setQ(e.target.value))} />
      </label>
    </>
  )
}
