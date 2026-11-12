// Telefon ekranini Jigarga ko'rsatish (faqat Android ilovasi — JigarScreen native plagini, MediaProjection).
// Ulashish yoqilgach egasi boshqa ilovaga o'tadi; Jigar'ga qaytib so'raganda — o'sha ilova ekranining oxirgi surati
// savolga ilova qilinadi (kamera kadri kabi). iPhone va brauzerda — yo'q (Apple boshqa ilovalar ekranini bermaydi).

const plugin = () => window.Capacitor?.Plugins?.JigarScreen;

export function createPhoneScreen() {
  let active = false;
  return {
    get supported() {
      return window.Capacitor?.getPlatform?.() === "android" && Boolean(plugin());
    },
    get active() {
      return active;
    },
    /** Android ruxsat oynasini ochadi ("Ekranni yozib olish/ulashish"). Rad etilsa — xato. */
    async start() {
      await plugin().start();
      active = true;
    },
    async stop() {
      active = false;
      await plugin()?.stop().catch(() => {});
    },
    /** Boshqa ilovadagi oxirgi ekran — data:image/jpeg;base64,... yoki null. */
    async snapshot() {
      if (!active) return null;
      const { image } = await plugin().capture();
      return image ? `data:image/jpeg;base64,${image}` : null;
    },
  };
}
