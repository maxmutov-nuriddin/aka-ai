// dist/extension papkasiga tayyor Chrome kengaytmasini yig'adi.
// Tuzilma saytdagidek: app/ (yon panel), shared/ (robot, logo, mavzu), options/, vendor/, icons/.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "extension");
const from = (...p) => path.join(root, ...p);
const to = (...p) => path.join(out, ...p);
const copy = (src, dst) => cpSync(src, dst, { recursive: true });

rmSync(out, { recursive: true, force: true });
mkdirSync(to("vendor"), { recursive: true });

// Kengaytmaning o'z fayllari
for (const f of ["manifest.json", "background.js"]) copy(from("extension", f), to(f));
copy(from("extension", "icons"), to("icons"));
copy(from("extension", "options"), to("options"));

// Ilova (yon panel): veb-ilova fayllari, faqat host-web.js o'rniga host-extension.js
copy(from("web", "app"), to("app"));
rmSync(to("app", "host-web.js"));
rmSync(to("app", "index.html"));
copy(from("extension", "host-extension.js"), to("app", "host-extension.js"));
const html = readFileSync(from("web", "app", "index.html"), "utf8");
if (!html.includes('src="host-web.js"')) throw new Error("web/app/index.html ichida host-web.js topilmadi");
writeFileSync(to("app", "sidepanel.html"), html.replace('src="host-web.js"', 'src="host-extension.js"'));

// Umumiy fayllar va kutubxonalar
copy(from("web", "shared"), to("shared"));
copy(from("server", "core", "parse.js"), to("shared", "parse.js"));
copy(from("server", "usage", "plan-pricing.js"), to("shared", "plan-pricing.js")); // konstruktor narxi (tannarxsiz)
copy(from("node_modules", "mermaid", "dist", "mermaid.min.js"), to("vendor", "mermaid.min.js"));

console.log(`Kengaytma tayyor: ${path.relative(root, out)}`);
console.log("Chrome → chrome://extensions → Developer mode → Load unpacked → shu papkani tanlang.");
