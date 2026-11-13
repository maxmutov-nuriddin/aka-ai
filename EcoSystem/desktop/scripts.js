// macOS (AppleScript) va Windows (PowerShell) skriptlari — sof funksiyalar (testlanadi: test/desktop/scripts.test.js).
// Ilova nomi chaqiruvchida isSafeAppName bilan tekshiriladi; sonlar shu yerda 0-100 ga keltiriladi.
const clampLevel = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// Windows: virtual tugmalar (VK) — tizim ovozi va media.
const VK = { volumeMute: 173, volumeDown: 174, volumeUp: 175, next: 176, previous: 177, playPause: 179 };
const VOLUME_STEP_PERCENT = 2; // Windows'da bitta "ovoz +" tugmasi ≈ 2%
const winKeys = (code, times = 1) =>
  `$w = New-Object -ComObject WScript.Shell; 1..${Math.max(1, times)} | ForEach-Object { $w.SendKeys([char]${code}) }`;

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
  quitAll: (keep) => `Get-Process | Where-Object { $_.MainWindowTitle -and @(${keep.map((k) => `'${k}'`).join(",")}) -notcontains $_.ProcessName } | ForEach-Object { $_.CloseMainWindow() | Out-Null; $_.ProcessName }`,
  lock: () => ["rundll32.exe", ["user32.dll,LockWorkStation"]],
  sleepDisplay: () => `(Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern int SendMessage(int h, int m, int w, int l);' -Name M -Namespace J -PassThru)::SendMessage(0xFFFF, 0x0112, 0xF170, 2) | Out-Null`,
  battery: () => "Get-CimInstance Win32_Battery | ForEach-Object { 'Zaryad: ' + $_.EstimatedChargeRemaining + '%, holat: ' + $_.BatteryStatus }",
};

module.exports = { mac, win, clampLevel, VOLUME_STEP_PERCENT };
