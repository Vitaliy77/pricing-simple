// js/tabs/consol-pl.js
// Consolidated P&L (by month, by year) — reads pre-priced monthly data from plan_monthly_pl

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Consolidated P&amp;L</h2>
        <p class="text-sm text-slate-500">
          Revenue → Direct costs → Gross profit → Indirect → Operating profit → Adjustments → Adjusted profit
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-sm text-slate-500">Year:</label>
        <select id="conYear" class="border rounded-md p-1 text-sm"></select>
        <button id="conReload" class="px-3 py-1.5 rounded-md border hover:bg-slate-50 text-sm">Reload</button>
      </div>
    </div>
    <div id="conMsg" class="text-sm text-slate-500"></div>
    <div class="overflow-x-auto">
      <table id="conTable" class="min-w-full text-sm border-separate border-spacing-y-1"></table>
    </div>
    <p class="text-xs text-slate-500">
      Indirect and Adjustments are stored locally for now. Later we can push them to Supabase.
    </p>
  </div>
`;

export async function init() {
  const sel = $('#conYear');
  const nowY = new Date().getUTCFullYear();
  for (let y = nowY - 1; y <= nowY + 1; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === nowY) opt.selected = true;
    sel.appendChild(opt);
  }
  $('#conReload').onclick = () => loadAndRender(Number($('#conYear').value));
  sel.onchange = () => loadAndRender(Number(sel.value));
  await loadAndRender(nowY);
}

/* ---------------- Core loader (reads ONLY plan_monthly_pl) ---------------- */

async function loadAndRender(year) {
  const msg = $('#conMsg');
  const table = $('#conTable');
  msg.textContent = 'Loading…';
  table.innerHTML = '';

  try {
    // 1) Pull pre-priced monthly data for the year
    const { data, error } = await client
      .from('plan_monthly_pl')
      .select('project_id, ym, revenue, labor, subs, equipment, materials, odc')
      .gte('ym', `${year}-01-01`)
      .lte('ym', `${year}-12-31`);

    if (error) throw error;

    // 2) Build the base structure and fill it from plan_monthly_pl
    const months = buildMonths(year);
    const base = makeEmptyPnl(months);

    for (const r of (data || [])) {
      const m = ymKey(r.ym); // 'YYYY-MM'
      add(base, 'revenue',   m, Number(r.revenue   || 0));
      add(base, 'labor',     m, Number(r.labor     || 0));
      add(base, 'subs',      m, Number(r.subs      || 0));
      add(base, 'equipment', m, Number(r.equipment || 0));
      add(base, 'materials', m, Number(r.materials || 0));
      add(base, 'odc',       m, Number(r.odc       || 0));
    }

    // 3) Load / apply local Indirect + Adjustments
    const extras = loadExtras(year, months);
    for (const m of months) {
      add(base, 'indirect',   m, extras.indirect[m]   || 0);
      add(base, 'adjustments',m, extras.adjustments[m]|| 0);
    }

    // 4) Render P&L (with subtotal % rows)
    renderTable(base, months, year, extras);
    msg.textContent = '';
  } catch (err) {
    console.error('consol-pl error', err);
    const notFound = /relation .*plan_monthly_pl.* does not exist/i.test(String(err?.message || err));
    $('#conMsg').textContent = notFound
      ? 'Error: table plan_monthly_pl not found. Publish from the EAC app or create the table first.'
      : 'Error loading consolidated P&L: ' + (err?.message || err);
  }
}

/* ---------------- Helpers: structure & math ---------------- */

function buildMonths(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

function makeEmptyPnl(months) {
  const base = {
    revenue: {}, labor: {}, subs: {}, equipment: {}, materials: {}, odc: {},
    indirect: {}, adjustments: {}
  };
  months.forEach(m => {
    base.revenue[m] = 0; base.labor[m] = 0; base.subs[m] = 0; base.equipment[m] = 0;
    base.materials[m] = 0; base.odc[m] = 0; base.indirect[m] = 0; base.adjustments[m] = 0;
  });
  return base;
}

function add(base, bucket, month, val) {
  if (!month) return;
  base[bucket][month] = (base[bucket][month] || 0) + Number(val || 0);
}

function ymKey(ym) {
  try { return String(ym).slice(0, 7); } catch { return null; }
}

/* ---------------- Indirect / Adjustments (local) ---------------- */

function loadExtras(year, months) {
  const raw = localStorage.getItem(`consol-extras-${year}`);
  const parsed = raw ? JSON.parse(raw) : {};
  const indirect = {};
  const adjustments = {};
  for (const m of months) {
    indirect[m] = Number(parsed.indirect?.[m] || 0);
    adjustments[m] = Number(parsed.adjustments?.[m] || 0);
  }
  return { indirect, adjustments };
}
function saveExtras(year, extras) {
  localStorage.setItem(`consol-extras-${year}`, JSON.stringify(extras));
}

/* ---------------- Rendering ---------------- */

function renderTable(base, months, year, extras) {
  const table = $('#conTable');

  // Derived rows
  const directByM   = {};
  const grossByM    = {};
  const opByM       = {};
  const adjProfByM  = {};

  months.forEach(m => {
    const dc = (base.labor[m]||0) + (base.subs[m]||0) + (base.equipment[m]||0) + (base.materials[m]||0) + (base.odc[m]||0);
    directByM[m]  = dc;
    const gp      = (base.revenue[m]||0) - dc;
    grossByM[m]   = gp;
    const op      = gp - (base.indirect[m]||0);
    opByM[m]      = op;
    const adj     = (base.adjustments[m]||0);
    adjProfByM[m] = op + adj;
  });

  const tot = obj => months.reduce((s, m) => s + Number(obj[m] || 0), 0);

  const revenueTot = tot(base.revenue);
  const laborTot   = tot(base.labor);
  const subsTot    = tot(base.subs);
  const equipTot   = tot(base.equipment);
  const matsTot    = tot(base.materials);
  const odcTot     = tot(base.odc);
  const directTot  = tot(directByM);
  const grossTot   = tot(grossByM);
  const indirectTot= tot(base.indirect);
  const opTot      = tot(opByM);
  const adjTot     = tot(base.adjustments);
  const adjProfTot = tot(adjProfByM);

  let html = '<thead><tr>';
  html += `<th class="p-2 text-left sticky left-0 bg-white w-56">Line</th>`;
  months.forEach(m => html += `<th class="p-2 text-right">${monthLabel(m)}</th>`);
  html += `<th class="p-2 text-right">Total</th>`;
  html += '</tr></thead><tbody>';

  // Revenue
  html += row('Revenue', base.revenue, revenueTot, months, true);

  // Direct costs
  html += sectionHeader('Direct Costs');
  html += row('Labor',             base.labor,     laborTot, months);
  html += row('Subcontractors',    base.subs,      subsTot,  months);
  html += row('Equipment',         base.equipment, equipTot, months);
  html += row('Materials',         base.materials, matsTot,  months);
  html += row('Other Direct Cost', base.odc,       odcTot,   months);
  html += row('Total Direct Cost', directByM,      directTot,months, true);

  // Gross Profit + %
  html += row('Gross Profit', grossByM, grossTot, months, true);
  html += pctRow('Gross % of Rev', grossByM, base.revenue, months);

  // Indirect & Adjustments
  html += sectionHeader('Indirect & Adjustments');

  html += editableRow('Indirect Cost', base.indirect, indirectTot, months, (m, val) => {
    extras.indirect[m] = Number(val || 0);
    saveExtras(year, extras);
    loadAndRender(year);
  });

  html += row('Operating Profit', opByM, opTot, months, true);
  html += pctRow('Operating % of Rev', opByM, base.revenue, months);

  html += editableRow('Adjustments / Add-backs', base.adjustments, adjTot, months, (m, val) => {
    extras.adjustments[m] = Number(val || 0);
    saveExtras(year, extras);
    loadAndRender(year);
  });

  html += row('Adjusted Profit', adjProfByM, adjProfTot, months, true);
  html += pctRow('Adjusted % of Rev', adjProfByM, base.revenue, months);

  html += '</tbody>';
  table.innerHTML = html;
}

function row(label, obj, total, months, bold=false) {
  let tr = `<tr class="${bold ? 'font-semibold bg-slate-50' : ''}">`;
  tr += `<td class="p-2 sticky left-0 bg-white">${label}</td>`;
  months.forEach(m => { tr += `<td class="p-2 text-right">${fmt(obj[m])}</td>`; });
  tr += `<td class="p-2 text-right">${fmt(total)}</td>`;
  tr += '</tr>';
  return tr;
}

function editableRow(label, obj, total, months, onChange) {
  let tr = '<tr>';
  tr += `<td class="p-2 sticky left-0 bg-white">${label}</td>`;
  months.forEach(m => {
    tr += `<td class="p-1 text-right">
      <input data-m="${m}" class="conEdit border rounded-md p-1 w-24 text-right" type="number" step="0.01" value="${Number(obj[m]||0)}">
    </td>`;
  });
  tr += `<td class="p-2 text-right">${fmt(total)}</td>`;
  tr += '</tr>';

  // wire after insertion so caret behavior is smooth
  setTimeout(() => {
    document.querySelectorAll('.conEdit').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const m = e.target.getAttribute('data-m');
        onChange(m, e.target.value);
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      });
    });
  }, 0);

  return tr;
}

function pctRow(label, numByMonth, revByMonth, months) {
  let tr = `<tr class="text-xs text-slate-500">`;
  tr += `<td class="p-1 sticky left-0 bg-white">${label}</td>`;
  months.forEach(m => {
    const num = numByMonth[m] || 0;
    const rev = revByMonth[m] || 0;
    tr += `<td class="p-1 text-right">${rev ? ((num / rev) * 100).toFixed(1) + '%' : ''}</td>`;
  });
  const numTot = months.reduce((s,m)=> s + Number(numByMonth[m]||0), 0);
  const revTot = months.reduce((s,m)=> s + Number(revByMonth[m]||0), 0);
  tr += `<td class="p-1 text-right">${revTot ? ((numTot / revTot) * 100).toFixed(1) + '%' : ''}</td>`;
  tr += '</tr>';
  return tr;
}

function sectionHeader(label) {
  return `<tr><td class="p-2 sticky left-0 bg-white text-slate-400 text-xs uppercase tracking-wide" colspan="14">${label}</td></tr>`;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short' });
}

function fmt(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  });
}

// Export alias (harmless if not used)
export const loader = init;
