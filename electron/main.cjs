const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron')
const path = require('path')
const http = require('http')

let win, normalBounds
if (!app.requestSingleInstanceLock()) app.quit()

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

// Sign-in: catch the redirect on a one-shot 127.0.0.1 server (fixed port 43821, same as Android).
ipcMain.handle('auth', (_, url) => new Promise((resolve, reject) => {
  // Task 5 restricts this to the Supabase auth host.
  if (typeof url !== 'string' || !url.startsWith('https://')) return reject(new Error('Bad sign-in URL'))
  let redirect
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1')
    if (u.pathname !== '/callback') { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<!doctype html><title>Calify</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1a1410;color:#fbf3e6;font:18px system-ui">You’re signed in. You can close this tab and go back to Calify.</body>')
    clearTimeout(timer); srv.close()
    if (win.isMinimized()) win.restore()
    win.focus()
    resolve({ redirect, query: u.search })
  })
  const timer = setTimeout(() => { srv.close(); reject(new Error('Sign-in timed out')) }, 5 * 60 * 1000)
  srv.on('error', e => { clearTimeout(timer); reject(new Error(e.code === 'EADDRINUSE' ? 'Port 43821 is busy, so sign-in cannot finish. Close the app using it and try again.' : e.message)) })
  srv.listen(43821, '127.0.0.1', () => {
    redirect = `http://127.0.0.1:${srv.address().port}/callback`
    shell.openExternal(url.replace('__REDIRECT__', encodeURIComponent(redirect)))
  })
}))

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus() } })
app.whenReady().then(create)
app.on('window-all-closed', () => app.quit())
