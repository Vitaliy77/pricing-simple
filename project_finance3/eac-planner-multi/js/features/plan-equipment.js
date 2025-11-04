import { client } from '../api/supabase.js';
import { publishMonthlyPL } from '../lib/publish-monthly.js';
import { getProjectId } from '../lib/state.js';
import { $, $$, formatMoney, monthToDate } from '../lib/dom.js';
import { equipmentList } from '../data/lookups.js';

export function makeEquipRow(row = {}) {
  row = row || {};
  const tr = document.createElement('tr');
  tr.className = 'border-b last:border-0';

  const equipSel = document.createElement('select');
  equipSel.className = 'border rounded-md p-1.5 w-56';
  equipSel.innerHTML = `<option value="">Select equipment</option>` +
    (equipmentList||[]).map(e => `<option value="${e.equip_type}">${e.equip_type}</option>`).join('');
  equipSel.value = row.equipment_type || '';

  const rateTd = document.createElement('td');
  rateTd.className = 'py-2 pr-3';
  rateTd.textContent = '';

  const hoursInput = document.createElement('input');
  hoursInput.type = 'number';
  hoursInput.step = '0.01';
  hoursInput.min = '0';
  hoursInput.className = 'border rounded-md p-1.5 w-24';
  hoursInput.value = row.hours ?? '';

  const costTd = document.createElement('td');
  costTd.className = 'py-2 pr-3 font-medium';
  costTd.textContent = '$0.00';

  const delBtn = document.createElement('button');
  delBtn.className = 'px-2 py-1 rounded-md border text-red-600 hover:bg-red-50';
  delBtn.textContent = 'Remove';
  delBtn.onclick = () => tr.remove();

  function recalc() {
    const item = (equipmentList||[]).find(x => x.equip_type === equipSel.value);
    const rt = item ? Number(item.rate || 0) : 0;
    const ru = item ? (item.rate_unit || 'hour') : 'hour';
    rateTd.textContent = `${formatMoney(rt)} / ${ru}`;
    const hours = Number(hoursInput.value || 0);
    costTd.textContent = formatMoney(rt * hours);
  }

  equipSel.onchange = recalc;
  hoursInput.oninput = recalc;

  tr.appendChild(tdWrap(equipSel));
  tr.appendChild(rateTd);
  tr.appendChild(tdWrap(hoursInput));
  tr.appendChild(costTd);
  tr.appendChild(tdWrap(delBtn));
  equipSel.dispatchEvent(new Event('change'));
  return tr;

  function tdWrap(el) {
    const td = document.createElement('td');
    td.className = 'py-2 pr-3';
    td.appendChild(el);
    return td;
  }
}

export async function saveEquip() {
  if (!getProjectId()) return new Error('Select a project first.');
  $('#saveEquip').disabled = true;
  $('#equipMsg').textContent = 'Saving...';
  try {
    const ym = monthToDate($('#monthPicker').value);
    const rows = $$('#equipTbody tr');
    const payload = rows.map(tr => {
      const equip_type = tr.querySelector('select')?.value || null;
      const hours = Number(tr.querySelector('input')?.value || 0);
      if (!equip_type || hours <= 0) return null;
      return { project_id: getProjectId(), ym, equipment_type: equip_type, hours };
    }).filter(Boolean);

    if (payload.length === 0) {
      $('#equipMsg').textContent = 'Nothing to save.';
      return;
    }

    const { error } = await client
      .from('plan_equipment')
      .upsert(payload, { onConflict: 'project_id,ym,equipment_type' });

    if (error) return error;

    $('#equipMsg').textContent = `Saved ${payload.length} row(s).`;

    // 👉 Publish P&L only after a successful save; log warning if it fails.
    try {
      const pid = getProjectId();
      const year =
        typeof state?.year === 'number'
          ? state.year
          : (ym instanceof Date ? ym.getFullYear() : Number(String(ym).slice(0, 4)));
      await publishMonthlyPL(pid, year);
    } catch (e) {
      console.warn('publishMonthlyPL warning:', e?.message || e);
    }

  } catch (error) {
    $('#equipMsg').textContent = `Error: ${error.message}`;
  } finally {
    $('#saveEquip').disabled = false;
  }
}

