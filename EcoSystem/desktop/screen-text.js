// Ekrandagi matnni o'qish — surat va Screen Recording ruxsatisiz (ECOTIZIM-REJA.md, 6-band).
// macOS: Accessibility (System Events) — oldingi ilovaning oynasidagi matn, tugma va maydonlar.
// Ruxsat: System Settings → Privacy & Security → Accessibility → Jigar. Windows — UI Automation (ruxsat shart emas).
const { jxa, powershell } = require("./os-run.js");

const TEXT_MAX = 15_000;
const READ_TIMEOUT_MS = 25_000; // katta oynalarda (VS Code, brauzer) element ko'p — sekin

// Oldingi ilova, oyna nomi va undagi matnlar (takrorlarsiz, ko'pi bilan 1500 element).
const SCRIPT = `
const se = Application("System Events");
const proc = se.processes.whose({ frontmost: true })[0];
const out = ["Ilova: " + proc.name()];
const win = proc.windows.length ? proc.windows[0] : null;
if (win) {
  out.push("Oyna: " + win.name());
  const seen = new Set();
  const items = win.entireContents();
  for (let i = 0; i < Math.min(items.length, 1500); i++) {
    for (const read of [() => items[i].value(), () => items[i].name(), () => items[i].description()]) {
      try {
        const v = read();
        if (typeof v === "string" && v.trim() && !seen.has(v.trim())) { seen.add(v.trim()); out.push(v.trim()); }
      } catch (e) {}
    }
  }
}
out.join("\\n");
`;

// Windows: oldingi oyna (GetForegroundWindow) va undagi elementlar nomi/qiymati (ko'pi bilan 1500 ta, takrorlarsiz).
const WIN_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -Name FG -Namespace J -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'
$root = [System.Windows.Automation.AutomationElement]::FromHandle([J.FG]::GetForegroundWindow())
$out = New-Object System.Collections.Generic.List[string]
$out.Add("Oyna: " + $root.Current.Name)
$seen = @{}
$all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
$i = 0
foreach ($e in $all) {
  if ($i -ge 1500) { break }; $i++
  $n = $e.Current.Name
  if ($n -and -not $seen.ContainsKey($n)) { $seen[$n] = 1; $out.Add($n) }
  try {
    $v = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
    if ($v -and -not $seen.ContainsKey($v)) { $seen[$v] = 1; $out.Add($v) }
  } catch {}
}
$out -join [Environment]::NewLine
`;

const clipText = (text) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}\n…(qisqartirildi)` : text);

async function screenTextWindows() {
  const r = await powershell(WIN_SCRIPT, READ_TIMEOUT_MS);
  return r.code === 0 ? { text: clipText(r.stdout.trim()) } : { error: `O'qib bo'lmadi: ${r.stderr.trim().slice(0, 200)}` };
}

async function screenText() {
  if (process.platform === "win32") return screenTextWindows();
  if (process.platform !== "darwin") return { error: "Ekran matnini o'qish faqat macOS va Windows'da — pc_screenshot ishlating." };
  const r = await jxa(SCRIPT, READ_TIMEOUT_MS);
  if (r.code !== 0) {
    const denied = /not allowed|assistive|-1719|-25211/i.test(r.stderr);
    return { error: denied ? "Ruxsat kerak: System Settings → Privacy & Security → Accessibility → Jigar'ni yoqing." : `O'qib bo'lmadi: ${r.stderr.trim().slice(0, 200)}` };
  }
  return { text: clipText(r.stdout.trim()) };
}

module.exports = { screenText };
