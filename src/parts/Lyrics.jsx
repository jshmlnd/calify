import { useEffect, useRef, useState } from 'react'
import { fetchLyrics } from '../lyrics'
import { usePos, seek } from '../player'

export function useLyrics(track) {
  const [st, setSt] = useState({ status: 'loading', data: null })
  useEffect(() => {
    if (!track) return setSt({ status: 'none', data: null })
    let on = true
    setSt({ status: 'loading', data: null })
    fetchLyrics(track).then(d => on && setSt({ status: d ? 'ok' : 'none', data: d }))
    return () => { on = false }
  }, [track?.id])
  return st
}

export const activeLine = (lines, t) => {
  let i = -1
  for (let j = 0; j < lines.length && lines[j].t <= t + 0.25; j++) i = j
  return i
}

// Synced lines: past lines dim, current line white, scroll keeps the current line in view.
export function LyricsLines({ lyrics, className = '', scroll = true }) {
  const t = usePos(s => s.t)
  const box = useRef()
  const cur = lyrics.synced ? activeLine(lyrics.lines, t) : -1
  useEffect(() => {
    if (!scroll || cur < 0) return
    const el = box.current?.children[cur]
    const sc = box.current?.closest('.scroll-y')
    if (el && sc) sc.scrollTo({ top: el.offsetTop - sc.clientHeight * 0.35, behavior: 'smooth' })
  }, [cur])
  return (
    <div ref={box} className={`lyrics-lines ${lyrics.synced ? 'synced' : ''} ${className}`}>
      {lyrics.lines.map((l, i) => (
        <p key={i} className={i === cur ? 'cur' : i < cur ? 'past' : ''} onClick={() => l.t != null && seek(l.t)}>{l.text}</p>
      ))}
    </div>
  )
}
