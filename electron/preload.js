const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  analyzeBreif: (payload) => ipcRenderer.invoke('analyze-brief', payload),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getProviderKey: (providerId) => ipcRenderer.invoke('get-provider-key', providerId),
  saveProviderKey: (providerId, key) => ipcRenderer.invoke('save-provider-key', providerId, key),
  setActiveProvider: (providerId) => ipcRenderer.invoke('set-active-provider', providerId),
  setProviderModel: (providerId, modelId) => ipcRenderer.invoke('set-provider-model', providerId, modelId),
  exportPDF: (html) => ipcRenderer.invoke('export-pdf', html),
  exportXLSX: (payload) => ipcRenderer.invoke('export-xlsx', payload),
})
