// js/main.js
// Tiny router + month context

import { $ } from './utils/dom.js';
import { initSupabase } from './api/supabase.js';

const routes = {
  '#consol-pl': () => import('./tabs/consol-pl.js'),
  '#scenarios': () => import('./tabs/scenarios.js'),
  '#indirect': () => import('./tabs/indirect.js'),
  '#addbacks': () => import('./tabs/addbacks.js'),
};

function setActiveTab(hash) {
  const map = {
    '#consol-pl': 'consol-pl',
    '#scenarios': 'scenarios',
    '#indirect': 'indirect',
    '#addbacks': 'addbacks',
  };
  Object.values(map).forEach(id => {
    const el = document.getElementById('tab-' + id);
    if (!el) return;
    el.className = 'py-2 inline-block text-slate-500 hover:text-slate-700';
  });
  const activeId = map[hash];
  if (activeId) {
    const el = document.getElementById('tab-' + activeId);
    if (el) {
      el.className = 'py-2 inline-block text-blue-600 border-b-2 border-blue-600 font-semibold';
    }
  }
}

export async function render() {
  const hash = location.hash || '#consol-pl';
  setActiveTab(hash);
  const loader = routes[hash] || routes['#consol-pl'];
  const view = $('#view');
  try {
    const mod = await loader();
    view.innerHTML = mod.template;
    if (typeof mod.init === 'function') {
      await mod.init(view);
    }
  } catch (err) {
    console.error('Tab render error:', err);
    view.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded-md text-sm">
      Failed to load tab: ${err?.message || err}
    </div>`;
  }
}

function initMonthPicker() {
  const el = $('#monthPicker');
  if (el && !el.value) {
    el.value = new Date().toISOString().slice(0,7);
  }
  if (el) {
    el.addEventListener('change', render);
  }
}

window.addEventListener('hashchange', render);

(async function bootstrap() {
  try {
    initSupabase();
    initMonthPicker();
    await render();
    $('#status').textContent = '';
  } catch (e) {
    console.error(e);
    $('#status').textContent = 'Init error: ' + (e.message || e);
  }
})();
