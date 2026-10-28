const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  proxyApiRequest: (request) => {
    // This will be handled by the backend proxy in main.js
    // For now, we return a placeholder
    return fetch(request);
  },
});