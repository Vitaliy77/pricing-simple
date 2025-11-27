// js/tabs/projectSelect.js
import { $, h } from "../lib/dom.js";
import { setSelectedProject, setPlanContext } from "../lib/projectContext.js";

export const template = /*html*/ `
  <article>
    <h3>Select Budget & Project</h3>

    <section style="display:flex;flex-wrap:wrap;gap:0.75rem;align-items:flex-end;margin-bottom:0.75rem;">
      <label>
        Plan Year
        <select id="planYearSelect">
          <option value="2026">2026</option>
          <option value="2027">2027</option>
          <option value="2028">2028</option>
        </select>
      </label>

      <label>
        Plan Version
        <select id="planVersionSelect">
          <option value="">Loading…</option>
        </select>
      </label>

      <label>
        Plan Type
        <select id="planTypeSelect">
          <option value="Working">Working</option>
          <option value="Final">Final</option>
        </select>
      </label>

      <label style="min-width:320px;">
        Level 1 Project
        <select id="level1ProjectSelect">
          <option value="">— Select a level 1 project —</option>
        </select>
      </label>
    </section>

    <section id="projMsg" style="min-height:1.25rem;font-size:0.9rem;"></section>

    <section style="margin-top:0.75rem;">
      <h4>Child Projects</h4>
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Project Code</th>
              <th>Name</th>
              <th>Revenue Formula</th>
              <th>Period of Performance</th>
              <th class="num">Funding</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="childProjectsBody">
            <tr><td colspan="6">No project selected.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

export const projectSelectTab = {
  template,
  async init({ root, client }) {
    const msg = $("#projMsg", root);
    const showMsg = (text) => msg && (msg.textContent = text);

    // DOM references
    const yearSel   = $("#planYearSelect", root);
    const verSel    = $("#planVersionSelect", root);
    const typeSel   = $("#planTypeSelect", root);
    const lvl1Sel   = $("#level1ProjectSelect", root);

    // Load initial data
    await Promise.all([
      loadPlanVersions(root, client),
      loadLevel1Projects(root, client),
    ]);

    // PLAN CONTEXT: Update shared context when filters change
    yearSel?.addEventListener("change", () => {
      const year = yearSel.value ? parseInt(yearSel.value, 10) : null;
      setPlanContext({ year });
    });

    verSel?.addEventListener("change", () => {
      const versionId   = verSel.value || null;
      const versionCode = verSel.selectedOptions[0]?.dataset.code || null;
      const versionDesc = verSel.selectedOptions[0]?.textContent || null;
      setPlanContext({ versionId, versionCode, versionDescription: versionDesc });
    });

    typeSel?.addEventListener("change", () => {
      const planType = typeSel.value || "Working";
      setPlanContext({ planType });
    });

    lvl1Sel?.addEventListener("change", () => {
      const projectId   = lvl1Sel.value || null;
      const projectCode = lvl1Sel.selectedOptions[0]?.dataset.code || null;
      const projectName = lvl1Sel.selectedOptions[0]?.dataset.name || null;

      setPlanContext({
        level1ProjectId: projectId,
        level1ProjectCode: projectCode,
        level1ProjectName: projectName,
      });

      if (projectId) {
        loadChildProjects(root, client, projectId);
        showMsg("Loading child projects...");
      } else {
        renderChildRows(root, []);
        showMsg("Select a level 1 project to view children.");
      }
    });

    showMsg("Select a project to view children.");
  },
};

// Load plan versions with data attributes
async function loadPlanVersions(root, client) {
  const sel = $("#planVersionSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;
  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    sel.innerHTML = `<option value="">Error loading versions</option>`;
    return console.error(error);
  }

  sel.innerHTML = `<option value="">— Select version —</option>`;
  data.forEach(pv => {
    const opt = document.createElement("option");
    opt.value = pv.id;
    opt.textContent = `${pv.code} – ${pv.description}`;
    opt.dataset.code = pv.code;
    sel.appendChild(opt);
  });
}

// Load level 1 projects with data-code and data-name
async function loadLevel1Projects(root, client) {
  const sel = $("#level1ProjectSelect", root);
  if (!sel) return;

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .order("project_code", { ascending: true });

  if (error || !data) {
    sel.innerHTML = `<option value="">Error loading projects</option>`;
    return console.error(error);
  }

  const level1 = data.filter(p => !p.project_code.includes("."));

  sel.innerHTML = `<option value="">— Select a level 1 project —</option>`;
  level1.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.project_code} – ${p.name}`;
    opt.dataset.code = p.project_code;
    opt.dataset.name = p.name;
    sel.appendChild(opt);
  });
}

async function loadChildProjects(root, client, parentProjectId) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;

  const { data: parent } = await client
    .from("projects")
    .select("project_code")
    .eq("id", parentProjectId)
    .single();

  if (!parent) {
    tbody.innerHTML = `<tr><td colspan="6">Error loading parent.</td></tr>`;
    return;
  }

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name, revenue_formula, pop_start, pop_end, funding")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="6">Error loading children.</td></tr>`;
    return console.error(error);
  }

  renderChildRows(root, data);
}

function renderChildRows(root, rows) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="6">No child projects found.</td></tr>`;
    return;
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString() : "";
  const fmtMoney = x => typeof x === "number" ? x.toLocaleString() : "";

  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.classList.add("hover:bg-blue-50", "cursor-pointer");
    tr.innerHTML = `
      <td>${r.project_code}</td>
      <td>${r.name}</td>
      <td>${r.revenue_formula || "-"}</td>
      <td>${fmtDate(r.pop_start)} – ${fmtDate(r.pop_end)}</td>
      <td class="num">${fmtMoney(r.funding)}</td>
      <td>
        <button class="text-blue-600 font-medium text-sm hover:underline">
          Select
        </button>
      </td>
    `;

    // SELECT LOWEST-LEVEL PROJECT → update global context
    tr.querySelector("button")?.addEventListener("click", () => {
      setSelectedProject({
        id: r.id,
        project_code: r.project_code,
        name: r.name,
        revenue_formula: r.revenue_formula,
        pop_start: r.pop_start,
        pop_end: r.pop_end,
        funding: r.funding,
      });

      // Optional: visual feedback
      document.querySelectorAll("#childProjectsBody tr").forEach(row => {
        row.classList.remove("bg-blue-100");
      });
      tr.classList.add("bg-blue-100");
    });

    tbody.appendChild(tr);
  });
}
