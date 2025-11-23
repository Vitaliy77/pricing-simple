function renderGrid() {
  const table = $('#empTable');
  if (!table) return;

  const months = state.months;
  const monthKeys = months.map(m => m.ym.slice(0, 7));

  let html = '<thead><tr>';

  // One sticky column for Employee + Role
  html += `
    <th class="p-2 sticky-col text-left text-xs font-semibold text-slate-500 bg-slate-50 border-b">
      Employee / Role
    </th>
  `;

  // Month headers: Jan-25 etc.
  months.forEach((m) => {
    html += `
      <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">
        ${m.label}
      </th>
    `;
  });

  html += `
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Hours</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Cost</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Year Revenue</th>
    <th class="p-2 text-right text-xs font-semibold text-slate-500 bg-slate-50 border-b">Profit</th>
    <th class="p-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b"></th>
  `;
  html += '</tr></thead><tbody>';

  const empOptions = empLookup
    .map(e => `
      <option value="${e.id}"
              data-role="${esc(e.role ?? '')}"
              data-name="${esc(e.full_name ?? e.name ?? '')}">
        ${esc(e.full_name ?? e.name ?? '')}
      </option>`)
    .join('');

  state.rows.forEach((row, idx) => {
    const rate = resolveLoadedRate(row.role);
    const hoursYear = monthKeys.reduce((s, k) => s + Number(row.monthHours[k] || 0), 0);
    const costYear  = hoursYear * rate;
    const revYear   = computeRevenue(costYear, state.projectFormula, state.projectFeePct);
    const profit    = revYear - costYear;

    html += `<tr data-idx="${idx}" class="pl-row">`;

    // Sticky Employee + Role cell
    html += `
      <td class="p-2 sticky-col bg-white align-top">
        <div class="flex flex-col gap-1">
          <select class="empSel border rounded-md px-2 py-1 min-w-56 text-xs">
            <option value="">— Select —</option>
            ${empOptions}
          </select>
          <input
            class="roleInp border rounded-md px-2 py-1 w-40 bg-slate-50 text-xs"
            value="${esc(row.role || '')}"
            disabled
          >
        </div>
      </td>
    `;

    // Month inputs (no column stripes now; just clean cells)
    monthKeys.forEach((k) => {
      const v = row.monthHours[k] ?? '';
      html += `
        <td class="p-1 text-right">
          <input
            data-k="${k}"
            class="hrInp border rounded-md px-2 py-1 w-20 text-right text-xs"
            type="number"
            min="0"
            step="0.1"
            value="${v !== '' ? String(v) : ''}"
          >
        </td>
      `;
    });

    html += `<td class="p-2 text-right">${fmtNum(hoursYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(costYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(revYear)}</td>`;
    html += `<td class="p-2 text-right">${fmtUSD0(profit)}</td>`;
    html += `
      <td class="p-2 text-right">
        <button class="rowDel px-2 py-1 rounded-md border text-xs hover:bg-slate-50">✕</button>
      </td>
    `;

    html += '</tr>';
  });

  const totals = calcTotals(state.rows, monthKeys);
  html += `
    <tr class="font-semibold summary-row">
      <td class="p-2 sticky-col bg-white">Totals</td>
      ${monthKeys.map(k => `
        <td class="p-2 text-right">${fmtNum(totals.hoursByMonth[k])}</td>
      `).join('')}
      <td class="p-2 text-right">${fmtNum(totals.hoursYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.costYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear)}</td>
      <td class="p-2 text-right">${fmtUSD0(totals.revYear - totals.costYear)}</td>
      <td class="p-2"></td>
    </tr>
  `;

  html += '</tbody>';
  table.innerHTML = html;

  // Restore selected employees
  table.querySelectorAll('tr[data-idx]').forEach(tr => {
    const i = Number(tr.dataset.idx);
    const sel = tr.querySelector('.empSel');
    if (sel) sel.value = state.rows[i].employee_id || '';
  });

  // Wire events (same as before)
  table.querySelectorAll('.empSel').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const opt = e.target.selectedOptions[0];
      const role = opt?.dataset?.role || '';
      const name = opt?.dataset?.name || '';
      state.rows[idx].employee_id = e.target.value || null;
      state.rows[idx].role = role;
      state.rows[idx].name = name;
      withCaretPreserved(() => renderGrid());
    });
  });

  table.querySelectorAll('.hrInp').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const tr = e.target.closest('tr');
      const idx = Number(tr.dataset.idx);
      const k = e.target.dataset.k;
      const n = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
      state.rows[idx].monthHours[k] = n === '' ? '' : (Number.isFinite(n) ? n : 0);
      withCaretPreserved(() => renderGrid());
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    });
  });

  table.querySelectorAll('.rowDel').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      const idx = Number(tr.dataset.idx);
      state.rows.splice(idx, 1);
      if (state.rows.length === 0) state.rows.push(blankRow());
      withCaretPreserved(() => renderGrid());
    });
  });
}
