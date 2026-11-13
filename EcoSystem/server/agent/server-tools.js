// Server o'zida bajaradigan asboblar (qurilma shart emas): jurnal (qilolmagan ishlar), kuzatuvlar, loyihalar,
// ssenariylar va favqulodda TO'XTA. Qurilma asboblari — server/devices/tools.js, birlashtiruvchi — toolbox.js.
import { pickDevice } from "../devices/hub.js";
import { ValidationError } from "../core/errors.js";
import { journalMarkdown } from "./journal.js";
import { normalizeCondition, normalizeAction, describeWatch, COUNTDOWN_ACTIONS } from "./watches.js";

const enumOf = (values, description) => ({ type: "string", enum: values, description });
const JOURNAL_READ_LIMIT = 30;
const KIND_BY_NAME = { gaps: "gap", errors: "error", actions: "action" };
const PROCESS_CONDITIONS = new Set(["process_exit", "process_idle"]);

export const SERVER_TOOLS = [
  {
    name: "journal",
    description: "Jurnal (~/Jigar papkasida md fayllar). gap — bilmagan yoki qilolmagan ishni yozib qo'yish: 'qilolmayman/bilmayman' deyishdan OLDIN doim chaqir (request — nima so'ralgan, reason — nega qilolmading, needed — nima kerak bo'lardi). read — ro'yxat: kind = gaps (qilolmagan ishlar) | errors (xatolar) | actions (bajarilgan ishlar); egasi 'qilolmagan ishlaringni ber' desa — read gaps. close — hal bo'lgan ishni `id` bo'yicha yopish.",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["gap", "read", "close"], "Amal"),
        request: { type: "string" }, reason: { type: "string" }, needed: { type: "string" },
        kind: enumOf(["gaps", "errors", "actions"], "read uchun"),
        open_only: { type: "boolean", description: "read gaps: faqat ochiqlari" },
        id: { type: "integer" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "watch",
    description: "Kuzatuv — 'qarab tur, tugasa ...'. create: shart (condition) bajarilganda amal (then). condition.type: process_exit (jarayon tugadi: name yoki pid), process_idle (jarayon `minutes` daqiqa bo'sh — masalan AI kod yozishni to'xtatdi; name: 'claude', 'node', 'Code'), screen_still (ekran `minutes` o'zgarmadi), screen_text (ekranda `text` chiqdi, masalan 'Done'), file (path, event: exists|changed), time (at — ISO vaqt). then.type: notify (xabar), lock, sleep, shutdown, restart, quit_all (oxirgi uchtasi — ruxsat bilan va 60 soniya ogohlantirish), scenario (then.scenario — nomi). hours — muddat (standart 6). list — faol kuzatuvlar; cancel — `id` (yoki id'siz — hammasi).",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["create", "list", "cancel"], "Amal"),
        device: { type: "string", description: "Qaysi qurilmada (aytilmasa — yozma)" },
        condition: {
          type: "object",
          properties: {
            type: enumOf(["process_exit", "process_idle", "screen_still", "screen_text", "file", "time"], "Shart turi"),
            name: { type: "string" }, pid: { type: "integer" }, minutes: { type: "integer" }, cpu: { type: "number" },
            text: { type: "string" }, path: { type: "string" }, event: enumOf(["exists", "changed"], "file uchun"), at: { type: "string" },
          },
          required: ["type"],
        },
        then: {
          type: "object",
          properties: {
            type: enumOf(["notify", "lock", "sleep", "shutdown", "restart", "quit_all", "scenario"], "Amal"),
            message: { type: "string", description: "Egasiga aytiladigan gap" },
            scenario: { type: "string" },
          },
          required: ["type"],
        },
        hours: { type: "number" }, note: { type: "string" }, id: { type: "integer" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "projects",
    description: "Loyihalar ro'yxati (nom → papka): save (name, path), list, remove (name). 'jigar loyihasini och' — avval list; topilmasa egasidan papkani so'rab save qil.",
    input_schema: {
      type: "object",
      properties: { action: enumOf(["save", "list", "remove"], "Amal"), name: { type: "string" }, path: { type: "string" } },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "scenario",
    description: "Ssenariylar — bir so'z bilan bir nechta ish: save (name, steps — oddiy tilda qadamlar, at — har kuni HH:MM, ixtiyoriy), list, remove (name), run (name) — qadamlarni qaytaradi, keyin ularni asboblar bilan bajarasan.",
    input_schema: {
      type: "object",
      properties: {
        action: enumOf(["save", "list", "remove", "run"], "Amal"),
        name: { type: "string" }, steps: { type: "string" }, at: { type: "string", description: "HH:MM (Toshkent)" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "emergency_stop",
    description: "Favqulodda TO'XTA: egasi 'to'xta', 'stop', 'bekor qil hammasini' desa — barcha kuzatuvlar bekor qilinadi, ruxsat darajasi 'xavfsiz'ga tushadi, shu javobdagi boshqa ishlar to'xtaydi.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export const SERVER_TOOL_NAMES = new Set(SERVER_TOOLS.map((t) => t.name));

const ok = (text) => ({ content: [{ type: "text", text }], isError: false });
const fail = (text) => ({ content: [{ type: "text", text }], isError: true });

/** Kuzatuv sharti uchun qurilmadan o'lchov (pc_probe): { running, cpu } | { hash } | { exists, mtime }. */
export async function probeCondition(hub, userId, deviceId, condition, access) {
  const result = await hub.call(userId, deviceId, { tool: "pc_probe", input: condition, approved: true, access });
  if (result?.error) throw new Error(result.error);
  return JSON.parse(result.text ?? "{}");
}

function journalTool(input, { userId, services }) {
  const { journal } = services;
  if (input.action === "gap") {
    const id = journal.add(userId, "gap", input.request || "Noma'lum so'rov", { "so'rov": input.request, sabab: input.reason, kerak: input.needed });
    return ok(`Yozib qo'yildi (#${id}) — QILOLMAGAN-ISHLAR.md. Egasiga ochiq ayt: nima qilolmading va nima kerak.`);
  }
  if (input.action === "close") return journal.close(userId, input.id) ? ok(`#${input.id} yopildi.`) : fail("Bunday ochiq yozuv yo'q.");
  const kind = KIND_BY_NAME[input.kind] ?? "gap";
  const entries = journal.list(userId, kind, { openOnly: kind === "gap" && input.open_only !== false, limit: JOURNAL_READ_LIMIT });
  const where = journal.filePath(kind);
  return ok(`${journalMarkdown(kind, entries)}${where ? `\nFayl: ${where}` : ""}`);
}

async function watchTool(input, ctx) {
  const { services, userId, hub } = ctx;
  if (input.action === "list") {
    const list = services.watches.mine(userId);
    return ok(list.length ? list.map((w) => `#${w.id}: ${describeWatch(w)}${w.status === "countdown" ? " (ogohlantirish berildi)" : ""}`).join("\n") : "Faol kuzatuv yo'q.");
  }
  if (input.action === "cancel") {
    if (input.id == null) return ok(`Bekor qilindi: ${services.watches.cancelAll(userId)} ta kuzatuv.`);
    return services.watches.cancel(userId, input.id) ? ok(`#${input.id} bekor qilindi.`) : fail("Bunday faol kuzatuv yo'q.");
  }
  const condition = normalizeCondition(input.condition);
  const action = normalizeAction(input.then);
  const devices = hub.list(userId);
  const target = pickDevice(devices, input.device, ctx.currentDeviceId, "pc");
  const needsDevice = condition.type !== "time" || !["notify", "scenario"].includes(action.type);
  if (target.error && needsDevice) return fail(target.error);
  const device = target.device ?? { id: "", name: "" };
  if (PROCESS_CONDITIONS.has(condition.type)) {
    const now = await probeCondition(hub, userId, device.id, condition, ctx.access);
    if (!now.running) return fail(`"${condition.name || condition.pid}" jarayoni hozir ishlamayapti — nomini tekshir (pc_run_command: ps yoki pc_apps list).`);
  }
  const create = () => services.watches.create(userId, {
    deviceId: device.id, deviceName: device.name, condition, action, note: input.note, approved: true, hours: input.hours,
  });
  const summary = describeWatch({ condition, action, deviceName: device.name });
  if (COUNTDOWN_ACTIONS.has(action.type) && ctx.access !== "unlimited") {
    const decision = await ctx.confirm({ tool: "watch", reason: summary, detail: "60 soniya ogohlantirish bilan" }, async () => {
      const w = create();
      services.nudges.add(userId, "result", `Kuzatuv #${w.id} qo'yildi: ${summary}.`);
    });
    if (decision === "deferred") return ok("Ruxsat so'rovi ilovaga yuborildi — egasi 'Ha' bosgach kuzatuv qo'yiladi.");
    if (!decision) return fail("Egasi ruxsat bermadi.");
  }
  const watch = create();
  return ok(`Kuzatuv #${watch.id}: ${summary}. Muddati: ${watch.expiresAt}. Bekor qilish: "kuzatuvni to'xtat".`);
}

function projectsTool(input, { userId, services }) {
  const { projects } = services;
  if (input.action === "save") {
    const p = projects.save(userId, input.name, input.path);
    return ok(`Saqlandi: ${p.name} → ${p.path}`);
  }
  if (input.action === "remove") return projects.remove(userId, input.name) ? ok("O'chirildi.") : fail("Bunday loyiha yo'q.");
  const list = projects.list(userId);
  return ok(list.length ? list.map((p) => `- ${p.name}: ${p.path}`).join("\n") : "Loyiha saqlanmagan — egasidan nom va papkani so'rab, save qil.");
}

function scenarioTool(input, { userId, services }) {
  const { scenarios } = services;
  if (input.action === "save") {
    const s = scenarios.save(userId, input.name, input.steps, input.at || null);
    return ok(`Ssenariy "${s.name}" saqlandi${s.at ? ` (har kuni ${s.at})` : ""}.`);
  }
  if (input.action === "remove") return scenarios.remove(userId, input.name) ? ok("O'chirildi.") : fail("Bunday ssenariy yo'q.");
  if (input.action === "run") {
    const s = scenarios.find(userId, input.name);
    return s ? ok(`Ssenariy "${s.name}" qadamlari: ${s.steps}\nEndi shularni asboblar bilan ketma-ket bajar va oxirida qisqa ayt.`) : fail("Bunday ssenariy yo'q — list bilan ko'r.");
  }
  const list = scenarios.list(userId);
  return ok(list.length ? list.map((s) => `- ${s.name}${s.at ? ` (${s.at})` : ""}: ${s.steps}`).join("\n") : "Ssenariy yo'q.");
}

function stopTool(_input, ctx) {
  const cancelled = ctx.services.watches.cancelAll(ctx.userId);
  ctx.services.settings.update({ access: "safe" });
  ctx.stop();
  return ok(`TO'XTATILDI: ${cancelled} ta kuzatuv bekor qilindi, ruxsat darajasi "xavfsiz". Boshqa ish qilma, egasiga qisqa ayt.`);
}

const HANDLERS = { journal: journalTool, watch: watchTool, projects: projectsTool, scenario: scenarioTool, emergency_stop: stopTool };

/** Server asbobini bajaradi. Kiritish xatosi — modelga tushunarli xato (u tuzatib qayta urinadi). */
export async function runServerTool(name, input, ctx) {
  try {
    return await HANDLERS[name](input ?? {}, ctx);
  } catch (err) {
    if (err instanceof ValidationError) return fail(err.message);
    ctx.services.journal.add(ctx.userId, "error", `${name}: ${input?.action ?? ""}`, { xato: err.message });
    return fail(`Bajarib bo'lmadi: ${err.message}`);
  }
}
