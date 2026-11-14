// Yig'ilgan ilovalarni (desktop/dist) downloads/ ga ko'chiradi va versiyalarini versions.json ga yozadi.
//   node deploy/publish-builds.mjs   (versiya — desktop/package.json "version": yangi relizda shuni oshiring: 2.1.0, 2.2.0 …)
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "desktop", "dist");
const out = path.join(root, "downloads");
const { version } = JSON.parse(readFileSync(path.join(root, "desktop", "package.json"), "utf8"));
const FILES = ["Jigar-win.exe", "Jigar-win.zip", "Jigar-mac.dmg"];

const versionsPath = path.join(out, "versions.json");
const versions = existsSync(versionsPath) ? JSON.parse(readFileSync(versionsPath, "utf8")) : {};
for (const name of FILES) {
  if (!existsSync(path.join(dist, name))) {
    console.warn(`o'tkazildi (yig'ilmagan): ${name}`);
    continue;
  }
  copyFileSync(path.join(dist, name), path.join(out, name));
  versions[name] = version;
  console.log(`${name} → v${version}`);
}
writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`);
