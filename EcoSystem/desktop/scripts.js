// macOS (AppleScript) va Windows (PowerShell) skriptlari — sof funksiyalar (testlanadi: test/desktop/scripts.test.js).
// Ilova nomi chaqiruvchida isSafeAppName bilan tekshiriladi; sonlar shu yerda 0-100 ga keltiriladi.
const clampLevel = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Windows: virtual tugmalar (VK) — tizim ovozi va media.
const VK = { volumeMute: 173, volumeDown: 174, volumeUp: 175, next: 176, previous: 177, playPause: 179 };
const VOLUME_STEP_PERCENT = 2; // Windows'da bitta "ovoz +" tugmasi ≈ 2%
const winKeys = (code, times = 1) =>
  `$w = New-Object -ComObject WScript.Shell; 1..${Math.max(1, times)} | ForEach-Object { $w.SendKeys([char]${code}) }`;

// Tab nomi/manzili uchun matn: skriptga xavfsiz joylanadi (AppleScript — qo'sh tirnoq, PowerShell — bitta tirnoq).
const TITLE_MAX = 80;
const cleanTitle = (text) => String(text ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, TITLE_MAX);
const asString = (text) => `"${cleanTitle(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const psString = (text) => `'${cleanTitle(text).replace(/'/g, "''")}'`;

// Windows: brauzer oynalari. Brauzer tab ro'yxatini bermaydi — faol tab sarlavhasi oyna sarlavhasida ko'rinadi.
const WIN_BROWSERS = ["chrome", "msedge", "brave", "firefox", "opera", "vivaldi", "yandex", "arc"];
const WIN_FIND_TYPE = `Add-Type -TypeDefinition @"
using System; using System.Text; using System.Collections.Generic; using System.Diagnostics; using System.Runtime.InteropServices;
public static class JT {
  delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);
  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  public static List<IntPtr> Find(string text, string[] procs) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var t = Title(h);
      if (t.IndexOf(text, StringComparison.OrdinalIgnoreCase) < 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      try { if (Array.IndexOf(procs, Process.GetProcessById((int)pid).ProcessName.ToLower()) >= 0) list.Add(h); } catch {}
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@`;

const mac = {
  volumeStatus: () => 'set s to get volume settings\nreturn (output volume of s as text) & "," & (output muted of s as text)',
  volumeSet: (level) => `set volume output volume ${clampLevel(level)} without output muted`,
  volumeStep: (delta) => `set volume output volume ((output volume of (get volume settings)) + ${Math.round(delta)}) without output muted`,
  mute: (on) => `set volume output muted ${on ? "true" : "false"}`,
  /** Ishlayotgan ilovaga (Spotify yoki Music) media buyrug'i. */
  player: (app, action) => `tell application "${app}" to ${{ play_pause: "playpause", next: "next track", previous: "previous track" }[action]}`,
  appsList: () => 'tell application "System Events" to get name of every process whose background only is false',
  focus: (app) => `tell application "${app}" to activate`,
  hide: (app) => `tell application "System Events" to set visible of process "${app}" to false`,
  quit: (app) => `tell application "${app}" to quit`,
  /** Brauzerning nomi yoki manzilida `text` bor tablarini yopadi (Chrome-oilasi va Safari). Qaytaradi: yopilganlar soni. */
  closeTabs: (browser, text) => browser === "Safari"
    ? `set found to 0\ntell application "Safari"\nrepeat with w in windows\nrepeat with i from (count of tabs of w) to 1 by -1\nset t to tab i of w\nif (name of t contains ${asString(text)}) or (URL of t contains ${asString(text)}) then\nclose t\nset found to found + 1\nend if\nend repeat\nend repeat\nend tell\nreturn found`
    : `set found to 0\ntell application "${browser}"\nrepeat with w in windows\nrepeat with i from (count of tabs of w) to 1 by -1\nset t to tab i of w\nif (title of t contains ${asString(text)}) or (URL of t contains ${asString(text)}) then\nclose t\nset found to found + 1\nend if\nend repeat\nend repeat\nend tell\nreturn found`,
  hideAll: (keep) => `tell application "System Events" to set visible of (every process whose visible is true${keep.map((k) => ` and name is not "${k}"`).join("")}) to false`,
};

const win = {
  volumeSet: (level) => `${winKeys(VK.volumeDown, 50)}; ${winKeys(VK.volumeUp, Math.round(clampLevel(level) / VOLUME_STEP_PERCENT) || 1)}`,
  volumeStep: (delta) => winKeys(delta > 0 ? VK.volumeUp : VK.volumeDown, Math.round(Math.abs(delta) / VOLUME_STEP_PERCENT)),
  mute: () => winKeys(VK.volumeMute),
  media: (action) => winKeys({ play_pause: VK.playPause, next: VK.next, previous: VK.previous }[action]),
  appsList: () => "Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.ProcessName + ' | ' + $_.MainWindowTitle }",
  focus: (app) => `$p = Get-Process -Name '${app}' -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1; (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null`,
  hide: (app) => `Add-Type -Name W -Namespace J -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'; Get-Process -Name '${app}' -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [J.W]::ShowWindow($_.MainWindowHandle, 6) | Out-Null }`,
  quit: (app) => `Get-Process -Name '${app}' -ErrorAction Stop | ForEach-Object { $_.CloseMainWindow() | Out-Null }`,
  hideAll: () => "(New-Object -ComObject Shell.Application).MinimizeAll()",
  /**
   * Sarlavhasida `text` bor brauzer oynasining FAOL tabini yopadi (Ctrl+W). Xavfsizlik: oyna oldinga chiqmasa — hech narsa
   * yuborilmaydi (Ctrl+W boshqa dasturga tushib ketmasin). Bir oynada bir necha mos tab bo'lsa — navbat bilan (≤5).
   * Topilmasa — chiqish kodi 3 va xabar (stderr).
   */
  closeTabs: (text) => `${WIN_FIND_TYPE}
$text = ${psString(text)}; $procs = @(${WIN_BROWSERS.map((b) => `'${b}'`).join(",")}); $closed = 0
foreach ($h in [JT]::Find($text, [string[]]$procs)) {
  for ($i = 0; $i -lt 5; $i++) {
    if ([JT]::Title($h).IndexOf($text, [StringComparison]::OrdinalIgnoreCase) -lt 0) { break }
    [JT]::ShowWindow($h, 9) | Out-Null
    [JT]::keybd_event(0x12, 0, 0, 0); [JT]::keybd_event(0x12, 0, 2, 0)
    [JT]::SetForegroundWindow($h) | Out-Null
    Start-Sleep -Milliseconds 300
    if ([JT]::GetForegroundWindow() -ne $h) { break }
    (New-Object -ComObject WScript.Shell).SendKeys('^w'); $closed++
    Start-Sleep -Milliseconds 350
  }
}
if ($closed -eq 0) { [Console]::Error.WriteLine("Sarlavhasida '$text' bo'lgan faol brauzer tabi topilmadi (Windows'da faqat faol tab yopiladi)."); exit 3 }
Write-Output $closed`,
  quitAll: (keep) => `Get-Process | Where-Object { $_.MainWindowTitle -and @(${keep.map((k) => `'${k}'`).join(",")}) -notcontains $_.ProcessName } | ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.ProcessName }`,
  lock: () => ["rundll32.exe", ["user32.dll,LockWorkStation"]],
  sleepDisplay: () => `(Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern int SendMessage(int h, int m, int w, int l);' -Name M -Namespace J -PassThru)::SendMessage(0xFFFF, 0x0112, 0xF170, 2) | Out-Null`,
  battery: () => "Get-CimInstance Win32_Battery | ForEach-Object { 'Zaryad: ' + $_.EstimatedChargeRemaining + '%, holat: ' + $_.BatteryStatus }",
};

module.exports = { mac, win, clampLevel, cleanTitle, VOLUME_STEP_PERCENT };
