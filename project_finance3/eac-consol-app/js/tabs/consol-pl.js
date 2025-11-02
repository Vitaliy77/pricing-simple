// js/tabs/consol-pl.js
// Shows consolidated P&L for the selected month / year.
// Later we can pull from: plan_labor, plan_subs, plan_equipment, plan_materials, plan_odc, actuals_monthly, projects.

import { getClient, getCurrentYm } from '../api/supabase.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Consolidated P&L</h2>
      <div id="consolMsg" class="text-sm text-slate-500"></div>
    </div>
    <div id="consolBody">
      <p class="text-sm text-slate-500">Loading…</p>
    </div>
  </div>
`;

export async function init(root) {
  const msg = document.getElementById('consolMsg');
  const body = document.getElementById('consolBody');
  const ym = getCurrentYm();
  const year = ym.slice(0,4);

  msg.textContent = 'Loading…';

  try {
    const supa = getClient();

    // NOTE: placeholder — you will later replace with a view/rpc that already aggregates by month.
    // For now, just get all planned revenue/cost for the year from a single staging table, if present.
    const { data, error } = await supa
      .from('consolidated_view')    // ← create later, or change to your name
      .select('*')
      .gte('ym', `${year}-01-01`)
      .lte('ym', `${year}-12-31`);

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    // roll up
    let rev = 0, dl = 0, subs = 0, equip = 0, mats = 0, odc = 0;
    rows.forEach(r => {
      rev   += Number(r.revenue || 0);
      dl    += Number(r.labor_cost || 0);
      subs  += Number(r.subs_cost || 0);
      equip += Number(r.equip_cost || 0);
      mats  += Number(r.materials_cost || 0);
      odc   += Number(r.odc_cost || 0);
    });
    const directCost = dl + subs + equip + mats + odc;
    const projectMargin = rev - directCost;
    const projectMarginPct = rev ? (projectMargin / rev * 100) : 0;

    body.innerHTML = `
      <div class="grid grid-cols-2 gap-4 max-w-3xl">
        <div class="bg-slate-50 rounded-lg p-4">
          <div class="text-xs uppercase text-slate-500 mb-1">Revenue</div>
          <div class="text-2xl font-semibold">$${fmt(rev)}</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-4">
          <div class="text-xs uppercase text-slate-500 mb-1">Direct Cost (Labor+Subs+Equip+Mat+ODC)</div>
          <div class="text-2xl font-semibold">$${fmt(directCost)}</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-4">
          <div class="text-xs uppercase text-slate-500 mb-1">Project Margin</div>
          <div class="text-2xl font-semibold">$${fmt(projectMargin)}</div>
          <div class="text-xs text-slate-500 mt-1">${projectMarginPct.toFixed(1)}%</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-4">
          <div class="text-xs uppercase text-slate-500 mb-1">Next step</div>
          <div class="text-sm text-slate-600">
            Add indirect/overhead, add-backs, and scenario deltas in the Scenarios tab.
          </div>
        </div>
      </div>

      <h3 class="mt-6 mb-2 font-semibold text-slate-700 text-sm">Breakdown</h3>
      <table class="min-w-full text-sm">
        <tbody>
          <tr><td class="py-1 pr-4 text-slate-600">Labor</td><td class="py-1 text-right">$${fmt(dl)}</td></tr>
          <tr><td class="py-1 pr-4 text-slate-600">Subcontractors</td><td class="py-1 text-right">$${fmt(subs)}</td></tr>
          <tr><td class="py-1 pr-4 text-slate-600">Equipment</td><td class="py-1 text-right">$${fmt(equip)}</td></tr>
          <tr><td class="py-1 pr-4 text-slate-600">Materials</td><td class="py-1 text-right">$${fmt(mats)}</td></tr>
          <tr><td class="py-1 pr-4 text-slate-600">Other Direct Cost</td><td class="py-1 text-right">$${fmt(odc)}</td></tr>
        </tbody>
      </table>
    `;

    msg.textContent = '';
  } catch (e) {
    console.error(e);
    msg.textContent = 'Error loading consolidated P&L';
    document.getElementById('consolBody').innerHTML =
      `<div class="p-4 bg-red-50 text-red-700 rounded-md text-sm">${e.message || e}</div>`;
  }
}

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
