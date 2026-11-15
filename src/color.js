import { useEffect, useState } from 'react'

const cache = new Map()

// Average colour of an image, re-toned like Spotify's header gradients (muted, mid-dark).
export function dominantColor(url) {
  if (!url) return Promise.resolve(null)
  if (!cache.has(url)) cache.set(url, new Promise(res => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = c.height = 10
        const x = c.getContext('2d', { willReadFrequently: true })
        x.drawImage(img, 0, 0, 10, 10)
        const d = x.getImageData(0, 0, 10, 10).data
        // weight saturated pixels higher so grey borders don't win
        let r = 0, g = 0, b = 0, w = 0
        for (let i = 0; i < d.length; i += 4) {
          const sat = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) + 8
          r += d[i] * sat; g += d[i + 1] * sat; b += d[i + 2] * sat; w += sat
        }
        res([r / w, g / w, b / w])
      } catch { res(null) }
    }
    img.onerror = () => res(null)
    img.src = url
  }))
  return cache.get(url)
}

export function tone(rgb, light = 0.32, maxSat = 0.55) {
  if (!rgb) return null
  const [r, g, b] = rgb.map(v => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1))
  if (max !== min) {
    h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
  }
  return `hsl(${Math.round(h * 60 + 360) % 360} ${Math.round(Math.min(s, maxSat) * 100)}% ${Math.round(light * 100)}%)`
}

const hashColor = s => `hsl(${[...(s || 'x')].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360} 35% 32%)`

export function useColor(url, seed, light, maxSat) {
  const [c, setC] = useState(null)
  useEffect(() => {
    let on = true
    setC(null)
    dominantColor(url).then(rgb => on && setC(tone(rgb, light, maxSat)))
    return () => { on = false }
  }, [url, light, maxSat])
  return c || hashColor(seed || url)
}
