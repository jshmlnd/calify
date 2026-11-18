export const newCode = (rand = Math.random) => 'CALI-' + String(Math.min(9999, Math.floor(rand() * 10000))).padStart(4, '0')

const decode = s => { try { return decodeURIComponent(s) } catch { return '' } }

export function normalizeCode(input) {
  const s = String(input ?? '').trim()
  const m = s.match(/[?&]c=([^&#]*)/)
  const d = (m ? decode(m[1]) : s).match(/^(?:cali[-\s]?)?(\d{4})$/i)
  return d ? `CALI-${d[1]}` : null
}
