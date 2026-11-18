import { useStore } from '../store'
import { Spinner, useAsync } from '../ui'
import { Avatar } from '../parts/TopBar'
import { followers, following } from '../social'

export function PersonCard({ p }) {
  const go = useStore(s => s.go), open = () => go({ name: 'profile', id: p.id })
  return (
    <div className="card person" role="link" tabIndex={0} onClick={open} onKeyDown={e => e.key === 'Enter' && open()}>
      <div className="card-art"><Avatar p={p} size={168} /></div>
      <div className="card-title">{p.name}</div>
      <div className="card-sub">Profile</div>
    </div>
  )
}

export function People({ id, which }) {
  const res = useAsync(() => (which === 'followers' ? followers : following)(id), [id, which])
  const list = res.data
  return (
    <div className="view scroll-y pad-view">
      <h1 className="m-title">{which === 'followers' ? 'Followers' : 'Following'}</h1>
      {res.loading && <Spinner />}
      {res.error && <div className="empty"><h2>Couldn't load this list</h2><p>{res.error.message}</p></div>}
      {list && !list.length && <div className="empty"><h2>{which === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</h2></div>}
      {list?.length > 0 && <div className="card-row wrap">{list.map(p => <PersonCard key={p.id} p={p} />)}</div>}
      <div className="view-foot" />
    </div>
  )
}
