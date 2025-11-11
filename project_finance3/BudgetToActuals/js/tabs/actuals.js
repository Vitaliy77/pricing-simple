// js/tabs/actuals.js
import { client } from '../api/supabase.js';


let rootEl = null;
let grants = [];
let mappings = [];
let parsedData = [];
let importLog = [];

export const template = /*html*/`
  <div class="bg-white rounded-xl shadow-sm p-6 space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Load Actuals (GL Export)</h2>
    </div>

    <div id="msg" class="text-sm text-slate-600"></div>

    <!-- Upload Area -->
    <div class="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
      <input type="file" id="csvFile" accept=".csv" class="hidden">
      <label for="csvFile" class="cursor-pointer">
        <div class="text-4xl text-slate-400 mb-2">Upload</div>
        <p class="text-sm text-slate-600">Drop your GL export CSV here or click to browse</p>
      </label>
    </div>

    <!-- Mapping Table (hidden until file loaded) -->
    <div id="mappingSection" class="hidden space-y-4">
      <h3 class="font-medium">GL Account Mapping</h3>
      <div class="overflow-x-auto">
        <table id="mappingTable" class="min-w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="p-2 text-left">GL Account</th>
              <th class="p-2 text-left">Grant ID</th>
              <th class="p-2 text-left">Map To</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="flex justify-end">
        <button id="importActuals" class="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium">
          Import Actuals
        </button>
      </div>
    </div>

    <!-- Import Log -->
    <div id="logSection" class="hidden mt-6">
      <h3 class="font-medium mb-2">Import Log</h3>
      <div id="importLog" class="bg-slate-50 p-4 rounded text-xs font-mono max-h-64 overflow-y-auto"></div>
    </div>
  </div>
`;

export async function init(root) {
  rootEl = root;
  await Promise.all([
    loadGrants(),
    loadMappings()
  ]);
  setupEventListeners();
}

async function loadGrants() {
  const { data, error } = await client
    .from('grants')
    .select('id, grant_id')
    .eq('status', 'active');

  if (error) { msg(error.message); return; }
  grants = data;
}

async function loadMappings() {
  const { data, error } = await client
    .from('gl_account_mapping')
    .select('*')
    .eq('is_active', true);

  if (error) { msg(error.message); return; }
  mappings = data;
}

function setupEventListeners() {
  const fileInput = rootEl.querySelector('#csvFile');
  const dropZone = rootEl.querySelector('[for="csvFile"]').parentElement;

  // Drag & drop
  ['dragover', 'dragenter'].forEach(evt => {
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      dropZone.classList.add('border-blue-500', 'bg-blue-50');
    });
  });
  ['dragleave', 'dragend'].forEach(evt => {
    dropZone.addEventListener(evt, e => {
      e.preventDefault();
      dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    });
  });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Click to browse
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  rootEl.querySelector('#importActuals')?.addEventListener('click', importActuals);
}

function handleFile(file) {
  if (!file.name.endsWith('.csv')) {
    msg('Please upload a CSV file.');
    return;
  }

  msg('Parsing CSV...');
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: results => {
      parsedData = results.data;
      msg(`Parsed ${parsedData.length} rows.`);
      renderMappingTable();
    },
    error: err => {
      console.error(err);
      msg(`Parse error: ${err.message}`);
    }
  });
}

function renderMappingTable() {
  const tbody = rootEl.querySelector('#mappingTable tbody');
  tbody.innerHTML = '';

  // Group by GL Account + Grant ID
  const grouped = {};
  parsedData.forEach(row => {
    const gl = row['Posting Account'] || row['Account'] || '';
    const grantId = row['Grant Restriction'] || '';
    const key = `${gl}|||${grantId}`;
    if (!grouped[key]) {
      grouped[key] = { gl, grantId, rows: [] };
    }
    grouped[key].rows.push(row);
  });

  Object.values(grouped).forEach(g => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2 border-t">${esc(g.gl)}</td>
      <td class="p-2 border-t">${esc(g.grantId)}</td>
      <td class="p-2 border-t">
        <select class="mapSelect border rounded px-2 py-1 text-xs w-full">
          <option value="">— Select Category —</option>
          <option value="Labor">Labor</option>
          <option value="Travel">Travel</option>
          <option value="Software">Software</option>
          <option value="Postage">Postage</option>
          <option value="Other">Other</option>
        </select>
      </td>
    `;

    // Try auto-map
    const mapping = mappings.find(m => 
      g.gl.includes(m.gl_account_pattern.replace('*', ''))
    );
    if (mapping) {
      tr.querySelector('.mapSelect').value = mapping.maps_to_category;
    }

    tbody.appendChild(tr);
  });

  rootEl.querySelector('#mappingSection').classList.remove('hidden');
  msg('Review mapping and click Import.');
}

async function importActuals() {
  if (parsedData.length === 0) return;

  const selects = rootEl.querySelectorAll('.mapSelect');
  const mapping = {};
  selects.forEach((sel, i) => {
    const tr = sel.closest('tr');
    const gl = tr.cells[0].textContent;
    const grantId = tr.cells[1].textContent;
    const category = sel.value;
    if (category) {
      mapping[`${gl}|||${grantId}`] = category;
    }
  });

  if (Object.keys(mapping).length === 0) {
    msg('Please map at least one GL account.');
    return;
  }

  msg('Importing...');
  importLog = [];
  const batchId = crypto.randomUUID();
  const batch = {
    id: batchId,
    filename: rootEl.querySelector('#csvFile').files[0]?.name || 'upload.csv',
    imported_by: null, // TODO: current user
    imported_at: new Date().toISOString(),
    row_count: 0,
    error_count: 0
  };

  const actualsToInsert = [];

  for (const row of parsedData) {
    const gl = row['Posting Account'] || row['Account'] || '';
    const grantId = row['Grant Restriction'] || '';
    const key = `${gl}|||${grantId}`;
    const mappedCategory = mapping[key];

    if (!mappedCategory) {
      importLog.push(`Skipped: ${gl} (no mapping)`);
      batch.error_count++;
      continue;
    }

    const grant = grants.find(g => g.grant_id === grantId);
    if (!grant) {
      importLog.push(`Skipped: Grant ID "${grantId}" not found`);
      batch.error_count++;
      continue;
    }

    const date = row['Date'] || row['Period'] || '';
    const amount = Number(row['Amount (Debit)'] || 0) - Number(row['Amount (Credit)'] || 0);
    if (amount === 0) continue;

    actualsToInsert.push({
      grant_id: grant.id,
      gl_date: formatDateForDB(date),
      amount,
      gl_account: gl,
      description: row['Memo'] || row['Memo (Main)'] || '',
      category_mapped: mappedCategory,
      import_batch_id: batchId
    });

    importLog.push(`Imported: $${amount.toFixed(2)} → ${mappedCategory}`);
    batch.row_count++;
  }

  try {
    // Insert batch record
    await client.from('import_batches').insert(batch);

    // Insert actuals
    if (actualsToInsert.length > 0) {
      const { error } = await client.from('actuals').insert(actualsToInsert);
      if (error) throw error;
    }

    renderImportLog();
    msg(`Imported ${batch.row_count} rows.`);
    parsedData = [];
    rootEl.querySelector('#mappingSection').classList.add('hidden');
  } catch (e) {
    console.error(e);
    msg(`Import failed: ${e.message}`);
  }
}

function renderImportLog() {
  const logEl = rootEl.querySelector('#importLog');
  logEl.innerHTML = importLog.map(line => `<div>${line}</div>`).join('');
  rootEl.querySelector('#logSection').classList.remove('hidden');
}

function formatDateForDB(dateStr) {
  // Handle "1/1/25" or "Jan 2025"
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function msg(txt) {
  const el = rootEl.querySelector('#msg');
  el.textContent = txt;
  if (txt) setTimeout(() => el.textContent = '', 5000);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export const actualsTab = { template, init };
