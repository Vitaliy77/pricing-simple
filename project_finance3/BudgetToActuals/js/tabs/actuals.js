import { client } from '../api/supabase.js';
import { $, h } from '../lib/dom.js';

export const template = /*html*/`
  <article>
    <h3>Load Actuals</h3>
    <p>Upload Excel/CSV with columns: Date, Account, Vendor Name, Memo (Main), Memo, Amount (Debit), Amount (Credit), Department, Location, Created By, Period, Type, Document Number, Grant</p>
    <input id="file" type="file" accept=".csv,.xlsx,.xls" />
    <button id="upload">Upload</button>
    <small id="msg"></small>
    <details style="margin-top:1rem"><summary>Preview</summary><div id="prev" class="scroll-x"></div></details>
    <script type="module" src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  </article>
`;

export async function init(root){
  const msg = (t,e=false)=> { $('#msg',root).textContent=t; $('#msg',root).style.color=e?'#b00':'inherit'; };

  $('#upload',root).onclick = async ()=>{
    const f = $('#file',root).files[0];
    if (!f) return msg('Pick a file', true);

    const buf = await f.arrayBuffer();
    const wb  = XLSX.read(buf, { type:'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw:false }); // array of objects
    preview(rows);
    const { error, data } = await client.rpc('load_actuals_csv', { p_rows: rows });
    msg(error ? error.message : `Loaded ${data} rows.`);
  };

  function preview(rows){
    const keys = Object.keys(rows[0]||{});
    const tbl = h(`<table><thead><tr>${keys.map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody></tbody></table>`);
    for (const r of rows.slice(0,20)){
      const tr = h('<tr></tr>');
      keys.forEach(k => tr.appendChild(h(`<td>${r[k]??''}</td>`)));
      tbl.tBodies[0].appendChild(tr);
    }
    $('#prev',root).innerHTML=''; $('#prev',root).appendChild(tbl);
  }
}
