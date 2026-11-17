// Listen together audio: the host sends its captured <audio> to each listener over its own RTCPeerConnection (mesh).
// Signaling goes through session.js (init / signal); messages are { to, from, sdp | candidate }, `from` stamped by the server.
import { supabase } from '../supabase'
import { useStore } from '../store'
import { audio, capture } from '../player'
import { stereo } from './state'

const FALLBACK = [{ urls: 'stun:stun.cloudflare.com:3478' }]

// STUN + Cloudflare TURN from the turn-credentials Edge Function; STUN only if that fails (signed out, offline).
export async function getIceServers() {
  try {
    const { data, error } = await supabase.functions.invoke('turn-credentials')
    if (error || !data?.iceServers?.length) throw error
    return data.iceServers
  } catch { return FALLBACK }
}

const peers = new Map()   // peer user id → RTCPeerConnection
const offering = new Set() // host: offers queued but not yet made
let send = () => {}, role = null, ice, q = Promise.resolve(), gen = 0, out
export const init = (sendFn, myRole) => { send = sendFn; role = myRole }
export const hasPeer = id => peers.has(id) || offering.has(id)
export const stateOf = id => peers.get(id)?.connectionState || 'closed'
const servers = () => (ice ||= getIceServers())   // minted once per session

function peer(id, iceServers) {
  closePeer(id)
  const pc = new RTCPeerConnection({ iceServers })
  pc.onicecandidate = e => e.candidate && send({ to: id, candidate: e.candidate.toJSON() })
  pc.onconnectionstatechange = () => pc.connectionState === 'failed' && peers.get(id) === pc && closePeer(id)
  peers.set(id, pc)
  return pc
}
export function closePeer(id) { peers.get(id)?.close(); peers.delete(id) }

// Signaling is handled one message at a time, so ICE candidates never race ahead of their offer/answer.
const serial = fn => (q = q.then(fn).catch(() => {}))

const hostTrack = () => capture().getAudioTracks().at(-1) || null

// Host: a send-only audio connection to one listener (re-offering replaces the old one).
export const offerTo = id => { offering.add(id); return serial(async () => {
  const g = gen, iceServers = await servers()
  if (g !== gen || role !== 'host') return
  const pc = peer(id, iceServers)
  pc.addTransceiver(hostTrack() || 'audio', { direction: 'sendonly' })
  await pc.setLocalDescription()
  send({ to: id, sdp: pc.localDescription.toJSON() })
}).finally(() => offering.delete(id)) }

// Listener: answers the host's offer and plays what arrives in its own element (its local `audio` stays paused).
export async function answer({ from, sdp }) {
  const g = gen, iceServers = await servers()
  if (g !== gen) return
  const pc = peer(from, iceServers)
  pc.ontrack = e => play(e.track)
  await pc.setRemoteDescription(sdp)
  await pc.setLocalDescription()
  send({ to: from, sdp: pc.localDescription.toJSON() })
}

// The host only takes answers, a listener only offers.
export const signal = msg => serial(async () => {
  if (msg.sdp?.type === 'offer') return role === 'listener' && answer(msg)
  if (msg.sdp?.type === 'answer' && role !== 'host') return
  const pc = peers.get(msg.from)
  if (!pc) return
  if (msg.sdp?.type === 'answer') await pc.setRemoteDescription({ type: 'answer', sdp: stereo(msg.sdp.sdp) })
  else if (msg.candidate) await pc.addIceCandidate(msg.candidate)
})

const volume = s => { if (out) out.volume = s.muted ? 0 : s.volume }
useStore.subscribe(volume)
function play(track) {
  out ||= new Audio()
  out.srcObject = new MediaStream([track])
  volume(useStore.getState())
  out.play().catch(() => {})
}

// A new song means a new captured track: swap it into every connection without renegotiating.
audio.addEventListener('playing', () => {
  if (role !== 'host' || !peers.size) return
  const t = hostTrack()
  for (const pc of peers.values()) for (const s of pc.getSenders()) if (s.track !== t) s.replaceTrack(t).catch(() => {})
})

export function close() {
  gen++
  role = null
  offering.clear()
  for (const id of [...peers.keys()]) closePeer(id)
  if (out) { out.pause(); out.srcObject = null }
  ice = null
}
