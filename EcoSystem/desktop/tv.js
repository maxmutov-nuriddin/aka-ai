// Uydagi televizorlar (aqlli TV): tarmoqdan topish (SSDP/UPnP), YouTube'ni TV'da ochish (DIAL),
// ovoz va ovozsiz rejim (UPnP RenderingControl). Samsung, LG, Sony, Philips, Android TV — ko'pchiligi qo'llaydi.
// Xavfsizlik: faqat lokal tarmoq manzillari (192.168.x, 10.x, 172.16-31.x) — tashqi manzilga so'rov yuborilmaydi.
const dgram = require("node:dgram");

const SSDP_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;
const DISCOVER_MS = 3000;
const HTTP_TIMEOUT_MS = 4000;
const SEARCH_TARGETS = ["urn:dial-multiscreen-org:service:dial:1", "urn:schemas-upnp-org:device:MediaRenderer:1"];
const RENDERING = "urn:schemas-upnp-org:service:RenderingControl:1";

/** Lokal tarmoq manzilimi (SSRF'dan himoya: TV deb kelgan tashqi manzilga borilmaydi). */
function isPrivateUrl(value) {
  try {
    const { hostname, protocol } = new URL(value);
    if (protocol !== "http:") return false;
    const p = hostname.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return p[0] === 10 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31);
  } catch {
    return false;
  }
}

/** SSDP javobidagi sarlavhalar: { location, st, server }. */
function parseSsdp(message) {
  const headers = {};
  for (const line of String(message).split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return { location: headers.location ?? "", st: headers.st ?? headers.nt ?? "", server: headers.server ?? "" };
}

const tag = (xml, name) => new RegExp(`<${name}>([^<]*)</${name}>`, "i").exec(xml)?.[1]?.trim() ?? "";
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Qurilma tavsifi (UPnP XML): nom, ishlab chiqaruvchi, model, tur va xizmatlar (controlURL to'liq manzil bilan). */
function parseDescription(xml, location) {
  const base = tag(xml, "URLBase") || location;
  const services = {};
  for (const block of xml.match(/<service>[\s\S]*?<\/service>/gi) ?? []) {
    const type = tag(block, "serviceType");
    const control = tag(block, "controlURL");
    if (type && control) {
      try {
        services[type] = new URL(control, base).href;
      } catch {
        /* buzilgan manzil — tashlanadi */
      }
    }
  }
  return {
    name: decode(tag(xml, "friendlyName")) || "TV",
    manufacturer: decode(tag(xml, "manufacturer")),
    model: decode(tag(xml, "modelName")),
    deviceType: tag(xml, "deviceType"),
    services,
  };
}

/** Televizormi (yoki ekranli media qurilma): DIAL yoki MediaRenderer va nomida TV belgisi. */
const looksLikeTv = (d) => Boolean(d.appUrl) || /MediaRenderer|TV/i.test(`${d.deviceType} ${d.name} ${d.model}`);

async function httpGet(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  return { text: await res.text(), appUrl: res.headers.get("application-url") };
}

/** SSDP M-SEARCH: tarmoqdagi qurilmalardan LOCATION manzillari. */
function ssdpSearch(waitMs = DISCOVER_MS) {
  return new Promise((resolve) => {
    const found = new Map();
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("message", (msg) => {
      const r = parseSsdp(msg);
      if (r.location && isPrivateUrl(r.location)) found.set(r.location, r);
    });
    socket.on("error", () => resolve([...found.values()]));
    socket.bind(0, () => {
      for (const st of SEARCH_TARGETS) {
        const query = `M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP_ADDR}:${SSDP_PORT}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`;
        socket.send(query, SSDP_PORT, SSDP_ADDR);
      }
    });
    setTimeout(() => {
      socket.close();
      resolve([...found.values()]);
    }, waitMs);
  });
}

let known = []; // oxirgi topilganlar: [{ name, ip, manufacturer, model, appUrl, services }]

async function discover() {
  const answers = await ssdpSearch();
  const devices = await Promise.all(answers.map(async ({ location }) => {
    try {
      const { text, appUrl } = await httpGet(location);
      const info = parseDescription(text, location);
      const dial = appUrl && isPrivateUrl(appUrl) ? appUrl.replace(/\/?$/, "/") : null;
      return { ...info, ip: new URL(location).hostname, appUrl: dial };
    } catch {
      return null;
    }
  }));
  // Bir TV bir nechta xizmat bilan javob beradi — IP bo'yicha birlashtiramiz.
  const byIp = new Map();
  for (const d of devices.filter(Boolean)) {
    const prev = byIp.get(d.ip);
    byIp.set(d.ip, prev ? { ...prev, ...d, name: prev.name || d.name, appUrl: prev.appUrl || d.appUrl, services: { ...prev.services, ...d.services } } : d);
  }
  known = [...byIp.values()].filter(looksLikeTv);
  return known;
}

/** Nom yoki IP bo'yicha TV; berilmasa — yagona topilgani. Oldin topilmagan bo'lsa — qidiradi. */
async function pickTv(hint) {
  if (!known.length) await discover();
  const want = String(hint ?? "").trim().toLowerCase();
  if (!want) return known.length === 1 ? { tv: known[0] } : known.length ? { error: `Bir nechta TV bor: ${known.map((t) => t.name).join(", ")} — qaysi biri?` } : { error: "Tarmoqda televizor topilmadi (TV yoqilgan va shu Wi-Fi'da bo'lsin)." };
  const tv = known.find((t) => t.ip === want || t.name.toLowerCase().includes(want) || want.includes(t.name.toLowerCase()));
  return tv ? { tv } : { error: `"${hint}" topilmadi. Topilganlar: ${known.map((t) => t.name).join(", ") || "yo'q"}.` };
}

function soapBody(action, args) {
  const params = Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join("");
  return `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${RENDERING}">${params}</u:${action}></s:Body></s:Envelope>`;
}

async function rendering(tv, action, args) {
  const url = tv.services[RENDERING];
  if (!url || !isPrivateUrl(url)) return { error: `${tv.name} ovozni tarmoq orqali boshqarishni qo'llamaydi.` };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPACTION: `"${RENDERING}#${action}"` },
    body: soapBody(action, { InstanceID: 0, Channel: "Master", ...args }),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await res.text();
  return res.ok ? { ok: true, text } : { error: `${tv.name} rad etdi (HTTP ${res.status}).` };
}

/** YouTube'ni TV'da ochish (DIAL): TV'ning YouTube ilovasi shu videoni o'ynaydi. */
async function youtubeOnTv(tv, videoId, startSeconds) {
  if (!tv.appUrl) return { error: `${tv.name} DIAL'ni qo'llamaydi — TV'da YouTube'ni tarmoqdan ochib bo'lmaydi.` };
  const body = `v=${videoId}${startSeconds ? `&t=${Math.round(startSeconds)}` : ""}`;
  const res = await fetch(`${tv.appUrl}YouTube`, {
    method: "POST", headers: { "Content-Type": "text/plain; charset=utf-8" }, body, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS * 2),
  });
  return res.status < 300 ? { text: `${tv.name}: YouTube'da video ochildi.` } : { error: `${tv.name} YouTube'ni ochmadi (HTTP ${res.status}). TV'da YouTube ilovasi o'rnatilganmi?` };
}

module.exports = { discover, pickTv, rendering, youtubeOnTv, isPrivateUrl, parseSsdp, parseDescription, looksLikeTv };
