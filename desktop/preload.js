const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tempoApp', {
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  openFile: () => ipcRenderer.invoke('open-file'),
  saveBackup: (content) => ipcRenderer.invoke('save-backup', content),
  onOpenFile: (cb) => ipcRenderer.on('open-tempo-file', (_e, data) => cb(data))
});