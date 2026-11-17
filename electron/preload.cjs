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
})
