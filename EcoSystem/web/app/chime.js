// Qisqa "ding": Jigar ismi eshitildi va tinglay boshladi (oyna yopiq bo'lsa ham egasi biladi). Juda past ovozda, ~0.25 s.
let ctx = null;

/** Ikki ohangli yengil signal. Ovoz o'chirilgan yoki ruxsat bo'lmasa — jim o'tadi. */
export function playChime() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    [[660, 0], [880, 0.11]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.07, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.16);
    });
  } catch {
    /* ovoz chiqmasa ham ish davom etadi */
  }
}
