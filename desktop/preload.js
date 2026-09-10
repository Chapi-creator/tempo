const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tempoApp', {
  saveFile: (opts) => ipcRenderer.invoke('save-file', opts),
  openFile: () => ipcRenderer.invoke('open-file')
});