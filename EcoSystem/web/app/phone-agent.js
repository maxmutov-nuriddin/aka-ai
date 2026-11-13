// Android telefon agentini yoqish: Jigar ilovasi (Capacitor, Android) ichida egasi kirgach — shaxsiy kalit yaratiladi
// (bir marta, /api/tokens) va JigarAgent plagini fonda serverga ulanadi. Shundan keyin Jigar telefonni boshqara oladi.
const TOKEN_KEY = "jigar.agentToken";
const TOKEN_ID_KEY = "jigar.agentTokenId";

const plugin = () => (window.Capacitor?.getPlatform?.() === "android" ? window.Capacitor?.Plugins?.JigarAgent : null);

function stored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string> }} deps
 */
export async function startPhoneAgent({ apiBase, authHeaders }) {
  const agent = plugin();
  if (!agent) return;
  const call = async (path, method = "GET", body) => {
    const res = await fetch(`${apiBase()}${path}`, { method, headers: { "Content-Type": "application/json", ...authHeaders() }, body: body && JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  try {
    let token = stored(TOKEN_KEY);
    const id = stored(TOKEN_ID_KEY);
    const { tokens } = await call("/api/tokens");
    if (!token || !tokens.some((t) => String(t.id) === id)) {
      const created = await call("/api/tokens", "POST", { name: "Android telefon" }); // o'chirilgan bo'lsa — yangisi
      token = created.token;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_ID_KEY, String(created.id));
    }
    await agent.start({ url: location.origin, token });
  } catch {
    /* kirilmagan yoki tarmoq — keyingi ochilishda */
  }
}

/** Sozlamalar uchun: server manzilini o'zgartirish (ichki sahifaga qaytadi). */
export const canResetServer = () => Boolean(plugin());
export const resetServer = () => plugin()?.resetServer();
