// Replaced at build time by vite `define`; tests set globalThis.__APP_VERSION__.
export const APP_VERSION = __APP_VERSION__

export const CHANGELOG = [
  {
    version: '1.1.0', date: '2026-11-17',
    new: [
      'Accounts with Google sign-in',
      'Profiles you can customise: photo, background, bio, theme and accent colour',
      'Followers and public playlists',
      'Listen together: up to 5 people, the host controls the music, and you can chat',
      "What's New page",
      'Report a bug',
      'Check for updates',
    ],
    fixed: [
      'Removing an imported file now removes only that file',
      'Longer battery life: animations pause when Calify is hidden, and the full-screen view is lighter',
      'Spotify login and CSV import removed',
    ],
  },
  {
    version: '1.0.0', date: '2026-11-15',
    new: [
      'First release: a Spotify-style player for Windows and Android',
      'Play your own music files',
      'Synced lyrics',
      'A calico look, with the cat',
    ],
    fixed: [],
  },
]
