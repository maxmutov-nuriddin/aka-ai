// jigar:// havolalari (Siri qisqa buyrug'i, Shortcuts, Windows "Ishga tushirish"): toza mantiq — Electron'siz, testlanadi.
//   jigar://listen — Jigar darhol tinglashni boshlaydi ("Hey Jigar" aytilgandek; oyna ochilmaydi).
// Faqat tinglashni boshlaydi: havola orqali buyruq matni QABUL QILINMAYDI — har qanday sayt jigar:// ni ochishi mumkin,
// buyruqni esa egasi o'z ovozi bilan aytadi. Chaqiruvchi: main.js (open-url, second-instance).
const SCHEME = "jigar";
const ACTIONS = new Set(["listen"]);

/** "jigar://listen" → "listen"; boshqa/buzuq havola — null. */
function deepLinkAction(url) {
  let parsed;
  try {
    parsed = new URL(String(url ?? ""));
  } catch {
    return null;
  }
  if (parsed.protocol !== `${SCHEME}:`) return null;
  const action = (parsed.hostname || parsed.pathname.replace(/^\/+/, "")).toLowerCase();
  return ACTIONS.has(action) ? action : null;
}

/** Windows: havola ikkinchi nusxaning argv'ida keladi. */
const deepLinkFromArgv = (argv = []) => argv.find((arg) => String(arg).toLowerCase().startsWith(`${SCHEME}://`)) ?? null;

module.exports = { SCHEME, deepLinkAction, deepLinkFromArgv };
