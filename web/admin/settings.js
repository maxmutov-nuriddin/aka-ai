// Support paneli — "Sozlamalar": miya (Claude / Gemini), ovoz xizmati, Fish modeli (hamma uchun) va tariflar jadvali.
// Narxlar serverdan (settings.costs: so'm / daqiqa) — 1 daqiqa = miya + ovoz.
import { $, GOALS, LLMS, PROVIDERS, api, num, som, toast } from "./lib.js";

const LLM_INFO = {
  claude: { title: "Claude", lines: ["O'zbekcha va xarakterlarda eng kuchli", "Javoblar sinalgan"], badge: "Tavsiya" },
  gemini: { title: "Gemini", lines: ["Arzonroq va tez", "Xato bersa — Claude javob beradi"], badge: "" },
};
const PROVIDER_INFO = {
  fishaudio: { title: "Fish Audio", lines: ["O'zbekchada eng aniq (10/10)", "Tarifdagi to'liq daqiqa limiti"], badge: "Tavsiya" },
  elevenlabs: { title: "ElevenLabs", lines: ["So'z vaqtlari bilan", "Qimmat — kunlik daqiqa ~2.5 barobar kam"], badge: "" },
  gemini: { title: "Gemini TTS", lines: ["Eng arzon — kunlik daqiqa ~1.5 barobar ko'p", "O'zbekcha sifati sinalmagan"], badge: "Yangi" },
};
const FISH_INFO = {
  "drama-3": { title: "Drama 3", lines: ["O'zbekchada aniq talaffuz", "Kulgi, pichirlash, his-tuyg'u teglari"], badge: "Tavsiya" },
  "s2.1-pro-free": { title: "S2.1 Pro Free", lines: ["Bepul", "O'zbekchada xato qiladi — faqat sinov uchun"], badge: "" },
};
const COMBOS = ["claude+fishaudio", "claude+elevenlabs", "claude+gemini", "gemini+fishaudio", "gemini+elevenlabs", "gemini+gemini"];
const DAYS = 30;

function optionHtml(kind, value, info, { selected, disabled, status, price }) {
  return `<button type="button" class="option" data-${kind}="${value}" role="radio" aria-checked="${selected}"${disabled ? " disabled" : ""}>
    <span class="option-head">
      <strong>${info.title}</strong>
      ${info.badge ? `<span class="pill pill-accent">${info.badge}</span>` : ""}
      <span class="radio" aria-hidden="true"></span>
    </span>
    ${price ? `<span class="option-line"><b>${price}</b></span>` : ""}
    ${info.lines.map((l) => `<span class="option-line">${l}</span>`).join("")}
    ${status ? `<span class="option-status${disabled ? " is-off" : ""}">${status}</span>` : ""}
  </button>`;
}

const statusOf = (configured) => (configured ? "● Ulangan" : "Kalit sozlanmagan (.env)");

/** Joriy juftlik: 1 daqiqa narxi, "Maktab darslari" kunlik limiti va o'quvchining oylik xarajati (limit to'liq). */
function renderCombo(s, tariffs) {
  const llm = s.costs?.llm?.[s.llmProvider] ?? 0;
  const tts = s.costs?.tts?.[s.ttsProvider] ?? 0;
  const perMinute = llm + tts;
  const study = tariffs.find((t) => t.goal === "study")?.minutes?.[`${s.llmProvider}+${s.ttsProvider}`] ?? 0;
  $("comboPanel").innerHTML = `
    <div><p class="sub">Joriy tanlov</p><strong>${LLMS[s.llmProvider]} + ${PROVIDERS[s.ttsProvider]}</strong></div>
    <div class="combo-nums">
      <div><span class="sub">1 daqiqa</span><b>${som(perMinute)}</b></div>
      <div><span class="sub">miya / ovoz</span><b>${num(llm)} + ${num(tts)}</b></div>
      <div><span class="sub">Maktab tarifi: kuniga</span><b>${num(study)} daq</b></div>
      <div><span class="sub">1 o'quvchi / oy (to'liq)</span><b>${som(perMinute * study * DAYS)}</b></div>
    </div>`;
}

export function renderSettings({ state }) {
  const s = state.settings;
  if (!s) return;
  renderCombo(s, state.stats?.tariffs ?? []);
  $("llmOptions").innerHTML = Object.entries(LLM_INFO)
    .map(([value, info]) => optionHtml("llm", value, info, {
      selected: s.llmProvider === value,
      disabled: !s.llms?.[value],
      status: statusOf(s.llms?.[value]),
      price: `~${som(s.costs?.llm?.[value] ?? 0)} / daqiqa`,
    }))
    .join("");
  $("providerOptions").innerHTML = Object.entries(PROVIDER_INFO)
    .map(([value, info]) => optionHtml("provider", value, info, {
      selected: s.ttsProvider === value,
      disabled: !s.providers?.[value],
      status: statusOf(s.providers?.[value]),
      price: `~${som(s.costs?.tts?.[value] ?? 0)} / daqiqa`,
    }))
    .join("");
  const available = new Set(s.fishModels ?? Object.keys(FISH_INFO));
  $("fishOptions").innerHTML = Object.keys(FISH_INFO) // tavsiya etilgani birinchi
    .filter((m) => available.has(m))
    .map((m) => optionHtml("fish", m, FISH_INFO[m], { selected: s.fishModel === m, disabled: false, status: "" }))
    .join("");
  $("fishPanel").classList.toggle("is-muted", s.ttsProvider !== "fishaudio");

  const tariffs = state.stats?.tariffs ?? [];
  const current = `${s.llmProvider}+${s.ttsProvider}`;
  $("tariffBody").innerHTML = tariffs
    .map((t) => {
      const count = state.users.filter((u) => u.role !== "support" && u.tariff.goal === t.goal).length;
      const cell = (key) => `<td class="num${key === current ? " is-current" : ""}">${num(t.minutes[key] ?? 0)} daq</td>`;
      return `<tr><td><span class="tariff"><span class="tariff-dot" data-goal="${t.goal}"></span>${GOALS[t.goal] ?? t.goal}</span></td>
        <td class="num">${som(t.price)}</td>${COMBOS.map(cell).join("")}<td class="num">${count}</td></tr>`;
    })
    .join("");
}

async function save(ctx, body, message) {
  try {
    ctx.state.settings = await api("/api/admin/settings", { method: "PUT", body });
    toast(message);
    await ctx.reload(); // limitlar va xarajat tanlovga bog'liq
  } catch (err) {
    toast(err.message, true);
  }
}

/** Tanlov tugmalari: bosilgan variant saqlanadi (o'chiq yoki allaqachon tanlangan — e'tiborsiz). */
function onPick(containerId, attr, handler) {
  $(containerId).addEventListener("click", (e) => {
    const b = e.target.closest(`[data-${attr}]`);
    if (!b || b.disabled || b.getAttribute("aria-checked") === "true") return;
    handler(b.dataset[attr]);
  });
}

export function initSettings(ctx) {
  onPick("llmOptions", "llm", (v) => save(ctx, { llmProvider: v }, `Miya: ${LLM_INFO[v].title}`));
  onPick("providerOptions", "provider", (v) => save(ctx, { ttsProvider: v }, `Ovoz xizmati: ${PROVIDER_INFO[v].title}`));
  onPick("fishOptions", "fish", (v) => save(ctx, { fishModel: v }, `Fish modeli: ${FISH_INFO[v].title}`));
}
