// js/tabs/projectSelect.js
import { $, h } from "../lib/dom.js";
import { setSelectedProject } from "../lib/projectContext.js";

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
            </tr>
          </thead>
          <tbody id="childProjectsBody">
            <tr><td colspan="5">No project selected.</td></tr>
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
    function showMsg(text) {
      if (msg) msg.textContent = text;
    }

    await Promise.all([
      loadPlanVersions(root, client),
      loadLevel1Projects(root, client),
    ]);

    const level1Select = $("#level1ProjectSelect", root);
    if (level1Select) {
      level1Select.addEventListener("change", () => {
        const projectId = level1Select.value || null;
        if (!projectId) {
          renderChildRows(root, []);
          showMsg("Select a level 1 project to view its children.");
        } else {
          loadChildProjects(root, client, projectId);
        }
      });
    }

    showMsg("Select a project to view children.");
  },
};

async function loadPlanVersions(root, client) {
  const sel = $("#planVersionSelect", root);
  if (!sel) return;
  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    sel.innerHTML = `<option value="">Error loading versions</option>`;
    return;
  }

  sel.innerHTML = `<option value="">— Select version —</option>`;
  for (const pv of data) {
    const opt = document.createElement("option");
    opt.value = pv.id;
    opt.textContent = `${pv.code} – ${pv.description}`;
    sel.appendChild(opt);
  }
}

async function loadLevel1Projects(root, client) {
  const sel = $("#level1ProjectSelect", root);
  if (!sel) return;

  // Level 1 projects: project_code with no dot OR first segment only
  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .order("project_code", { ascending: true });

  if (error) {
    console.error(error);
    sel.innerHTML = `<option value="">Error loading projects</option>`;
    return;
  }

  const level1 = data.filter((p) => !p.project_code.includes("."));

  sel.innerHTML = `<option value="">— Select a level 1 project —</option>`;
  for (const p of level1) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.project_code} – ${p.name}`;
    sel.appendChild(opt);
  }
}

async function loadChildProjects(root, client, parentProjectId) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;

  // First get the parent project_code
  const { data: parentArr, error: pErr } = await client
    .from("projects")
    .select("project_code")
    .eq("id", parentProjectId)
    .maybeSingle();

  if (pErr || !parentArr) {
    console.error(pErr);
    tbody.innerHTML = `<tr><td colspan="5">Error loading parent project.</td></tr>`;
    return;
  }

  const prefix = parentArr.project_code + ".";

  const { data, error } = await client
    .from("projects")
    .select("project_code, name, revenue_formula, pop_start, pop_end, funding")
    .like("project_code", `${prefix}%`)
    .order("project_code", { ascending: true });

  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="5">Error loading child projects.</td></tr>`;
    return;
  }

  renderChildRows(root, data);
}

function renderChildRows(root, rows) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody) return;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No child projects found.</td></tr>`;
    return;
  }

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "");
  const fmtMoney = (x) =>
    typeof x === "number"
      ? x.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.project_code}</td>
      <td>${r.name}</td>
      <td>${r.revenue_formula}</td>
      <td>${fmtDate(r.pop_start)} – ${fmtDate(r.pop_end)}</td>
      <td class="num">${fmtMoney(r.funding)}</td>
    `;
    tbody.appendChild(tr);
  }
}
