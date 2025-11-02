// js/tabs/consol-pl.js
// Consolidated P&L (by month, by year) built from project-level plans

import { $ } from '../lib/dom.js';
import { client } from '../api/supabase.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Consolidated P&amp;L</h2>
        <p class="text-sm text-slate-500">Revenue → Direct costs → Gross profit → Indirect → Operating profit → Adjustments → Adjusted profit</p>
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
    <p class="text-xs text-slate-500">Indirect and Adjustments are stored locally for now. Later we can push them to Supabase.</p>
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

async function loadAndRender(year) {
  const msg = $('#conMsg');
  const table = $('#conTable');
  msg.textContent = 'Loading…';
  table.innerHTML = '';

  try {
    const [
      projectsRes,
      employeesRes,
      rolesRes,
      equipRes,
      matsRes,
      planLaborRes,
      planSubsRes,
      planEquipRes,
      planMatsRes,
      planOdcRes
    ] = await Promise.all([
      client.from('projects').select('id, name, revenue_formula, fee_pct'),
      client.from('employees').select('id, full_name, role'),
      client.from('labor_roles').select('role, loaded_rate'),
      client.from('equipment_catalog').select('equipment_type, description, rate, rate_unit'),
      client.from('materials_catalog').select('sku, unit_cost, waste_pct'),
      client.from('plan_labor').select('project_id, employee_id, ym, hours'),
      client.from('plan_subs').select('project_id, vendor_id, ym, cost'),
      client.from('plan_equipment').select('project_id, equipment_type, ym, hours'),
      client.from('plan_materials').select('project_id, sku, ym, qty'),
      client.from('plan_odc').select('project_id, odc_type, ym, cost'),
    ]);

    const projects   = projectsRes.data   || [];
    const employees  = employeesRes.data  || [];
    const laborRoles = rolesRes.data      || [];
    const equipCat   = equipRes.data      || [];
    const matsCat    = matsRes.data       || [];

    const planLabor  = (planLaborRes.data  || []).filter(r => ymYear(r.ym) === year);
    const planSubs   = (planSubsRes.data   || []).filter(r => ymYear(r.ym) === year);
    const planEquip  = (planEquipRes.data  || []).filter(r => ymYear(r.ym) === year);
    const planMats   = (planMatsRes.data   || []).filter(r => ymYear(r.ym) === year);
    const planOdc    = (planOdcRes.data    || []).filter(r => ymYear(r.ym) === year);

    const months = buildMonths(year);

    // maps
    const roleRate = Object.fromEntries(laborRoles.map(r => [r.role, Number(r.loaded_rate || 0)]));
    const empRole  = Object.fromEntries(employees.map(e => [e.id, e.role]));
    const equipRate = Object.fromEntries(equipCat.map(e => [e.equipment_type ?? e.description, Number(e.rate || 0)]));
    const matInfo   = Object.fromEntries(matsCat.map(m => [m.sku, { unit_cost: Number(m.unit_cost || 0), waste_pct: Number(m.waste_pct || 0) }]));
    const projMap   = Object.fromEntries(projects.map(p => [p.id, p]));

    // base structure
    const base = makeEmptyPnl(months);

    // labor
    for (const r of planLabor) {
      const m = ymKey(r.ym);
      const role = empRole[r.employee_id] || '';
      const rate = roleRate[role] || 0;
      const cost = Number(r.hours || 0) * rate;
      add(base, 'labor', m, cost);
      addProjCost(base, r.project_id, m, cost);
    }

    // subs
    for (const r of planSubs) {
      const m = ymKey(r.ym);
      const cost = Number(r.cost || 0);
      add(base, 'subs', m, cost);
      addProjCost(base, r.project_id, m, cost);
    }

    // equipment
    for (const r of planEquip) {
      const m = ymKey(r.ym);
      const rate = equipRate[r.equipment_type] || 0;
      const cost = Number(r.hours || 0) * rate;
      add(base, 'equipment', m, cost);
      addProjCost(base, r.project_id, m, cost);
    }

    // materials
    for (const r of planMats) {
      const m = ymKey(r.ym);
      const mi = matInfo[r.sku] || { unit_cost: 0, waste_pct: 0 };
      const loaded = mi.unit_cost * (1 + mi.waste_pct);
      const cost = Number(r.qty || 0) * loaded;
      add(base, 'materials', m, cost);
      addProjCost(base, r.project_id, m, cost);
    }

    // odc
    for (const r of planOdc) {
      const m = ymKey(r.ym);
      const cost = Number(r.cost || 0);
      add(base, 'odc', m, cost);
      addProjCost(base, r.project_id, m, cost);
    }

    // revenue from projects
    for (const projId of Object.keys(base.projCosts)) {
      const proj = projMap[projId];
      const formula = proj?.revenue_formula || 'TM';
      const feePct  = Number(proj?.fee_pct || 0);
      const perMonth = base.projCosts[projId];
      for (const m of months) {
        const dc = Number(perMonth[m] || 0);
        const rev = priceByRule(dc, formula, feePct);
        add(base, 'revenue', m, rev);
      }
    }

    // local extras
    const extras = loadExtras(year, months);
    for (const m of months) {
      add(base, 'indirect', m, extras.indirect[m] || 0);
      add(base, 'adjustments', m, extras.adjustments[m] || 0);
    }

    renderTable(base, months, year, extras);
    msg.textContent = '';
  } catch (err) {
    console.error('consol-pl error', err);
    msg.textContent = 'Error loading consolidated P&L: ' + (err?.message || err);
  }
}

function buildMonths(year) {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`);
}
function makeEmptyPnl(months) {
  const base = {
    revenue: {},
    labor: {},
    subs: {},
    equipment: {},
    materials: {},
    odc: {},
    indirect: {},
    adjustments: {},
    projCosts: {}
  };
  months.forEach(m => {
    base.revenue[m] = 0;
    base.labor[m] = 0;
    base.subs[m] = 0;
    base.equipment[m] = 0;
    base.materials[m] = 0;
    base.odc[m] = 0;
    base.indirect[m] = 0;
    base.adjustments[m] = 0;
  });
  return base;
}
function add(base, bucket, month, val) {
  base[bucket][month] = (base[bucket][month] || 0) + Number(val || 0);
}
function addProjCost(base, projId, month, val) {
  if (!projId) return;
  if (!base.projCosts[projId]) base.projCosts[projId] = {};
  base.projCosts[projId][month] = (base.projCosts[projId][month] || 0) + Number(val || 0);
}
function priceByRule(directCost, formula, feePct) {
  switch (formula) {
    case 'COST_PLUS': return directCost * (1 + (Number(feePct || 0) / 100));
    case 'TM':        return directCost;
    case 'FP':        return directCost;
    default:          return directCost;
  }
}
function ymYear(ym) {
  try { return Number(String(ym).slice(0,4)); } catch { return 0; }
}
function ymKey(ym) {
  try { return String(ym).slice(0,7); } catch { return null; }
}
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
function renderTable(base, months, year, extras) {
  const table = $('#conTable');

  const directByM = {};
  const grossByM  = {};
  const opByM     = {};
  const adjProfByM = {};

  months.forEach(m => {
    const dc = (base.labor[m]||0) + (base.subs[m]||0) + (base.equipment[m]||0) + (base.materials[m]||0) + (base.odc[m]||0);
    directByM[m] = dc;
    const gp = (base.revenue[m]||0) - dc;
    grossByM[m] = gp;
    const op = gp - (base.indirect[m]||0);
    opByM[m] = op;
    const adj = base.adjustments[m]||0;
    adjProfByM[m] = op + adj;
  });

  const tot = (obj) => months.reduce((s,m)=> s + Number(obj[m]||0), 0);

  const revenueTot = tot(base.revenue);
  const laborTot   = tot(base.labor);
  const subsTot    = tot(base.subs);
  const equipTot   = tot(base.equipment);
  const matsTot    = tot(base.materials);
  const odcTot     = tot(base.odc);
  const directTot  = tot(directByM);
  const grossTot   = tot(grossByM);
  const indirectTot = tot(base.indirect);
  const opTot      = tot(opByM);
  const adjTot     = tot(base.adjustments);
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
  months.forEach(m => {
    tr += `<td class="p-2 text-right">${fmt(obj[m])}</td>`;
  });
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
    const pct = rev ? (num / rev) * 100 : 0;
    tr += `<td class="p-1 text-right">${rev ? pct.toFixed(1) + '%' : ''}</td>`;
  });
  const numTot = months.reduce((s,m)=> s + Number(numByMonth[m]||0), 0);
  const revTot = months.reduce((s,m)=> s + Number(revByMonth[m]||0), 0);
  tr += `<td class="p-1 text-right">${revTot ? (numTot / revTot * 100).toFixed(1) + '%' : ''}</td>`;
  tr += '</tr>';
  return tr;
}

function sectionHeader(label) {
  return `<tr><td class="p-2 sticky left-0 bg-white text-slate-400 text-xs uppercase tracking-wide" colspan="14">${label}</td></tr>`;
}

function monthLabel(ym) {
  const [y,m] = ym.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleString('en-US', { month: 'short' });
}

function fmt(v) {
  const n = Number(v || 0);
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// 👇 this is what your main.js expects
export const loader = init;
