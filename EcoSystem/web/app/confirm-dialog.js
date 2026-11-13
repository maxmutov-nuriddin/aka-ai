// Xavfli amal oldidan ikkinchi tasdiq ("Rostdan ham ...mi?") — "Chiqish" oynasi (logout-dialog) ko'rinishida.
// Ishlatilishi: if (!(await askConfirm({ title, text, confirm }))) return;
// Matnlar — textContent (xavfsiz). Esc yoki "Bekor qilish" — rad.

let dialog = null;

function build() {
  const d = document.createElement("dialog");
  d.className = "logout-dialog";
  d.setAttribute("aria-labelledby", "confirmTitle");
  const form = document.createElement("form");
  form.method = "dialog";
  const title = Object.assign(document.createElement("h2"), { id: "confirmTitle" });
  const text = document.createElement("p");
  const actions = Object.assign(document.createElement("div"), { className: "logout-actions" });
  const cancel = Object.assign(document.createElement("button"), { type: "submit", className: "ghost", value: "cancel" });
  const ok = Object.assign(document.createElement("button"), { type: "submit", className: "danger-action", value: "confirm" });
  actions.append(cancel, ok);
  form.append(title, text, actions);
  d.append(form);
  document.body.append(d);
  return { d, title, text, cancel, ok };
}

/**
 * @param {{ title: string, text: string, confirm: string, cancel?: string }} options
 * @returns {Promise<boolean>} true — egasi tasdiqladi
 */
export function askConfirm({ title, text, confirm, cancel = "Bekor qilish" }) {
  dialog ??= build();
  const { d } = dialog;
  dialog.title.textContent = title;
  dialog.text.textContent = text;
  dialog.ok.textContent = confirm;
  dialog.cancel.textContent = cancel;
  d.returnValue = "";
  return new Promise((resolve) => {
    d.addEventListener("close", () => resolve(d.returnValue === "confirm"), { once: true });
    d.showModal();
    dialog.cancel.focus(); // standart — xavfsiz tanlov (Enter tasodifan tasdiqlamasin)
  });
}
