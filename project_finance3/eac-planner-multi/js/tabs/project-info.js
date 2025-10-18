// js/tabs/project-info.js
// Project Information tab: view/edit metadata for the currently selected project.

import { $ } from '../lib/dom.js';
import { getProjectId } from '../lib/state.js';
import { client } from '../api/supabase.js';

export const template = /*html*/ `
  <div class="bg-white rounded-xl shadow-sm p-5">
    <h2 class="text-lg font-semibold mb-4">Project Information</h2>

    <form id="projInfoForm" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm text-gray-600">Project ID</label>
        <input id="pi_id" type="text" class="mt-1 border rounded-md p-2 w-full bg-slate-50" disabled>
      </div>

      <div>
        <label class="block text-sm text-gray-600">Project Name *</label>
        <input id="pi_name" type="text" class="mt-1 border rounded-md p-2 w-full" required placeholder="e.g., Airport Expansion">
      </div>

      <div>
        <label class="block text-sm text-gray-600">Client</label>
        <input id="pi_client" type="text" class="mt-1 border rounded-md p-2 w-full" placeholder="e.g., City of Springfield">
      </div>

      <div>
        <label class="block text-sm text-gray-600">Project Manager</label>
        <input id="pi_pm" type="text" class="mt-1 border rounded-md p-2 w-full" placeholder="e.g., Jane Doe">
      </div>

      <div>
        <label class="block text-sm text-gray-600">Start Date</label>
        <input id="pi_start" type="date" class="mt-1 border rounded-md p-2 w-full">
      </div>

      <div>
        <label class="block text-sm text-gray-600">End Date</label>
        <input id="pi_end" type="date" class="mt-1 border rounded-md p-2 w-full">
      </div>

      <div>
        <label class="block text-sm text-gray-600">Contract Value</label>
        <input id="pi_contract" type="number" step="0.01" class="mt-1 border rounded-md p-2 w-full" placeholder="0.00">
      </div>

      <div>
        <label class="block text-sm text-gray-600">Funded Value</label>
        <input id="pi_funded" type="number" step="0.01" class="mt-1 border rounded-md p-2 w-full" placeholder="0.00">
      </div>

      <div>
        <label class="block text-sm text-gray-600">Revenue Formula</label>
        <select id="pi_formula" class="mt-1 border rounded-md p-2 w-full">
          <option value="TM">T&amp;M</option>
          <option value="COST_PLUS">Cost Plus + Fee</option>
          <option value="FP">Fixed Price</option>
        </select>
      </div>

      <div id="feeWrap">
        <label class="block text-sm text-gray-600">Fee % (when Cost Plus)</label>
        <input id="pi_fee" type="number" step="0.01" class="mt-1 border rounded-md p-2 w-full" placeholder="e.g., 10">
      </div>

      <div class="md:col-span-2">
        <label class="block text-sm text-gray-600">Description</label>
        <textarea id="pi_desc" class="mt-1 border rounded-md p-2 w-full" rows="3" placeholder="Brief description"></textarea>
      </div>
    </form>

    <div class="mt-4 flex items-center gap-3">
      <button id="piSave" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Save</button>
      <span id="piMsg" class="text-sm text-slate-500"></span>
    </div>
  </div>
`;

export async function init(rootEl) {
  const pid = getProjectId();
  const msg = $('#piMsg');

  if (!pid) {
    rootEl.innerHTML = `
      <div class="p-4 rounded-md bg-amber-50 text-amber-800 text-sm">
        Select or create a project in the top bar to edit its information.
      </div>`;
    return;
  }

  // Wire fee visibility
  const feeWrap = $('#feeWrap');
  const fee = $('#pi_fee');
  const formula = $('#pi_formula');
  const syncFeeVisibility = () => {
    const cp = formula.value === 'COST_PLUS';
    feeWrap.style.opacity = cp ? '1' : '0.5';
    feeWrap.style.pointerEvents = cp ? 'auto' : 'none';
  };
  formula.addEventListener('change', syncFeeVisibility);

  // Load current project
  try {
    msg.textContent = 'Loading project…';
    const { data, error } = await client
      .from('projects')
      .select('*')
      .eq('id', pid)
      .single();

    if (error) throw error;

    // Populate the form (fields missing in schema will simply show empty)
    $('#pi_id').value = data.id || '';
    $('#pi_name').value = data.name ?? '';
    $('#pi_client').value = data.client ?? '';
    $('#pi_pm').value = data.project_manager ?? '';
    $('#pi_start').value = data.start_date ?? '';
    $('#pi_end').value = data.end_date ?? '';
    $('#pi_contract').value = numOrEmpty(data.contract_value);
    $('#pi_funded').value = numOrEmpty(data.funded_value);
    $('#pi_formula').value = data.revenue_formula ?? 'TM';
    $('#pi_fee').value = numOrEmpty(data.fee_pct);
    $('#pi_desc').value = data.description ?? '';

    syncFeeVisibility();
    msg.textContent = '';
  } catch (err) {
    console.error('Project load error', err);
    msg.textContent = `Error: ${err?.message || err}`;
  }

  // Save handler
  $('#piSave').onclick = async () => {
    try {
      msg.textContent = 'Saving…';

      const payload = {
        name: $('#pi_name').value.trim(),
        client: emptyToNull($('#pi_client').value),
        project_manager: emptyToNull($('#pi_pm').value),
        start_date: emptyToNull($('#pi_start').value),
        end_date: emptyToNull($('#pi_end').value),
        contract_value: parseOrNull($('#pi_contract').value),
        funded_value: parseOrNull($('#pi_funded').value),
        revenue_formula: $('#pi_formula').value,
        fee_pct: parseOrNull($('#pi_fee').value),
        description: emptyToNull($('#pi_desc').value),
      };

      if (!payload.name) throw new Error('Project name is required.');

      const { error } = await client
        .from('projects')
        .update(payload)
        .eq('id', getProjectId());

      if (error) throw error;
      msg.textContent = 'Saved.';
      setTimeout(() => (msg.textContent = ''), 1500);
    } catch (err) {
      console.error('Project save error', err);
      msg.textContent = `Save failed: ${err?.message || err}`;
    }
  };
}

// ---------- helpers ----------
function parseOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function emptyToNull(v) {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}
function numOrEmpty(v) {
  return (v == null || v === '') ? '' : String(v);
}
