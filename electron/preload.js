const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  chooseSourceFile: () => ipcRenderer.invoke('choose-source-file'),
  analyzeBreif: (payload) => ipcRenderer.invoke('analyze-brief', payload),
  saveApiKey: (key) => ipcRenderer.invoke('save-api-key', key),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  exportPDF: (html) => ipcRenderer.invoke('export-pdf', html),
  exportXLSX: (payload) => ipcRenderer.invoke('export-xlsx', payload),
})
