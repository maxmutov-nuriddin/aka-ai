// Server testlari uchun yordamchi: xotiradagi baza bilan ilova ochadi va (kerak bo'lsa) foydalanuvchini kiritadi.
import { createApp } from "../../server/app.js";
import { openDatabase } from "../../server/db/database.js";

export const TEST_USER = { name: "Test O'quvchi", email: "test@jigar.uz", password: "parol-12345" };

/**
 * @param {object} options createApp parametrlari (jigar, tts, stt, env)
 * @param {{ login?: boolean }} [flags] login: true — foydalanuvchi ro'yxatdan o'tadi, so'rovlar token bilan ketadi
 */
export async function startServer(options, { login = true } = {}) {
  const app = createApp({ db: openDatabase(":memory:"), ...options });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let token = "";
  if (login) {
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...TEST_USER, client: "extension" }),
    });
    ({ token } = await res.json());
  }
  const auth = () => (token ? { Authorization: `Bearer ${token}` } : {});
  const raw = (path, init = {}) => fetch(base + path, { ...init, headers: { ...auth(), ...(init.headers ?? {}) } });
  const post = (path, body, headers = {}) =>
    raw(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { app, base, token, raw, post, close: () => server.close() };
}
