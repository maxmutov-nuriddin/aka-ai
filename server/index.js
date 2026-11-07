// Serverni ishga tushirish: npm start (yoki npm run dev).
import { createApp, defaultDbFile } from "./app.js";
import { openDatabase } from "./db/database.js";

const SESSION_CLEANUP_MS = 6 * 60 * 60_000;
const env = process.env;

if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("Diqqat: ANTHROPIC_API_KEY o'rnatilmagan. Claude'ga so'rovlar ishlamaydi.");
}
if (!env.ELEVENLABS_API_KEY && !(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION)) {
  console.warn("Diqqat: ELEVENLABS_API_KEY yo'q. Jigar brauzer ovozida gapiradi va brauzer orqali tinglaydi.");
}

const dbFile = defaultDbFile(env);
const app = createApp({ env, db: openDatabase(dbFile) });

// Muddati o'tgan sessiyalarni vaqti-vaqti bilan tozalash.
app.store.deleteExpiredSessions();
setInterval(() => app.store.deleteExpiredSessions(), SESSION_CLEANUP_MS).unref();

const port = Number(env.PORT) || 3000;
app.listen(port, () => console.log(`Jigar ishga tushdi: http://localhost:${port} (baza: ${dbFile})`));
