// Ilovaning texnik xatosini serverga yozadi (POST /api/journal/client → XATOLAR.md): mikrofon ochilmasa — sababi
// (err.name: err.message), qurilmadagi mikrofonlar soni va qurilma turi. Egasi xatoni nusxalab yubormasa ham, sabab
// serverda ko'rinadi. Bir xil xato (joy + nom) bir sahifa ochilishida faqat bir marta yuboriladi.

const sent = new Set();

/** Mikrofonlar soni (ruxsatsiz ham sanaladi; nomlari kerak emas). Aniqlab bo'lmasa — "?". */
async function audioInputCount() {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput").length;
  } catch {
    return "?";
  }
}

/** Qurilma turi: "desktop ilova, Windows NT 10.0" kabi (qurilma id'si yuborilmaydi). */
function deviceLabel() {
  const ua = navigator.userAgent;
  const os = ua.match(/Windows NT [\d.]+|Mac OS X [\d_]+|Android [\d.]+|iPhone OS [\d_]+/)?.[0] ?? "noma'lum OS";
  return `${/JigarDesktop\//.test(ua) ? "desktop ilova" : "brauzer"}, ${os}`;
}

/**
 * @param {{ apiBase: () => string, authHeaders: () => Record<string, string> }} host
 * @param {{ where: string, name?: string, message?: string }} issue
 */
export async function reportClientIssue({ apiBase, authHeaders }, { where, name = "xato", message = "" }) {
  const key = `${where}|${name}`;
  if (sent.has(key)) return;
  sent.add(key);
  try {
    await fetch(`${apiBase()}/api/journal/client`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ where, name, message, audioInputs: await audioInputCount(), device: deviceLabel() }),
    });
  } catch {
    /* jurnal ixtiyoriy — xato ilovani to'xtatmasin */
  }
}
