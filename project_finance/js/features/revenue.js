import { client, PROJECT_ID } from '../api/supabase.js';
import { $ } from '../lib/dom.js';

function _numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n / 100; // UI uses percent (10) -> store 0.10
}
function _setPctInput(el, frac) {
  el.value = frac == null ? '' : (Number(frac) * 100).toFixed(2).replace(/\.00$/, '');
}
function _toggleRevenueFields() {
  const method = $('#revMethod').value;
  const tmOnly = method === 'TM';
  const cpOnly = method === 'COST_PLUS';
  $('#feePct').disabled = tmOnly;
  $('#matPct').disabled = cpOnly;
  $('#subsPct').disabled = cpOnly;
  $('#equipPct').disabled = cpOnly;
}

export async function loadRevenueSettings() {
  try {
    const { data, error } = await client
      .from('project_revenue_policy')
      .select('method, fee_pct, mat_markup_pct, subs_markup_pct, equip_markup_pct')
      .eq('project_id', PROJECT_ID)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const method = data?.method || 'TM';
    $('#revMethod').value = method;
    _setPctInput($('#feePct'), data?.fee_pct);
    _setPctInput($('#matPct'), data?.mat_markup_pct);
    _setPctInput($('#subsPct'), data?.subs_markup_pct);
    _setPctInput($('#equipPct'), data?.equip_markup_pct);
    _toggleRevenueFields();
    $('#revMsg').textContent = `Method: ${method}`;
  } catch (error) {
    console.error('loadRevenueSettings error', error);
    $('#revMsg').textContent = `Error: ${error.message}`;
  }
}

export async function saveRevenueSettings(onAfterSave=()=>{}) {
  $('#saveRev').disabled = true;
  $('#revMsg').textContent = 'Saving...';
  try {
    const method = $('#revMethod').value;
    const feePct = _numOrNull($('#feePct').value);
    const matPct = _numOrNull($('#matPct').value);
    const subsPct = _numOrNull($('#subsPct').value);
    const equipPct = _numOrNull($('#equipPct').value);

    const payload = {
      project_id: PROJECT_ID,
      method,
      fee_pct: feePct ?? 0,
      mat_markup_pct: matPct ?? 0,
      subs_markup_pct: subsPct ?? 0,
      equip_markup_pct: equipPct ?? 0
    };

    const { error } = await client
      .from('project_revenue_policy')
      .upsert(payload, { onConflict: 'project_id' });

    if (error) throw error;

    $('#revMsg').textContent = `Saved. Using ${method}.`;
    await onAfterSave();
  } catch (error) {
    $('#revMsg').textContent = `Save error: ${error.message}`;
  } finally {
    $('#saveRev').disabled = false;
  }
}

export function wireRevenueUI(onChange=()=>{}) {
  $('#revMethod').addEventListener('change', () => { _toggleRevenueFields(); onChange(); });
  $('#saveRev').addEventListener('click', () => saveRevenueSettings(onChange));
}
