// /js/main.js
import * as auth from "./tabs/auth.js";

function render() {
  const app = document.getElementById("app");
  const hash = location.hash || "#auth";
  console.log("[router] hash =", hash);

  if (hash === "#auth") {
    auth.init(app);
  } else {
    app.innerHTML = `<article><p>Go to <strong>Sign in</strong> first.</p></article>`;
  }
}

window.addEventListener("hashchange", render);
window.addEventListener("load", render);
console.log("main.js loaded as module ✅");
