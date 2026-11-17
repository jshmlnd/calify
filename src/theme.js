// Themes and accent. Node-importable: `document` is touched only inside applyTheme.
export const THEMES = ['calico', 'midnight', 'daylight']
export const ACCENTS = ['#f08a3c', '#e8115b', '#1ed760', '#509bf5', '#8d67ab', '#f2b33d', '#e91429', '#14b8a6']
export const SURFACE = { calico: '#1a1410', midnight: '#111827', daylight: '#faf6f0' }
// Accent text/icons also sit on --elev-2 (active rows, toggled buttons), so it must clear that too.
export const ELEV = { calico: '#362a22', midnight: '#263247', daylight: '#e0d5c3' }
const rgb = h => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) }
const lum = h => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * r + .7152 * g + .0722 * b }
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) }

function toHsl(h) {
  const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const hh = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [hh * 60, s, l]
}
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
}
export const hue = h => toHsl(h)[0]

// Same hue, lightness stepped away from the surface until the ratio reaches 3.
export function readableAccent(hex, theme) {
  const surf = SURFACE[theme] || SURFACE.calico, el = ELEV[theme] || ELEV.calico
  const ok = c => contrast(c, surf) >= 3 && contrast(c, el) >= 3
  if (ok(hex)) return hex
  const [h, s, l] = toHsl(hex), dir = lum(surf) > .5 ? -1 : 1
  for (let i = 1; i <= 100; i++) {
    const c = fromHsl(h, s, Math.min(1, Math.max(0, l + dir * i / 100)))
    if (ok(c)) return c
  }
  return dir > 0 ? '#ffffff' : '#000000'
}

// Black or white text, whichever reads better on the accent.
export const onAccent = hex => contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff'

export function applyTheme({ theme, accent } = {}) {
  const t = THEMES.includes(theme) ? theme : 'calico'
  const a = /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : ACCENTS[0]
  const base = readableAccent(a, t), [h, s, l] = toHsl(base)
  const root = document.documentElement
  root.dataset.theme = t
  root.style.setProperty('--accent', base)
  root.style.setProperty('--on-accent', onAccent(base))
  root.style.setProperty('--accent-2', fromHsl(h, s, Math.min(1, Math.max(0, l + (t === 'daylight' ? -.06 : .06)))))
}
