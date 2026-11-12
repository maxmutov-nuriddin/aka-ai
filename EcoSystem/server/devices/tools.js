// Jigarning "qo'llari" — kompyuterdagi asboblar (Claude tool use). Bajaruvchi — desktop ilova (desktop/tools.js).
// Ko'rish (ekran, fayl o'qish, ochish) — so'ramasdan; buyruq bajarish va fayl yozish — egasining "Ha"si bilan.
import { DeviceOfflineError } from "./hub.js";

const TEXT_RESULT_MAX = 20_000; // asbob natijasi (matn) modelga shuncha belgigacha
const SUMMARY_MAX = 300;

/** Claude'ga beriladigan asboblar ro'yxati (faqat kompyuter ulangan bo'lsa). */
export const PC_TOOLS = [
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

const TOOL_NAMES = new Set(PC_TOOLS.map((t) => t.name));
/** Egasining "Ha"sisiz bajarilmaydigan asboblar. */
export const CONFIRM_TOOLS = new Set(["pc_run_command", "pc_write_file"]);

/** Ilovada ko'rinadigan holat matni (typing pufakchasida). */
export const TOOL_STATUS = {
  pc_screenshot: "🖥 Ekranga qarayapman",
  pc_windows: "🪟 Oynalarni ko'ryapman",
  pc_list_dir: "📁 Papkani ko'ryapman",
  pc_read_file: "📄 Faylni o'qiyapman",
  pc_open: "🚀 Ochyapman",
  pc_run_command: "⌨️ Buyruqni bajaryapman",
  pc_write_file: "💾 Faylga yozyapman",
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}\n…(qisqartirildi)` : s);
const text = (value) => ({ type: "text", text: clip(String(value ?? ""), TEXT_RESULT_MAX) });

/** Tasdiq oynasi uchun qisqa tavsif: nima bajariladi. */
export function describeAction(name, input) {
  const reason = String(input?.reason ?? "").slice(0, SUMMARY_MAX);
  if (name === "pc_run_command") return { reason, detail: String(input?.command ?? "").slice(0, 2000) };
  if (name === "pc_write_file") {
    const size = String(input?.content ?? "").length;
    return { reason, detail: `${String(input?.path ?? "").slice(0, 500)} (${size} belgi)` };
  }
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

/**
 * Bitta chat uchun asbob bajaruvchisi. Kompyuter ulanmagan bo'lsa — null (asboblar berilmaydi).
 * @param {{ hub: ReturnType<import("./hub.js").createDeviceHub>, userId: number,
 *           confirm: (action: {tool: string, reason: string, detail: string}) => Promise<boolean>,
 *           onStatus?: (text: string) => void }} deps
 */
export function createPcToolbox({ hub, userId, confirm, onStatus = () => {} }) {
  const status = hub.status(userId);
  if (!status.online) return null;
  return {
    device: status,
    definitions: PC_TOOLS,
    /** @returns {Promise<{ content: object[], isError: boolean }>} */
    async run(name, input) {
      if (!TOOL_NAMES.has(name)) return { content: [text(`Noma'lum asbob: ${name}`)], isError: true };
      let approved = false;
      if (CONFIRM_TOOLS.has(name)) {
        approved = await confirm({ tool: name, ...describeAction(name, input) });
        if (!approved) return { content: [text("Egasi ruxsat bermadi — bajarilmadi. Boshqa yo'l taklif qil yoki so'ra.")], isError: true };
      }
      onStatus(TOOL_STATUS[name]);
      try {
        return toToolContent(await hub.call(userId, { tool: name, input: input ?? {}, approved }));
      } catch (err) {
        const message = err instanceof DeviceOfflineError ? err.message : `Bajarib bo'lmadi: ${err.message}`;
        return { content: [text(message)], isError: true };
      }
    },
  };
}
