# Calify

A music player for Windows and Android.

- **Your own music:** import MP3 / M4A / FLAC / WAV / OGG files (tags and cover art are read; a matching `.lrc` file gives synced lyrics). Remove a single imported file with **Remove from Calify**.
- **Lyrics:** synced lyrics from [LRCLIB](https://lrclib.net).
- **Player:** queue with "Next in queue", shuffle, repeat / repeat one, Liked Songs, your own playlists, Now Playing view, full-screen player, miniplayer (Windows), output-device picker, OS media controls.
- **Accounts (optional):** sign in with Google to get a profile (photo, bio, background, accent colour, theme, public playlists, last played), following, People search and Listen together. Local playback works signed out and offline.
- **Listen together:** 2-5 people hear the host's playback live. Start a session to get a `CALI-0000` code and a join link (`calify.zjkm.tech/calify/join`); the host approves every joiner. Listeners can chat and add songs to the host's queue. It keeps running in the background on Android.
- **What's New** and **Report a bug** live in the account menu.
- **Updates:** "Check for updates" in the account menu (Windows also checks quietly on startup). Windows installs on restart; Android downloads the APK and opens the system install prompt.

## Install

Download from the [latest release](https://github.com/jshmlnd/calify/releases/latest): `Calify-Setup-<version>.exe` for Windows, the `.apk` for Android (allow "Install unknown apps" once).

## Develop

```bash
npm install
npm run dev          # browser at http://localhost:5173
npm test             # unit tests
npm run desktop      # run the Electron app from source
npm run dist:win     # build the Windows installer into release/
npm run android:apk  # build the debug APK (needs Android SDK + JDK 21)
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Setup

1. **`.env`**: copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase dashboard. Never commit `.env`.
2. **Supabase**: enable the Google provider (Authentication, Providers), then:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push                          # migrations in supabase/migrations
   npx supabase secrets set CF_TURN_KEY_ID=... CF_TURN_API_TOKEN=...
   npx supabase functions deploy turn-credentials
   ```
   Bug reports land in the Supabase dashboard.
3. **Site** (join link and privacy pages): `cd site && npx wrangler deploy` (served at calify.zjkm.tech).
4. **Release**: needs `gh` logged in as the repo owner and JAVA_HOME set to JDK 21.
   ```bash
   npm run release -- --dry-run   # build and check, publish nothing
   npm run release                # build the installer and APK, publish a GitHub release
   ```
   Bump the version in `package.json` and Android `versionCode`/`versionName` first, and add a `src/changelog.js` entry.
5. **Back up `C:\Users\Administrator.JOSHUAA\.android\debug.keystore`.** Android only installs an update signed with the same key, so losing it means users must uninstall and reinstall.

## Keyboard shortcuts (desktop)

Space play/pause · Ctrl+←/→ previous/next · Shift+←/→ seek · Ctrl+S shuffle · Ctrl+R repeat · Ctrl+↑/↓ volume · Ctrl+L search · Ctrl+F filter library · Ctrl+N new playlist · Ctrl+P settings · Ctrl+= / − / 0 zoom
