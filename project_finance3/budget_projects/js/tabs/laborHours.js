// js/tabs/laborHours.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

const MONTHS = [
  { key: "jan", label: "Jan", idx: 0 },
  { key: "feb", label: "Feb", idx: 1 },
  { key: "mar", label: "Mar", idx: 2 },
  { key: "apr", label: "Apr", idx: 3 },
  { key: "may", label: "May", idx: 4 },
  { key: "jun", label: "Jun", idx: 5 },
  { key: "jul", label: "Jul", idx: 6 },
  { key: "aug", label: "Aug", idx: 7 },
  { key: "sep", label: "Sep", idx: 8 },
  { key: "oct", label: "Oct", idx: 9 },
  { key: "nov", label: "Nov", idx: 10 },
  { key: "dec", label: "Dec", idx: 11 },
];

export const template = /*html*/ `
  <article class="full-width-card w-full">
    <style>
      .labor-table {
        border-collapse: separate;
        border-spacing: 0;
        width: 100%;
        min-width: 100%;
        table-layout: auto;
      }

      .labor-table th,
      .labor-table td {
        padding: 2px 6px;
        white-space: nowrap;
        border-right: none;
        border-bottom: 1px solid #e2e8f0;
        background-clip: padding-box;
      }

      .labor-cell-input {
        width: 3.2rem;
        min-width: 3.2rem;
        max-width: 3.2rem;
        text-align: right;
        font-variant-numeric: tabular-nums;
        height: 1.5rem;
        line-height: 1.5rem;
        padding: 0 4px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        background: #ffffff !important;
      }

      /* NEW: Warning style when >200 hours entered */
      .labor-cell-warning {
        background-color: #fef9c3 !important; /* yellow-100 */
        border-color: #facc15 !important;     /* yellow-400 */
      }

      .no-spin { -moz-appearance: textfield; }
      .no-spin::-webkit-inner-spin-button,
      .no-spin::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      /* sticky columns */
      .labor-col-project  { width: 9rem;  min-width: 9rem; }
      .labor-col-employee { width: 10rem; min-width: 10rem; }
      .labor-col-dept     { width: 15rem; min-width: 15rem; }

      .labor-sticky-1,
      .labor-sticky-2,
      .labor-sticky-3 {
        position: sticky;
        z-index: 30;
      }

      .labor-sticky-1 { left: 0; }
      .labor-sticky-2 { left: 9rem; }
      .labor-sticky-3 { left: calc(9rem + 10rem); }

      .labor-table thead th.labor-sticky-1,
      .labor-table thead th.labor-sticky-2,
      .labor-table thead th.labor-sticky-3 {
        background-color: #f8fafc;
        z-index: 40;
      }

      .labor-row-striped:nth-child(odd)  { background-color: #f8fafc; }
      .labor-row-striped:nth-child(even) { background-color: #ffffff; }
      .labor-row-striped:hover           { background-color: #dbeafe; }
      .labor-row-active                  { background-color: #bfdbfe !important; }

      .labor-summary-row {
        background-color: #e5e7eb !important;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 25;
      }
    </style>

    <!-- Compact header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="laborInlinePlan" class="font-medium"></span>
        <span id="laborInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">· Labor Hours</span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Enter hours per month for employees on projects under the selected Level 1 project.
        </span>
      </div>
      <div id="laborHoursMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- Main grid -->
    <section class="border-t border-slate-200" id="laborHoursSection" style="display:none;">
      <div class="px-4 py-2 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select id="laborProjectSelect" class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select project —</option>
          </select>
        </label>
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Employee</span>
          <select id="laborEmployeeSelect" class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select employee —</option>
          </select>
        </label>
        <button id="assignEmployeeBtn" class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Assign Employee to Project
        </button>
      </div>

      <div class="w-full max-h-[520px] overflow-y-auto overflow-x-auto">
        <table class="labor-table text-xs">
          <thead class="bg-slate-50">
            <tr>
              <th class="labor-sticky-1 labor-col-project sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Project
              </th>
              <th class="labor-sticky-2 labor-col-employee sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Employee
              </th>
              <th class="labor-sticky-3 labor-col-dept sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Department / Labor Category
              </th>
              ${MONTHS.map(m => `
                <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  ${m.label}
                </th>`).join("")}
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                Total Hrs
              </th>
            </tr>
          </thead>
          <tbody id="laborHoursTbody" class="bg-white">
            <tr>
              <td colspan="16" class="text-center py-10 text-slate-500 text-xs">
                Loading…
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

// ... [all your existing helper functions remain unchanged: fmtNum, computeRowTotal, etc.]

// UPDATED: Smart change handler with 200-hour clamp + visual warning
function wireGridEvents(root, client, ctx) {
  const tbody = $("#laborHoursTbody", root);
  if (!tbody) return;

  tbody.querySelectorAll("input[data-row][data-month]").forEach((inp) => {
    inp.addEventListener("change", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;

      const rowIdx = Number(target.dataset.row);
      const monthKey = target.dataset.month;
      if (Number.isNaN(rowIdx) || !monthKey) return;

      const row = rows[rowIdx];
      if (!row) return;

      const ym = row.ymMap[monthKey];
      let raw = target.value.trim();

      // Empty cell → null (no highlight, no save)
      if (raw === "") {
        row.months[ym] = null;
        target.classList.remove("labor-cell-warning");
      } else {
        let num = Number.parseFloat(raw);

        if (Number.isNaN(num)) {
          // invalid input → reset to previous value
          num = row.months[ym] || 0;
          target.value = fmtNum(num);
        }

        // Clamp to 200 and highlight if exceeded
        if (num > 200) {
          num = 200;
          target.value = "200";
          target.classList.add("labor-cell-warning");
        } else {
          target.classList.remove("labor-cell-warning");
        }

        row.months[ym] = num;
      }

      // Update row total
      const totalCell = root.querySelector(`[data-total-row="${rowIdx}"]`);
      if (totalCell) {
        totalCell.textContent = computeRowTotal(row).toLocaleString(undefined, {
          maximumFractionDigits: 2,
        });
      }

      updateLaborTotals(root);

      // Save clamped/valid value to DB
      await upsertHourCell(client, ctx, row, monthKey, row.months[ym]);
    });
  });

  // Row selection highlight
  tbody.querySelectorAll("tr.labor-row-striped").forEach((tr) => {
    tr.addEventListener("click", () => {
      tbody
        .querySelectorAll("tr.labor-row-striped")
        .forEach((r) => r.classList.remove("labor-row-active"));
      tr.classList.add("labor-row-active");
    });
  });
}

// ... [rest of your file — load functions, init, etc. — completely unchanged]
