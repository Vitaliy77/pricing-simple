import { $, state } from './state.js';
import { loadLookups, fetchPL, loadRevenuePolicy, saveRevenuePolicy } from './api.js';
import { renderPL } from './ui.js';

function monthsOf(year){
  return Array.from({length:12}, (_,i) => new Date(Date.UTC(year, i, 1)));
}

async function init(){
  // Catalogs
  $('#status').textContent = 'Loading catalogs…';
  const lookups = await loadLookups();
  state.rolesRate = Object.fromEntries((lookups.roles||[]).map(r => [r.role, +(r.base_rate*(1+r.burden_pct)).toFixed(2)]));
  state.employees = lookups.employees||[];
  state.vendors   = lookups.vendors||[];
  state.equipment = lookups.equipment||[];
  state.materials = lookups.materials||[];
  $('#status').textContent = 'Catalogs loaded.';

  // Revenue policy
  try {
    const p = await loadRevenuePolicy();
    const rm = $('#revMethod'); if (rm) rm.value = p.method;
    const fee = $('#feePct'); if (fee) fee.value = p.fee_pct*100;
    const mat = $('#matPct'); if (mat) mat.value = p.mat_markup_pct*100;
    const subs = $('#subsPct'); if (subs) subs.value = p.subs_markup_pct*100;
    const eq = $('#equipPct'); if (eq) eq.value = p.equip_markup_pct*100;
  } catch (e) {
    console.warn('Revenue policy load warning:', e.message||e);
  }

  await refreshPL();
}

// Save revenue settings
async function savePolicy(){
  const method = $('#revMethod').value;
  const fee    = Number($('#feePct').value || 0)/100;
  const mat    = Number($('#matPct').value || 0)/100;
  const subs   = Number($('#subsPct').value || 0)/100;
  const equip  = Number($('#equipPct').value || 0)/100;
  const PROJECT_ID = (await import('./config.js')).PROJECT_ID;
  const payload = { project_id: PROJECT_ID, method,
                    fee_pct: fee, mat_markup_pct: mat, subs_markup_pct: subs, equip_markup_pct: equip };
  const { error } = await saveRevenuePolicy(payload);
  $('#revMsg').textContent = error ? `Save error: ${error.message}` : `Saved. Using ${method}.`;
  await refreshPL();
}

async function refreshPL(){
  const ym = $('#monthPicker')?.value || state.month;
  const yr = Number(ym.slice(0,4));
  const { costs, rev } = await fetchPL(yr);

  const costMap = {};
  costs.forEach(r => { costMap[new Date(r.ym).toISOString().slice(0,7)] = r; });
  const revMap = {};
  rev.forEach(r => { revMap[new Date(r.ym).toISOString().slice(0,7)] = Number(r.revenue||0); });

  const months = monthsOf(yr);
  const table = document.getElementById('plTable');
  renderPL(table, months, costMap, revMap);
}

// events
document.addEventListener('DOMContentLoaded', init);
const month = document.getElementById('monthPicker');
if (month) month.addEventListener('change', refreshPL);
const refresh = document.getElementById('refreshPL');
if (refresh) refresh.addEventListener('click', refreshPL);
const saveRev = document.getElementById('saveRev');
if (saveRev) saveRev.addEventListener('click', savePolicy);
