// Uydagi qurilmalar (hozircha televizor): topish, YouTube'ni TV'da ochish, TV ovozi. Tarmoq protokollari — tv.js.
const tv = require("./tv.js");
const { videoIdFrom, search } = require("./youtube.js");

const TV_VOLUME_STEP = 5;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const currentVolume = (xml) => Number(/<CurrentVolume>(\d+)<\/CurrentVolume>/i.exec(xml)?.[1]);

async function homeTv(input) {
  const action = input?.action;
  if (action === "discover") {
    const list = await tv.discover();
    return list.length
      ? { text: list.map((t) => `- ${t.name} (${[t.manufacturer, t.model].filter(Boolean).join(" ")}, ${t.ip})${t.appUrl ? ", YouTube: bor" : ""}${t.services["urn:schemas-upnp-org:service:RenderingControl:1"] ? ", ovoz: bor" : ""}`).join("\n") }
      : { error: "Tarmoqda televizor topilmadi. TV yoqilganmi va shu Wi-Fi'dami?" };
  }
  const picked = await tv.pickTv(input?.tv);
  if (picked.error) return { error: picked.error };
  const target = picked.tv;
  switch (action) {
    case "youtube": {
      const id = videoIdFrom(input.url) ?? (input.query ? (await search(input.query))[0]?.id : null);
      if (!id) return { error: "Video topilmadi." };
      return tv.youtubeOnTv(target, id, input.seconds);
    }
    case "volume": {
      const r = await tv.rendering(target, "SetVolume", { DesiredVolume: clamp(input.level) });
      return r.error ? r : { text: `${target.name}: ovoz ${clamp(input.level)}.` };
    }
    case "volume_up":
    case "volume_down": {
      const now = await tv.rendering(target, "GetVolume", {});
      if (now.error) return now;
      const level = clamp((currentVolume(now.text) || 0) + (action === "volume_up" ? TV_VOLUME_STEP : -TV_VOLUME_STEP));
      const r = await tv.rendering(target, "SetVolume", { DesiredVolume: level });
      return r.error ? r : { text: `${target.name}: ovoz ${level}.` };
    }
    case "mute":
    case "unmute": {
      const r = await tv.rendering(target, "SetMute", { DesiredMute: action === "mute" ? 1 : 0 });
      return r.error ? r : { text: `${target.name}: ${action === "mute" ? "ovoz o'chirildi" : "ovoz yoqildi"}.` };
    }
    case "status": {
      const r = await tv.rendering(target, "GetVolume", {});
      return r.error ? r : { text: `${target.name} (${target.ip}): ovoz ${currentVolume(r.text)}.` };
    }
    default:
      return { error: `Noma'lum amal: ${action}` };
  }
}

module.exports = { homeTv };
