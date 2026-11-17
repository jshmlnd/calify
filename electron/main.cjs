const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const path = require('path')
const http = require('http')

let win, normalBounds
if (!app.requestSingleInstanceLock()) app.quit()

// Listen together links: calify://join/CALI-0000 (the renderer validates the code).
const joinCode = argv => argv.map(a => /^calify:\/\/join\/([^/?#]+)/i.exec(String(a))?.[1]).find(Boolean)
let pendingJoin = joinCode(process.argv)   // started by a link
const sendJoin = code => { if (!code) return; if (win) { if (win.isMinimized()) win.restore(); win.focus(); win.webContents.send('join', code) } else pendingJoin = code }
// Packaged only: in dev this would point calify:// at the bare Electron binary. The NSIS installer registers it too.
if (app.isPackaged) app.setAsDefaultProtocolClient('calify')
app.on('open-url', (e, url) => { e.preventDefault(); sendJoin(joinCode([url])) })   // macOS
ipcMain.handle('join-pending', () => { const c = pendingJoin; pendingJoin = null; return c })

function create() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 820, minHeight: 600,
    backgroundColor: '#000000', title: 'Calify',
    icon: path.join(__dirname, '../build/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#b3b3b3', height: 64 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  })
  Menu.setApplicationMenu(null)
  const dev = process.env.VITE_DEV_SERVER_URL
  dev ? win.loadURL(dev) : win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

ipcMain.on('mini', (_, on) => {
  if (on) {
    normalBounds = win.getBounds()
    win.setMinimumSize(280, 280)
    win.setBounds({ width: 340, height: 400 })
    win.setAlwaysOnTop(true, 'floating')
    win.setTitleBarOverlay({ height: 32 })
  } else {
    win.setAlwaysOnTop(false)
    win.setMinimumSize(820, 600)
    if (normalBounds) win.setBounds(normalBounds)
    win.setTitleBarOverlay({ height: 64 })
  }
})
ipcMain.on('zoom', (_, f) => win.webContents.setZoomFactor(f))
ipcMain.on('quit', () => app.quit())

// Supabase project URL (same as VITE_SUPABASE_URL; main can't read Vite env). Only its Google sign-in page may be opened.
const AUTH_PREFIX = 'https://yfbfsskdalovjpdbcndq.supabase.co/auth/v1/authorize?'

// Sign-in: catch the redirect on a one-shot 127.0.0.1 server (fixed port 43821, in the Supabase redirect allow-list).
// Resolves with the callback's query ('?code=…' or '?error=…').
ipcMain.handle('auth', (_, url) => new Promise((resolve, reject) => {
  if (typeof url !== 'string' || !url.startsWith(AUTH_PREFIX)) return reject(new Error('Bad sign-in URL'))
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1')
    if (u.pathname !== '/callback') { res.writeHead(404); return res.end() }
    const msg = u.searchParams.has('code') ? 'You’re signed in to Calify. You can close this tab.' : 'Sign-in didn’t finish. You can close this tab and try again in Calify.'
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><title>Calify</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1a1410;color:#fbf3e6;font:18px system-ui">${msg}</body>`)
    clearTimeout(timer); srv.close()
    if (win.isMinimized()) win.restore()
    win.focus()
    resolve(u.search)
  })
  const timer = setTimeout(() => { srv.close(); reject(new Error('Sign-in timed out')) }, 5 * 60 * 1000)
  srv.on('error', e => { clearTimeout(timer); reject(new Error(e.code === 'EADDRINUSE' ? 'Port 43821 is busy, so sign-in cannot finish. Close the app using it and try again.' : e.message)) })
  srv.listen(43821, '127.0.0.1', () => shell.openExternal(url))
}))

app.on('second-instance', (_, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } sendJoin(joinCode(argv)) })
app.whenReady().then(create)
app.on('window-all-closed', () => app.quit())
