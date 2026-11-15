const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('calify', {
  desktop: true,
  mini: on => ipcRenderer.send('mini', on),
  zoom: f => ipcRenderer.send('zoom', f),
  quit: () => ipcRenderer.send('quit'),
  auth: url => ipcRenderer.invoke('auth', url),
})
