// Agent rejalashtiruvchisi (har 30 s):
//  1) kuzatuvlar — shart bajarilsa amal (xavflisi — 60 s ogohlantirish, bekor qilinadi), muddati o'tsa — tugaydi;
//  2) monitoring (2 daqiqada) — batareya, disk, protsessor; muammo bo'lsa bir marta aytadi;
//  3) vaqtli ssenariylar — har kuni belgilangan soatda (Toshkent).
import { evaluate, describeWatch, COUNTDOWN_ACTIONS, COUNTDOWN_MS } from "./watches.js";
import { probeCondition } from "./server-tools.js";

export const AGENT_TICK_MS = 30_000;
export const MONITOR_EVERY_MS = 2 * 60_000;
const SCREEN_TEXT_EVERY_MS = 2 * 60_000; // ekran matni (Haiku) — tez-tez emas
const SCENARIO_WINDOW_MIN = 30; // belgilangan vaqtdan keyin shuncha daqiqa ichida ishga tushadi
const TASHKENT_OFFSET_MS = 5 * 60 * 60_000;
const LIMITS = { battery: 15, batteryRearm: 20, diskGb: 10, diskRearmGb: 15, cpu: 0.9, cpuRearm: 0.7, cpuStreak: 3 };
const SCREEN_TEXT_PROMPT = "Sen ekran suratini tekshiruvchisan. Faqat bitta so'z bilan javob ber: HA yoki YO'Q.";

/** Toshkent vaqti: { day: "YYYY-MM-DD", minutes: kun boshidan daqiqalar }. */
export function tashkentDay(ms) {
  const t = new Date(ms + TASHKENT_OFFSET_MS);
  return { day: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

/** Vaqtli ssenariy hozir ishga tushishi kerakmi. */
export function scenarioDue(scenario, nowMs) {
  const { day, minutes } = tashkentDay(nowMs);
  const [h, m] = scenario.at.split(":").map(Number);
  const late = minutes - (h * 60 + m);
  return scenario.lastRun !== day && late >= 0 && late < SCENARIO_WINDOW_MIN ? day : null;
}

/**
 * Monitoring qoidalari (sof): har muammo bir marta aytiladi, tuzalgach qayta "qurollanadi".
 * @param {{ battery?: {percent: number, charging: boolean} | null, diskFreeGb?: number, cpu?: number }} h
 * @returns {{ alerts: string[], state: object }}
 */
export function evaluateHealth(h, state = {}) {
  const next = { ...state };
  const alerts = [];
  const b = h.battery;
  if (b && !b.charging && b.percent <= LIMITS.battery && !state.battery) {
    alerts.push(`🔋 Batareya ${b.percent}% qoldi — quvvatga ulang.`);
    next.battery = true;
  } else if (!b || b.charging || b.percent >= LIMITS.batteryRearm) next.battery = false;
  if (typeof h.diskFreeGb === "number") {
    if (h.diskFreeGb < LIMITS.diskGb && !state.disk) {
      alerts.push(`💽 Diskda ${h.diskFreeGb.toFixed(1)} GB joy qoldi — keraksiz fayllarni tozalash kerak.`);
      next.disk = true;
    } else if (h.diskFreeGb >= LIMITS.diskRearmGb) next.disk = false;
  }
  if (typeof h.cpu === "number") {
    next.cpuStreak = h.cpu > LIMITS.cpu ? (state.cpuStreak ?? 0) + 1 : 0;
    if (next.cpuStreak >= LIMITS.cpuStreak && !state.cpu) {
      alerts.push("🔥 Protsessor bir necha daqiqadan beri to'liq band — biror dastur osilib qolgan bo'lishi mumkin.");
      next.cpu = true;
    } else if (h.cpu < LIMITS.cpuRearm) next.cpu = false;
  }
  return { alerts, state: next };
}

/**
 * @param {{ hub, jigar, watches, nudges, journal, settings, scenarios, store,
 *           makeToolbox: (userId: number) => object, now?: () => number, log?: (m: string) => void }} deps
 */
export function createAgentScheduler({ hub, jigar, watches, nudges, journal, settings, scenarios, store, makeToolbox, now = Date.now, log = console.warn }) {
  let running = false;
  let lastMonitor = 0;
  const health = new Map(); // deviceId -> holat (evaluateHealth)

  const deviceOnline = (w) => hub.list(w.userId).some((d) => d.id === w.deviceId);
  const power = (w, action) => hub.call(w.userId, w.deviceId, { tool: "pc_power", input: { action }, approved: true, access: "full" });

  async function measure(w) {
    if (w.condition.type === "time") return {};
    if (w.condition.type !== "screen_text") return probeCondition(hub, w.userId, w.deviceId, w.condition, "full");
    const shot = await hub.call(w.userId, w.deviceId, { tool: "pc_screenshot", input: {}, approved: true, access: "full" });
    if (typeof shot?.image !== "string") return { match: false };
    const answer = await jigar.think({
      system: SCREEN_TEXT_PROMPT,
      content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot.image } },
        { type: "text", text: `Ekranda "${w.condition.text}" (yoki shu ma'nodagi yozuv) ko'rinyaptimi?` }],
    });
    return { match: /^\s*HA\b/i.test(answer) };
  }

  /** Amalni bajaradi; natija — nudge va jurnal. */
  async function fire(w, detail) {
    watches.update(w.id, { state: w.state, status: "done" });
    const said = w.action.message || `Kuzatuv #${w.id}: ${detail}.`;
    const doneText = { notify: "", lock: " Ekran qulflandi.", sleep: " Kompyuter uxlatildi.", shutdown: " Kompyuter o'chirilmoqda.", restart: " Kompyuter qayta yoqilmoqda.", quit_all: " Ilovalar yopildi.", scenario: "" }[w.action.type];
    nudges.add(w.userId, "result", `✅ ${said}${doneText}`);
    try {
      if (["lock", "sleep", "shutdown", "restart"].includes(w.action.type)) await power(w, w.action.type);
      if (w.action.type === "quit_all") await hub.call(w.userId, w.deviceId, { tool: "pc_apps", input: { action: "quit_all" }, approved: true, access: "full" });
      if (w.action.type === "scenario") await runScenario(w.userId, w.action.scenario);
      journal.add(w.userId, "action", `Kuzatuv #${w.id}: ${w.action.type}`, { shart: describeWatch(w), natija: detail }, w.deviceName);
    } catch (err) {
      journal.add(w.userId, "error", `Kuzatuv #${w.id}: ${w.action.type}`, { xato: err.message }, w.deviceName);
      nudges.add(w.userId, "alert", `Kuzatuv #${w.id}: amalni bajarib bo'lmadi — ${err.message}`);
    }
  }

  async function checkWatch(w) {
    const t = now();
    if (t > Date.parse(w.expiresAt)) {
      watches.update(w.id, { state: w.state, status: "expired" });
      nudges.add(w.userId, "result", `Kuzatuv #${w.id} muddati tugadi: ${describeWatch(w)}.`);
      return;
    }
    if (w.status === "countdown") {
      if (t >= Date.parse(w.fireAt)) await fire(w, w.state.detail ?? "shart bajarildi");
      return;
    }
    if (w.condition.type !== "time" && !deviceOnline(w)) return; // qurilma qaytib ulanganda davom etadi
    if (w.condition.type === "screen_text" && t - (w.state.lastCheck ?? 0) < SCREEN_TEXT_EVERY_MS) return;
    const probe = await measure(w);
    const { met, state, detail } = evaluate(w.condition, probe, w.state, t);
    const nextState = { ...state, lastCheck: t, detail };
    if (!met) return watches.update(w.id, { state: nextState, status: "active" });
    if (COUNTDOWN_ACTIONS.has(w.action.type)) {
      watches.update(w.id, { state: nextState, status: "countdown", fireAt: new Date(t + COUNTDOWN_MS).toISOString() });
      const what = { shutdown: "kompyuter o'chiriladi", restart: "kompyuter qayta yoqiladi", quit_all: "hamma ilovalar yopiladi" }[w.action.type];
      nudges.add(w.userId, "countdown", `⏳ ${detail}. 60 soniyadan keyin ${w.deviceName ? `${w.deviceName}: ` : ""}${what}. Bekor qilish — tugma yoki "to'xta".`, w.id);
      return;
    }
    await fire({ ...w, state: nextState }, detail);
  }

  async function monitor() {
    const owner = store.ownerUser();
    if (!owner || settings.all().monitor !== "on") return;
    for (const device of hub.list(owner.id).filter((d) => d.kind === "pc")) {
      const result = await hub.call(owner.id, device.id, { tool: "pc_health", input: {}, approved: true, access: "safe" });
      if (result?.error) continue;
      const { alerts, state } = evaluateHealth(JSON.parse(result.text ?? "{}"), health.get(device.id));
      health.set(device.id, state);
      for (const alert of alerts) nudges.add(owner.id, "alert", `[${device.name}] ${alert}`);
    }
  }

  /** Ssenariyni fonda bajaradi (ruxsat kerak bo'lsa — ilovaga karta). Natija — nudge. */
  async function runScenario(userId, name) {
    const scenario = scenarios.find(userId, name);
    if (!scenario) throw new Error(`"${name}" ssenariysi topilmadi`);
    const result = await jigar.chat({
      history: [{ role: "user", content: `Ssenariyni hozir bajar: "${scenario.name}". Qadamlar: ${scenario.steps}` }],
      toolbox: makeToolbox(userId), llm: settings.all().llm, length: "qisqa",
    });
    nudges.add(userId, "result", `▶️ ${scenario.name}: ${result.parsed?.tushuntirish ?? result.text}`.replace(/\[[a-z]+\]\s*/g, ""));
  }

  async function timedScenarios() {
    for (const s of scenarios.timed()) {
      const day = scenarioDue(s, now());
      if (!day) continue;
      scenarios.markRun(s.userId, s.name, day);
      await runScenario(s.userId, s.name).catch((err) => journal.add(s.userId, "error", `Ssenariy: ${s.name}`, { xato: err.message }));
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      for (const w of watches.live()) await checkWatch(w).catch((err) => log(`[agent] kuzatuv #${w.id}: ${err.message}`));
      if (now() - lastMonitor >= MONITOR_EVERY_MS) {
        lastMonitor = now();
        await monitor().catch((err) => log(`[agent] monitoring: ${err.message}`));
      }
      await timedScenarios().catch((err) => log(`[agent] ssenariy: ${err.message}`));
    } finally {
      running = false;
    }
  }

  return { tick, runScenario, start: () => setInterval(tick, AGENT_TICK_MS).unref() };
}
