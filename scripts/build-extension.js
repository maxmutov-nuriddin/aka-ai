// dist/extension papkasiga tayyor Chrome kengaytmasini yig'adi.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "extension");

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "vendor"), { recursive: true });

const copy = (from, to) => cpSync(path.join(root, from), path.join(out, to));

for (const f of ["manifest.json", "background.js", "host-extension.js", "options.html", "options.js"]) {
  copy(path.join("extension", f), f);
}
copy("web/app.js", "app.js");
copy("web/styles.css", "styles.css");
copy("server/parse.js", "parse.js");
copy("node_modules/mermaid/dist/mermaid.min.js", "vendor/mermaid.min.js");

const html = readFileSync(path.join(root, "web", "index.html"), "utf8");
if (!html.includes('src="host-web.js"')) throw new Error("index.html ichida host-web.js topilmadi");
writeFileSync(path.join(out, "sidepanel.html"), html.replace('src="host-web.js"', 'src="host-extension.js"'));

console.log(`Kengaytma tayyor: ${path.relative(root, out)}`);
console.log("Chrome → chrome://extensions → Developer mode → Load unpacked → shu papkani tanlang.");
