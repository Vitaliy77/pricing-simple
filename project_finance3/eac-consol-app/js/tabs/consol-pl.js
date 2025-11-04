// js/tabs/consol-pl.js
// Consolidated P&L (by month, by year)
// Strategy: try plan_monthly_pl first; if empty/unreadable, aggregate from EAC views.

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

/* ---------------- Core loader with fallback ---------------- */

async function loadAndRender(year) {
  const msg = $('#conMsg');
  const table = $('#conTable');
  msg.textContent = 'Loading…';
  table.innerHTML = '';

  const start = `${year}-01-01`;
  const end   = `${year + 1}-01-01`;
  const months = buildMonths(year);
  const base = makeEmptyPnl(months);

  try {
    // -------- A) Try consolidated table first
    const { data: planRows, error: planErr } = await client
      .from('plan_monthly_pl')
      .select('project_id, ym, revenue, labor, subs, equipment, materials, odc')
      .gte('ym', start)
      .lt('ym', end);

    if (planErr) {
      // Hard failure (e.g., relation missing or RLS)
      console.warn('[Consol] plan_monthly_pl error → falling back:', planErr);
    } else if (Array.isArray(planRows) && planRows.length > 0) {
      // Populate from plan_monthly_pl
      for (const r of planRows) {
        const m = ymKey(r.ym);
        add(base, 'revenue',   m, Number(r.revenue   || 0));
        add(base, 'labor',     m, Number(r.labor     || 0));
        add(base, 'subs',      m, Number(r.subs      || 0));
        add(base, 'equipment', m, Number(r.equipment || 0));
        add(base, 'materials', m, Number(r.materials || 0));
        add(base, 'odc',       m, Number(r.odc       || 0));
      }

      const extras = loadExtras(year, months);
      for (const m of months) {
        add(base, 'indirect',    m, extras.indirect[m]    || 0);
        add(base, 'adjustments', m, extras.adjustments[m] || 0);
      }

      renderTable(base, months, year, extras);
      msg.textContent = `Loaded ${planRows.length.toLocaleString('en-US')} rows from plan_monthly_pl.`;
      return;
    } else {
      console.info('[Consol] plan_monthly_pl returned 0 rows; falling back to EAC views.');
    }

    // -------- B) Fallback: aggregate from EAC views (same sources as EAC app)
    const { data: costRows, error: costErr } = await client
      .from('vw_eac_monthly_pl')
      .select('ym, labor, equip, materials, subs, fringe, overhead, gna, total_cost')
      .gte('ym', start)
      .lt('ym', end);

    if (costErr) throw costErr;

    const { data: revRows, error: revErr } = await client
      .from('vw_eac_revenue_monthly')
      .select('ym, revenue')
      .gte('ym', start)
      .lt('ym', end);

    if (revErr) throw revErr;

    // Sum across all projects per month
    const costMap = {}; // k -> { labor, equip, materials, subs, total_cost }
    for (const r of (costRows || [])) {
      const k = ymKey(r.ym);
      const cur = costMap[k] || { labor:0, equip:0, materials:0, subs:0, total_cost:0 };
      cur.labor      += Number(r.labor      || 0);
      cur.equip      += Number(r.equip      || 0);
      cur.materials  += Number(r.materials  || 0);
      cur.subs       += Number(r.subs       || 0);
      cur.total_cost += Number(r.total_cost || 0);
      costMap[k] = cur;
    }

    const revMap = {}; // k -> revenue
    for (const r of (revRows || [])) {
      const k = ymKey(r.ym);
      revMap[k] = (revMap[k] || 0) + Number(r.revenue || 0);
    }

    // Fill base
    for (const m of months) {
      add(base, 'revenue',   m, Number(revMap[m] || 0));
      add(base, 'labor',     m, Number(costMap[m]?.labor     || 0));
      add(base, 'subs',      m, Number(costMap[m]?.subs      || 0));
      add(base, 'equipment', m, Number(costMap[m]?.equip     || 0));
      add(base, 'materials', m, Number(costMap[m]?.materials || 0));
      // If you want to split ODC from total_cost (- known buckets), you can do:
      const known = (costMap[m]?.labor||0) + (costMap[m]?.subs||0) + (costMap[m]?.equip||0) + (costMap[m]?.materials||0);
      const odc = Math.max(0, (costMap[m]?.total_cost || 0) - known);
      add(base, 'odc', m, odc);
    }

    const extras = loadExtras(year, months);
    for (const m of months) {
      add(base, 'indirect',    m, extras.indirect[m]    || 0);
      add(base, 'adjustments', m, extras.adjustments[m] || 0);
    }

    renderTable(base, months, year, extras);
    const srcNote = `Fallback used: ${revRows?.length || 0} revenue rows, ${costRows?.length || 0} cost rows from EAC views.`;
    msg.textContent = srcNote;

  } catch (err) {
    console.error('consol-pl error', err);
    const notFound = /relation .*plan_monthly_pl.* does not exist/i.test(String(err?.message || err));
    $('#conMsg').textContent = notFound
      ? 'Error: table plan_monthly_pl not found. Either publish consolidated rows from EAC or rely on the automatic fallback (EAC views).'
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

  setTimeout(() => {
    document.querySelectorAll('.conEdit').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const mm = e.target.getAttribute('data-m');
        onChange(mm, e.target.value);
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
