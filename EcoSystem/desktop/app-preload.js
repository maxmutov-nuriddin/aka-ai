// Asosiy Jigar oynasi uchun yagona ko'prik (Node, fayl, buyruq — yo'q):
// - status: Jigar holati (tinglayapti / o'ylayapti / gapiryapti) — tray'da ko'rinadi, oyna ochilmaydi;
// - onVisibility: oyna yashirildi/ko'rindi — sahifa animatsiyani to'xtatadi (fonda tejamkor).
const { contextBridge, ipcRenderer } = require("electron");

const STATES = new Set(["idle", "listening", "transcribing", "thinking", "speaking"]);

contextBridge.exposeInMainWorld("jigarDesktop", {
  status: (state) => {
    if (STATES.has(state)) ipcRenderer.send("jigar:status", state);
  },
  /** Mikrofon tugmasi: ruxsat yo'q bo'lsa — ilova ruxsat oynasini qayta ko'rsatadi. true — ruxsat berildi. */
  requestMic: () => ipcRenderer.invoke("jigar:request-mic"),
  /** Jurnal uchun: ilova ichidagi ruxsat holati (saqlangan javob, manzil o'zimizmi). */
  micInfo: () => ipcRenderer.invoke("jigar:mic-info"),
  onVisibility: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("jigar:visibility", (_event, visible) => callback(Boolean(visible)));
  },
});
