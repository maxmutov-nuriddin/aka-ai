// Jigar EcoSystem serverini ishga tushirish: npm start (yoki npm run dev). Global serveridan alohida (port 3100).
import { createApp, defaultDbFile } from "./app.js";
import { openDatabase } from "./db/database.js";
import { networkInterfaces } from "node:os";

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
// Jigarning o'z tashabbusi: ekranga qarab maslahat, ertalabki va kechki xulosa (Sozlamalarda o'chiriladi).
app.proactive.start();

const port = Number(env.PORT) || 3100; // Global — 3000, EcoSystem — 3100 (aralashmasin)
// HOST=0.0.0.0 (standart) — bir Wi-Fi'dagi boshqa qurilmalar ham kira oladi. Faqat shu kompyuter: HOST=127.0.0.1
const host = env.HOST || "0.0.0.0";

/** Shu kompyuterning lokal tarmoqdagi IPv4 manzillari (192.168.x.x kabi). */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

app.listen(port, host, () => {
  console.log(`Jigar EcoSystem ishga tushdi: http://localhost:${port} (baza: ${dbFile})`);
  if (host === "0.0.0.0") {
    for (const ip of lanAddresses()) console.log(`  Tarmoqdagi qurilmalar uchun: http://${ip}:${port}`);
    console.log("  Eslatma: telefon/boshqa kompyuterda mikrofon faqat HTTPS orqali ishlaydi (brauzer talabi).");
  }
});
