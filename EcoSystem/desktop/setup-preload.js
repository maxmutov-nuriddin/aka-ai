// Server manzili oynasi uchun yagona ko'prik: manzilni asosiy jarayonga yuborish (tekshirib saqlaydi).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jigarSetup", {
  save: (url) => ipcRenderer.invoke("jigar:save-server", String(url ?? "")),
});
