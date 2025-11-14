// js/tabs/actuals.js
import { client } from '../api/supabase.js';
import { $, h } from '../lib/dom.js';

export const template = /*html*/`
  <article>
    <h3>Load Actuals</h3>
    <p>
      Upload Excel/CSV with columns such as:
      Date, Account, Vendor Name, Memo (Main), Memo, Amount (Debit),
      Amount (Credit), Department, Location, Created By, Period,
      Type, Document Number, Grant
    </p>

    <input id="file" type="file" accept=".csv,.xlsx,.xls" />
    <button id="upload" type="button">Upload</button>
    <small id="msg"></small>

    <details style="margin-top:1rem">
      <summary>Preview</summary>
      <div id="prev" class="scroll-x"></div>
    </details>
  </article>
`;

export async function init(root) {
  const msg = (t, isErr = false) => {
    const el = $('#msg', root);
    if (!el) return;
    el.textContent = t;
    el.style.color = isErr ? '#b00' : 'inherit';
  };

  // Upload handler
  $('#upload', root).onclick = async () => {
    try {
      const fileInput = $('#file', root);
      const file = fileInput?.files?.[0];
      if (!file) {
        msg('Pick a file first', true);
        return;
      }

      if (typeof XLSX === 'undefined') {
        console.error('[actuals] XLSX global not found – check index.html script tag');
        msg('Upload library not loaded. Please contact admin.', true);
        return;
      }

      msg('Reading file…');

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false }); // array of objects

      if (!rows.length) {
        msg('File has no data rows.', true);
        return;
      }

      // Show preview of first 20 rows
      preview(rows);

      msg('Uploading to server…');

      // Call Supabase RPC – send rows as JSON (Supabase will serialize)
      const { error } = await client.rpc('load_actuals_csv', {
        p_rows: rows
      });

      if (error) {
        console.error('[actuals] RPC error:', error);
        msg('Upload failed: ' + error.message, true);
      } else {
        msg(`Loaded ${rows.length} rows.`);
      }
    } catch (e) {
      console.error('[actuals] upload exception:', e);
      msg('Upload failed: ' + (e.message || String(e)), true);
    }
  };

  function preview(rows) {
    const prev = $('#prev', root);
    if (!prev) return;

    const first = rows[0] || {};
    const keys = Object.keys(first);
    if (!keys.length) {
      prev.textContent = 'No columns detected.';
      return;
    }

    const tbl = h(`<table><thead><tr>${
      keys.map(k => `<th>${k}</th>`).join('')
    }</tr></thead><tbody></tbody></table>`);

    for (const r of rows.slice(0, 20)) {
      const tr = h('<tr></tr>');
      keys.forEach(k => {
        tr.appendChild(h(`<td>${r[k] ?? ''}</td>`));
      });
      tbl.tBodies[0].appendChild(tr);
    }

    prev.innerHTML = '';
    prev.appendChild(tbl);
  }
}
