// js/tabs/revenueBudget.js
import { $, h } from "../lib/dom.js";
import { getPlanContext } from "../lib/projectContext.js";

// Month mapping
const MONTH_FIELDS = [
  { col: "amt_jan", idx: 0, label: "Jan" },
  { col: "amt_feb", idx: 1, label: "Feb" },
  { col: "amt_mar", idx: 2, label: "Mar" },
  { col: "amt_apr", idx: 3, label: "Apr" },
  { col: "amt_may", idx: 4, label: "May" },
  { col: "amt_jun", idx: 5, label: "Jun" },
  { col: "amt_jul", idx: 6, label: "Jul" },
  { col: "amt_aug", idx: 7, label: "Aug" },
  { col: "amt_sep", idx: 8, label: "Sep" },
  { col: "amt_oct", idx: 9, label: "Oct" },
  { col: "amt_nov", idx: 10, label: "Nov" },
  { col: "amt_dec", idx: 11, label: "Dec" },
];

let projectScope = [];
let projectMeta = {};

export const template = /*html*/ `
  <article class="full-width-card">
    <style>
      .rev-table-wrapper {
        position: relative;
        width: 100%;
        max-height: 520px;
        overflow-y: auto;
        overflow-x: auto;
      }

      .rev-table {
        border-collapse: separate;
        border-spacing: 0;
        width: max-content;
        min-width: 100%;
      }

      .rev-table th,
      .rev-table td {
        padding: 2px 4px;
        white-space: nowrap;
        background-clip: padding-box;
      }

      /* Sticky columns — fully opaque and always on top */
      .rev-sticky-1,
      .rev-sticky-2,
      .rev-sticky-3 {
        position: sticky;
        z-index: 40;
        background-color: #f8fafc;
      }

      .rev-sticky-1 { left: 0; }
      .rev-sticky-2 { left: 12rem; }     /* Project width */
      .rev-sticky-3 { left: calc(12rem + 10rem); } /* Project + Type */

      .rev-col-project { width: 12rem; }
      .rev-col-type    { width: 10rem; }
      .rev-col-desc    { width: 18rem; }

      .rev-row-striped:nth-child(odd)  { background-color: #eff6ff; }
      .rev-row-striped:nth-child(even) { background-color: #ffffff; }
      .rev-row-striped:hover           { background-color: #dbeafe; }

      .rev-summary-row {
        background-color: #e5e7eb;
        font-weight: 600;
        position: sticky;
        bottom: 0;
        z-index: 30;
      }

      .rev-num-input {
        width: 5.2rem;
        text-align: right;
        border: 1px solid #cbd5f5;
        border-radius: 3px;
        padding: 0 4px;
        font-size: 11px;
        height: 1.4rem;
        background-color: #ffffff;
      }
    </style>

    <!-- Header + controls -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span id="revInlinePlan" class="font-medium"></span>
        <span id="revInlineProject"></span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Revenue Budget
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Revenue by project and type (T&amp;M, Fixed, Software, Subs &amp; ODC, etc.).
        </span>
      </div>

      <div id="revMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>

      <div class="mt-1 flex flex-wrap items-end gap-3 text-xs">
        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Project</span>
          <select id="revProjectSelect" class="min-w-[220px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select project —</option>
          </select>
        </label>

        <label class="flex flex-col">
          <span class="mb-0.5 text-[11px] text-slate-700">Revenue Type</span>
          <select id="revTypeSelect" class="min-w-[160px] px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="FIXED">Fixed</option>
            <option value="SOFTWARE">Software</option>
            <option value="UNIT">Unit</option>
            <option value="OTHER">Other</option>
          </select>
        </label>

        <button id="addRevLineBtn" class="px-3 py-1.5 text-xs font-medium rounded-md shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          + Add Revenue Line
        </button>
      </div>
    </div>

    <!-- Table with proper wrapper for sticky headers + columns -->
    <div class="rev-table-wrapper">
      <table class="rev-table text-xs">
        <thead class="bg-slate-50">
          <tr>
            <th class="rev-sticky-1 rev-col-project sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Project</th>
            <th class="rev-sticky-2 rev-col-type sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Type</th>
            <th class="rev-sticky-3 rev-col-desc sticky top-0 bg-slate-50 text-left text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Description</th>
            ${MONTH_FIELDS.map(m => `
              <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                ${m.label}
              </th>`
            ).join("")}
            <th class="sticky top-0 bg-slate-50 text-right text-[11px] font-semibold text-slate-700 uppercase tracking-wider">Total</th>
          </tr>
        </thead>
        <tbody id="revBody" class="bg-white">
          <tr>
            <td colspan="16" class="text-center py-10 text-slate-500 text-xs">Loading…</td>
          </tr>
        </tbody>
      </table>
    </div>
  </article>
`;

// ─────────────────────────────────────────────
// [Rest of your code remains 100% unchanged below]
// ─────────────────────────────────────────────

// TAB INIT, loadProjectsUnderLevel1, loaders, refreshRevenue, renderRevenue,
// insertManualRevenueLine, handleRevenueChange — all exactly as you had them.

// (Just confirming: no logic changes needed — only the <style> block and wrapper div were upgraded)

export const revenueBudgetTab = { template, init: /* ... same as before */ };
// ... all your existing functions below remain identical ...
