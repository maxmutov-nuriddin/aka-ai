// Sozlamalar → "Miya va ovoz": qaysi model qancha sarflashi. Narxlar — taxminiy (provayder saytida o'zgarishi mumkin):
// Claude — Anthropic narxlari; Gemini, OpenAI va ovoz xizmatlari — Global/server/usage/tariffs.js dagi tannarx.
// Narx USD: LLM — 1 mln token uchun (kirish / chiqish); ovoz — 1 daqiqa nutq uchun.
// "1 javob" — odatiy javob (~5-10 ming token kirish, ~1 ming chiqish); oylik hisob — kuniga 100 javob / 25 daqiqa gapirish.

const DAYS = 30;
const ANSWERS_PER_DAY = 100;
const SPEECH_MINUTES_PER_DAY = 25;

/** LLM: kaliti — sozlamadagi nom. perAnswer — taxminiy USD bitta javobga. */
export const LLM_PRICES = {
  haiku: { name: "Claude Haiku 5.5", input: 0.1, output: 0.5, perAnswer: 0.002 },
  sonnet: { name: "Claude Sonnet 5.5", input: 2, output: 10, perAnswer: 0.015 },
  opus: { name: "Claude Opus 5.5", input: 4, output: 20, perAnswer: 0.03 },
  gemini: { name: "Gemini 3.8 Flash", input: 1.5, output: 7.5, perAnswer: 0.0195 },
  openai: { name: "OpenAI gpt-6.1-sol", input: 2, output: 10, perAnswer: 0.0146 },
};

/** Ovoz: perMinute — USD 1 daqiqa nutq uchun. */
export const TTS_PRICES = {
  gemini: { name: "Gemini TTS", perMinute: 0.027 },
  openai: { name: "OpenAI TTS", perMinute: 0.015 },
  fishaudio: { name: "Fish Audio", perMinute: 0.055 },
  elevenlabs: { name: "ElevenLabs", perMinute: 0.19 },
};

/** USD matni: $0.1, $2, $45, $0.027 — ortiqcha nollarsiz. */
export function usd(value) {
  if (value >= 10) return "$" + Math.round(value);
  const digits = value < 0.1 ? 3 : 2;
  return "$" + String(Number(value.toFixed(digits)));
}

/** Tanlov ro'yxatidagi qisqa narx: " · $0.1 / $0.5" (LLM) yoki " · ~$0.027/daq" (ovoz); noma'lum — "". */
export function priceTag(kind, key) {
  if (kind === "llm" && LLM_PRICES[key]) return " · " + usd(LLM_PRICES[key].input) + " / " + usd(LLM_PRICES[key].output);
  if (kind === "tts" && TTS_PRICES[key]) return " · ~" + usd(TTS_PRICES[key].perMinute) + "/daq";
  return "";
}

export const monthlyLlm = (key) => (LLM_PRICES[key] ? LLM_PRICES[key].perAnswer * ANSWERS_PER_DAY * DAYS : 0);
export const monthlyTts = (key) => (TTS_PRICES[key] ? TTS_PRICES[key].perMinute * SPEECH_MINUTES_PER_DAY * DAYS : 0);

function table(headers, rows) {
  const t = document.createElement("table");
  t.className = "price-table";
  const head = t.createTHead().insertRow();
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  const body = t.createTBody();
  for (const cells of rows) {
    const tr = body.insertRow();
    for (const c of cells) tr.insertCell().textContent = c;
  }
  return t;
}

/** Yig'iladigan "Narxlar" bo'limi: miya va ovoz jadvallari + tushuntirish. Matnlar — textContent. */
export function pricesBlock(current = {}) {
  const box = document.createElement("details");
  box.className = "price-box";
  const summary = document.createElement("summary");
  summary.textContent = "Qaysi model qancha sarflaydi (taxminiy)";
  const mark = (key, now) => (key === now ? "✓ " : "");
  const llmRows = Object.entries(LLM_PRICES).map(([key, p]) => [
    mark(key, current.llm) + p.name,
    usd(p.input) + " / " + usd(p.output),
    usd(p.perAnswer),
    "~" + usd(monthlyLlm(key)),
  ]);
  const ttsRows = Object.entries(TTS_PRICES).map(([key, p]) => [
    mark(key, current.tts) + p.name,
    usd(p.perMinute),
    "~" + usd(monthlyTts(key)),
  ]);
  const note = document.createElement("small");
  note.className = "price-note";
  note.textContent =
    "Miya: narx 1 mln token uchun (kirish / chiqish). Oylik hisob: kuniga " + ANSWERS_PER_DAY + " javob; ovoz — kuniga "
    + SPEECH_MINUTES_PER_DAY + " daqiqa gapirish. Haqiqiy sarf gap uzunligiga va keshga qarab o'zgaradi. "
    + "Opus hozircha ishlatilmaydi; OpenAI ovozi 2027-01-06 da o'chadi. Aniq narxlar provayder saytida; Anthropic va OpenAI'da oylik limit qo'ying.";
  box.append(
    summary,
    table(["Miya", "1 mln token", "1 javob", "Oyiga"], llmRows),
    table(["Ovoz", "1 daqiqa", "Oyiga"], ttsRows),
    note,
  );
  return box;
}
