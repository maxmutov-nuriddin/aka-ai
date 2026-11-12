// EcoSystem kirish: birinchi marta — parol qo'yish (/api/auth/setup), keyin — faqat parol (/api/auth/login).
// Shu kompyuterdan (lokal, parolsiz rejim) yoki allaqachon kirgan bo'lsa — darhol ilovaga.
const $ = (id) => document.getElementById(id);
const nextUrl = () => {
  const next = new URLSearchParams(location.search).get("next") || "/app/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app/"; // faqat o'z sahifalarimiz
};

async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Xato yuz berdi.");
  return data;
}

async function main() {
  let status = { setup: true, local: false, user: false };
  try {
    status = await (await fetch("/api/auth/status")).json();
  } catch {
    /* tarmoq xatosi — odatiy kirish formasi */
  }
  if (status.user || status.local) return location.replace(nextUrl());

  const firstTime = !status.setup;
  $("title").textContent = firstTime ? "Parol qo'ying" : "Jigar";
  $("hint").textContent = firstTime
    ? "Bu parol bilan boshqa qurilmalardan (telefon, boshqa kompyuter) kirasiz. Kamida 8 belgi."
    : "Parolni kiriting.";
  $("nameRow").hidden = !firstTime;
  $("repeatRow").hidden = !firstTime;
  $("repeat").required = firstTime;
  $("password").autocomplete = firstTime ? "new-password" : "current-password";
  $("submit").textContent = firstTime ? "Saqlash va kirish" : "Kirish";
  $("password").focus();

  $("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("error").textContent = "";
    const password = $("password").value;
    if (firstTime && password !== $("repeat").value) {
      $("error").textContent = "Parollar bir xil emas.";
      return;
    }
    $("submit").disabled = true;
    try {
      if (firstTime) await post("/api/auth/setup", { password, name: $("name").value.trim() });
      else await post("/api/auth/login", { password });
      location.replace(nextUrl());
    } catch (err) {
      $("error").textContent = err.message;
      $("submit").disabled = false;
    }
  });
}

main();
