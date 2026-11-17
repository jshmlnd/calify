const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('calify', {
  desktop: true,
  mini: on => ipcRenderer.send('mini', on),
  zoom: f => ipcRenderer.send('zoom', f),
  quit: () => ipcRenderer.send('quit'),
  auth: url => ipcRenderer.invoke('auth', url),
  // calify://join/CODE: codes arriving now, plus the one Calify was started with. Returns an unsubscribe.
  onJoin: cb => {
    const fn = (_, code) => cb(String(code))
    ipcRenderer.on('join', fn)
    ipcRenderer.invoke('join-pending').then(code => code && cb(String(code)))
    return () => ipcRenderer.removeListener('join', fn)
  },
  // check(): 'none' | 'downloading' | 'ready' | 'error'. onReady(cb) gets the downloaded version (also one already waiting).
  updates: {
    check: () => ipcRenderer.invoke('update-check'),
    install: () => ipcRenderer.send('update-install'),
    onReady: cb => {
      const fn = (_, v) => cb(String(v))
      ipcRenderer.on('update-ready', fn)
      ipcRenderer.invoke('update-ready').then(v => v && cb(String(v)))
      return () => ipcRenderer.removeListener('update-ready', fn)
    },
  },
})
