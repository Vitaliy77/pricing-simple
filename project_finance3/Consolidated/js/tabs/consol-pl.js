// js/tabs/consol-pl.js
// Consolidated P&L — pulls from Supabase, no line_code
import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';

// Your scenario ID
const SCENARIO_ID = '3857bc3c-78d5-42f6-8fbb-493ce34063f2';

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Consolidated P&amp;L</h2>
        <p class="text-sm text-slate-500">
          Revenue to Direct costs to Gross profit to Indirect to Operating profit to Adjustments to Adjusted profit
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
      Indirect and Adjustments loaded from Supabase (scenario: ${SCENARIO_ID}).
    </p>
  </div>
`;

export async function init(root) {
  const sel = root.querySelector('#conYear');
  const reloadBtn = root.querySelector('#conReload');
  const nowY = new Date().getUTCFullYear();

  for (let y = nowY - 1; y <= nowY + 1; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === nowY) opt.selected = true;
    sel.appendChild(opt);
  }

  reloadBtn.onclick = () => setTimeout(() => loadAndRender(root, Number(sel.value)), 0);
  sel.onchange = () => setTimeout(() => loadAndRender(root, Number(sel.value)), 0);

  setTimeout(() => loadAndRender(root, nowY), 0);
}

async function loadAndRender(root, year) {
  const msg = root.querySelector('#conMsg');
  const table = root.querySelector('#conTable');
  if (!table) return;

  msg.textContent = 'Loading…';
  table.innerHTML = '';

  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const months = buildMonths(year);
  const base = makeEmptyPnl(months);

  try {
    // A) Try plan_monthly_pl
    const { data: planRows, error: planErr } = await client
      .from('plan_monthly_pl')
      .select('project_id, ym, revenue, labor, subs, equipment, materials, odc')
      .gte('ym', start)
      .lt('ym', end);

    if (!planErr && planRows?.length > 0) {
      for (const r of planRows) {
        const m = ymKey(r.ym);
        add(base, 'revenue', m, Number(r.revenue || 0));
        add(base, 'labor', m, Number(r.labor || 0));
        add(base, 'subs', m, Number(r.subs || 0));
        add(base, 'equipment', m, Number(r.equipment || 0));
        add(base, 'materials', m, Number(r.materials || 0));
        add(base, 'odc', m, Number(r.odc || 0));
      }
    } else {
      // B) Fallback to EAC views
      const { data: costRows } = await client
        .from('vw_eac_monthly_pl')
        .select('ym, labor, equip, materials, subs, total_cost')
        .gte('ym', start)
        .lt('ym', end);

      const { data: revRows } = await client
        .from('vw_eac_revenue_monthly')
        .select('ym, revenue')
        .gte('ym', start)
        .lt('ym', end);

      const costMap = {};
      for (const r of (costRows || [])) {
        const k = ymKey(r.ym);
        const cur = costMap[k] || { labor:0, equip:0, materials:0, subs:0, total_cost:0 };
        cur.labor += Number(r.labor || 0);
        cur.equip += Number(r.equip || 0);
        cur.materials += Number(r.materials || 0);
        cur.subs += Number(r.subs || 0);
        cur.total_cost += Number(r.total_cost || 0);
        costMap[k] = cur;
      }

      const revMap = {};
      for (const r of (revRows || [])) {
        const k = ymKey(r.ym);
        revMap[k] = (revMap[k] || 0) + Number(r.revenue || 0);
      }

      for (const m of months) {
        add(base, 'revenue', m, Number(revMap[m] || 0));
        add(base, 'labor', m, Number(costMap[m]?.labor || 0));
        add(base, 'subs', m, Number(costMap[m]?.subs || 0));
        add(base, 'equipment', m, Number(costMap[m]?.equip || 0));
        add(base, 'materials', m, Number(costMap[m]?.materials || 0));
        const known = (costMap[m]?.labor||0) + (costMap[m]?.subs||0) +
                      (costMap[m]?.equip||0) + (costMap[m]?.materials||0);
        const odc = Math.max(0, (costMap[m]?.total_cost || 0) - known);
        add(base, 'odc', m, odc);
      }
    }

    // C) Load Indirect
    const { data: indirectRows } = await client
      .from('indirect_lines')
      .select('ym, amount')
      .eq('scenario_id', SCENARIO_ID)
      .gte('ym', start)
      .lt('ym', end);

    for (const r of (indirectRows || [])) {
      const m = ymKey(r.ym);
      add(base, 'indirect', m, Number(r.amount || 0));
    }

    // D) Load Add-backs — NO line_code!
    const { data: addbackRows } = await client
      .from('addback_lines')
      .select('ym, amount')  // ← ONLY ym, amount
      .eq('scenario_id', SCENARIO_ID)
      .gte('ym', start)
      .lt('ym', end);

    for (const r of (addbackRows || [])) {
      const m = ymKey(r.ym);
      add(base, 'adjustments', m, Number(r.amount || 0));
    }

    renderTable(root, base, months, year);
    msg.textContent = `Loaded from Supabase (scenario: ${SCENARIO_ID}).`;

  } catch (err) {
    console.error('consol-pl error', err);
    msg.textContent = 'Error: ' + (err?.message || err);
  }
}

function buildMonths(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

function makeEmptyPnl(months) {
  const base = { revenue: {}, labor: {}, subs: {}, equipment: {}, materials: {}, odc: {}, indirect: {}, adjustments: {} };
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

function renderTable(root, base, months, year) {
  const table = root.querySelector('#conTable');
  if (!table) return;

  const directByM = {}; const grossByM = {}; const opByM = {}; const adjProfByM = {};
  months.forEach(m => {
    const dc = (base.labor[m]||0) + (base.subs[m]||0) + (base.equipment[m]||0) + (base.materials[m]||0) + (base.odc[m]||0);
    directByM[m] = dc;
    const gp = (base.revenue[m]||0) - dc;
    grossByM[m] = gp;
    const op = gp - (base.indirect[m]||0);
    opByM[m] = op;
    const adj = (base.adjustments[m]||0);
    adjProfByM[m] = op + adj;
  });

  const tot = obj => months.reduce((s, m) => s + Number(obj[m] || 0), 0);
  const revenueTot = tot(base.revenue);
  const laborTot = tot(base.labor);
  const subsTot = tot(base.subs);
  const equipTot = tot(base.equipment);
  const matsTot = tot(base.materials);
  const odcTot = tot(base.odc);
  const directTot = tot(directByM);
  const grossTot = tot(grossByM);
  const indirectTot = tot(base.indirect);
  const opTot = tot(opByM);
  const adjTot = tot(base.adjustments);
  const adjProfTot = tot(adjProfByM);

  let html = '<thead><tr>';
  html += `<th class="p-2 text-left sticky left-0 bg-white w-56">Line</th>`;
  months.forEach(m => html += `<th class="p-2 text-right">${monthLabel(m)}</th>`);
  html += `<th class="p-2 text-right">Total</th>`;
  html += '</tr></thead><tbody>';

  html += row('Revenue', base.revenue, revenueTot, months, true);
  html += sectionHeader('Direct Costs');
  html += row('Labor', base.labor, laborTot, months);
  html += row('Subcontractors', base.subs, subsTot, months);
  html += row('Equipment', base.equipment, equipTot, months);
  html += row('Materials', base.materials, matsTot, months);
  html += row('Other Direct Cost', base.odc, odcTot, months);
  html += row('Total Direct Cost', directByM, directTot, months, true);
  html += row('Gross Profit', grossByM, grossTot, months, true);
  html += pctRow('Gross % of Rev', grossByM, base.revenue, months);
  html += sectionHeader('Indirect & Adjustments');
  html += row('Indirect Cost', base.indirect, indirectTot, months);
  html += row('Operating Profit', opByM, opTot, months, true);
  html += pctRow('Operating % of Rev', opByM, base.revenue, months);
  html += row('Adjustments / Add-backs', base.adjustments, adjTot, months);
  html += row('Adjusted Profit', adjProfByM, adjProfTot, months, true);
  html += pctRow('Adjusted % of Rev', adjProfByM, base.revenue, months);
  html += '</tbody>';

  table.innerHTML = html;
}

function row(label, obj, total, months, bold = false) {
  let tr = `<tr class="${bold ? 'font-semibold bg-slate-50' : ''}">`;
  tr += `<td class="p-2 sticky left-0 bg-white">${label}</td>`;
  months.forEach(m => { tr += `<td class="p-2 text-right">${fmt(obj[m])}</td>`; });
  tr += `<td class="p-2 text-right">${fmt(total)}</td>`;
  tr += '</tr>';
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
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export const loader = init;
