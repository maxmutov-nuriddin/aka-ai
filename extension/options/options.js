// Kengaytma sozlamalari: server manzili, hisobga kirish (token chrome.storage.local'da), mikrofon ruxsati.
const DEFAULT_API = "http://localhost:3000";
const $ = (id) => document.getElementById(id);

const normalizeBase = (value) => String(value || DEFAULT_API).trim().replace(/\/+$/, "");

async function apiBase() {
  const { apiBase: value } = await chrome.storage.sync.get({ apiBase: DEFAULT_API });
  return normalizeBase(value);
}

// ---------- Hisob ----------
async function renderAccount() {
  const { token, user } = await chrome.storage.local.get({ token: "", user: null });
  const signedIn = Boolean(token && user);
  $("signedIn").hidden = !signedIn;
  $("loginForm").hidden = signedIn;
  if (signedIn) {
    $("userName").textContent = user.name;
    $("userEmail").textContent = user.email;
  }
  $("registerLink").href = `${await apiBase()}/login?mode=register`;
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const status = $("loginStatus");
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!email || password.length < 8) {
    status.textContent = "Email va kamida 8 belgili parolni kirit.";
    return;
  }
  status.textContent = "Kirilmoqda…";
  try {
    const res = await fetch(`${await apiBase()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, client: "extension" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server xatosi (${res.status})`);
    await chrome.storage.local.set({ token: data.token, user: data.user });
    $("password").value = "";
    status.textContent = "Kirdingiz. Yon panelga qayting.";
    await renderAccount();
  } catch (err) {
    status.textContent = err.message || "Kirib bo'lmadi. Server manzilini tekshir.";
  }
});

$("logout").addEventListener("click", async () => {
  const { token } = await chrome.storage.local.get({ token: "" });
  try {
    await fetch(`${await apiBase()}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* server bo'lmasa ham, kengaytmadagi token o'chiriladi */
  }
  await chrome.storage.local.remove(["token", "user"]);
  await renderAccount();
});

// ---------- Server manzili ----------
apiBase().then((value) => {
  $("apiBase").value = value;
});
$("save").addEventListener("click", async () => {
  const value = normalizeBase($("apiBase").value);
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error("protocol");
  } catch {
    $("status").textContent = "Manzil noto'g'ri (http:// yoki https:// bilan boshlansin).";
    return;
  }
  await chrome.storage.sync.set({ apiBase: value });
  // Boshqa server — boshqa hisob: eski tokenni o'chiramiz.
  await chrome.storage.local.remove(["token", "user"]);
  $("status").textContent = "Saqlandi. Endi shu serverdagi hisobingga kir.";
  await renderAccount();
});

// ---------- Mikrofon ----------
$("mic").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    $("micStatus").textContent = "Ruxsat berildi. Yon panelga qaytib, mikrofonni bos.";
  } catch {
    $("micStatus").textContent = "Ruxsat berilmadi. Brauzer so'raganda \"Allow\" ni bos.";
  }
});

renderAccount();
