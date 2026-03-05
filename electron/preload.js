const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API to the React app
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  uploadStart: () => ipcRenderer.invoke('upload:start'),
  uploadComplete: () => ipcRenderer.invoke('upload:complete'),
  getVersion: () => ipcRenderer.invoke('app:version'),
});
