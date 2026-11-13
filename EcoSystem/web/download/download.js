// Yuklab olish sahifasi: /api/downloads dan fayllar ro'yxati, foydalanuvchi tizimiga mos karta birinchi.
// Matnlar textContent bilan; QR (server yaratgan SVG) — <img> ichida (skript ishlamaydi).
const $ = (id) => document.getElementById(id);

const PLATFORMS = {
  mac: {
    icon: "🍎", title: "macOS", note: "Apple Silicon va Intel",
    steps: [
      "Yuklangan Jigar-mac.dmg ni oching va Jigar'ni Applications papkasiga torting.",
      "Birinchi marta: Jigar ustida o'ng tugma → Open → Open (ilova imzosiz).",
      "Ekranni ko'rishi uchun: System Settings → Privacy & Security → Screen Recording → Jigar.",
    ],
  },
  windows: {
    icon: "🪟", title: "Windows", note: "Windows 10 / 11",
    steps: [
      "Jigar-win.exe — o'rnatuvchini ishga tushiring. Jigar-win.zip bo'lsa — arxivni istalgan papkaga oching va ichidagi Jigar.exe ni ishga tushiring.",
      "\"Windows protected your PC\" chiqsa: More info → Run anyway (ilova imzosiz).",
      "O'rnatilgach Jigar tray'da turadi; Ctrl+Shift+J — chaqirish.",
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
    icon: "📱", title: "iPhone / iPad", note: "Bosh ekranga qo'shish (PWA)",
    steps: [
      "Apple App Store'dan tashqari ilova o'rnatishga ruxsat bermaydi — Jigar veb-ilova sifatida qo'shiladi.",
      "Safari'da Jigar'ni oching (shu sahifadagi \"Ochish\" tugmasi).",
      "Pastdagi \"Ulashish\" (□↑) → \"Bosh ekranga qo'shish\" (Add to Home Screen).",
      "Mikrofon ishlashi uchun manzil HTTPS bo'lishi kerak.",
    ],
  },
};

/** "Hey Siri, Jigar" — Apple Shortcuts yo'riqnomasi (Mac va iPhone). Server: POST /api/voice. */
function siriCard(origin) {
  const box = node("article", "card");
  box.append(node("h2", null, "🎙 Siri: \"Hey Siri, Jigar\""), node("div", "meta", "Mac va iPhone — Shortcuts (Qisqa buyruqlar) orqali"));
  const steps = [
    "Jigar → Sozlamalar → \"Siri uchun kalit\" → \"Yangi kalit yaratish\" — kalitni nusxalang.",
    "Shortcuts ilovasida yangi buyruq yarating, nomi: Jigar.",
    "1-amal: \"Dictate Text\" (Matnni diktovka qilish), til — o'zbek yoki rus.",
    `2-amal: "Get Contents of URL": ${origin}/api/voice, Method — POST, Headers — Authorization: Bearer <kalit>, Request Body — JSON: text = Dictated Text.`,
    "3-amal: \"Get Dictionary Value\" — kalit: speech.",
    "4-amal: \"Speak Text\" (Matnni gapirish).",
    "Tayyor: \"Hey Siri, Jigar\" deng va buyruqni ayting. Ruxsat kerak bo'lgan ishlar Jigar ilovasida tasdiqlanadi.",
    "Uydan tashqarida ishlashi uchun server HTTPS manzilda bo'lishi kerak (Tailscale yoki Cloudflare Tunnel).",
  ];
  const help = node("details");
  help.open = true;
  help.append(node("summary", null, "Qanday sozlanadi"));
  const list = node("ol");
  for (const step of steps) list.append(node("li", null, step));
  help.append(list);
  box.append(help);
  return box;
}

function myPlatform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  return null;
}

const sizeLabel = (bytes) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function card(platform, file, mine) {
  const info = PLATFORMS[platform];
  const box = node("article", `card${mine ? " mine" : ""}`);
  box.append(node("h2", null, `${info.icon} ${info.title}`), node("div", "meta", info.note));
  const btn = node("a", "btn");
  if (platform === "ios") {
    btn.href = "/app/";
    btn.textContent = "Ochish";
  } else if (file?.ready) {
    btn.href = file.url;
    btn.setAttribute("download", file.name);
    btn.textContent = `Yuklab olish · ${sizeLabel(file.size)}`;
  } else {
    btn.textContent = "Hali tayyor emas";
    btn.setAttribute("aria-disabled", "true");
  }
  box.append(btn);
  if (file?.ready) box.append(node("div", "meta", `SHA-256: ${file.sha256}`));
  const help = node("details");
  help.open = mine;
  help.append(node("summary", null, "Qanday o'rnatiladi"));
  const list = node("ol");
  for (const step of info.steps) list.append(node("li", null, step));
  help.append(list);
  box.append(help);
  return box;
}

async function main() {
  let data = { files: [], version: "", lanUrl: null, qr: null };
  try {
    data = await (await fetch("/api/downloads")).json();
  } catch {
    /* ro'yxat kelmadi — kartalar "tayyor emas" holatida */
  }
  if (data.version) $("version").textContent = `Versiya ${data.version} · kompyuter va telefon uchun`;
  const mine = myPlatform();
  const order = ["mac", "windows", "android", "ios"].sort((a, b) => (b === mine) - (a === mine));
  const byPlatform = Object.fromEntries((data.files ?? []).map((f) => [f.platform, f]));
  $("cards").replaceChildren(...order.map((p) => card(p, byPlatform[p], p === mine)), siriCard(location.origin));
  // QR — kompyuterda ko'rsatiladi (telefonda shart emas).
  if (data.qr && data.lanUrl && mine !== "ios" && mine !== "android") {
    $("qrImg").src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.qr)}`;
    $("lanUrl").textContent = data.lanUrl;
    $("qrBox").hidden = false;
  }
}

main();
