// Jigarning "qo'llari" — qurilmalardagi asboblar (Claude tool use). Bajaruvchi — desktop ilova (desktop/tools.js).
// Ko'rish, ochish, ovoz, ilovalar, YouTube — so'ramasdan; buyruq, fayl yozish, hamma ilovalarni yopish — "Ha" bilan.
// Har asbobda ixtiyoriy `device` — qaysi qurilmada (aytilmasa: chat yozilgan kompyuter yoki yagona ulangani).
// Bajaruvchi va ruxsat — server/agent/toolbox.js.

const TEXT_RESULT_MAX = 20_000; // asbob natijasi (matn) modelga shuncha belgigacha
const SUMMARY_MAX = 300;

const DEVICE_PROP = {
  device: { type: "string", description: "Qaysi qurilmada (nomi, masalan 'MacBook'). Aytilmagan bo'lsa — yozma." },
};
const enumOf = (values, description) => ({ type: "string", enum: values, description });

/** Yangi asboblar: ovoz va media, ilovalar, YouTube (Jigar pleeri), tizim. */
const CONTROL_TOOLS = [
  {
    name: "pc_media",
    description: "Kompyuter ovozi va media: ovozni foizga qo'yish yoki ±10%, o'chirish/yoqish; musiqa (Spotify, Music yoki Jigar YouTube pleeri) — play/pause, keyingi, oldingi; status — hozirgi ovoz.",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["volume_set", "volume_up", "volume_down", "mute", "unmute", "play_pause", "next", "previous", "status"], "Amal"),
        level: { type: "integer", minimum: 0, maximum: 100, description: "volume_set uchun: 0-100" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_apps",
    description: "Ilovalar: list — ochiq ilovalar; open, focus (oldinga chiqarish), hide (yashirish), quit (yopish) — `app` nomi bilan; hide_all — hammasini yashirish (ish stoli); quit_all — hammasini yopish (egasidan ruxsat so'raladi).",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["list", "open", "focus", "hide", "quit", "hide_all", "quit_all"], "Amal"),
        app: { type: "string", description: "Ilova nomi (list'dagi kabi), masalan 'Telegram', 'Google Chrome'" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_youtube",
    description: "YouTube — Jigarning o'z pleer oynasida (ovozi tizimdan alohida boshqariladi). search — 5 ta natija; play — `url` yoki `query` (birinchi natija), `seconds` — boshlanish vaqti; pause, resume; seek — aniq vaqtga (`seconds`); forward/back — `seconds` ga (standart 10); volume — YouTube ovozi `level` (0-100); mute, unmute; fullscreen; close; status — nom, vaqt, ovoz.",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["search", "play", "pause", "resume", "seek", "forward", "back", "volume", "mute", "unmute", "fullscreen", "close", "status"], "Amal"),
        query: { type: "string", description: "Qidiruv so'zi (search, play)" },
        url: { type: "string", description: "YouTube havolasi yoki video id (play)" },
        seconds: { type: "integer", minimum: 0, description: "Soniyalarda: 1:30 = 90" },
        level: { type: "integer", minimum: 0, maximum: 100, description: "volume uchun: 0-100" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "home_tv",
    description: "Uydagi televizor (shu kompyuter bilan bir Wi-Fi'da): discover — tarmoqdan topish; youtube — TV'ning YouTube ilovasida video (`query` yoki `url`, `seconds` — boshlanish); volume (`level` 0-100), volume_up, volume_down, mute, unmute; status. `tv` — TV nomi yoki IP (bitta bo'lsa yozma).",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["discover", "youtube", "volume", "volume_up", "volume_down", "mute", "unmute", "status"], "Amal"),
        tv: { type: "string", description: "TV nomi yoki IP" },
        query: { type: "string", description: "YouTube qidiruv so'zi" },
        url: { type: "string", description: "YouTube havolasi yoki video id" },
        seconds: { type: "integer", minimum: 0, description: "Boshlanish vaqti, soniyada" },
        level: { type: "integer", minimum: 0, maximum: 100, description: "Ovoz 0-100" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_system",
    description: "Tizim: lock — ekranni qulflash; sleep_display — ekranni o'chirish; battery — batareya; info — tizim, xotira, ishlash vaqti.",
    input_schema: {
      type: "object",
      properties: { action: enumOf(["lock", "sleep_display", "battery", "info"], "Amal") },
      required: ["action"],
      additionalProperties: false,
    },
  },
];

/** Kuchli asboblar: quvvat, dasturlash (VS Code, Claude Code), xabarlar. */
const POWER_TOOLS = [
  {
    name: "pc_power",
    description: "Kompyuter quvvati: lock (qulflash), sleep (uxlatish), shutdown (o'chirish), restart (qayta yoqish). shutdown/restart — egasidan ruxsat bilan.",
    input_schema: {
      type: "object",
      properties: { action: enumOf(["lock", "sleep", "shutdown", "restart"], "Amal") },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_dev",
    description: "Dasturlash: open — loyihani VS Code'da ochish; claude — loyiha papkasida Claude Code'ga prompt berish (fonda ishlaydi, natija logga yoziladi; visible=true — Terminal oynasida ko'rinadi); status — oxirgi Claude Code ishining holati va natijasi (log oxiri). `project` — saqlangan loyiha nomi yoki `path` — papka.",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["open", "claude", "status"], "Amal"),
        project: { type: "string", description: "Saqlangan loyiha nomi (projects asbobi)" },
        path: { type: "string", description: "Papka yo'li (loyiha saqlanmagan bo'lsa)" },
        prompt: { type: "string", description: "Claude Code uchun topshiriq (claude)" },
        visible: { type: "boolean", description: "Terminal oynasida ko'rinsin (claude)" },
        run: { type: "string", description: "status uchun: ish id'si (bo'lmasa — oxirgisi)" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_message",
    description: "Xabarlar (Mac — Messages ilovasi orqali iMessage/SMS): contacts — kontaktlardan ism bo'yicha telefon raqamini topish; send — xabar yuborish (`to` — raqam yoki email, `text`). Har yuborish egasining ruxsati bilan.",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["contacts", "send"], "Amal"),
        query: { type: "string", description: "Kontakt ismi (contacts)" },
        to: { type: "string", description: "Telefon raqami (+998...) yoki iMessage email (send)" },
        text: { type: "string", description: "Xabar matni (send)" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
];

/** Telefon (Android agent) — telefon ulangan bo'lsa ishlaydi. */
const PHONE_TOOLS = [
  {
    name: "phone",
    description: "Telefon (Android): volume_set (level), volume_up, volume_down, mute, unmute; play_pause, next, previous (musiqa); apps — ilovalar ro'yxati; open_app (app — nomi, masalan 'Telegram'); youtube (query yoki url, seconds); open_url (url); sms (to, text — ruxsat bilan); call (to — terish oynasini ochadi); contacts (query); battery; flashlight_on, flashlight_off; find — telefonni topish (20 s baland ovoz).",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["volume_set", "volume_up", "volume_down", "mute", "unmute", "play_pause", "next", "previous", "apps", "open_app",
          "youtube", "open_url", "sms", "call", "contacts", "battery", "flashlight_on", "flashlight_off", "find"], "Amal"),
        level: { type: "integer", minimum: 0, maximum: 100 },
        app: { type: "string" }, query: { type: "string" }, url: { type: "string" }, seconds: { type: "integer", minimum: 0 },
        to: { type: "string", description: "Telefon raqami (+998...)" }, text: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
];

const BASE_TOOLS = [
  {
    name: "pc_screen_text",
    description: "Ekrandagi matnni o'qish (oldingi ilova va oynadagi yozuvlar, tugmalar, maydonlar) — suratsiz va tez. 'Ekranimda nima bor', 'xatoni o'qi' — avval shu; rasm, grafik yoki dizayn kerak bo'lsa — pc_screenshot.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "pc_screenshot",
    description: "Egasining kompyuter ekranini ko'radi (hozirgi holat surati). Ekranda nima borligini bilish, xatoni ko'rish yoki maslahat berish uchun.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "pc_windows",
    description: "Kompyuterda ochiq oynalar va ilovalar ro'yxati (nomlari).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "pc_list_dir",
    description: "Papkadagi fayl va papkalar ro'yxati. Yo'l uy papkasi ichida bo'lishi kerak; '~' — uy papkasi (masalan '~/Desktop').",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Papka yo'li, masalan ~/Documents" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_read_file",
    description: "Matnli faylni o'qiydi (kod, hujjat, eslatma; ko'pi bilan ~200 KB). Maxfiy fayllar (.ssh, .env, kalitlar) o'qilmaydi.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Fayl yo'li, masalan ~/Desktop/reja.txt" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_open",
    description: "Kompyuterda ochadi: veb manzil (https://...), ilova nomi (masalan 'Telegram', 'Safari') yoki fayl/papka yo'li.",
    input_schema: {
      type: "object",
      properties: { target: { type: "string", description: "URL, ilova nomi yoki fayl yo'li" } },
      required: ["target"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_run_command",
    description: "Terminal buyrug'ini bajaradi (macOS/Linux — zsh/bash, Windows — PowerShell). Bajarishdan oldin egasidan ruxsat so'raladi. Faqat kerak bo'lganda ishlat, xavfsizroq yo'l bo'lsa — o'shani tanla.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Bitta buyruq" },
        reason: { type: "string", description: "Egasiga: nima qilinadi va nima uchun (bitta gap, o'zbekcha)" },
      },
      required: ["command", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "pc_write_file",
    description: "Faylga yozadi (yangi fayl yoki ustidan yozish). Oldin egasidan ruxsat so'raladi.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Fayl yo'li, masalan ~/Desktop/xat.txt" },
        content: { type: "string", description: "Faylning to'liq mazmuni" },
        reason: { type: "string", description: "Egasiga: nima yoziladi va nima uchun (bitta gap)" },
      },
      required: ["path", "content", "reason"],
      additionalProperties: false,
    },
  },
];

/** Claude'ga beriladigan asboblar (qurilma ulangan bo'lsa); har biriga ixtiyoriy `device`. */
export const PC_TOOLS = [...BASE_TOOLS, ...CONTROL_TOOLS, ...POWER_TOOLS, ...PHONE_TOOLS].map((tool) => ({
  ...tool,
  input_schema: { ...tool.input_schema, properties: { ...tool.input_schema.properties, ...DEVICE_PROP } },
}));

export const PC_TOOL_NAMES = new Set(PC_TOOLS.map((t) => t.name));
// Qachon "Ha" so'ralishi — ruxsat darajasiga bog'liq: server/agent/access.js (needsConfirm).

/** Ilovada ko'rinadigan holat matni (typing pufakchasida). */
export const TOOL_STATUS = {
  pc_screenshot: "🖥 Ekranga qarayapman",
  pc_screen_text: "📖 Ekrandagi matnni o'qiyapman",
  pc_windows: "🪟 Oynalarni ko'ryapman",
  pc_list_dir: "📁 Papkani ko'ryapman",
  pc_read_file: "📄 Faylni o'qiyapman",
  pc_open: "🚀 Ochyapman",
  pc_run_command: "⌨️ Buyruqni bajaryapman",
  pc_write_file: "💾 Faylga yozyapman",
  pc_media: "🔊 Ovoz va musiqa",
  pc_apps: "🪟 Ilovalar",
  pc_youtube: "▶️ YouTube",
  pc_system: "⚙️ Tizim",
  home_tv: "📺 Televizor",
  pc_power: "🔌 Quvvat",
  pc_dev: "💻 Loyiha",
  pc_message: "✉️ Xabar",
  phone: "📱 Telefon",
};

/** Asbob qaysi turdagi qurilmada bajariladi. */
export const toolKind = (name) => (name === "phone" ? "phone" : "pc");

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}\n…(qisqartirildi)` : s);
export const text = (value) => ({ type: "text", text: clip(String(value ?? ""), TEXT_RESULT_MAX) });

/** Tasdiq oynasi uchun qisqa tavsif: nima bajariladi. */
export function describeAction(name, input) {
  const reason = String(input?.reason ?? "").slice(0, SUMMARY_MAX);
  if (name === "pc_run_command") return { reason, detail: String(input?.command ?? "").slice(0, 2000) };
  if (name === "pc_write_file") {
    const size = String(input?.content ?? "").length;
    return { reason, detail: `${String(input?.path ?? "").slice(0, 500)} (${size} belgi)` };
  }
  if (name === "pc_apps") return { reason: reason || "Barcha ochiq ilovalar yopiladi (saqlanmagan ish bo'lsa, ilova o'zi so'raydi).", detail: "quit_all" };
  if (name === "pc_power") return { reason: reason || "Kompyuter quvvati", detail: String(input?.action ?? "") };
  if (name === "pc_dev") return { reason: reason || `Claude Code: ${String(input?.project ?? input?.path ?? "")}`, detail: String(input?.prompt ?? "").slice(0, 2000) };
  if (name === "pc_message" || name === "phone") return { reason: reason || `SMS: ${String(input?.to ?? "")}`, detail: String(input?.text ?? "").slice(0, 1000) };
  return { reason, detail: "" };
}

/** Desktop natijasini tool_result mazmuniga aylantiradi: { image } — rasm, { error } — xato, qolgani — matn. */
export function toToolContent(result) {
  if (result?.error) return { content: [text(result.error)], isError: true };
  const blocks = [];
  if (typeof result?.image === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(result.image)) {
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: result.image } });
  }
  if (result?.text != null) blocks.push(text(result.text));
  if (!blocks.length) blocks.push(text("Bajarildi."));
  return { content: blocks, isError: false };
}
