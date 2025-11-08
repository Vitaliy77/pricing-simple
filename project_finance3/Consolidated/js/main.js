// js/main.js
// Tiny router + month context

// ↓ Adjust this import to match your project:
//   - If your helper lives at js/lib/dom.js, use: './lib/dom.js'
//   - If it's js/utils/dom.js, keep './utils/dom.js'
import { $ } from './utils/dom.js';
import { initSupabase } from './api/supabase.js';

const routes = {
  '#consol-pl': () => import('./tabs/consol-pl.js'),
  '#scenarios': () => import('./tabs/scenarios.js'),
  '#indirect': () => import('./tabs/indirect.js').then(m => m.indirectTab),
  '#addbacks': () => import('./tabs/addbacks.js').then(m => m.addbacksTab),
};

function setActiveTab(hash) {
  const ids = ['consol-pl', 'scenarios', 'indirect', 'addbacks'];
  ids.forEach(name => {
    const el = document.getElementById(`tab-${name}`);
    if (!el) return;
    const isActive = hash === `#${name}`;
    el.classList.toggle('border-b-2', isActive);
    el.classList.toggle('border-blue-600', isActive);
    el.classList.toggle('font-semibold', isActive);
  });
}

async function render() {
  const hash = location.hash || '#consol-pl';
  setActiveTab(hash);

  const loader = routes[hash] || routes['#consol-pl'];
  // Show a tiny status while loading
  const status = $('#status');
  if (status) status.textContent = 'Loading…';

  try {
    console.log('[router] loading', hash, loader.toString());
    const mod = await loader(); // this import() is where a bad tab file will throw
    const view = $('#view');
    // Each tab module must export: template (string) and init(container)
    view.innerHTML = mod.template;
    await mod.init(view);
    if (status) status.textContent = '';
  } catch (e) {
    console.error('Tab render error:', e);
    const view = $('#view');
    view.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded">
      <div class="font-semibold">Tab render error</div>
      <div class="text-sm mt-1">${(e && e.message) ? e.message : e}</div>
    </div>`;
    if (status) status.textContent = 'Error';
  }
}

function initMonthPicker() {
  const el = document.getElementById('monthPicker');
  if (!el) return;
  // Default to current month if empty
  if (!el.value) {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    el.value = ym;
  }
  // Optionally react to changes (tabs can read #monthPicker when needed)
  el.addEventListener('change', () => {
    // leave as a no-op; tab modules already read it when they load
  });
}

window.addEventListener('hashchange', render);

(async function bootstrap() {
  try {
    initSupabase();
    initMonthPicker();
    await render();
    const status = $('#status');
    if (status) status.textContent = '';
  } catch (e) {
    console.error(e);
    const status = $('#status');
    if (status) status.textContent = 'Init error: ' + (e.message || e);
  }
})();
