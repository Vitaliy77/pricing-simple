// js/tabs/admin.js
import { $ } from "../lib/dom.js";

export const template = /*html*/ `
  <article class="full-width-card">
    <style>
      .admin-section {
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 1rem;
        margin-bottom: 1rem;
      }
      .admin-section:last-of-type {
        border-bottom: none;
        margin-bottom: 0;
        padding-bottom: 0;
      }

      .admin-section-title {
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #4b5563;
        margin-bottom: 0.25rem;
      }
      .admin-section-desc {
        font-size: 0.75rem;
        color: #6b7280;
        margin-bottom: 0.5rem;
      }

      .admin-grid-2 {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr);
        gap: 0.75rem;
      }
      @media (max-width: 900px) {
        .admin-grid-2 {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      .admin-form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.5rem 0.75rem;
      }
      .admin-form-grid label {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        font-size: 0.75rem;
        color: #374151;
      }
      .admin-form-grid input,
      .admin-form-grid select {
        border-radius: 0.375rem;
        border: 1px solid #cbd5f5;
        padding: 0.3rem 0.45rem;
        font-size: 0.8rem;
      }

      .admin-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-top: 0.5rem;
      }

      .admin-btn-primary {
        background-color: #2563eb;
        color: #ffffff;
        border-radius: 0.375rem;
        padding: 0.35rem 0.8rem;
        font-size: 0.8rem;
        font-weight: 500;
        border: none;
        cursor: pointer;
      }
      .admin-btn-primary:hover {
        background-color: #1d4ed8;
      }

      .admin-btn-secondary {
        background-color: #e5e7eb;
        color: #374151;
        border-radius: 0.375rem;
        padding: 0.3rem 0.7rem;
        font-size: 0.75rem;
        border: none;
        cursor: pointer;
      }
      .admin-btn-secondary:hover {
        background-color: #d1d5db;
      }

      .admin-msg {
        font-size: 0.7rem;
      }

      .admin-table-wrapper {
        max-height: 260px;
        overflow: auto;
        border-radius: 0.5rem;
        border: 1px solid #e5e7eb;
      }
      .admin-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.75rem;
      }
      .admin-table th,
      .admin-table td {
        padding: 0.25rem 0.4rem;
        white-space: nowrap;
      }
      .admin-table thead {
        background-color: #f9fafb;
        position: sticky;
        top: 0;
        z-index: 1;
      }
      .admin-table tbody tr:nth-child(odd) {
        background-color: #f3f4f6;
      }
      .admin-table tbody tr:nth-child(even) {
        background-color: #ffffff;
      }
      .admin-table tbody tr:hover {
        background-color: #e5f3ff;
        cursor: pointer;
      }
    </style>

    <!-- Header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span class="font-medium">Admin · Master Data</span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Labor, Employees, Subs & ODC
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Maintain core reference tables used across planning (rates, employees, vendors).
        </span>
      </div>
      <div id="adminGlobalMsg" class="admin-msg text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- Body -->
    <div class="px-4 py-3 space-y-4">

      <!-- 1) Labor Categories -->
      <section class="admin-section">
        <div class="admin-section-title">Labor Categories &amp; Billing Rates</div>
        <div class="admin-section-desc">
          Maintain labor categories and standard billing rates. Click a row to edit, or add a new category.
        </div>

        <div class="admin-grid-2">
          <div>
            <form id="adminLaborForm" class="space-y-2">
              <input type="hidden" id="adminLaborId" />

              <div class="admin-form-grid">
                <label>
                  Labor Category
                  <input
                    id="adminLaborName"
                    type="text"
                    placeholder="e.g. Sr. Engineer"
                    required
                  />
                </label>
                <label>
                  Billing Rate
                  <input
                    id="adminLaborRate"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 210"
                    required
                  />
                </label>
              </div>

              <div class="admin-actions">
                <button type="submit" class="admin-btn-primary" id="adminLaborSubmit">
                  Add Category
                </button>
                <button type="button" class="admin-btn-secondary" id="adminLaborClear">
                  Clear
                </button>
                <span id="adminLaborMsg" class="admin-msg text-slate-500"></span>
              </div>
            </form>
          </div>

          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th class="text-right">Billing Rate</th>
                </tr>
              </thead>
              <tbody id="adminLaborBody">
                <tr><td colspan="2">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- 2) Employees / TBD New Hires -->
      <section class="admin-section">
        <div class="admin-section-title">Employees &amp; TBD New Hires</div>
        <div class="admin-section-desc">
          Add new employees (incl. TBD hires) and update basic details for existing employees.
        </div>

        <div class="admin-grid-2">
          <div>
            <form id="adminEmpForm" class="space-y-2">
              <input type="hidden" id="adminEmpId" />

              <div class="admin-form-grid">
                <label>
                  Existing Employee
                  <select id="adminEmpSelect">
                    <option value="">— Add new / or select to edit —</option>
                  </select>
                </label>

                <label>
                  Employee ID
                  <input
                    id="adminEmpEmployeeId"
                    type="text"
                    placeholder="e.g. TBD-001 or 12345"
                  />
                </label>

                <label>
                  Full Name
                  <input
                    id="adminEmpName"
                    type="text"
                    placeholder="e.g. TBD Sr Engineer"
                    required
                  />
                </label>

                <label>
                  Department Code
                  <input
                    id="adminEmpDeptCode"
                    type="text"
                    placeholder="e.g. ENG"
                  />
                </label>

                <label>
                  Department Name
                  <input
                    id="adminEmpDeptName"
                    type="text"
                    placeholder="e.g. Engineering"
                  />
                </label>

                <label>
                  Hourly Cost
                  <input
                    id="adminEmpHourlyCost"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 85"
                    required
                  />
                </label>

                <label>
                  Labor Category
                  <select id="adminEmpLaborCat">
                    <option value="">— Select category —</option>
                  </select>
                </label>
              </div>

              <div class="admin-actions">
                <button type="submit" class="admin-btn-primary" id="adminEmpSubmit">
                  Save Employee
                </button>
                <button type="button" class="admin-btn-secondary" id="adminEmpClear">
                  Clear
                </button>
                <span id="adminEmpMsg" class="admin-msg text-slate-500"></span>
              </div>
            </form>
          </div>

          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Emp ID</th>
                  <th>Dept</th>
                  <th>Labor Cat</th>
                  <th class="text-right">Hourly Cost</th>
                </tr>
              </thead>
              <tbody id="adminEmpBody">
                <tr><td colspan="5">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- 3) Vendors / Subs & ODC -->
      <section class="admin-section">
        <div class="admin-section-title">Vendors · Subs &amp; ODC</div>
        <div class="admin-section-desc">
          Maintain vendor list used for subcontractor and ODC planning. Adjust column names in code if your <code>vendors</code> schema differs.
        </div>

        <div class="admin-grid-2">
          <div>
            <form id="adminVendorForm" class="space-y-2">
              <input type="hidden" id="adminVendorId" />

              <div class="admin-form-grid">
                <label>
                  Vendor Name
                  <input
                    id="adminVendorName"
                    type="text"
                    placeholder="e.g. ABC Subcontracting LLC"
                    required
                  />
                </label>

                <label>
                  Type
                  <select id="adminVendorType">
                    <option value="Subcontractor">Subcontractor</option>
                    <option value="ODC">ODC Vendor</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
              </div>

              <div class="admin-actions">
                <button type="submit" class="admin-btn-primary" id="adminVendorSubmit">
                  Save Vendor
                </button>
                <button type="button" class="admin-btn-secondary" id="adminVendorClear">
                  Clear
                </button>
                <span id="adminVendorMsg" class="admin-msg text-slate-500"></span>
              </div>
            </form>
          </div>

          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody id="adminVendorBody">
                <tr><td colspan="2">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </article>
`;

export const adminTab = {
  template,
  async init({ root, client }) {
    const globalMsg = $("#adminGlobalMsg", root);
    if (globalMsg) {
      globalMsg.textContent = "Loading admin data…";
    }

    try {
      await Promise.all([
        initLaborSection(root, client),
        initEmployeeSection(root, client),
        initVendorSection(root, client),
      ]);

      if (globalMsg) {
        globalMsg.textContent = "";
      }
    } catch (err) {
      console.error("[Admin] init error", err);
      if (globalMsg) {
        globalMsg.textContent = "Error loading admin data.";
      }
    }
  },
};

// ─────────────────────────────────────────────
// LABOR CATEGORIES
// ─────────────────────────────────────────────
async function initLaborSection(root, client) {
  const form = $("#adminLaborForm", root);
  const msg = $("#adminLaborMsg", root);
  const idInput = $("#adminLaborId", root);
  const nameInput = $("#adminLaborName", root);
  const rateInput = $("#adminLaborRate", root);
  const submitBtn = $("#adminLaborSubmit", root);
  const clearBtn = $("#adminLaborClear", root);
  const body = $("#adminLaborBody", root);

  const showMsg = (text, type = "info") => {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color =
      type === "error"
        ? "#b91c1c"
        : type === "success"
        ? "#166534"
        : "#6b7280";
  };

  async function loadLaborCategories() {
    if (!body) return;
    body.innerHTML = `<tr><td colspan="2">Loading…</td></tr>`;

    const { data, error } = await client
      .from("labor_categories")
      .select("id, labor_category, billing_rate")
      .order("labor_category");

    if (error) {
      console.error("[Admin] labor_categories error", error);
      body.innerHTML = `<tr><td colspan="2">Error loading.</td></tr>`;
      return;
    }

    if (!data || !data.length) {
      body.innerHTML = `<tr><td colspan="2">No labor categories yet.</td></tr>`;
      return;
    }

    body.innerHTML = "";
    data.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.dataset.laborCategory = row.labor_category || "";
      tr.dataset.billingRate = row.billing_rate ?? "";
      tr.innerHTML = `
        <td>${row.labor_category || ""}</td>
        <td class="text-right">${Number(row.billing_rate || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
      `;
      body.appendChild(tr);
    });
  }

  function clearForm() {
    if (idInput) idInput.value = "";
    if (nameInput) nameInput.value = "";
    if (rateInput) rateInput.value = "";
    if (submitBtn) submitBtn.textContent = "Add Category";
    showMsg("", "info");
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = idInput?.value || "";
      const labor_category = nameInput?.value.trim();
      const billing_rate = parseFloat(rateInput?.value || "0");

      if (!labor_category) {
        showMsg("Labor Category is required.", "error");
        return;
      }

      showMsg("Saving…");

      if (id) {
        const { error } = await client
          .from("labor_categories")
          .update({ labor_category, billing_rate })
          .eq("id", id);

        if (error) {
          console.error(error);
          showMsg(error.message || "Failed to update category", "error");
        } else {
          showMsg("Category updated.", "success");
          await loadLaborCategories();
        }
      } else {
        const { error } = await client
          .from("labor_categories")
          .insert({ labor_category, billing_rate });

        if (error) {
          console.error(error);
          showMsg(error.message || "Failed to add category", "error");
        } else {
          showMsg("Category added.", "success");
          clearForm();
          await loadLaborCategories();
        }
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearForm();
    });
  }

  if (body) {
    body.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr || !tr.dataset.id) return;

      if (idInput) idInput.value = tr.dataset.id || "";
      if (nameInput) nameInput.value = tr.dataset.laborCategory || "";
      if (rateInput) rateInput.value = tr.dataset.billingRate || "";
      if (submitBtn) submitBtn.textContent = "Update Category";
      showMsg("Editing existing category.", "info");
    });
  }

  await loadLaborCategories();
}

// ─────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────
async function initEmployeeSection(root, client) {
  const form = $("#adminEmpForm", root);
  const msg = $("#adminEmpMsg", root);
  const idInput = $("#adminEmpId", root);
  const select = $("#adminEmpSelect", root);
  const empIdInput = $("#adminEmpEmployeeId", root);
  const nameInput = $("#adminEmpName", root);
  const deptCodeInput = $("#adminEmpDeptCode", root);
  const deptNameInput = $("#adminEmpDeptName", root);
  const hourlyCostInput = $("#adminEmpHourlyCost", root);
  const laborCatSelect = $("#adminEmpLaborCat", root);
  const clearBtn = $("#adminEmpClear", root);
  const body = $("#adminEmpBody", root);

  const showMsg = (text, type = "info") => {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color =
      type === "error"
        ? "#b91c1c"
        : type === "success"
        ? "#166534"
        : "#6b7280";
  };

  async function loadLaborCatsForEmployees() {
    if (!laborCatSelect) return;
    const { data, error } = await client
      .from("labor_categories")
      .select("id, labor_category")
      .order("labor_category");

    if (error) {
      console.error("[Admin] labor_categories for employees error", error);
      return;
    }

    laborCatSelect.innerHTML = `<option value="">— Select category —</option>`;
    (data || []).forEach((row) => {
      const opt = document.createElement("option");
      opt.value = row.id;
      opt.textContent = row.labor_category || "";
      laborCatSelect.appendChild(opt);
    });
  }

  async function loadEmployees() {
    if (!body || !select) return;

    body.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;

    // Load employees with labor_category name joined
    const { data, error } = await client
      .from("employees")
      .select(`
        id,
        employee_id,
        full_name,
        department_code,
        department_name,
        hourly_cost,
        labor_category_id,
        labor_categories ( labor_category )
      `)
      .order("full_name", { ascending: true });

    if (error) {
      console.error("[Admin] employees error", error);
      body.innerHTML = `<tr><td colspan="5">Error loading.</td></tr>`;
      return;
    }

    select.innerHTML = `<option value="">— Add new / or select to edit —</option>`;
    body.innerHTML = "";

    if (!data || !data.length) {
      body.innerHTML = `<tr><td colspan="5">No employees found.</td></tr>`;
      return;
    }

    data.forEach((row) => {
      const lcName = row.labor_categories?.labor_category || "";

      const opt = document.createElement("option");
      opt.value = row.id;
      opt.textContent = row.full_name || row.employee_id || row.id;
      opt.dataset.emp = JSON.stringify({
        id: row.id,
        employee_id: row.employee_id || "",
        full_name: row.full_name || "",
        department_code: row.department_code || "",
        department_name: row.department_name || "",
        hourly_cost: row.hourly_cost ?? "",
        labor_category_id: row.labor_category_id || "",
      });
      select.appendChild(opt);

      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.dataset.emp = opt.dataset.emp;
      tr.innerHTML = `
        <td>${row.full_name || ""}</td>
        <td>${row.employee_id || ""}</td>
        <td>${row.department_code || ""}</td>
        <td>${lcName}</td>
        <td class="text-right">${Number(row.hourly_cost || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
      `;
      body.appendChild(tr);
    });
  }

  function fillEmpFormFromData(emp) {
    if (!emp) return;
    if (idInput) idInput.value = emp.id || "";
    if (empIdInput) empIdInput.value = emp.employee_id || "";
    if (nameInput) nameInput.value = emp.full_name || "";
    if (deptCodeInput) deptCodeInput.value = emp.department_code || "";
    if (deptNameInput) deptNameInput.value = emp.department_name || "";
    if (hourlyCostInput) hourlyCostInput.value = emp.hourly_cost ?? "";
    if (laborCatSelect) laborCatSelect.value = emp.labor_category_id || "";
  }

  function clearEmpForm() {
    if (select) select.value = "";
    if (idInput) idInput.value = "";
    if (empIdInput) empIdInput.value = "";
    if (nameInput) nameInput.value = "";
    if (deptCodeInput) deptCodeInput.value = "";
    if (deptNameInput) deptNameInput.value = "";
    if (hourlyCostInput) hourlyCostInput.value = "";
    if (laborCatSelect) laborCatSelect.value = "";
    showMsg("", "info");
  }

  if (select) {
    select.addEventListener("change", () => {
      const opt = select.options[select.selectedIndex];
      const json = opt?.dataset?.emp;
      if (!json) {
        clearEmpForm();
        return;
      }
      try {
        const emp = JSON.parse(json);
        fillEmpFormFromData(emp);
        showMsg("Editing existing employee.", "info");
      } catch {
        clearEmpForm();
      }
    });
  }

  if (body) {
    body.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr || !tr.dataset.emp) return;
      try {
        const emp = JSON.parse(tr.dataset.emp);
        fillEmpFormFromData(emp);
        if (select) select.value = emp.id || "";
        showMsg("Editing existing employee.", "info");
      } catch {
        // ignore
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearEmpForm();
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = idInput?.value || "";
      const employee_id = empIdInput?.value.trim() || null;
      const full_name = nameInput?.value.trim();
      const department_code = deptCodeInput?.value.trim() || null;
      const department_name = deptNameInput?.value.trim() || null;
      const hourly_cost = parseFloat(hourlyCostInput?.value || "0");
      const labor_category_id = laborCatSelect?.value || null;

      if (!full_name) {
        showMsg("Full Name is required.", "error");
        return;
      }

      showMsg("Saving…");

      const payload = {
        full_name,
        employee_id,
        department_code,
        department_name,
        hourly_cost,
        labor_category_id,
      };

      if (id) {
        const { error } = await client
          .from("employees")
          .update(payload)
          .eq("id", id);

        if (error) {
          console.error(error);
          showMsg(error.message || "Failed to update employee", "error");
        } else {
          showMsg("Employee updated.", "success");
          await loadEmployees();
        }
      } else {
        const { error } = await client
          .from("employees")
          .insert(payload);

        if (error) {
          console.error(error);
          showMsg(error.message || "Failed to add employee", "error");
        } else {
          showMsg("Employee added.", "success");
          clearEmpForm();
          await loadEmployees();
        }
      }
    });
  }

  await loadLaborCatsForEmployees();
  await loadEmployees();
}

// ─────────────────────────────────────────────
// VENDORS (Subs / ODC)
// Adjust columns if your vendors schema differs:
// assumed: vendors(id, name, vendor_type)
// ─────────────────────────────────────────────
async function initVendorSection(root, client) {
  const form = $("#adminVendorForm", root);
  const msg = $("#adminVendorMsg", root);
  const idInput = $("#adminVendorId", root);
  const nameInput = $("#adminVendorName", root);
  const typeSelect = $("#adminVendorType", root);
  const clearBtn = $("#adminVendorClear", root);
  const body = $("#adminVendorBody", root);

  const showMsg = (text, type = "info") => {
    if (!msg) return;
    msg.textContent = text;
    msg.style.color =
      type === "error"
        ? "#b91c1c"
        : type === "success"
        ? "#166534"
        : "#6b7280";
  };

  async function loadVendors() {
    if (!body) return;
    body.innerHTML = `<tr><td colspan="2">Loading…</td></tr>`;

    const { data, error } = await client
      .from("vendors")
      .select("id, name, vendor_type")
      .order("name");

    if (error) {
      console.error("[Admin] vendors error", error);
      body.innerHTML = `<tr><td colspan="2">Error loading.</td></tr>`;
      return;
    }

    if (!data || !data.length) {
      body.innerHTML = `<tr><td colspan="2">No vendors found.</td></tr>`;
      return;
    }

    body.innerHTML = "";
    data.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.dataset.name = row.name || "";
      tr.dataset.vendorType = row.vendor_type || "";
      tr.innerHTML = `
        <td>${row.name || ""}</td>
        <td>${row.vendor_type || ""}</td>
      `;
      body.appendChild(tr);
    });
  }

  function clearForm() {
    if (idInput) idInput.value = "";
    if (nameInput) nameInput.value = "";
    if (typeSelect) typeSelect.value = "Subcontractor";
    showMsg("", "info");
  }

  if (body) {
    body.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr || !tr.dataset.id) return;
      if (idInput) idInput.value = tr.dataset.id || "";
      if (nameInput) nameInput.value = tr.dataset.name || "";
      if (typeSelect) typeSelect.value = tr.dataset.vendorType || "Subcontractor";
      showMsg("Editing existing vendor.", "info");
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearForm();
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = idInput?.value || "";
      const name = nameInput?.value.trim();
      const vendor_type = typeSelect?.value || "Subcontractor";

      if (!name) {
        showMsg("Vendor Name is required.", "error");
        return;
      }

      showMsg("Saving…");

      if (id) {
        const { error } = await client
          .from("vendors")
          .update({ name, vendor_type })
          .eq("id", id);

        if (error) {
          console.error(error);
          showMsg(error.message || "Failed to update vendor", "error");
        } else {
          showMsg("Vendor updated.", "success");
          await loadVendors();
        }
      } else {
        const { error } = await client
          .from("vendors")
          .insert({ name, vendor_type });

        if (error) {
          console.error(error);
          showMsg(error.message || "Failed to add vendor", "error");
        } else {
          showMsg("Vendor added.", "success");
          clearForm();
          await loadVendors();
        }
      }
    });
  }

  await loadVendors();
}
