// Fonda ishlayotganini bildiruvchi kichik yozuv: ekran pastida, hamma oynalar ustida, bosilmaydi va fokusni olmaydi.
// "Tinglayapti…", "O'ylayapti…", "Gapiryapti…" — holat o'zgarsa yangilanadi; Jigar bo'sh bo'lsa (idle) — yashirinadi.
// Chaqiruvchi: main.js (jigar:status). Asosiy oyna ko'rinib turgan paytda ko'rsatilmaydi (u yerda holat o'zi ko'rinadi).
const { BrowserWindow, screen } = require("electron");
const { pillLabel, PILL_HIDE_DELAY_MS } = require("./pill-policy.js");

const SIZE = { width: 240, height: 48 };
const BOTTOM_MARGIN = 72;

const PAGE = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:600 15px system-ui,"Segoe UI",sans-serif}
  .pill{box-sizing:border-box;height:100%;display:flex;align-items:center;gap:10px;padding:0 18px;border-radius:999px;
    background:rgba(16,18,40,.94);color:#eef0ff;border:1px solid rgba(124,116,255,.55);box-shadow:0 6px 24px rgba(0,0,0,.45)}
  .dot{width:10px;height:10px;border-radius:50%;background:#7ee081;animation:p 1.1s ease-in-out infinite}
  @keyframes p{0%,100%{transform:scale(.8);opacity:.6}50%{transform:scale(1.2);opacity:1}}
</style><div class="pill"><span class="dot"></span><span id="t">Jigar</span></div>`;

function createStatusPill({ getMainWindow }) {
  let pill = null;
  let hideTimer = null;

  function ensure() {
    if (pill && !pill.isDestroyed()) return pill;
    pill = new BrowserWindow({
      ...SIZE,
      frame: false,
      transparent: true,
      resizable: false,
      show: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    pill.setIgnoreMouseEvents(true);
    pill.setAlwaysOnTop(true, "screen-saver");
    pill.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    pill.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);
    pill.on("closed", () => { pill = null; });
    return pill;
  }

  function place(win) {
    const { workArea } = screen.getPrimaryDisplay();
    win.setPosition(
      Math.round(workArea.x + (workArea.width - SIZE.width) / 2),
      Math.round(workArea.y + workArea.height - SIZE.height - BOTTOM_MARGIN),
    );
  }

  /** Holat o'zgardi: yozuvni ko'rsat yoki (idle) biroz kutib yashir. */
  function update(state) {
    clearTimeout(hideTimer);
    const main = getMainWindow();
    const mainInView = Boolean(main && !main.isDestroyed() && main.isVisible() && !main.isMinimized() && main.isFocused());
    const label = pillLabel(state);
    if (!label || mainInView) {
      if (pill && !pill.isDestroyed() && pill.isVisible()) {
        hideTimer = setTimeout(() => pill && !pill.isDestroyed() && pill.hide(), label ? 0 : PILL_HIDE_DELAY_MS);
      }
      return;
    }
    const win = ensure();
    win.webContents.executeJavaScript(`document.getElementById("t").textContent = ${JSON.stringify(label)}`).catch(() => {});
    place(win);
    if (!win.isVisible()) win.showInactive();
  }

  const destroy = () => {
    clearTimeout(hideTimer);
    if (pill && !pill.isDestroyed()) pill.destroy();
  };
  return { update, destroy };
}

module.exports = { createStatusPill };
