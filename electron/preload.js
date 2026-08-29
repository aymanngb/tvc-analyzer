const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  analyzeBreif: (payload) => ipcRenderer.invoke('analyze-brief', payload),
  saveApiKey: (key) => ipcRenderer.invoke('save-api-key', key),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  exportPDF: (html) => ipcRenderer.invoke('export-pdf', html),
})
