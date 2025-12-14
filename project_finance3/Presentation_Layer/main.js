// main.js

// Mobile menu toggle
(function () {
  const btn = document.querySelector("[data-menu-toggle]");
  const menu = document.getElementById("mobile-menu");
  if (!btn || !menu) return;

  btn.addEventListener("click", () => {
    const isOpen = !menu.classList.contains("hidden");
    menu.classList.toggle("hidden");
    btn.setAttribute("aria-expanded", String(!isOpen));
  });
})();

// Handwritten hero text on tools page (if present)
(function () {
  const el = document.getElementById("hero-hand-text");
  if (!el) return;

  const lines = [
    "AI that actually runs the work.",
    "Less busywork.",
    "More signal."
  ];

  let lineIdx = 0;
  let charIdx = 0;
  let erasing = false;

  function tick() {
    const current = lines[lineIdx];

    if (!erasing) {
      charIdx++;
      el.textContent = current.slice(0, charIdx);
      if (charIdx >= current.length) {
        erasing = true;
        setTimeout(tick, 1100);
        return;
      }
    } else {
      charIdx--;
      el.textContent = current.slice(0, Math.max(0, charIdx));
      if (charIdx <= 0) {
        erasing = false;
        lineIdx = (lineIdx + 1) % lines.length;
      }
    }
    setTimeout(tick, erasing ? 25 : 35);
  }

  tick();
})();

// Demo-only: prevent form submit from reloading page
(function () {
  const form = document.getElementById("lead-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Thanks! (Demo form) Wire this to Formspree / Netlify Forms / your backend when ready.");
    form.reset();
  });
})();
