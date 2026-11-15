import { useId } from 'react'
import { useStore } from '../store'

// Calify's mascot: a sitting calico. Awake and bopping while music plays, dozing when paused.
// Patches are clipped to the silhouette so they read as fur, not stickers.
export function CaliCat({ size = 80, state, className = '' }) {
  const playing = useStore(s => s.playing)
  const awake = state ? state === 'awake' : playing
  const id = 'cat' + useId().replace(/[^a-z0-9]/gi, '')
  return (
    <svg viewBox="0 0 100 112" width={size} height={size * 1.12} className={`calicat ${awake ? 'awake' : 'asleep'} ${className}`}
      role="img" aria-label={awake ? 'Calico cat bopping along' : 'Calico cat napping'}>
      <defs>
        <clipPath id={id}>
          <path d="M24 108 C20 84 28 62 50 60 C72 62 80 84 76 108 Z" />
          <path d="M50 20 C68 20 78 32 78 46 C78 60 66 68 50 68 C34 68 22 60 22 46 C22 32 32 20 50 20 Z" />
          <path d="M25 37 L27 7 L47 22 Z" /><path d="M75 37 L73 7 L53 22 Z" />
        </clipPath>
      </defs>

      <g className="cat-tail">
        <path d="M70 102 C90 103 98 86 92 72 C88 63 91 55 98 52" fill="none" stroke="#f08a3c" strokeWidth="9" strokeLinecap="round" />
        <path d="M70 102 C90 103 98 86 92 72 C88 63 91 55 98 52" fill="none" stroke="#1a110c" strokeWidth="9" strokeLinecap="butt" strokeDasharray="7 13" strokeDashoffset="-4" />
      </g>

      <g className="cat-body">
        <g clipPath={`url(#${id})`}>
          <rect x="0" y="56" width="100" height="56" fill="#f6ead8" />
          <path d="M56 64 C76 62 92 80 86 104 C72 110 58 94 55 80 Z" fill="#f08a3c" />
          <path d="M12 84 C24 76 40 84 40 96 C40 110 20 114 12 104 Z" fill="#1a110c" />
        </g>
        <ellipse cx="40" cy="107" rx="7.5" ry="3.6" fill="#f6ead8" />
        <ellipse cx="60" cy="107" rx="7.5" ry="3.6" fill="#f6ead8" />
      </g>

      <g className="cat-head">
        <g clipPath={`url(#${id})`}>
          <rect x="0" y="0" width="100" height="70" fill="#f6ead8" />
          <path d="M8 -2 C40 -4 52 16 47 33 C43 46 26 52 8 48 Z" fill="#f08a3c" />
          <path d="M58 2 C82 -2 98 20 89 41 C81 54 63 45 57 33 C52 22 52 9 58 2 Z" fill="#1a110c" />
        </g>
        <path className="ear-l" d="M30 31 L30.5 13 L42 23 Z" fill="#e8a39d" opacity=".8" />
        <path className="ear-r" d="M70 31 L69.5 13 L58 23 Z" fill="#e8a39d" opacity=".55" />
        <g className="eyes-open">
          <path d="M33 44 Q39 37.5 45 44 Q39 49.5 33 44 Z" fill="#f2b33d" />
          <path d="M55 44 Q61 37.5 67 44 Q61 49.5 55 44 Z" fill="#f2b33d" />
          <ellipse cx="39" cy="44" rx="1.5" ry="4" fill="#1a110c" />
          <ellipse cx="61" cy="44" rx="1.5" ry="4" fill="#1a110c" />
        </g>
        <g className="eyes-shut" fill="none" strokeWidth="2" strokeLinecap="round">
          <path d="M33 45 Q39 49.5 45 45" stroke="#1a110c" />
          <path d="M55 45 Q61 49.5 67 45" stroke="#f6ead8" />
        </g>
        <path d="M47 52 L53 52 L50 55.5 Z" fill="#e88a8f" />
        <path d="M50 55.5 Q47 59 44 57 M50 55.5 Q53 59 56 57" fill="none" stroke="#1a110c" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M40 54 L18 50 M40 56 L18 58 M60 54 L82 50 M60 56 L82 58" stroke="#8f7d6b" strokeWidth="0.9" strokeLinecap="round" opacity=".8" />
      </g>

      <g className="cat-z" fill="none" stroke="#f6ead8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M80 18 h6 l-6 7 h6" /><path d="M89 6 h4 l-4 5 h4" opacity=".7" />
      </g>
    </svg>
  )
}
