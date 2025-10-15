import { client } from '../api/supabase.js';
import { getProjectId } from '../lib/state.js';
import { $, $$, formatMoney, monthToDate } from '../lib/dom.js';
import { employees, rolesRate } from '../data/lookups.js';

export function makeLaborRow(row = {}) {
  row = row || {};
  const tr = document.createElement('tr');
  tr.className = 'border-b last:border-0';

  const empSel = document.createElement('select');
  empSel.className = 'border rounded-md p-1.5 w-56';
  empSel.innerHTML = `<option value="">Select employee</option>` +
    (employees||[]).map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
  empSel.value = row.employee_id || '';

  const roleTd = document.createElement('td');
  roleTd.className = 'py-2 pr-3 text-slate-700';
  roleTd.textContent = (employees||[]).find(e => e.id === row.employee_id)?.role || '';

  const rateTd = document.createElement('td');
  rateTd.className = 'py-2 pr-3';
  rateTd.textContent = formatMoney(rolesRate[roleTd.textContent] || 0);

  const overrideInput = document.createElement('input');
  overrideInput.type = 'number';
  overrideInput.step = '0.01';
  overrideInput.min = '0';
  overrideInput.className = 'border rounded-md p-1.5 w-28';
  overrideInput.value = row.override_rate ?? '';

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
    const emp = (employees||[]).find(x => x.id === empSel.value);
    const role = emp ? emp.role : '';
    roleTd.textContent = role || '';
    const baseRate = rolesRate[role] || 0;
    rateTd.textContent = formatMoney(baseRate);
    const rate = Number(overrideInput.value || baseRate);
    const hours = Number(hoursInput.value || 0);
    costTd.textContent = formatMoney(rate * hours);
  }

  empSel.onchange = recalc;
  overrideInput.oninput = recalc;
  hoursInput.oninput = recalc;

  tr.appendChild(tdWrap(empSel));
  tr.appendChild(roleTd);
  tr.appendChild(rateTd);
  tr.appendChild(tdWrap(overrideInput));
  tr.appendChild(tdWrap(hoursInput));
  tr.appendChild(costTd);
  tr.appendChild(tdWrap(delBtn));

  empSel.dispatchEvent(new Event('change'));
  return tr;

  function tdWrap(el) {
    const td = document.createElement('td');
    td.className = 'py-2 pr-3';
    td.appendChild(el);
    return td;
  }
}

export async function saveLabor() {
  if (!getProjectId()) return new Error('Select a project first.');
  $('#saveLabor').disabled = true;
  $('#laborMsg').textContent = 'Saving...';
  try {
    const ym = monthToDate($('#monthPicker').value);
    const rows = $$('#laborTbody tr');
    const payload = rows.map(tr => {
      const [empSel, overrideInput, hoursInput] = tr.querySelectorAll('select, input');
      const employee_id = empSel?.value || null;
      const hours = Number(hoursInput?.value || 0);
      const override_rate = overrideInput?.value ? Number(overrideInput.value) : null;
      if (!employee_id || hours <= 0) return null;
      return { project_id: getProjectId(), ym, employee_id, hours, override_rate };
    }).filter(Boolean);

    if (payload.length === 0) {
      $('#laborMsg').textContent = 'Nothing to save.';
      return;
    }

    const { error } = await client
      .from('plan_labor')
      .upsert(payload, { onConflict: 'project_id,ym,employee_id' });

    if (error) return error;

    $('#laborMsg').textContent = `Saved ${payload.length} row(s).`;
  } catch (error) {
    $('#laborMsg').textContent = `Error: ${error.message}`;
  } finally {
    $('#saveLabor').disabled = false;
  }
}
