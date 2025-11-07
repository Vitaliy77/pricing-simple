// js/tabs/indirect.js
import { $ } from '../lib/dom.js';
import { client, getCurrentYm } from '../api/supabase.js';

/* -------------------------------------------------------------
   Templates – one for each tab
------------------------------------------------------------- */
const indirectTemplate = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Indirect Costs</h2>
      <div class="flex gap-2 items-center">
        <input id="indYear" type="number" class="border rounded-md p-1 w-28" />
        <button id="indReload" class="px-3 py-1.5 rounded-md border">Reload</button>
        <button id="indAdd" class="px-3 py-1.5 rounded-md border">+ Add line</button>
        <button id="indSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white">Save</button>
      </div>
    </div>
    <div id="indMsg" class="text-sm text-slate-600"></div>
    <div id="indTable" class="overflow-auto border rounded-lg"></div>
  </div>
`;

const addbacksTemplate = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Add-backs / Adjustments</h2>
      <div class="flex gap-2 items-center">
        <input id="abYear" type="number" class="border rounded-md p-1 w-28" />
        <button id="abReload" class="px-3 py-1.5 rounded-md border">Reload</button>
        <button id="abAdd" class="px-3 py-1.5 rounded-md border">+ Add line</button>
        <button id="abSave" class="px-3 py-1.5 rounded-md bg-blue-600 text-white">Save</button>
      </div>
    </div>
    <div id="abMsg" class="text-sm text-slate-600"></div>
    <div id="abTable" class="overflow-auto border rounded-lg"></div>
  </div>
`;

/* -------------------------------------------------------------
   Shared state & helpers
------------------------------------------------------------- */
const makeState = () => ({
  year: null,
  months: [],
  lines: [],
  hasLabel: true,
});

const monthsForYear = (year) => {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return Array.from({length:12}, (_,i) => {
    const d = new Date(Date.UTC(year,i,1));
    const key = d.toISOString().slice(0,7);
    return { ym:`${key}-01`, key, short:names[i] };
  });
};

const blankLine = () => ({ label:'', month:{} });

const groupLines = (rows, hasLabel) => {
  const map = new Map();
  for (const r of rows) {
    const key = hasLabel ? (r.label||'') : 'line';
    if (!map.has(key)) map.set(key, { label:hasLabel?key:'', month:{} });
    const obj = map.get(key);
    const ymKey = String(r.ym).slice(0,7);
    obj.month[ymKey] = (obj.month[ymKey]||0) + Number(r.amount||0);
  }
  return Array.from(map.values());
};

const labelMissing = e => e && (e.code==='PGRST204' || e.code==='42703' || /column .*label.* does not exist/i.test(e.message||''));
const tableMissing = e => e && (e.code==='42P01' || /relation .* does not exist/i.test(e.message||''));

const num = v => { const n=Number(v); return Number.isFinite(n)?n:0; };
const sum = arr => arr.reduce((s,v)=>s+num(v),0);
const parseMoney = s => { if(!s) return 0; const n=Number(String(s).replace(/[, $]/g,'')); return Number.isFinite(n)?n:0; };
const fmtUSD0 = v => { const n=Number(v||0); return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}):''; };
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* -------------------------------------------------------------
   Core CRUD (shared) — NO GLOBALS
------------------------------------------------------------- */
const loadFor = async (root, state, table) => {
  const isIndirect = table === 'indirect_lines';
  const msg = root.querySelector(isIndirect ? '#indMsg' : '#abMsg');
  if (!msg) return;

  msg.textContent = 'Loading…';

  const yearInput = root.querySelector(isIndirect ? '#indYear' : '#abYear');
  const picked = Number(yearInput?.value);
  if (picked && picked !== state.year) {
    state.year = picked;
    state.months = monthsForYear(state.year);
  }

  const start = `${state.year}-01-01`;
  const next = `${state.year + 1}-01-01`;

  const trySelect = async () => {
    let q = client.from(table).select('id,label,ym,amount').gte('ym', start).lt('ym', next);
    let { data, error } = await q;
    if (error && labelMissing(error)) {
      state.hasLabel = false;
      const q2 = client.from(table).select('id,ym,amount').gte('ym', start).lt('ym', next);
      ({ data, error } = await q2);
    }
    if (error) throw error;
    return data || [];
  };

  try {
    const rows = await trySelect();
    state.lines = groupLines(rows, state.hasLabel);
    renderFor(root, state, table);
    msg.textContent = `Loaded ${state.lines.length} line${state.lines.length === 1 ? '' : 's'} for ${state.year}.`;
  } catch (e) {
    console.error(e);
    msg.textContent = 'Load error: ' + (e?.message || e);
  }
};

const saveFor = async (root, state, table) => {
  const isIndirect = table === 'indirect_lines';
  const msg = root.querySelector(isIndirect ? '#indMsg' : '#abMsg');
  if (!msg) return;

  msg.textContent = 'Saving…';

  const yearInput = root.querySelector(isIndirect ? '#indYear' : '#abYear');
  const picked = Number(yearInput?.value);
  if (picked && picked !== state.year) {
    state.year = picked;
    state.months = monthsForYear(state.year);
  }

  const start = `${state.year}-01-01`;
  const next = `${state.year + 1}-01-01`;
  const monthKeys = state.months.map(m => m.key);

  const rows = [];
  const push = (label, ymKey, amt) => {
    if (!amt) return;
    const ym = `${ymKey}-01`;
    if (state.hasLabel) rows.push({ label, ym, amount: amt });
    else rows.push({ ym, amount: amt });
  };

  for (const r of state.lines) {
    const label = (r.label || '').trim();
    if (state.hasLabel && !label) continue;
    for (const k of monthKeys) {
      const amt = num(r.month?.[k]);
      if (amt) push(label, k, amt);
    }
  }

  try {
    const del = await client.from(table).delete().gte('ym', start).lt('ym', next);
    if (del.error && !tableMissing(del.error)) throw del.error;

    if (rows.length) {
      const { error } = await client.from(table).insert(rows);
      if (error) throw error;
    }

    msg.textContent = 'Saved.';
    setTimeout(() => (msg.textContent = ''), 1800);
  } catch (e) {
    console.error(e);
    msg.textContent = 'Save failed: ' + (e?.message || e);
  }
};

/* -------------------------------------------------------------
   Rendering (shared)
------------------------------------------------------------- */
const renderFor = (root, state, table) => {
  const isIndirect = table === 'indirect_lines';
  const tableEl = root.querySelector(isIndirect ? '#indTable' : '#abTable');
  if (!tableEl) return;

  tableEl.innerHTML = buildTableHTML(state.lines, state.months);
  wireTable(tableEl, state.lines, root, state);
};

const buildTableHTML = (rows, months) => {
  const head = months.map(m => `<th class="text-right px-2 py-2 whitespace-nowrap">${esc(m.short)}</th>`).join('');
  const body = rows.map((r, i) => {
    const labelCell = `<input data-row="${i}" data-field="label" class="border rounded px-2 py-1 w-full" value="${esc(r.label||'')}">`;
    const monthCells = months.map(m => {
      const val = fmtUSD0(r.month?.[m.key] || '');
      return `<td class="px-2 py-1 text-right"><input data-row="${i}" data-month="${m.key}" class="border rounded px-2 py-1 w-28 text-right" value="${val}"></td>`;
    }).join('');
    const total = fmtUSD0(sum(Object.values(r.month || {})));
    return `<tr>
      <td class="px-2 py-1 w-56">${labelCell}</td>
      ${monthCells}
      <td class="px-2 py-1 text-right font-medium">${total}</td>
      <td class="px-2 py-1 text-right"><button data-del="${i}" class="text-red-600 hover:underline">Delete</button></td>
    </tr>`;
  }).join('');
  const empty = `<tr><td colspan="${months.length + 3}" class="px-2 py-10 text-center text-slate-500">No lines — add one</td></tr>`;
  return `
    <table class="min-w-full text-sm">
      <thead class="bg-slate-50 sticky top-0">
        <tr><th class="text-left px-2 py-2">Label</th>${head}<th class="text-right px-2 py-2">Total</th><th class="px-2 py-2"></th></tr>
      </thead>
      <tbody>${body || empty}</tbody>
    </table>
  `;
};

const wireTable = (container, rows, root, state) => {
  container.querySelectorAll('input[data-field="label"]').forEach(inp => {
    inp.addEventListener('change', e => {
      const idx = Number(e.target.dataset.row);
      rows[idx].label = e.target.value.trim();
    });
  });

  container.querySelectorAll('input[data-month]').forEach(inp => {
    const update = () => {
      const idx = Number(inp.dataset.row);
      const key = inp.dataset.month;
      rows[idx].month[key] = parseMoney(inp.value);
      const tr = inp.closest('tr');
      const tot = tr?.querySelector('td:nth-last-child(2)');
      if (tot) tot.textContent = fmtUSD0(sum(Object.values(rows[idx].month)));
    };
    inp.addEventListener('change', update);
    inp.addEventListener('blur', update);
  });

  container.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.del);
      rows.splice(idx, 1);
      renderFor(root, state, root.querySelector('#indTable') ? 'indirect_lines' : 'addback_lines');
    });
  });
};

/* -------------------------------------------------------------
   Tab objects – exported for the router
------------------------------------------------------------- */
const indirectState = makeState();
const addbacksState = makeState();

export const indirectTab = {
  template: indirectTemplate,
  async init(root) {
    const state = indirectState;
    const yearInput = root.querySelector('#indYear');
    const ym = getCurrentYm();
    state.year = Number(ym.slice(0, 4));
    state.months = monthsForYear(state.year);
    yearInput.value = state.year;

    root.querySelector('#indReload')?.addEventListener('click', () => loadFor(root, state, 'indirect_lines'));
    root.querySelector('#indAdd')?.addEventListener('click', () => {
      state.lines.push(blankLine());
      renderFor(root, state, 'indirect_lines');
    });
    root.querySelector('#indSave')?.addEventListener('click', () => saveFor(root, state, 'indirect_lines'));

    await loadFor(root, state, 'indirect_lines');
  }
};

export const addbacksTab = {
  template: addbacksTemplate,
  async init(root) {
    const state = addbacksState;
    const yearInput = root.querySelector('#abYear');
    const ym = getCurrentYm();
    state.year = Number(ym.slice(0, 4));
    state.months = monthsForYear(state.year);
    yearInput.value = state.year;

    root.querySelector('#abReload')?.addEventListener('click', () => loadFor(root, state, 'addback_lines'));
    root.querySelector('#abAdd')?.addEventListener('click', () => {
      state.lines.push(blankLine());
      renderFor(root, state, 'addback_lines');
    });
    root.querySelector('#abSave')?.addEventListener('click', () => saveFor(root, state, 'addback_lines'));

    await loadFor(root, state, 'addback_lines');
  }
};
