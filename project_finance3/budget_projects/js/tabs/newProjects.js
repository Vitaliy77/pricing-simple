// js/tabs/newProjects.js
import { $ } from "../lib/dom.js";

export const template = /*html*/ `
  <article class="full-width-card">
    <style>
      .np-form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 0.75rem 1rem;
      }
      .np-form-grid label {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.75rem;
        color: #374151;
      }
      .np-form-grid input,
      .np-form-grid select {
        border-radius: 0.375rem;
        border: 1px solid #cbd5f5;
        padding: 0.35rem 0.5rem;
        font-size: 0.8rem;
      }
      .np-form-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-top: 0.75rem;
      }
      .np-btn-primary {
        background-color: #2563eb;
        color: #ffffff;
        border-radius: 0.375rem;
        padding: 0.4rem 0.9rem;
        font-size: 0.8rem;
        font-weight: 500;
        border: none;
        cursor: pointer;
      }
      .np-btn-primary:hover {
        background-color: #1d4ed8;
      }
      .np-msg {
        font-size: 0.75rem;
      }
    </style>

    <!-- Header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span class="font-medium">Pipeline · TBD Sales</span>
        <span class="ml-2 text-xs text-slate-900 font-semibold">
          · Add New Projects
        </span>
        <span class="text-[11px] text-slate-600 ml-1">
          — Create placeholder (TBD) projects in the <code>projects</code> table.
        </span>
      </div>
      <div id="npMsg" class="np-msg text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- Body -->
    <div class="px-4 py-3">
      <form id="newProjectForm" class="space-y-2" style="max-width:720px;">
        <div class="np-form-grid">
          <label>
            Project Code
            <input
              id="npCode"
              type="text"
              maxlength="25"
              placeholder="e.g. P900001.001.001"
              required
            />
          </label>

          <label>
            Name
            <input
              id="npName"
              type="text"
              placeholder="e.g. TBD Cybersecurity Task Order"
              required
            />
          </label>

          <label>
            Revenue Formula
            <select id="npRevFormula">
              <option value="T&M">T&amp;M</option>
              <option value="CPFF">CPFF</option>
              <option value="Fixed Price">Fixed Price</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label>
            Multiplier
            <input
              id="npMultiplier"
              type="number"
              step="0.0001"
              value="1.0000"
            />
          </label>

          <label>
            Period of Performance Start
            <input id="npPopStart" type="date" required />
          </label>

          <label>
            Period of Performance End
            <input id="npPopEnd" type="date" required />
          </label>

          <label>
            Funding
            <input
              id="npFunding"
              type="number"
              step="0.01"
              placeholder="e.g. 2500000"
              required
            />
          </label>

          <label>
            Project Manager
            <input
              id="npPM"
              type="text"
              placeholder="e.g. Jane Smith"
              required
            />
          </label>
        </div>

        <div class="np-form-actions">
          <button type="submit" class="np-btn-primary">
            Add Project
          </button>
          <span class="text-[11px] text-slate-500">
            New projects are added immediately to the <code>projects</code> table.
          </span>
        </div>
      </form>
    </div>
  </article>
`;

export const newProjectsTab = {
  template,
  init({ root, client }) {
    const form = $("#newProjectForm", root);
    const msg = $("#npMsg", root);

    function showMsg(text, type = "info") {
      if (!msg) return;
      msg.textContent = text;
      msg.style.color =
        type === "error"
          ? "#b91c1c"
          : type === "success"
          ? "#166534"
          : "#6b7280";
    }

    if (!form) return;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const project_code = $("#npCode", root).value.trim();
      const name = $("#npName", root).value.trim();
      const revenue_formula = $("#npRevFormula", root).value;
      const multiplier = parseFloat($("#npMultiplier", root).value || "1");
      const pop_start = $("#npPopStart", root).value;
      const pop_end = $("#npPopEnd", root).value;
      const funding = parseFloat($("#npFunding", root).value || "0");
      const project_manager = $("#npPM", root).value.trim();

      if (!project_code || !name) {
        showMsg("Project Code and Name are required.", "error");
        return;
      }

      showMsg("Saving…");

      const { error } = await client.from("projects").insert({
        project_code,
        name,
        revenue_formula,
        multiplier,
        pop_start,
        pop_end,
        project_manager,
        funding,
      });

      if (error) {
        console.error(error);
        showMsg(error.message || "Failed to save project", "error");
      } else {
        showMsg("Project added.", "success");
        form.reset();
      }
    });
  },
};
