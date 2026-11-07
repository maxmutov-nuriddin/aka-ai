// Sahnadagi yozuv: Jigar gapirayotgan gap ovoz bilan birga, so'zma-so'z yozilib boradi.
// Ovoz o'chiq bo'lsa — javob matni to'liq, birdaniga ko'rsatiladi.

/** Aytilgan qismni so'z oxirigacha cho'zadi — yozuv so'z o'rtasida uzilmaydi. */
export function revealUpTo(text, spoken) {
  if (spoken <= 0) return 0;
  if (spoken >= text.length) return text.length;
  const nextSpace = text.indexOf(" ", spoken);
  return nextSpace === -1 ? text.length : nextSpace;
}

/**
 * @param {HTMLElement} root
 * @returns {{ follow: (c: {text: string, spoken: number}) => void, showStatic: (text: string) => void, done: () => void, reset: () => void }}
 */
export function createCaption(root) {
  const hello = root.firstElementChild;
  const said = document.createElement("span");
  said.className = "said";
  const unsaid = document.createElement("span");
  unsaid.className = "unsaid";
  const line = document.createElement("p");
  line.className = "caption-line";
  line.append(said, unsaid);

  function follow({ text, spoken }) {
    if (!line.isConnected) root.replaceChildren(line);
    root.classList.remove("static", "done");
    root.classList.add("speaking");
    const cut = revealUpTo(text, spoken);
    said.textContent = text.slice(0, cut);
    unsaid.textContent = text.slice(cut);
  }

  function showStatic(text) {
    root.classList.remove("speaking", "done");
    root.classList.add("static");
    const paragraphs = String(text).trim().split(/\n{2,}/).map((p) => {
      const el = document.createElement("p");
      el.textContent = p;
      return el;
    });
    root.replaceChildren(...paragraphs);
  }

  function done() {
    if (!root.classList.contains("speaking")) return;
    root.classList.remove("speaking");
    root.classList.add("done");
    if (line.isConnected) {
      said.textContent += unsaid.textContent;
      unsaid.textContent = "";
    }
  }

  function reset() {
    root.className = "caption";
    root.replaceChildren(hello);
  }

  return { follow, showStatic, done, reset };
}
