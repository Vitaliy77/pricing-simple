import { client } from '../api/supabase.js';
import { publishMonthlyPL } from '../lib/publish-monthly.js';
import { getProjectId } from '../lib/state.js';
import { $, $$, monthToDate } from '../lib/dom.js';
import { vendors } from '../data/lookups.js';

export function makeSubRow(row = {}) {
  row = row || {};
  const tr = document.createElement('tr');
  tr.className = 'border-b last:border-0';

  const vendorSel = document.createElement('select');
  vendorSel.className = 'border rounded-md p-1.5 w-56';
  vendorSel.innerHTML = `<option value="">Select vendor</option>` +
    (vendors||[]).map(v => `<option value="${v.id}">${v.name}</option>`).join('');
  vendorSel.value = row.vendor_id || '';

  const costInput = document.createElement('input');
  costInput.type = 'number';
  costInput.step = '0.01';
  costInput.min = '0';
  costInput.className = 'border rounded-md p-1.5 w-32';
  costInput.value = row.cost ?? '';

  const noteInput = document.createElement('input');
  noteInput.type = 'text';
  noteInput.placeholder = '(optional)';
  noteInput.className = 'border rounded-md p-1.5 w-64';
  noteInput.value = row.note ?? '';

  const delBtn = document.createElement('button');
  delBtn.className = 'px-2 py-1 rounded-md border text-red-600 hover:bg-red-50';
  delBtn.textContent = 'Remove';
  delBtn.onclick = () => tr.remove();

  ;[vendorSel, costInput, noteInput, delBtn].forEach(el => {
    const td = document.createElement('td');
    td.className = 'py-2 pr-3';
    td.appendChild(el);
    tr.appendChild(td);
  });
  const tdEnd = document.createElement('td');
  tdEnd.className = 'py-2 pr-3';
  tr.appendChild(tdEnd);

  return tr;
}

export async function saveSubs() {
  if (!getProjectId()) return new Error('Select a project first.');
  $('#saveSubs').disabled = true;
  $('#subsMsg').textContent = 'Saving...';
  try {
    const ym = monthToDate($('#monthPicker').value);
    const rows = $$('#subsTbody tr');
    const payload = rows.map(tr => {
      const [vendorSel, costInput, noteInput] = tr.querySelectorAll('select, input');
      const vendor_id = vendorSel?.value || null;
      const cost = Number(costInput?.value || 0);
      const note = noteInput?.value || null;
      if (!vendor_id || cost <= 0) return null;
      return { project_id: getProjectId(), ym, vendor_id, cost, note };
    }).filter(Boolean);

    if (payload.length === 0) {
      $('#subsMsg').textContent = 'Nothing to save.';
      return;
    }

    const { error } = await client
      .from('plan_subs')
      .upsert(payload, { onConflict: 'project_id,ym,vendor_id' });

    if (error) return error;

    $('#subsMsg').textContent = `Saved ${payload.length} row(s).`;

    // 👉 Publish P&L only after a successful save; non-fatal if it fails.
    try {
      const pid = getProjectId();
      // Prefer deriving year from ym if state.year might be undefined:
      const year = typeof state?.year === 'number' ? state.year : Number(String(ym).slice(0, 4));
      await publishMonthlyPL(pid, year);
    } catch (e) {
      console.warn('publishMonthlyPL warning:', e?.message || e);
    }

  } catch (error) {
    $('#subsMsg').textContent = `Error: ${error.message}`;
  } finally {
    $('#saveSubs').disabled = false;
  }
}

