export const MAX_MEMBERS = 5
export const JOIN_TIMEOUT_MS = 60000
export const HOST_GONE_MS = 15000
export const MAX_CHAT = 500

const LISTENER = new Set(['queue', 'chat'])
export const can = (role, action) => role === 'host' || (role === 'listener' && LISTENER.has(action))
export const admit = (memberCount) => (memberCount >= MAX_MEMBERS ? 'full' : 'ok')
export const canQueue = (hostLibraryIds, trackId) => hostLibraryIds.has(trackId)
export const cleanChat = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT) || null
export const hostGone = (lastSeenAt, now) => now - lastSeenAt >= HOST_GONE_MS
export const listenerBlocked = (together) => together?.role === 'listener'
