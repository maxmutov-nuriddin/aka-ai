// Bitta so'rov (chat, Siri, fon vazifasi) uchun Jigarning asboblari: qurilma asboblari (ulangan bo'lsa) + server asboblari.
// Ruxsat — darajaga qarab (access.js); "Ha" — chatda kartada (ask) yoki kechiktirilgan (ilovadagi nudge kartasi).
// Har qurilma amali jurnalga: bajarilgani — HARAKATLAR.md, xatosi — XATOLAR.md.
import { DeviceOfflineError, pickDevice } from "../devices/hub.js";
import { createRequire } from "node:module";
import { PC_TOOLS, PC_TOOL_NAMES, TOOL_STATUS, describeAction, toToolContent, text, toolKind } from "../devices/tools.js";
import { needsConfirm } from "./access.js";
import { SERVER_TOOLS, SERVER_TOOL_NAMES, runServerTool } from "./server-tools.js";

// Faqat ko'rish/o'qish — harakat jurnaliga yozilmaydi.
const READ_TOOLS = new Set(["pc_screenshot", "pc_screen_text", "pc_windows", "pc_list_dir", "pc_read_file"]);
const READ_ACTIONS = new Set(["status", "list", "search", "contacts", "discover", "battery", "info"]);
const isReadOnly = (name, input) => READ_TOOLS.has(name) || READ_ACTIONS.has(input?.action);
const LOG_INPUT_MAX = 300;
// YouTube qidiruvi (telefon uchun serverda: agent faqat video id oladi) — desktop bilan umumiy modul.
const { search: youtubeSearch, videoIdFrom } = createRequire(import.meta.url)("../../desktop/youtube-search.js");

const ok = (value) => ({ content: [text(value)], isError: false });
const fail = (value) => ({ content: [text(value)], isError: true });
const firstText = (r) => r.content.find((b) => b.type === "text")?.text ?? "";

/**
 * @param {{ hub: object, userId: number, currentDeviceId?: string | null, access?: string,
 *           ask?: ((action: object) => Promise<boolean>) | null, onStatus?: (text: string) => void,
 *           services: { journal, watches, projects, scenarios, nudges, settings, approvals } }} deps
 *   ask — chatda "Ha/Yo'q" kartasi; null — kechiktirilgan tasdiq (Siri, fon vazifasi).
 */
export function createToolbox({ hub, userId, currentDeviceId = null, access = "safe", ask = null, onStatus = () => {}, services }) {
  const devices = hub.list(userId);
  let stopped = false;

  /** "Ha" so'rash: true | false | "deferred" (ilovaga karta yuborildi, run() keyin bajariladi). */
  async function confirm(action, run) {
    if (ask) return ask(action);
    const id = services.approvals.defer(userId, run);
    services.nudges.add(userId, "approval", `🔐 ${action.reason}${action.detail ? `\n${action.detail}` : ""}`, id);
    return "deferred";
  }

  async function callDevice(name, input, device) {
    onStatus(TOOL_STATUS[name]);
    const summary = `${name}${input.action ? ` ${input.action}` : ""}`;
    const logged = JSON.stringify(input).slice(0, LOG_INPUT_MAX);
    try {
      const result = await hub.call(userId, device.id, { tool: name, input, approved: true, access });
      if (result?.error) services.journal.add(userId, "error", summary, { kiritish: logged, xato: result.error }, device.name);
      else if (!isReadOnly(name, input)) services.journal.add(userId, "action", summary, { kiritish: logged, natija: String(result?.text ?? "").slice(0, LOG_INPUT_MAX) }, device.name);
      return toToolContent(result);
    } catch (err) {
      services.journal.add(userId, "error", summary, { kiritish: logged, xato: err.message }, device.name);
      return fail(err instanceof DeviceOfflineError ? err.message : `Bajarib bo'lmadi: ${err.message}`);
    }
  }

  /** Loyiha nomi → papka (pc_dev); telefon YouTube'i — qidiruv so'zi → video id. */
  async function prepare(name, input) {
    if (name === "phone" && input.action === "youtube") {
      const id = videoIdFrom(input.url) ?? (input.query ? (await youtubeSearch(input.query))[0]?.id : null);
      return id ? { input: { ...input, url: id } } : { error: "Video topilmadi." };
    }
    if (name !== "pc_dev" || !input.project || input.path) return { input };
    const project = services.projects.find(userId, input.project);
    return project ? { input: { ...input, path: project.path } } : { error: `"${input.project}" loyihasi saqlanmagan — egasidan papkani so'rab, projects save qil.` };
  }

  const ctx = { hub, userId, currentDeviceId, access, services, confirm, stop: () => { stopped = true; } };

  return {
    devices,
    current: devices.find((d) => d.id === currentDeviceId) ?? null,
    /** Qurilma ulangan — javobni Claude beradi (muqobil miyalarda asbob yo'q). */
    required: devices.length > 0,
    // Faqat ulangan qurilma turlarining asboblari (kompyuter — pc_*, telefon — phone) + server asboblari.
    definitions: [...PC_TOOLS.filter((t) => devices.some((d) => d.kind === toolKind(t.name))), ...SERVER_TOOLS],
    /** @returns {Promise<{ content: object[], isError: boolean }>} */
    async run(name, rawInput) {
      if (stopped) return fail("TO'XTA buyrug'i berilgan — boshqa ish bajarilmaydi.");
      if (SERVER_TOOL_NAMES.has(name)) return runServerTool(name, rawInput, ctx);
      if (!PC_TOOL_NAMES.has(name)) return fail(`Noma'lum asbob: ${name}`);
      const { device: hint, ...raw } = rawInput ?? {};
      const target = pickDevice(hub.list(userId), hint, currentDeviceId, toolKind(name));
      if (target.error) return fail(target.error);
      const prepared = await prepare(name, raw).catch((err) => ({ error: `Tayyorlab bo'lmadi: ${err.message}` }));
      if (prepared.error) return fail(prepared.error);
      const { input } = prepared;
      if (!needsConfirm(name, input, access)) return callDevice(name, input, target.device);
      const action = describeAction(name, input);
      const decision = await confirm({ tool: name, ...action, detail: `[${target.device.name}] ${action.detail}`.trim() }, async () => {
        const result = await callDevice(name, input, target.device);
        services.nudges.add(userId, "result", `${TOOL_STATUS[name] ?? name}: ${firstText(result).slice(0, 500)}`);
      });
      if (decision === "deferred") return ok("Ruxsat so'rovi egasining ilovasiga yuborildi — 'Ha' bosilgach bajariladi. Shuni egasiga ayt.");
      if (!decision) return fail("Egasi ruxsat bermadi — bajarilmadi. Boshqa yo'l taklif qil yoki so'ra.");
      return callDevice(name, input, target.device);
    },
  };
}
