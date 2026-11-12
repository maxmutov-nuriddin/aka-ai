// Gemini (Google) — Jigarning muqobil "miyasi". Support panelida tanlanadi (settings: llm_provider).
// Interactions API (POST /v1beta/interactions): system_instruction + input qadamlari (user_input / model_output).
// Kirish xabarlari Anthropic formatida keladi (buildMessages) — shu yerda Gemini formatiga o'giriladi.

const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";
const DEFAULT_MODEL = "gemini-3.8-flash";
const REQUEST_TIMEOUT_MS = 60_000;

/** Anthropic kontent bloki -> Gemini kontent bloki (matn yoki rasm). Kesh belgilari tashlanadi. */
function toGeminiBlock(block) {
  if (block?.type === "text") return { type: "text", text: block.text };
  if (block?.type === "image" && block.source?.type === "base64") {
    return { type: "image", data: block.source.data, mime_type: block.source.media_type };
  }
  return null;
}

/** Anthropic messages -> Gemini input qadamlari. */
export function toGeminiInput(messages) {
  return messages.map((m) => ({
    type: m.role === "assistant" ? "model_output" : "user_input",
    content: typeof m.content === "string"
      ? [{ type: "text", text: m.content }]
      : m.content.map(toGeminiBlock).filter(Boolean),
  }));
}

/** Javobdan oxirgi model qadamining matni. */
export function geminiText(data) {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const last = [...steps].reverse().find((s) => s?.type === "model_output") ?? steps.at(-1);
  return (last?.content ?? []).filter((c) => c?.type === "text").map((c) => c.text).join("").trim();
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchImpl?: typeof fetch }} [options]
 */
export function createGeminiLlm({ env = process.env, fetchImpl = fetch } = {}) {
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

  /**
   * @param {{ system: string, messages: Array<{ role: string, content: unknown }>, maxTokens: number }} request
   * @returns {Promise<{ text: string, model: string }>}
   */
  async function generate({ system, messages, maxTokens }) {
    if (!key) throw new Error("Gemini sozlanmagan (GEMINI_API_KEY)");
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json", "Api-Revision": API_REVISION },
      body: JSON.stringify({
        model,
        system_instruction: system,
        store: false, // tarixni o'zimiz yuboramiz — Google'da saqlanmasin
        generation_config: { max_output_tokens: maxTokens, thinking_level: "low" },
        input: toGeminiInput(messages),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
    }
    const text = geminiText(await res.json());
    if (!text) throw new Error("Gemini: bo'sh javob");
    return { text, model };
  }

  return { configured: Boolean(key), model, generate };
}
