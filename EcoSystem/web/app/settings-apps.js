// Sozlamalar → "Jigar ilovalari": yuklab olish markazi (alohida sahifa yo'q).
// Ro'yxat — /api/downloads: har platforma — yuklab olish tugmasi, hajmi, SHA-256 va o'rnatish yo'riqnomasi;
// telefon uchun QR-kod (server yaratgan SVG — <img> ichida, skript ishlamaydi); Siri ("Hey Siri, Jigar") yo'riqnomasi.
// Foydalanuvchi tizimiga mos ilova — birinchi va yo'riqnomasi ochiq. Matnlar — textContent (xavfsiz).

const PLATFORMS = {
  mac: {
    icon: "🍎", title: "macOS", note: "Apple Silicon va Intel",
    steps: [
      "Jigar-mac.dmg ni oching va Jigar'ni Applications papkasiga torting.",
      "Birinchi marta: Jigar ustida o'ng tugma → Open → Open (ilova imzosiz).",
      "Ekranni ko'rishi uchun: System Settings → Privacy & Security → Screen Recording → Jigar.",
    ],
  },
  windows: {
    icon: "🪟", title: "Windows", note: "Windows 10 / 11",
    steps: [
      "Jigar-win.zip ni istalgan papkaga oching va ichidagi Jigar.exe ni ishga tushiring (.exe o'rnatuvchi bo'lsa — uni).",
      "\"Windows protected your PC\" chiqsa: More info → Run anyway (ilova imzosiz).",
      "Jigar tray'da turadi va kompyuter yonganda o'zi ishga tushadi; Ctrl+Shift+J — chaqirish.",
    ],
  },
  android: {
    icon: "🤖", title: "Android", note: "Android 7+",
    steps: [
      "Jigar-android.apk ni yuklab, oching.",
      "So'rasa: \"Noma'lum manbalardan o'rnatish\"ga shu brauzer uchun ruxsat bering.",
      "Ilovada mikrofon va (kerak bo'lsa) ekranni ulashishga ruxsat bering.",
    ],
  },
  ios: {
    icon: "📱", title: "iPhone / iPad", note: "Bosh ekranga qo'shish (veb-ilova)",
    steps: [
      "Safari'da Jigar'ni oching (QR-kod yoki manzil orqali).",
      "Pastdagi \"Ulashish\" (□↑) → \"Bosh ekranga qo'shish\".",
      "Mikrofon ishlashi uchun manzil HTTPS bo'lishi kerak.",
    ],
  },
};

// Mac: "Hey Siri, Jigar" — Jigar ilovasi o'zi tinglashni boshlaydi (kalitsiz, to'liq imkoniyat bilan).
const SIRI_MAC_STEPS = [
  "Jigar ilovasi (dmg) o'rnatilgan va ishlab turgan bo'lsin.",
  "Shortcuts (Быстрые команды) ilovasini oching → \"+\" — yangi buyruq, nomi: Jigar.",
  "Amal qo'shing: \"Open URLs\" (Открыть URL-адреса) → manzil: jigar://listen",
  "Tayyor: \"Hey Siri, Jigar\" deng — \"ding\" eshitiladi, keyin buyruqni ayting (\"Telegramni och\").",
];

// iPhone yoki Jigar ilovasisiz: Siri matnni serverga yuboradi (kalit bilan; imkoniyat — "Keng" darajagacha).
const SIRI_STEPS = (origin) => [
  "Sozlamalar → Xavfsizlik → \"Siri uchun kalit\" → \"Yangi kalit yaratish\" — kalitni nusxalang.",
  "Shortcuts ilovasida yangi buyruq yarating, nomi: Jigar.",
  "1-amal: \"Dictate Text\", til — o'zbek yoki rus.",
  `2-amal: "Get Contents of URL": ${origin}/api/voice, Method — POST, Headers — Authorization: Bearer <kalit>, Request Body — JSON: text = Dictated Text.`,
  "3-amal: \"Get Dictionary Value\" — kalit: speech. 4-amal: \"Speak Text\".",
  "Tayyor: \"Hey Siri, Jigar\" deng va buyruqni ayting.",
];

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function myPlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return null;
}

/** "Qanday o'rnatiladi" — yig'iladigan yo'riqnoma. */
function howTo(steps, open, summary = "Qanday o'rnatiladi") {
  const box = el("details", "app-help");
  box.open = open;
  box.append(el("summary", null, summary));
  const list = el("ol");
  for (const step of steps) list.append(el("li", null, step));
  box.append(list);
  return box;
}

function platformRow(platform, file, mine, apiBase) {
  const info = PLATFORMS[platform];
  const row = el("div", `app-row${mine ? " mine" : ""}`);
  const head = el("div", "app-head");
  const name = el("div", "app-title");
  name.append(el("span", "app-name", `${info.icon} ${info.title}`), el("small", "app-note", mine ? `${info.note} · shu qurilma` : info.note));
  head.append(name);
  if (platform === "ios") {
    head.append(el("small", "app-missing", "Safari orqali"));
  } else if (file?.ready) {
    const link = el("a", "app-get", `Yuklab olish${file.version ? ` · v${file.version}` : ""} · ${(file.size / 1024 ** 2).toFixed(0)} MB`);
    link.href = `${apiBase()}${file.url}`;
    link.setAttribute("download", file.name);
    head.append(link);
  } else {
    head.append(el("small", "app-missing", "hali tayyor emas"));
  }
  row.append(head);
  if (file?.ready) row.append(el("small", "app-sha", `SHA-256: ${file.sha256}`));
  row.append(howTo(info.steps, mine));
  return row;
}

function qrBlock(data, mine) {
  if (!data.qr || !data.phoneUrl || mine === "ios" || mine === "android") return null; // telefonda QR shart emas
  const box = el("div", "app-qr");
  const img = el("img");
  img.alt = "Telefon uchun QR-kod";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.qr)}`;
  const text = el("p", null, "Telefonda kamerani QR-kodga qarating — Jigar ochiladi.");
  text.append(el("br"), el("code", null, data.phoneUrl));
  box.append(img, text);
  return box;
}

/**
 * Mac ilovasida: bir tugma bilan "Jigarga ayt" Siri buyrug'i — kalit yaratiladi, buyruq tayyorlanib Shortcuts'da ochiladi
 * (egasi "Qo'shish"ni bosadi). Keyin: "Hey Siri, Jigarga ayt".
 */
function siriInstaller(apiBase, authHeaders) {
  const box = el("div", "app-siri-install");
  const button = el("button", "app-get", "Siri'ga qo'shish (\"Hey Siri, Jigar\")");
  button.type = "button";
  const note = el("small", "app-note", "Bir tugma: Shortcuts ochiladi — \"Добавить\" ni bosing. Keyin: \"Hey Siri, Jigar\".");
  button.addEventListener("click", async () => {
    button.disabled = true;
    note.textContent = "Tayyorlanyapti…";
    try {
      const res = await fetch(`${apiBase()}/api/tokens`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ name: "Mac Siri" }) });
      const { token, error } = await res.json().catch(() => ({}));
      if (!res.ok || !token) throw new Error(error || `HTTP ${res.status}`);
      const result = await window.jigarDesktop.installSiri(token);
      note.textContent = result.ok ? "Shortcuts ochildi — \"Добавить\" ni bosing. Keyin: \"Hey Siri, Jigar\"." : `Bo'lmadi: ${result.error}`;
    } catch (err) {
      note.textContent = `Bo'lmadi: ${err.message}`;
    } finally {
      button.disabled = false;
    }
  });
  box.append(button, note);
  return box;
}

/** Jigar ilovasining ichida: yuklab olish ro'yxati yo'q — faqat Siri (Mac). */
function renderDesktopSiri(list, apiBase, authHeaders) {
  const siri = el("div", "app-row");
  const title = el("div", "app-title");
  title.append(el("span", "app-name", "🎙 Siri"), el("small", "app-note", "\"Hey Siri, Jigar\""));
  const head = el("div", "app-head");
  head.append(title);
  siri.append(head, ...(window.jigarDesktop.installSiri ? [siriInstaller(apiBase, authHeaders)] : []), howTo(SIRI_MAC_STEPS, false, "Siri: Jigar tinglasin (qo'lda)"));
  list.replaceChildren(siri);
}

/** @param {HTMLElement} list @param {() => string} apiBase @param {() => Record<string, string>} authHeaders */
export async function renderApps(list, apiBase, authHeaders = () => ({})) {
  if (window.jigarDesktop) return renderDesktopSiri(list, apiBase, authHeaders); // o'rnatilgan ilovada yuklab olish kerak emas
  let data = { files: [], version: "", phoneUrl: null, qr: null };
  try {
    data = await (await fetch(`${apiBase()}/api/downloads`)).json();
  } catch {
    /* ro'yxat kelmadi — hammasi "tayyor emas" */
  }
  const mine = myPlatform();
  const order = ["mac", "windows", "android", "ios"].sort((a, b) => (b === mine) - (a === mine));
  const byPlatform = Object.fromEntries((data.files ?? []).map((f) => [f.platform, f]));
  const origin = apiBase() || location.origin;
  const siri = el("div", "app-row");
  const siriHead = el("div", "app-head");
  const siriTitle = el("div", "app-title");
  siriTitle.append(el("span", "app-name", "🎙 Siri"), el("small", "app-note", "\"Hey Siri, Jigar\" — Mac va iPhone"));
  siriHead.append(siriTitle);
  siri.append(siriHead, ...(window.jigarDesktop?.installSiri ? [siriInstaller(apiBase, authHeaders)] : []),
    howTo(SIRI_MAC_STEPS, mine === "mac", "Mac: Jigar ilovasi tinglasin"), howTo(SIRI_STEPS(origin), false, "iPhone: Siri orqali buyruq"));
  list.replaceChildren(
    ...(data.version ? [el("small", "app-version", `Versiya ${data.version}`)] : []),
    ...[qrBlock(data, mine)].filter(Boolean),
    ...order.map((p) => platformRow(p, byPlatform[p], p === mine, apiBase)),
    siri,
  );
}
