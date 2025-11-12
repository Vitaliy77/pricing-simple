// /js/main.js
import { client } from "./api/supabase.js";

const app = document.getElementById("app");

// Tabs that require a signed-in user
const PROTECTED_TABS = new Set(["#grants", "#budget", "#actuals", "#compare", "#summary"]);

let session = null;

// Fetch session once on load
async function loadSession() {
  try {
    const { data } = await client.auth.getSession();
    session = data.session || null;
  } catch (e) {
    console.error("[session] getSession failed:", e);
    session = null;
  }
}

// React to login / logout instantly
client.auth.onAuthStateChange((_event, newSession) => {
  session = newSession;
  console.log("[auth] state change →", !!session);
  render(); // re-render the current tab
});

// Simple guard
function needsAuth(hash) {
  return PROTECTED_TABS.has(hash);
}

// Render any tab by filename (e.g. "#grants" → "./tabs/grants.js")
async function render() {
  const hash = location.hash || "#auth";
  console.log("[router] hash =", hash, "signedIn =", !!session);

  // Gate protected tabs
  if (needsAuth(hash) && !session) {
    app.innerHTML = `
      <article>
        <p>Please <a href="#auth">sign in</a> first.</p>
      </article>`;
    return;
  }

  // Resolve module path
  const tabName = (hash.startsWith("#") ? hash.slice(1) : hash) || "auth";
  const modulePath = `./tabs/${tabName}.js`;

  try {
    const mod = await import(modulePath);
    if (mod?.template) app.innerHTML = mod.template;
    if (typeof mod?.init === "function") await mod.init(app, { session });
  } catch (e) {
    console.error("[router] failed to load", modulePath, e);
    app.innerHTML = `
      <article>
        <h3>Not found</h3>
        <p>Could not load tab <code>${tabName}</code>.</p>
      </article>`;
  }
}

// Initial boot
window.addEventListener("hashchange", render);
window.addEventListener("load", async () => {
  console.log("main.js loaded as module ✅");
  await loadSession();
  render();
});
