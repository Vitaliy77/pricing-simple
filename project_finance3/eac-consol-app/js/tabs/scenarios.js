// js/tabs/scenarios.js
// Simple what-if layer applied on top of consolidated numbers.
// For now we just re-fetch consolidated base and apply user deltas in the browser.

import { getClient, getCurrentYm } from '../api/supabase.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Scenarios / What-ifs</h2>
      <div id="scMsg" class="text-sm text-slate-500"></div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label class="block text-xs text-slate-500 mb-1">Delay revenue (months)</label>
        <input id="scDelay" type="number" min="0" max="12" value="0"
          class="w-full border rounded-md px-2 py-1 text-sm">
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Increase revenue (%)</label>
        <input id="scRevPct" type="number" step="1" value="0"
          class="w-full border rounded-md px-2 py-1 text-sm">
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Increase direct cost (%)</label>
        <input id="scCostPct" type="number" step="1" value="0"
          class="w-full border rounded-md px-2 py-1 text-sm">
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Add monthly indirect / OH ($)</label>
        <input id="scOH" type="number" step="100" value="0"
          class="w-full border rounded-md px-2 py-1 text-sm">
      </div>
      <div class="flex items-end">
        <button id="scApply" class="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm">Apply Scenario</button>
      </div>
    </div>

    <div id="scResult" class="pt-3 border-t"></div>
  </div>
`;

export async function init(root) {
  const msg = document.getElementById('scMsg');
  const res = document.getElementById('scResult');
  msg.textContent = 'Loading base…';

  const base = await loadBase();
  msg.textContent = '';

  renderResult(base, {});

  document.getElementById('scApply').onclick = () => {
    const scenario = {
      delayMonths: Number(document.getElementById('scDelay').value || 0),
      revPct: Number(document.getElementById('scRevPct').value || 0),
      costPct: Number(document.getElementById('scCostPct').value || 0),
      oh: Number(document.getElementById('scOH').value || 0),
    };
    const applied = applyScenario(base, scenario);
    renderResult(applied, scenario);
  };
}

async function loadBase() {
  const supa = getClient();
  const ym = getCurrentYm();
  const year = ym.slice(0,4);

  // Same placeholder source as consol tab
  const { data, error } = await supa
    .from('consolidated_view')
    .select('*')
    .gte('ym', `${year}-01-01`)
    .lte('ym', `${year}-12-31`);
  if (error) throw error;

  let rev = 0, dc = 0;
  (data || []).forEach(r => {
    rev += Number(r.revenue || 0);
    dc  += Number(r.labor_cost || 0)
        + Number(r.subs_cost || 0)
        + Number(r.equip_cost || 0)
        + Number(r.materials_cost || 0)
        + Number(r.odc_cost || 0);
  });
  return { revenue: rev, directCost: dc, oh: 0 };
}

function applyScenario(base, sc) {
  // delayMonths is conceptual here — real shift will be done later when we have monthly rows.
  let revenue = base.revenue * (1 + (sc.revPct || 0) / 100);
  let directCost = base.directCost * (1 + (sc.costPct || 0) / 100);
  let oh = (sc.oh || 0);
  let margin = revenue - directCost - oh;
  return { revenue, directCost, oh, margin };
}

function renderResult(model, scenario) {
  const res = document.getElementById('scResult');
  const marginPct = model.revenue ? (model.margin / model.revenue * 100) : 0;
  res.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="bg-slate-50 rounded-lg p-4">
        <div class="text-xs text-slate-500 uppercase mb-1">Revenue</div>
        <div class="text-xl font-semibold">$${fmt(model.revenue)}</div>
      </div>
      <div class="bg-slate-50 rounded-lg p-4">
        <div class="text-xs text-slate-500 uppercase mb-1">Direct Cost</div>
        <div class="text-xl font-semibold">$${fmt(model.directCost)}</div>
      </div>
      <div class="bg-slate-50 rounded-lg p-4">
        <div class="text-xs text-slate-500 uppercase mb-1">Indirect / OH</div>
        <div class="text-xl font-semibold">$${fmt(model.oh)}</div>
      </div>
      <div class="bg-slate-50 rounded-lg p-4">
        <div class="text-xs text-slate-500 uppercase mb-1">Margin</div>
        <div class="text-xl font-semibold">$${fmt(model.margin)}</div>
        <div class="text-xs text-slate-500 mt-1">${marginPct.toFixed(1)}%</div>
      </div>
    </div>
    <p class="text-xs text-slate-400 mt-3">
      Scenario: rev +${scenario.revPct||0}%, cost +${scenario.costPct||0}%, OH $${fmt(scenario.oh||0)}.
      Delay = ${scenario.delayMonths||0} mo (applied later at monthly level).
    </p>
  `;
}

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
