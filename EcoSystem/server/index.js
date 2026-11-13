// Jigar EcoSystem serverini ishga tushirish: npm start (yoki npm run dev). Global serveridan alohida (port 3100).
import { createApp, defaultDbFile } from "./app.js";
import { openDatabase } from "./db/database.js";
import { homedir, networkInterfaces } from "node:os";
import { scheduleBackups } from "./db/backup.js";
import { productionProblems } from "./http/security.js";
import path from "node:path";

const SESSION_CLEANUP_MS = 6 * 60 * 60_000;
const env = process.env;

if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) {
  console.warn("Diqqat: ANTHROPIC_API_KEY o'rnatilmagan. Claude'ga so'rovlar ishlamaydi.");
}
if (!env.ELEVENLABS_API_KEY && !(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION)) {
  console.warn("Diqqat: ELEVENLABS_API_KEY yo'q. Jigar brauzer ovozida gapiradi va brauzer orqali tinglaydi.");
}

// Internetga chiqarishdan oldin xavfli sozlamalar: fatal — server ishga tushmaydi, warn — ogohlantirish.
const { fatal, warn: warnings } = productionProblems(env);
for (const message of warnings) console.warn(`Diqqat: ${message}`);
if (fatal.length) {
  for (const message of fatal) console.error(`XATO: ${message}`);
  process.exit(1);
}

const dbFile = defaultDbFile(env);
// Jurnal md fayllari (QILOLMAGAN-ISHLAR.md, XATOLAR.md, HARAKATLAR.md): ECO_JOURNAL_DIR yoki ~/Jigar.
const journalDir = env.ECO_JOURNAL_DIR?.trim() || path.join(homedir(), "Jigar");
const database = openDatabase(dbFile);
const app = createApp({ env, db: database, journalDir });
// Bazaning kunlik zaxirasi (data/backups, oxirgi 7 kun); ECO_BACKUP_DIR bilan o'zgartiriladi.
scheduleBackups(database, env.ECO_BACKUP_DIR?.trim() || path.join(path.dirname(dbFile), "backups"));

// Muddati o'tgan sessiyalarni vaqti-vaqti bilan tozalash.
app.store.deleteExpiredSessions();
setInterval(() => app.store.deleteExpiredSessions(), SESSION_CLEANUP_MS).unref();
// Jigarning o'z tashabbusi: ekranga qarab maslahat, ertalabki va kechki xulosa (Sozlamalarda o'chiriladi).
app.proactive.start();
// Kuzatuvlar ("tugasa o'chir"), monitoring (batareya, disk), vaqtli ssenariylar.
app.agent.start();

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
