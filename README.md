# Calify

A Spotify-style music player for Windows and Android.

- **Spotify:** log in to see your Spotify playlists and Liked Songs and search Spotify (full songs need Premium; see below). No Premium? Import a playlist's CSV export and Calify matches its songs to your files.
- **Your own music:** import MP3 / M4A / FLAC / WAV / OGG files (tags and cover art are read; a matching `.lrc` file gives synced lyrics).
- **Lyrics:** synced lyrics from [LRCLIB](https://lrclib.net).
- **Player:** queue with "Next in queue", shuffle, repeat / repeat one, Liked Songs, your own playlists, Now Playing view, full-screen player, miniplayer (Windows), output-device picker, OS media controls (Windows media keys, Android lock-screen notification).

## Install

| Platform | File |
|---|---|
| Windows | `release/Calify Setup 1.0.0.exe` |
| Android | `release/Calify-1.0.0.apk` (copy to the phone, allow "Install unknown apps") |

## Develop

```bash
npm install
npm run dev          # browser at http://localhost:5173
npm test             # lyrics parser tests
npm run desktop      # run the Electron app from source
npm run dist:win     # build the Windows installer into release/
npm run android:apk  # build the debug APK (needs Android SDK + JDK 21)
```

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Spotify (optional)

Calify can sign in to Spotify, show your Spotify playlists and Liked Songs in Your Library, and search Spotify. Full songs need **Spotify Premium**.

1. Go to the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app. Tick **Web API** and **Web Playback SDK**. Add the redirect URI `http://127.0.0.1:43821/callback` (the dashboard needs a port; Calify listens on 43821 during sign-in). For browser dev also add `http://127.0.0.1:5173/` and open the dev server at that address, not `localhost`.
2. Put the app's **Client ID** in a `.env` file (see `.env.example`): `VITE_SPOTIFY_CLIENT_ID=...`, then rebuild. A PKCE Client ID isn't a secret, so it ships inside Calify. People then just press **Log in with Spotify** and sign in on Spotify's own page with their normal account; they never see a key. Builds without one show a Client ID field in Settings instead.
3. Development-mode apps allow 5 users. Add each person's Spotify email under the app's **User Management**.

Spotify's 2026 dev-mode rules: playlist tracks load only for playlists you own or collaborate on, and search returns at most 10 songs.

**Where Spotify songs play**

| | |
|---|---|
| Browser (`npm run dev`) | In Calify, through the Web Playback SDK |
| Windows app | In Calify, once it runs on castLabs' Widevine Electron (below). Until then it says it can't decode Spotify audio. |
| Android app | Opens the song in the Spotify app/site (the SDK isn't supported inside apps) |

**Windows: Widevine Electron**

Calify runs on castLabs' Electron (`45.2.1+wvcus`), which includes Widevine. Spotify's licence server also wants the app VMP-signed with castLabs' free EVS service. `npm run dist:win` does that automatically (`build/evs-sign.cjs`, after code-signing) once you have an EVS account:

```bash
python -m pip install --upgrade castlabs-evs
python -m castlabs_evs.account signup
npm run dist:win
```

Without an account the build still works and prints "EVS signing skipped". Spotify songs won't play until it's signed. EVS logins expire about monthly: run `python -m castlabs_evs.account reauth`. To test from source, sign the dev binary once with `python -m castlabs_evs.vmp sign-pkg node_modules/electron/dist`, then run `npm run desktop`.

npm 12 blocks URL dependencies by default, so reinstalling needs `npm install --allow-remote=root`.

## Keyboard shortcuts (desktop)

Space play/pause · Ctrl+←/→ previous/next · Shift+←/→ seek · Ctrl+S shuffle · Ctrl+R repeat · Ctrl+↑/↓ volume · Ctrl+L search · Ctrl+F filter library · Ctrl+N new playlist · Ctrl+P settings · Ctrl+= / − / 0 zoom
