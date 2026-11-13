// Asosiy Jigar oynasi uchun yagona ko'prik (Node, fayl, buyruq — yo'q):
// - status: Jigar holati (tinglayapti / o'ylayapti / gapiryapti) — tray'da ko'rinadi, oyna ochilmaydi;
// - onVisibility: oyna yashirildi/ko'rindi — sahifa animatsiyani to'xtatadi (fonda tejamkor).
const { contextBridge, ipcRenderer } = require("electron");

const STATES = new Set(["idle", "listening", "transcribing", "thinking", "speaking"]);

contextBridge.exposeInMainWorld("jigarDesktop", {
  status: (state) => {
    if (STATES.has(state)) ipcRenderer.send("jigar:status", state);
  },
  onVisibility: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("jigar:visibility", (_event, visible) => callback(Boolean(visible)));
  },
});
