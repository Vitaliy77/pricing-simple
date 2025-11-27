// js/tabs/newProjects.js
import { $ } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>Add New Projects (TBD Sales)</h3>
    <p style="margin-bottom:0.5rem;">
      Use this tab to create TBD projects in the <code>projects</code> table.
    </p>

    <form id="newProjectForm" class="form-vertical" style="max-width:520px;">
      <label>
        Project Code
        <input id="npCode" type="text" maxlength="25" placeholder="e.g. P900001.001.001" required />
      </label>
      <label>
        Name
        <input id="npName" type="text" required />
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
        <input id="npMultiplier" type="number" step="0.0001" value="1.0000" />
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
        <input id="npFunding" type="number" step="0.01" required />
      </label>
      <label>
        Project Manager
        <input id="npPM" type="text" required />
      </label>
      <button type="submit">Add Project</button>
      <small id="npMsg"></small>
    </form>
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
        type === "error" ? "#b91c1c" : type === "success" ? "#166534" : "#374151";
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
