// OpenAI (ChatGPT) — Jigarning muqobil "miyasi". Support panelida tanlanadi (settings: llm_provider = "openai").
// Responses API (POST /v1/responses): instructions (tizim prompti) + input (rolli xabarlar).
// Kirish xabarlari Anthropic formatida keladi (buildMessages) — shu yerda OpenAI formatiga o'giriladi.
// Model: OPENAI_MODEL (standart gpt-6.1-sol — Claude Sonnet sinfi; arzoni gpt-6-luna). Tannarx: usage/tariffs.js.

const API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-6.1-sol";
const REQUEST_TIMEOUT_MS = 60_000;

/** Anthropic kontent bloki -> OpenAI kontent qismi (matn yoki rasm). Kesh belgilari tashlanadi. */
function toOpenAiPart(block) {
  if (block?.type === "text") return { type: "input_text", text: block.text };
  if (block?.type === "image" && block.source?.type === "base64") {
    return { type: "input_image", image_url: `data:${block.source.media_type};base64,${block.source.data}` };
  }
  return null;
}

/** Anthropic messages -> Responses API input. Jigarning oldingi javoblari — oddiy matn. */
export function toOpenAiInput(messages) {
  return messages.map((m) => {
    if (m.role === "assistant") {
      const text = typeof m.content === "string" ? m.content : m.content.filter((b) => b?.type === "text").map((b) => b.text).join("");
      return { role: "assistant", content: text };
    }
    const content = typeof m.content === "string"
      ? [{ type: "input_text", text: m.content }]
      : m.content.map(toOpenAiPart).filter(Boolean);
    return { role: "user", content };
  });
}

/** Javobdan matn: output[] ichidagi "message" elementlarining output_text qismlari (reasoning va boshqalar o'tkaziladi). */
export function openAiText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (Array.isArray(data?.output) ? data.output : [])
    .filter((item) => item?.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part?.type === "output_text")
    .map((part) => part.text)
    .join("")
    .trim();
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createOpenAiLlm({ env = process.env, fetchImpl = fetch } = {}) {
  const key = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  /**
   * @param {{ system: string, messages: Array<{ role: string, content: unknown }>, maxTokens: number }} request
   * @returns {Promise<{ text: string, model: string }>}
   */
  async function generate({ system, messages, maxTokens }) {
    if (!key) throw new Error("OpenAI sozlanmagan (OPENAI_API_KEY)");
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: system,
        input: toOpenAiInput(messages),
        max_output_tokens: maxTokens,
        reasoning: { effort: "low" }, // tez javob: o'quvchi ovoz kutyapti
        store: false, // tarixni o'zimiz yuboramiz — OpenAI'da saqlanmasin
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
    }
    const text = openAiText(await res.json());
    if (!text) throw new Error("OpenAI: bo'sh javob");
    return { text, model };
  }

  return { configured: Boolean(key), model, generate };
}
