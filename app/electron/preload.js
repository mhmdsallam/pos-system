const { contextBridge, ipcRenderer } = require("electron");

/**
 * Production-safe Electron API bridge
 * Only exposes necessary functions through contextBridge for security
 */
contextBridge.exposeInMainWorld("electron", {
  // App path
  getAppPath: () => ipcRenderer.invoke("get-app-path"),

  // Printing API - uses IPC to main process
  printHTML: (htmlContent, title) => {
    return ipcRenderer.invoke("print-html", htmlContent, title);
  },

  // Dialog API
  showSaveDialog: (options) => {
    return ipcRenderer.invoke("show-save-dialog", options);
  },

  // Platform info
  platform: process.platform,
});
