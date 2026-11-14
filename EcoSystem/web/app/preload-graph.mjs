// app.js dan boshlab hamma ES modullarni (relative import) topadi — index.html dagi modulepreload ro'yxati shu bilan tekshiriladi.
import { readFileSync } from "node:fs";
import path from "node:path";

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^"'`\n]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;

/** @param {string} entry web/ ichidagi yo'l, masalan "app/app.js" @returns {string[]} web/ ga nisbatan tartiblangan yo'llar */
export function moduleGraph(webDir, entry = "app/app.js") {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    let source;
    try {
      source = readFileSync(path.join(webDir, rel), "utf8");
    } catch {
      return; // web/ ichida yo'q (masalan, /shared/parse.js serverning core/ papkasidan beriladi) — ro'yxatda qoladi, ichi o'qilmaydi
    }
    for (const m of source.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec?.startsWith(".")) continue;
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
    }
  };
  visit(entry);
  return [...seen].sort();
}
