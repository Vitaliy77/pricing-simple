// /js/main.js
import { $ } from "./lib/dom.js";
import * as auth from "./tabs/auth.js";

function render() {
  const app = $("#app");
  const hash = location.hash || "#auth";

  console.log("[router] hash =", hash);

  if (hash === "#auth") {
    app.innerHTML = auth.template;
    try {
      auth.init(app);
      console.log("[router] auth.init() called");
    } catch (e) {
      console.error("[router] auth.init() threw:", e);
      app.innerHTML = `<article><p style="color:#b00">Init error: ${e?.message || e}</p></article>`;
    }
    return;
  }

  app.innerHTML = `<article><p>Go to <strong>Sign in</strong> first.</p></article>`;
}

window.addEventListener("hashchange", render);
window.addEventListener("load", render);
console.log("main.js loaded as module ✅");
