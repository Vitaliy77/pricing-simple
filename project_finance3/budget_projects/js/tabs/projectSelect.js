// js/tabs/projectSelect.js
import { $, h } from "../lib/dom.js";
import { setSelectedProject, setPlanContext, getPlanContext } from "../lib/projectContext.js";
import { client } from "../api/supabase.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Select Budget &amp; Project</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;">
      Choose a plan year, version, plan type, and a level 1 project. Then pick a
      specific lowest-level project to work with. Your selections will carry over
      to the other tabs (Revenue, Cost, P&amp;L).
    </p>

    <!-- Filters -->
    <section style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.75rem;">
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

      <label>
        Level 1 Project
        <select id="level1ProjectSelect">
          <option value="">Loading…</option>
        </select>
      </label>
    </section>

    <section id="projMessage" style="min-height:1.25rem;font-size:0.9rem;"></section>

    <!-- Child projects table -->
    <section style="margin-top:0.75rem;">
      <h4 style="margin-bottom:0.35rem;font-size:0.95rem;">Child Projects (select one)</h4>
      <div class="scroll-x">
        <table class="data-grid">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Revenue Formula</th>
              <th>PoP</th>
              <th>Funding</th>
            </tr>
          </thead>
          <tbody id="childProjectsBody">
            <tr><td colspan="5">Select a Level 1 project to view child projects.</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
`;

export const projectSelectTab = {
  template,
  async init({ root }) {
    const msg = $("#projMessage", root);
    const yearSel = $("#planYearSelect", root);
    const verSel  = $("#planVersionSelect", root);
    const typeSel = $("#planTypeSelect", root);
    const lvl1Sel = $("#level1ProjectSelect", root);

    // 1) Load plan versions & level 1 projects
    await Promise.all([
      loadPlanVersions(root),
      loadLevel1Projects(root),
    ]);

    // 2) Pre-fill from existing context, if any
    const ctx = getPlanContext();
    if (ctx.year && yearSel) {
      yearSel.value = String(ctx.year);
    }
    if (ctx.planType && typeSel) {
      typeSel.value = ctx.planType;
    }
    if (ctx.level1ProjectId && lvl1Sel) {
      lvl1Sel.value = ctx.level1ProjectId;
      // also load children for this L1 project
      await loadChildProjects(root, ctx.level1ProjectId);
    }

    if (ctx.versionId && verSel) {
      verSel.value = ctx.versionId;
    }

    // 3) Wire event handlers to update context + reload children
    yearSel?.addEventListener("change", () => {
      const year = yearSel.value ? parseInt(yearSel.value, 10) : null;
      setPlanContext({ year });
    });

    verSel?.addEventListener("change", () => {
      const versionId   = verSel.value || null;
      const versionCode = verSel.selectedOptions[0]?.dataset?.code || null;
      setPlanContext({ versionId, versionCode });
    });

    typeSel?.addEventListener("change", () => {
      const planType = typeSel.value || "Working";
      setPlanContext({ planType });
    });

    lvl1Sel?.addEventListener("change", async () => {
      const level1ProjectId   = lvl1Sel.value || null;
      const level1ProjectCode = lvl1Sel.selectedOptions[0]?.dataset?.code || null;
      const level1ProjectName = lvl1Sel.selectedOptions[0]?.dataset?.name || null;

      setPlanContext({
        level1ProjectId,
        level1ProjectCode,
        level1ProjectName,
      });

      setSelectedProject(null);   // clear previous low-level selection
      await loadChildProjects(root, level1ProjectId);
    });

    if (msg) msg.textContent = "Select filters and a project to work with.";
  },
};

// ---------- helpers ----------

async function loadPlanVersions(root) {
  const sel = $("#planVersionSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description, sort_order")
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
    opt.dataset.code = pv.code;
    opt.textContent = `${pv.code} – ${pv.description}`;
    sel.appendChild(opt);
  }
}

async function loadLevel1Projects(root) {
  const sel = $("#level1ProjectSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .eq("level", 1)
    .order("project_code", { ascending: true });

  if (error) {
    console.error(error);
    sel.innerHTML = `<option value="">Error loading projects</option>`;
    return;
  }

  sel.innerHTML = `<option value="">— Select a level 1 project —</option>`;
  for (const p of data) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.dataset.code = p.project_code;
    opt.dataset.name = p.name;
    opt.textContent = `${p.project_code} – ${p.name}`;
    sel.appendChild(opt);
  }
}

async function loadChildProjects(root, level1ProjectId) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody) return;

  if (!level1ProjectId) {
    tbody.innerHTML = `<tr><td colspan="5">Select a Level 1 project to view child projects.</td></tr>`;
    return;
  }

  tbody.innerHTML = `<tr><td colspan="5">Loading child projects…</td></tr>`;

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name, revenue_formula, pop_start, pop_end, funding, parent_project_id, level")
    .eq("parent_project_id", level1ProjectId)
    .order("project_code", { ascending: true });

  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="5">Error loading child projects.</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No child projects found for this Level 1 project.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  for (const proj of data) {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";

    const pop =
      (proj.pop_start || "") && (proj.pop_end || "")
        ? `${proj.pop_start} – ${proj.pop_end}`
        : "";

    const funding = proj.funding != null
      ? proj.funding.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "";

    tr.innerHTML = `
      <td>${proj.project_code}</td>
      <td>${proj.name}</td>
      <td>${proj.revenue_formula || ""}</td>
      <td>${pop}</td>
      <td class="num">${funding}</td>
    `;

    tr.addEventListener("click", () => {
      // 🔵 This is the key: set selected project in shared context & header
      setSelectedProject({
        id: proj.id,
        project_code: proj.project_code,
        name: proj.name,
      });

      // highlight the selected row
      Array.from(tbody.querySelectorAll("tr")).forEach((row) => {
        row.classList.remove("selected-row");
      });
      tr.classList.add("selected-row");
    });

    tbody.appendChild(tr);
  }
}
