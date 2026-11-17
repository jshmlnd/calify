import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCode, normalizeCode } from '../src/together/codes.js'
import { can, admit, canQueue, cleanChat, hostGone, listenerBlocked, hostOnly, BLOCKED_MSG, MAX_CHAT, queueFull, MAX_QUEUED } from '../src/together/rules.js'
import { membersFrom, forMe, joinDecision, joinError, chatMsg, addChat, libraryMeta, chunks, libraryPart, hostPos, stereo, artOf, nextMeta, MAX_ART } from '../src/together/state.js'

test('newCode pads to 4 digits', () => {
  assert.equal(newCode(() => 0), 'CALI-0000')
  assert.equal(newCode(() => 0.9999), 'CALI-9999')
})

test('normalizeCode accepts the 4 forms, rejects junk', () => {
  for (const s of ['CALI-0482', 'cali 0482', '0482', 'https://calify.zjkm.tech/calify/join?c=CALI-0482']) assert.equal(normalizeCode(s), 'CALI-0482')
  assert.equal(normalizeCode('CALI-48'), null)
  assert.equal(normalizeCode('hello'), null)
})

test('can: listener limits, host everything', () => {
  assert.equal(can('listener', 'control'), false)
  assert.equal(can('listener', 'queue'), true)
  assert.equal(can('listener', 'chat'), true)
  assert.equal(can('listener', 'approve'), false)
  assert.equal(can('listener', 'remove'), false)
  for (const a of ['control', 'queue', 'chat', 'approve', 'remove']) assert.equal(can('host', a), true)
})

test('admit, canQueue, hostGone', () => {
  assert.equal(admit(4), 'ok')
  assert.equal(admit(5), 'full')
  assert.equal(canQueue(new Set(['l:1']), 'l:1'), true)
  assert.equal(canQueue(new Set(['l:1']), 'l:2'), false)
  assert.equal(hostGone(0, 14999), false)
  assert.equal(hostGone(0, 15000), true)
})

test('cleanChat', () => {
  assert.equal(cleanChat('  hi  there '), 'hi there')
  assert.equal(cleanChat('   '), null)
  assert.equal(cleanChat('a'.repeat(600)).length, MAX_CHAT)
})

test('listenerBlocked', () => {
  assert.equal(listenerBlocked(null), false)
  assert.equal(listenerBlocked({ role: 'host' }), false)
  assert.equal(listenerBlocked({ role: 'listener' }), true)
})

test('normalizeCode: malformed escapes give null, not a throw', () => {
  assert.equal(normalizeCode('https://calify.zjkm.tech/calify/join?c=%E0%A4%A'), null)
  assert.equal(normalizeCode('?c=CALI%2D0482'), 'CALI-0482')
})

test('hostOnly: a listener calling toggle() does not change playing', () => {
  const toasts = [], st = { together: { role: 'listener' }, playing: false, toastMsg: m => toasts.push(m) }
  const toggle = hostOnly(() => st, () => { st.playing = !st.playing })
  toggle()
  assert.equal(st.playing, false)
  assert.deepEqual(toasts, [BLOCKED_MSG])
  st.together = { role: 'host' }; toggle()
  assert.equal(st.playing, true)
  st.together = null; toggle()
  assert.equal(st.playing, false)
})

test('membersFrom: host first, one row per user', () => {
  const p = { b: [{ id: 'b', name: 'Mia', avatar_path: null, role: 'listener' }, { id: 'b', name: 'Mia', role: 'listener' }], a: [{ id: 'a', name: 'Jo', avatar_path: 'a/x.jpg', role: 'host' }] }
  assert.deepEqual(membersFrom(p, 'a'), [{ id: 'a', name: 'Jo', avatar_path: 'a/x.jpg' }, { id: 'b', name: 'Mia', avatar_path: null }])
})

test('forMe and joinDecision', () => {
  assert.equal(forMe({ to: 'a', from: 'b' }, 'a'), true)
  assert.equal(forMe({ to: 'c', from: 'b' }, 'a'), false)
  assert.equal(forMe(null, 'a'), false)
  const m = n => Array.from({ length: n }, (_, i) => ({ id: 'm' + i }))
  assert.equal(joinDecision(m(2), 'm1'), 'member')
  assert.equal(joinDecision(m(4), 'x'), 'ask')
  assert.equal(joinDecision(m(5), 'x'), 'full')
  assert.equal(joinError({ ok: true }), null)
  assert.equal(joinError({ ok: false, reason: 'full' }), 'Session is full')
  assert.equal(joinError({ ok: false }), "The host didn't let you in")
  assert.equal(joinError(null), "The host didn't let you in")
})

test('chatMsg cleans input; name comes from the caller (presence), not the payload; only the host can send events; addChat caps', () => {
  assert.equal(chatMsg({ from: 'b', text: '   ' }, 'a', 'Mia'), null)
  const m = chatMsg({ id: 'x', from: 'b', name: 'The Host', text: ' hi  there ', at: 5, kind: 'event' }, 'a', 'Mia')
  assert.deepEqual(m, { id: 'x', from: 'b', name: 'Mia', text: 'hi there', at: 5, kind: 'msg' })
  assert.equal(chatMsg({ id: 'y', from: 'a', name: 'Jo', text: 'Mia joined', at: 1, kind: 'event' }, 'a', 'Jo').kind, 'event')
  assert.equal(chatMsg({ from: 'b', text: 'hi' }, 'a', 'x'.repeat(99)).name.length, 40)
  assert.equal(chatMsg({ from: 'b', text: 'hi' }, 'a').name, 'Someone')
  let c = []
  for (let i = 0; i < 205; i++) c = addChat(c, { id: i })
  assert.equal(c.length, 200)
  assert.equal(c[0].id, 5)
})

test('library: metadata only, chunked by size under the 64 KB send cap, reassembled', () => {
  const tracks = Array.from({ length: 450 }, (_, i) => ({ id: 'l:' + i, title: 't' + i, artist: 'a', album: 'b', duration: 3, source: 'local', lrc: 'x' }))
  const parts = chunks(libraryMeta(tracks))
  assert.equal(parts.length, 1)
  assert.deepEqual(Object.keys(parts[0][0]), ['id', 'title', 'artist', 'album', 'duration'])
  // Worst case: every field at the 300-char cap, in 3-byte UTF-8 characters.
  const big = libraryMeta(Array.from({ length: 450 }, (_, i) => ({ id: i + '€'.repeat(300), title: '€'.repeat(300), artist: '€'.repeat(300), album: '€'.repeat(300), duration: 1 })))
  const bigParts = chunks(big)
  assert.ok(bigParts.length > 1)
  for (const p of bigParts) assert.ok(new TextEncoder().encode(JSON.stringify({ to: 'x', part: 99, parts: 99, tracks: p })).length < 65536 - 4096)
  let st = { buf: [], lib: null }
  bigParts.forEach((p, part) => { st = libraryPart(st.buf, { part, parts: bigParts.length, tracks: p }) })
  assert.deepEqual(st.lib, big)
  assert.deepEqual(chunks([]), [[]])
  assert.deepEqual(libraryPart([], { part: 0, parts: 1, tracks: [] }).lib, [])
})

test('hostPos extrapolates while playing, clamps to duration', () => {
  assert.equal(hostPos(null, 0), 0)
  assert.equal(hostPos({ t: 10, playing: true, at: 1000, track: { duration: 200 } }, 3000), 12)
  assert.equal(hostPos({ t: 10, playing: false, at: 1000, track: { duration: 200 } }, 3000), 10)
  assert.equal(hostPos({ t: 199, playing: true, at: 0, track: { duration: 200 } }, 5000), 200)
})

test('stereo adds Opus stereo + bitrate once', () => {
  const sdp = 'v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=rtpmap:0 PCMU/8000\r\n'
  const out = stereo(sdp)
  assert.match(out, /a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000\r\n/)
  assert.equal(stereo(out), out)
  assert.equal(stereo('v=0\r\n'), 'v=0\r\n')
})

test('libraryMeta coerces untrusted payloads', () => {
  const [m] = libraryMeta([{ id: 5, title: { x: 1 }, artist: null, album: 'a'.repeat(400), duration: '12', extra: 'drop' }])
  assert.deepEqual(m, { id: '5', title: '[object Object]', artist: '', album: 'a'.repeat(300), duration: 12 })
  assert.equal(libraryMeta([{ duration: -3 }])[0].duration, 0)
  assert.equal(libraryMeta([null])[0].id, '')
})

test('queueFull caps songs per listener', () => {
  const q = Array.from({ length: MAX_QUEUED }, () => ({ addedById: 'b' }))
  assert.equal(queueFull(q, 'b'), true)
  assert.equal(queueFull(q.slice(1), 'b'), false)
  assert.equal(queueFull(q, 'c'), false)
})

test('artOf accepts only small data: images', () => {
  const ok = 'data:image/webp;base64,UklGRg=='
  assert.equal(artOf(ok), ok)
  assert.equal(artOf('data:image/jpeg;base64,/9j/4AAQ'), 'data:image/jpeg;base64,/9j/4AAQ')
  for (const bad of ['https://evil.example/x.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', 'data:image/png;base64,"x', null, 5, {}])
    assert.equal(artOf(bad), null)
  assert.equal(artOf('data:image/png;base64,' + 'A'.repeat(MAX_ART)), null)
})

test('nextMeta: up to 10 rows of title, artist, added by; coerces untrusted input', () => {
  const q = Array.from({ length: 12 }, (_, i) => ({ id: 'l:' + i, title: 't' + i, artist: 'a', addedBy: i ? 'Mia' : undefined, src: 'blob:x' }))
  const n = nextMeta(q)
  assert.equal(n.length, 10)
  assert.deepEqual(n[0], { title: 't0', artist: 'a', addedBy: '' })
  assert.deepEqual(n[1], { title: 't1', artist: 'a', addedBy: 'Mia' })
  assert.deepEqual(nextMeta('nope'), [])
  assert.equal(nextMeta([{ addedBy: 'x'.repeat(99) }])[0].addedBy.length, 40)
})

test('a worst-case `now` (art at the cap, 10 long Up Next rows, long track) fits together_send\'s 64 KB', () => {
  const long = '€'.repeat(300), t = { id: long, title: long, artist: long, album: long, duration: 1 }
  const art = 'data:image/webp;base64,' + 'A'.repeat(MAX_ART - 30)
  assert.equal(artOf(art), art)
  const now = { track: libraryMeta([t])[0], art, next: nextMeta(Array(12).fill({ ...t, addedBy: long })), playing: true, t: 123.456 }
  assert.ok(new TextEncoder().encode(JSON.stringify(now)).length < 65536 - 2048)
})
