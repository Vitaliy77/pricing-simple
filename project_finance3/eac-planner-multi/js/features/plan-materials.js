import { client } from '../api/supabase.js';
import { publishMonthlyPL } from '../lib/publish-monthly.js';
import { getProjectId } from '../lib/state.js';
import { $, $$, formatMoney, monthToDate } from '../lib/dom.js';
import { materialsList } from '../data/lookups.js';

export function makeMatRow(row = {}) {
  row = row || {};
  const tr = document.createElement('tr');
  tr.className = 'border-b last:border-0';

  const skuSel = document.createElement('select');
  skuSel.className = 'border rounded-md p-1.5 w-64';
  skuSel.innerHTML = `<option value="">Select material</option>` +
    (materialsList||[]).map(m => `<option value="${m.sku}">${m.sku} — ${m.description}</option>`).join('');
  skuSel.value = row.sku || '';

  const unitTd = document.createElement('td');
  unitTd.className = 'py-2 pr-3';
  unitTd.textContent = '';

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.step = '0.01';
  qtyInput.min = '0';
  qtyInput.className = 'border rounded-md p-1.5 w-24';
  qtyInput.value = row.qty ?? '';

  const costTd = document.createElement('td');
  costTd.className = 'py-2 pr-3 font-medium';
  costTd.textContent = '$0.00';

  const delBtn = document.createElement('button');
  delBtn.className = 'px-2 py-1 rounded-md border text-red-600 hover:bg-red-50';
  delBtn.textContent = 'Remove';
  delBtn.onclick = () => tr.remove();

  function recalc() {
    const item = (materialsList||[]).find(x => x.sku === skuSel.value);
    const unitCost = item ? (Number(item.unit_cost) * (1 + Number(item.waste_pct || 0))) : 0;
    unitTd.textContent = `${formatMoney(unitCost)} (incl waste)`;
    const qty = Number(qtyInput.value || 0);
    costTd.textContent = formatMoney(unitCost * qty);
  }

  skuSel.onchange = recalc;
  qtyInput.oninput = recalc;

  tr.appendChild(tdWrap(skuSel));
  tr.appendChild(unitTd);
  tr.appendChild(tdWrap(qtyInput));
  tr.appendChild(costTd);
  tr.appendChild(tdWrap(delBtn));
  skuSel.dispatchEvent(new Event('change'));
  return tr;

  function tdWrap(el) {
    const td = document.createElement('td');
    td.className = 'py-2 pr-3';
    td.appendChild(el);
    return td;
  }
}

export async function saveMat() {
  if (!getProjectId()) return new Error('Select a project first.');
  $('#saveMat').disabled = true;
  $('#matMsg').textContent = 'Saving...';
  try {
    const ym = monthToDate($('#monthPicker').value);
    const rows = $$('#matTbody tr');
    const payload = rows.map(tr => {
      const sku = tr.querySelector('select')?.value || null;
      const qty = Number(tr.querySelector('input')?.value || 0);
      if (!sku || qty <= 0) return null;
      return { project_id: getProjectId(), ym, sku, qty };
    }).filter(Boolean);

    if (payload.length === 0) {
      $('#matMsg').textContent = 'Nothing to save.';
      return;
    }

    const { error } = await client
      .from('plan_materials')
      .upsert(payload, { onConflict: 'project_id,ym,sku' });

    if (error) return error;

    $('#matMsg').textContent = `Saved ${payload.length} row(s).`;
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
    $('#matMsg').textContent = `Error: ${error.message}`;
  } finally {
    $('#saveMat').disabled = false;
  }
}
