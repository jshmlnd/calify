# Calify

A music player for Windows and Android.

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

## Keyboard shortcuts (desktop)

Space play/pause · Ctrl+←/→ previous/next · Shift+←/→ seek · Ctrl+S shuffle · Ctrl+R repeat · Ctrl+↑/↓ volume · Ctrl+L search · Ctrl+F filter library · Ctrl+N new playlist · Ctrl+P settings · Ctrl+= / − / 0 zoom
