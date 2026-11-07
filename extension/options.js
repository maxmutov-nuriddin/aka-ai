const input = document.getElementById("apiBase");
const status = document.getElementById("status");
chrome.storage.sync.get({ apiBase: "http://localhost:3000" }).then(({ apiBase }) => {
  input.value = apiBase;
});
document.getElementById("save").addEventListener("click", async () => {
  let value = input.value.trim().replace(/\/+$/, "");
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    status.textContent = "Manzil noto'g'ri (http:// yoki https:// bilan boshlansin).";
    return;
  }
  await chrome.storage.sync.set({ apiBase: value });
  status.textContent = "Saqlandi. Yon panelni qayta oching.";
});
