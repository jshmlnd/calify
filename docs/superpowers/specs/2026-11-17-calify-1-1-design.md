# Calify 1.1 — design

Status: draft for approval · Date: 2026-11-17 · Repo: github.com/jshmlnd/calify

## Intent

Calify 1.0.0 is a Spotify-style player (React/Vite, Electron for Windows, Capacitor for Android) whose music is the user's own imported files, plus an optional Spotify login. 1.1 turns it into a small social music app built around **your own files**: accounts, customizable profiles that signed-in users can see and follow, and **Listen together**, where up to 5 people hear the host's music live and chat. It also drops the Spotify and CSV paths, fixes file removal, cuts battery use, and adds an in-app changelog, bug reports and self-updating.

## Goals

1. **Cleanup**
   - Remove Spotify login/library/playback and the CSV playlist import entirely.
   - Go back to stock Electron (castLabs/Widevine and EVS signing existed only for Spotify).
2. **Remove one imported file.** Local-file tracks get **Remove from Calify** in their right-click and "…" menus; it deletes only Calify's copy (IndexedDB file + art + list entry) and removes the track from Liked Songs, playlists, history and queue. Settings → "Remove all" stays.
3. **Battery and efficiency** (desktop and Android):
   - Pause all CSS animations when the window/app is hidden or minimized; pause the awake-cat and paw animations while music is paused (the sleeping cat's slow breathing may stay).
   - Progress UI updates only as often as it visibly moves, without re-rendering unrelated components.
   - Remove expensive blur effects (full-screen backdrop `filter: blur(60px)`, any decorative blur).
   - No timers or polling running while nothing plays.
4. **What's New (changelog).**
   - In-app page reachable from the account menu, listing versions newest first, each split into *New* and *Fixed*.
   - Content is bundled in the app (works offline).
   - Shown automatically once after each update ("Calify 1.1 is here").
   - Includes a 1.1.0 entry describing everything in this doc, and a 1.0.0 entry.
5. **Report a bug.**
   - Form in the account menu and Help menu: "What happened?" (required), "What did you expect?" (optional).
   - Calify attaches app version, platform (windows/android) and user id if signed in.
   - Stored in Supabase; read by the owner in the Supabase dashboard. Works signed out.
6. **Accounts (Supabase).**
   - Sign in / sign up with **Google** only for now. Facebook and Apple are deferred; the sign-in screen should make adding them later a matter of enabling them in Supabase plus a button.
   - Signing in is optional: local playback works signed out and offline.
   - Sign-in unlocks profiles, following, People search and Listen together.
7. **Profiles.**
   - Only signed-in users have one, can edit it, or can see other profiles.
   - Editable: name, bio, profile photo, **background** (decorates only their profile page), **accent color** and **theme** (apply to their whole Calify app *and* tint their profile for visitors).
   - Themes: **Calico** (current warm dark, default), **Midnight** (cool blue-black), **Daylight** (light). The cat mascot appears in all.
   - Accent: 8 preset swatches (ginger default) plus a custom picker; adjust automatically if the chosen color would make text unreadable (WCAG AA against the theme's surfaces).
   - Shows: public playlists, followers, following, and **last played** song.
   - **Public playlists:** each Calify playlist gets a "Make public" switch (off by default). Visitors see its picture and song list (title, artist, album, duration). **Not playable.**
   - **Last played:** title/artist/art of the most recent song; not playable; not updated during Private session.
   - **Follow / Following** buttons. Tapping counts lists those people.
   - Search gets a **People** section (by name), shown only to signed-in users.
   - Layout follows the reference (Spotify profile): big round photo, "Profile" label, huge name, counts line, then sections. Spotify's "Top artists this month" is **not** included.
8. **Listen together** (2–5 people incl. host):
   - **Start:** host taps **Start a session**, gets a code like **CALI-0000** (format: `CALI-` + 4 digits, from the owner's link example) and a shareable link `https://calify.zjkm.tech/calify/join?c=CALI-0000`. Others join by code, by link, or by an **Invite** from the host on a profile of someone the host follows.
   - **Host approves every joiner:** the host sees "Mia wants to join — Allow / Deny". Until allowed, the joiner gets no audio, chat or library. Deny, or no answer within 60 s, shows "The host didn't let you in". An Invite from the host counts as pre-approved.
   - **Join link page:** a small static page on the owner's domain (Cloudflare, `calify.zjkm.tech/calify/join`). It tries to open Calify via `calify://join/CALI-0000` and otherwise shows the Windows and Android download links (latest GitHub release). Calify registers `calify://` on Windows (Electron protocol handler + NSIS, single-instance hand-off) and Android (intent filter, host `join`). The privacy policy page lives on the same site (`calify.zjkm.tech/calify/privacy`).
   - **Who can do what:**
     - Only the host controls playback (play, pause, seek, skip, next, previous, shuffle, repeat).
     - Listeners can browse the host's library read-only and **Add to queue**.
     - Added songs go straight into the host's Next in queue, tagged "Added by <name>". The host can remove them; there's no approval step.
     - Listeners keep their own volume and can leave.
   - **Audio:** the host's playback is streamed live to each listener (approach A below), so everyone hears the same moment. Listeners see now playing, art and lyrics (fetched from LRCLIB by title/artist).
   - **Chat:** text messages plus events ("Mia joined", "Mia queued *Iris*"). Lives only for the session, not stored.
   - **Ending:** host leaving ends the session for everyone. A listener leaving doesn't affect others. A 6th person is refused ("Session is full").
   - **Background on Android:**
     - The host's session keeps running with the screen off or the app in the background: the stream, the Realtime connection and the queue keep working, under the existing media foreground service plus whatever native keep-alive is needed.
     - Listeners keep hearing audio in the background too, with a media notification.
     - If a listener's connection drops, it reconnects when the app returns.
   - **UI:** a session panel on the right (desktop, replacing the Queue panel while in a session); full-screen sheet on phones. Sketch:

     ```
     ┌ Listening together · CALI-482 ─── ✕ ┐
     │ (You) Host · Mia · Leo               │
     │ ▶ Now playing: Iris                  │
     │ Next: Folded · added by Mia          │
     │──────────────────────────────────────│
     │ Leo: this song 🔥                     │
     │ Mia queued "Iris"                    │
     │ [ Message…                     Send ]│
     └──────────────────────────────────────┘
     ```
9. **Updates.**
   - Releases are published to **GitHub Releases on jshmlnd/calify** (public repo).
   - **Windows:** "Check for updates" in the account menu; a quiet check on startup. When an update is downloaded, show "Calify X is ready — restart to update"; install on restart.
   - **Android:** "Check for updates" finds a newer release APK. Calify downloads it and triggers Android's install prompt (the user grants "install unknown apps" for Calify once).
   - What's New opens after an update.
10. **Version:** 1.1.0 (package.json, Android versionName/versionCode, About text).

## Non-goals

- Spotify, CSV import, Audius, or any shared music catalog.
- Facebook and Apple sign-in (deferred to a later version).
- Spotify's "Top artists this month".
- Screenshots in bug reports.
- Persisted chat history.
- iOS/macOS builds.
- Playing someone else's playlist from their profile.

## Anti-goals (failure even if it "works")

- **Music files leave the user's device** to a server. Listen together streams audio live; nothing is uploaded or stored.
- **A secret ships inside the app or git:** Cloudflare token, Supabase service key, GitHub token. Only the Supabase URL and anon key may be in the app.
- **Local playback needs an account or a network.**
- **1.0 data is lost:** imported files, Calify playlists, Liked Songs, settings must survive the update. Only Spotify-sourced entries are dropped (they can't play any more).
- **Battery gets worse:** new realtime connections must close when not in a session.

## Constraints

- **Existing stack:** React 19 + Vite, zustand (persisted store with versioned `migrate`), Electron (NSIS via electron-builder), Capacitor 8 Android, idb-keyval for local files.
- **Supabase free tier:** Postgres + RLS, Auth, Realtime, Storage, Edge Functions. Storage ~1 GB; keep images small (photo/background/covers resized client-side, e.g. ≤ 1024 px JPEG/WebP).
- **Google sign-in:**
  - Needs a Google Cloud OAuth client and consent screen, created by the owner.
  - The consent screen needs a **privacy policy URL**, served at `calify.zjkm.tech/calify/privacy`.
- **OAuth redirect:**
  - Desktop uses the existing loopback catcher in the Electron main process (`http://127.0.0.1:43821/callback`), with Supabase PKCE (`signInWithOAuth` with `skipBrowserRedirect`, then `exchangeCodeForSession`).
  - Android uses the existing `calify://auth` deep link (intent filter already present) with `@capacitor/browser` and the Capacitor App `appUrlOpen` event.
  - Both URLs go in Supabase's redirect allow list.
  - The Android `LoopbackAuthPlugin` is then unused; delete it.
- **Relay:**
  - Cloudflare TURN. The API token lives only as Supabase Edge Function secrets (`CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`).
  - The owner rotates the token that was pasted in chat and enters the new one.
- **GitHub publishing** needs a `GH_TOKEN` in the publisher's environment only.
- **Windows builds are unsigned** (SmartScreen warning on install; electron-updater still works unsigned).
- **Android signing:**
  - Every release keeps using this PC's debug key (`C:\Users\Administrator.JOSHUAA\.android\debug.keystore`), so 1.1 installs over 1.0 without data loss.
  - The owner backs this file up; losing it means users must reinstall.
  - Releases must be built on this PC or with this keystore.
- **Tooling access:** the owner allowed using, from this PC:
  - the Supabase CLI: tables, RLS, storage, the Edge Function, secrets;
  - Cloudflare's CLI: hosting the join and privacy pages on `calify.zjkm.tech`.

## Approaches considered

**Listen together audio:**
- **A. Live stream from host — chosen.**
  - Host captures its `<audio>` output (`HTMLMediaElement.captureStream()`) and sends it over one WebRTC peer connection per listener (mesh, max 4, Opus).
  - Signaling, presence, chat and queue requests go over Supabase Realtime.
  - STUN first, Cloudflare TURN as fallback; credentials minted per session by a Supabase Edge Function for signed-in users.
  - Trade-offs: perfect sync, no storage, no copies of files, near-zero cost; host device does more work (~0.5 Mbps up at 4 listeners) and quality is streaming-grade.
- **B. Upload songs to Supabase Storage and play in sync — rejected.** Free tier fills in hours, slow song starts, sync drift, copies of music on a server (copyright).
- **C. Everyone must own the same files — rejected.** Breaks "listeners queue from the host's library".

**Relay provider:**
- **Cloudflare TURN — chosen.** 1,000 GB/month free, then $0.05/GB; est. ≤ 0.25 GB/hour even when all 4 listeners are relayed.
- **Metered — rejected.** 0.5–5 GB/month free, then $99/month.

**Release hosting:**
- **GitHub Releases on the public repo — chosen.** Free, no practical limits, electron-updater native.
- **Separate public releases repo — not needed** (repo is public).
- **Supabase Storage — rejected.** ~1 GB storage, ~5 GB/month egress vs a ~125 MB installer.

## Decisions already made (by the owner)

- **Listen together:** approach A with Cloudflare TURN; host-only playback controls; listeners queue from the host's library; chat; 2–5 people; the host approves each joiner; the host's session keeps running in the background on Android.
- **Join link:** `calify.zjkm.tech/calify/join?c=CALI-0000`.
- **Signing:** Android keeps the current debug key.
- **Tooling:** the existing Supabase project and Cloudflare account are used through their CLIs.
- Accounts via Supabase with **Google only** for now (Facebook and Apple deferred). Only signed-in users customize/see profiles.
- Profile fields as listed in Goal 7. Background is profile-only; accent + theme apply app-wide and tint the profile.
- Updates via GitHub Releases on jshmlnd/calify.
- Proposals the owner accepted without changes: optional sign-in, the theme set and accent presets, per-file removal, the changelog behaviour, bug report fields, the battery measures, and the "Make public" switch.

## Data (Supabase)

- `profiles` (id = auth user id): name, bio, avatar_path, background_path, accent, theme, last_played (title, artist, art_path?), updated_at.
  - RLS: select for authenticated; insert/update own row.
- `follows` (follower, followee, created_at; pk both).
  - RLS: select for authenticated; insert/delete where follower = self.
- `public_playlists`: id, owner, local_id (Calify playlist id), name, cover_path, tracks (json: title, artist, album, duration), updated_at.
  - RLS: select for authenticated; write own.
  - Synced when a public playlist changes; deleted when made private or deleted.
- `bug_reports`: id, user_id (nullable), what, expected, app_version, platform, created_at.
  - RLS: insert for anon + authenticated; no select from the app.
- `sessions`: code (unique while active), host, created_at, ended_at. Used to hand out unique codes and validate joins.
- **Storage:**
  - Buckets for avatars, backgrounds and playlist covers, readable only by authenticated users (signed URLs), writable by the owner's own path.
  - Local-file album art is **not** uploaded except as a public playlist's cover or the last-played art (small, resized).
- **Edge Function** `turn-credentials`:
  - Requires a valid user JWT.
  - Calls Cloudflare's generate-ice-servers API with a short TTL and returns the ICE servers.
- **Realtime channel per session**, carrying:
  - presence: members, role;
  - broadcast: chat, queue-request, now-playing state, end, WebRTC offers/answers/ICE;
  - library snapshot: track metadata only, sent by the host on request.
- **Per-user channel** for invites while the app is open.

## Left to the builder

- Component structure and exact layouts, following existing components (Card, Shelf, TrackList, RightPanel, Overlays) and the calico styles.
- **How the library snapshot is sent:** chunking or paging, and its size limits.
- **Session codes:** how they're generated and retried on collision.
- **Signed-URL lifetime.**
- **Rate limits** for chat and queue requests.
- **Opus bitrate.**
- **The Android in-app APK download/install mechanism:** a small native helper or plugins, whichever is smallest.
- **Store migration v3:** drop `source: 'spotify'` tracks and Spotify fields the same way `dropAudius` does, with a test.
- **Tests** for the non-trivial logic: migration, accent contrast adjustment, code generation, queue/permission rules for host vs listener.

## Calls made by the designer (owner to check)

- **Code format:** 4 digits (`CALI-0000`), read from the owner's link example. 3 digits gives only 1,000 combinations.
- **Listener background playback:** goes beyond the owner's "yes for the host", because listening with the screen off is the main way people use it.
- **Join requests:** time out after 60 s.
- **`captureStream()`:** verified in the Android WebView at the start of the build. If it fails, the build stops and the owner is asked before any fallback.
