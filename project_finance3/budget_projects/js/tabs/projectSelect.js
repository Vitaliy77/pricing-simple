// js/tabs/projectSelect.js
import { $, h } from "../lib/dom.js";
import {
  setSelectedProject,
  setPlanContext,
  getPlanContext,
} from "../lib/projectContext.js";
import { client } from "../api/supabase.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Select Budget & Project</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;color:#475569;">
      Choose a plan year, version, plan type, and a level 1 project. Then click a child project to work with.
      Your selection will carry over to Revenue, Cost, and P&L tabs.
    </p>

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

      <label style="min-width:340px;">
        Level 1 Project
        <select id="level1ProjectSelect">
          <option value="">Loading…</option>
        </select>
      </label>
    </section>

    <section id="projMessage" style="min-height:1.25rem;font-size:0.9rem;color:#64748b;margin-bottom:0.75rem;"></section>

    <section style="margin-top:0.75rem;">
      <h4 style="margin-bottom:0.35rem;font-size:0.95rem;">Child Projects (click to select)</h4>
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
            <tr><td colspan="5">Select a Level 1 project above.</td></tr>
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
    const verSel = $("#planVersionSelect", root);
    const typeSel = $("#planTypeSelect", root);
    const lvl1Sel = $("#level1ProjectSelect", root);

    // Load data
    await Promise.all([
      loadPlanVersions(root),
      loadLevel1Projects(root),
    ]);

    // Restore previous context
    const ctx = getPlanContext();
    if (ctx.year) yearSel.value = String(ctx.year);
    if (ctx.planType) typeSel.value = ctx.planType;
    if (ctx.versionId) verSel.value = ctx.versionId;
    if (ctx.level1ProjectId) {
      lvl1Sel.value = ctx.level1ProjectId;
      await loadChildProjects(root, ctx.level1ProjectId);
    }

    // Event Listeners
    yearSel?.addEventListener("change", () => {
      setPlanContext({ year: yearSel.value ? parseInt(yearSel.value, 10) : null });
    });

    verSel?.addEventListener("change", () => {
      const versionId = verSel.value || null;
      const versionLabel = verSel.selectedOptions[0]?.textContent || null;
      const versionCode = verSel.selectedOptions[0]?.dataset?.code || null;

      setPlanContext({ versionId, versionLabel, versionCode });
    });

    typeSel?.addEventListener("change", () => {
      setPlanContext({ planType: typeSel.value || "Working" });
    });

    lvl1Sel?.addEventListener("change", async () => {
      const id = lvl1Sel.value || null;
      const code = lvl1Sel.selectedOptions[0]?.dataset?.code || null;
      const name = lvl1Sel.selectedOptions[0]?.dataset?.name || null;

      setPlanContext({
        level1ProjectId: id,
        level1ProjectCode: code,
        level1ProjectName: name,
      });

      setSelectedProject(null); // Clear previous child selection

      if (id) {
        await loadChildProjects(root, id);
      } else {
        $("#childProjectsBody", root).innerHTML = `<tr><td colspan="5">Select a Level 1 project above.</td></tr>`;
      }
    });

    msg.textContent = "Ready – select a project to begin.";
  },
};

// Load Plan Versions
async function loadPlanVersions(root) {
  const sel = $("#planVersionSelect", root);
  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error || !data) {
    sel.innerHTML = `<option value="">Error loading versions</option>`;
    console.error(error);
    return;
  }

  sel.innerHTML = `<option value="">— Select version —</option>`;
  data.forEach(pv => {
    const opt = document.createElement("option");
    opt.value = pv.id;
    opt.dataset.code = pv.code;
    opt.textContent = `${pv.code} – ${pv.description}`;
    sel.appendChild(opt);
  });
}

// Load Level 1 Projects
async function loadLevel1Projects(root) {
  const sel = $("#level1ProjectSelect", root);
  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .order("project_code");

  if (error || !data) {
    sel.innerHTML = `<option value="">Error loading projects</option>`;
    console.error(error);
    return;
  }

  const level1 = data.filter(p => !p.project_code.includes("."));

  sel.innerHTML = `<option value="">— Select Level 1 Project —</option>`;
  level1.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.dataset.code = p.project_code;
    opt.dataset.name = p.name;
    opt.textContent = `${p.project_code} – ${p.name}`;
    sel.appendChild(opt);
  });
}

// Load Child Projects + CRITICAL: setSelectedProject() on click
async function loadChildProjects(root, level1ProjectId) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody || !level1ProjectId) {
    tbody && (tbody.innerHTML = `<tr><td colspan="5">Select a Level 1 project above.</td></tr>`);
    return;
  }

  tbody.innerHTML = `<tr><td colspan="5">Loading child projects…</td></tr>`;

  const { data: parent } = await client
    .from("projects")
    .select("project_code")
    .eq("id", level1ProjectId)
    .single();

  if (!parent) {
    tbody.innerHTML = `<tr><td colspan="5">Parent project not found.</td></tr>`;
    return;
  }

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name, revenue_formula, pop_start, pop_end, funding")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="5">No child projects found.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  data.forEach(proj => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.classList.add("hover:bg-blue-50", "transition-colors");

    const pop = proj.pop_start && proj.pop_end
      ? `${new Date(proj.pop_start).toLocaleDateString()} – ${new Date(proj.pop_end).toLocaleDateString()}`
      : "";

    const funding = proj.funding ? Number(proj.funding).toLocaleString() : "";

    tr.innerHTML = `
      <td><strong>${proj.project_code}</strong></td>
      <td>${proj.name}</td>
      <td>${proj.revenue_formula || ""}</td>
      <td>${pop}</td>
      <td class="num">${funding}</td>
    `;

    tr.addEventListener("click", () => {
      console.log("[ProjectSelect] Setting selected project:", proj);

      setSelectedProject({
        id: proj.id,
        project_code: proj.project_code,
        name: proj.name,
      });

      // Visual feedback
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("bg-blue-100"));
      tr.classList.add("bg-blue-100", "font-medium");
    });

    tbody.appendChild(tr);
  });
}
