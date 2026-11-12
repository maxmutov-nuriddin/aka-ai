// Veb-rejim: sahifa matni foydalanuvchi kiritgan maydondan olinadi, API shu serverda.
window.JIGAR_HOST = {
  mode: "web",
  apiBase: "",
  async getPage() {
    const text = document.getElementById("pageText").value;
    const title = document.getElementById("pageTitle").value;
    return { title, url: "", text, selection: "" };
  },
};
