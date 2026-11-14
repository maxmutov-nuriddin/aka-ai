// EcoSystem sozlamalari (Sozlamalar oynasida): miya, ovoz xizmati, javob chuqurligi, Jigar xarakteri,
// faol rejim (ekranga o'zi qaraydi), kunlik xulosa va kompyuter holati.
import { askPassword } from "./confirm-dialog.js";
import { deviceStatusText } from "./pc-actions.js";
import { agentSection } from "./eco-agent.js";
import { priceTag, pricesBlock } from "./model-prices.js";
// Server: GET/PUT /api/settings (server/settings.js), xarakter — PUT /api/auth/profile.

const PROFILE_KEY = "jigar.profile";
const LABELS = {
  llm: {
    haiku: "Claude Haiku — standart (tez, arzon)", sonnet: "Claude Sonnet — kuchliroq",
    opus: "Claude Opus — eng kuchli (hozircha ishlatilmaydi)", gemini: "Gemini", openai: "OpenAI",
  },
  tts: { gemini: "Gemini", elevenlabs: "ElevenLabs", fishaudio: "Fish Audio", openai: "OpenAI" },
  effort: { low: "Tez", medium: "O'rtacha", high: "Chuqur" },
  proactive: { on: "Yoqiq", off: "O'chiq" },
  briefs: { on: "Yoqiq", off: "O'chiq" },
  monitor: { on: "Yoqiq", off: "O'chiq" },
  access: {
    safe: "Xavfsiz — uy papkasi, har ishga «Ha»",
    wide: "Keng — butun disk",
    full: "To'liq — «Ha» faqat xavfli ishlarga",
    unlimited: "Cheksiz — hech narsa so'ramaydi (parol bilan)",
  },
  length: { qisqa: "Qisqa", odatiy: "O'rtacha", batafsil: "Batafsil" },
};
const TITLES = {
  llm: "Miya", tts: "Ovoz", effort: "Javob chuqurligi", length: "Javob uzunligi",
  proactive: "Faol rejim (ekranga o'zi qarab maslahat beradi)", briefs: "Ertalabki reja va kechki xulosa",
  monitor: "Kuzatish: batareya, disk, protsessor", access: "Ruxsat darajasi (Jigar kompyuterda nimalar qila oladi)",
};

/** Saqlangan profil (til, uzunlik, xarakter) — bitta maydon o'zgarganda qolganlari saqlanib qolsin. */
function savedProfile() {
  try {
    const { lang, length } = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
    return { ...(lang ? { lang } : {}), ...(length ? { length } : {}) };
  } catch {
    return {};
  }
}

/**
 * @param {HTMLElement} container
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string>, persona: string | null,
 *           onProfile: (profile: object) => void }} deps
 */
export async function mountEcoSettings(container, { apiBase, authHeaders, persona, onProfile, t }) {
  const request = async (path, method = "GET", body) => {
    const res = await fetch(`${apiBase()}${path}`, {
      method, headers: { "Content-Type": "application/json", ...authHeaders() }, body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  let state;
  try {
    state = await request("/api/settings");
  } catch {
    container.hidden = true;
    return;
  }

  // Holat ("Saqlandi ✓") — sahifa sarlavhasida (hamma kartochkalar uchun bitta).
  const status = document.getElementById("settingsStatus") ?? Object.assign(document.createElement("small"), { className: "eco-status" });

  /** Bitta tanlov (select): kaliti yo'q xizmat — tanlab bo'lmaydi. Matnlar — textContent (xavfsiz). */
  function field(key, value, options, ready, onChange) {
    const label = document.createElement("label");
    label.className = "eco-field";
    const caption = document.createElement("span");
    caption.className = "setting-label";
    caption.textContent = TITLES[key];
    const select = document.createElement("select");
    for (const option of options) {
      const opt = document.createElement("option");
      const off = ready && ready[option] === false;
      opt.value = option;
      opt.textContent = `${LABELS[key][option] ?? option}${priceTag(key, option)}${off ? " — kalit yo'q" : ""}`;
      opt.disabled = off;
      opt.selected = option === (value ?? "");
      select.append(opt);
    }
    let previous = select.value;
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        await onChange(select.value);
        previous = select.value;
        status.textContent = "Saqlandi ✓";
      } catch (err) {
        select.value = previous; // saqlanmadi — eski tanlov qaytadi
        status.textContent = err.message;
      } finally {
        select.disabled = false;
      }
    });
    label.append(caption, select);
    return label;
  }

  const saveSetting = (key) => async (value) => {
    state = await request("/api/settings", "PUT", { [key]: value });
  };
  /** Ruxsat darajasi: cheksiz — parol bilan (server tekshiradi), muddatsiz: egasi o'zi boshqasini tanlaguncha. */
  const saveAccess = async (value) => {
    const body = { access: value };
    if (value === "unlimited") {
      const password = await askPassword({
        title: "Cheksiz rejim",
        text: "Jigar hech narsa so'ramasdan («Ha»siz), muddatsiz ishlaydi: fayl o'chirish va buyruqlar ham. Parolingizni kiriting:",
        confirm: "Yoqish",
      });
      if (!password) throw new Error("Bekor qilindi.");
      body.password = password;
    }
    state = await request("/api/settings", "PUT", body);
  };
  const saveProfileField = (key) => async (value) => {
    const { user } = await request("/api/auth/profile", "PUT", { profile: { ...savedProfile(), [key]: value || null } });
    onProfile(user.profile ?? {});
  };

  /** Parol — boshqa qurilmalardan (telefon, boshqa kompyuter) kirish uchun. */
  function passwordField() {
    const form = document.createElement("form");
    form.className = "eco-field";
    const caption = document.createElement("span");
    caption.className = "setting-label";
    caption.textContent = "Telefon yoki boshqa kompyuterdan kirish uchun";
    const input = document.createElement("input");
    input.type = "password";
    input.minLength = 8;
    input.required = true;
    input.autocomplete = "new-password";
    input.placeholder = "Yangi parol, kamida 8 belgi";
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "ghost";
    save.textContent = "Parolni saqlash";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await request("/api/auth/password", "PUT", { password: input.value });
        input.value = "";
        status.textContent = "Parol saqlandi ✓";
      } catch (err) {
        status.textContent = err.message;
      }
    });
    form.append(caption, input, save);
    return form;
  }

  const device = document.createElement("small");
  device.className = "eco-device";
  deviceStatusText({ apiBase, authHeaders, t }).then((text) => { device.textContent = text; });

  /** Bo'lim kartochkasi: sarlavha va maydonlar; nav — chapdagi bo'limlar ro'yxatidagi kaliti (settings-nav.js). */
  const card = (nav, title, ...children) => {
    const section = document.createElement("section");
    section.className = "settings-card";
    section.dataset.nav = nav;
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading, ...children);
    return section;
  };

  container.replaceChildren(
    card("brain", "Miya va ovoz",
      device,
      field("llm", state.llm, state.choices.llm, state.ready.llm, saveSetting("llm")),
      field("tts", state.tts, state.choices.tts, state.ready.tts, saveSetting("tts")),
      field("effort", state.effort, state.choices.effort, null, saveSetting("effort")),
      field("length", savedProfile().length ?? "odatiy", Object.keys(LABELS.length), null, saveProfileField("length")),
      pricesBlock({ llm: state.llm, tts: state.tts })),
    card("jarvis", "Jarvis: o'zi kuzatish va ruxsat",
      field("proactive", state.proactive, ["on", "off"], null, saveSetting("proactive")),
      field("briefs", state.briefs, ["on", "off"], null, saveSetting("briefs")),
      field("monitor", state.monitor, ["on", "off"], null, saveSetting("monitor")),
      field("access", state.access, state.choices.access ?? Object.keys(LABELS.access), null, saveAccess)),
    card("security", "Xavfsizlik: Siri, jurnal va parol", passwordField(), agentSection({ apiBase, authHeaders, status })),
  );
  container.hidden = false;
}
