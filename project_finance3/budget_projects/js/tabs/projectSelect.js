// js/tabs/projectSelect.js
import { $, h } from "../lib/dom.js";
import { setSelectedProject, setPlanContext, getPlanContext } from "../lib/projectContext.js";
import { client } from "../api/supabase.js";

export const template = /*html*/ `
  <article>
    <h3 style="margin-bottom:0.5rem;">Select Budget & Project</h3>
    <p style="font-size:0.9rem;margin-bottom:0.75rem;">
      Choose a plan year, version, plan type, and a level 1 project. Then pick a
      specific lowest-level project to work with. Your selections will carry over
      to the other tabs (Revenue, Cost, P&L).
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

      <label style="min-width:320px;">
        Level 1 Project
        <select id="level1ProjectSelect">
          <option value="">Loading…</option>
        </select>
      </label>
    </section>

    <section id="projMessage" style="min-height:1.25rem;font-size:0.9rem;color:#64748b;"></section>

    <!-- Child projects table -->
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
    const verSel  = $("#planVersionSelect", root);
    const typeSel = $("#planTypeSelect", root);
    const lvl1Sel = $("#level1ProjectSelect", root);

    // Load data
    await Promise.all([
      loadPlanVersions(root),
      loadLevel1Projects(root),  // now safe – no .eq("level", 1)
    ]);

    // Restore previous context
    const ctx = getPlanContext();
    if (ctx.year && yearSel) yearSel.value = String(ctx.year);
    if (ctx.planType && typeSel) typeSel.value = ctx.planType;
    if (ctx.versionId && verSel) verSel.value = ctx.versionId;
    if (ctx.level1ProjectId && lvl1Sel) {
      lvl1Sel.value = ctx.level1ProjectId;
      await loadChildProjects(root, ctx.level1ProjectId);
    }

    // Wire events
    yearSel?.addEventListener("change", () => {
      setPlanContext({ year: yearSel.value ? parseInt(yearSel.value, 10) : null });
    });

    verSel?.addEventListener("change", () => {
      const versionId = verSel.value || null;
      const versionCode = verSel.selectedOptions[0]?.dataset?.code || null;
      setPlanContext({ versionId, versionCode });
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

      setSelectedProject(null); // clear previous selection
      if (id) {
        await loadChildProjects(root, id);
      } else {
        $("#childProjectsBody", root).innerHTML = `<tr><td colspan="5">Select a Level 1 project above.</td></tr>`;
      }
    });

    msg && (msg.textContent = "Ready – select a project to begin.");
  },
};

// Load plan versions
async function loadPlanVersions(root) {
  const sel = $("#planVersionSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Plan versions error:", error);
    sel.innerHTML = `<option value="">Error loading versions</option>`;
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

// FIXED: No more .eq("level", 1) → works even without level column
async function loadLevel1Projects(root) {
  const sel = $("#level1ProjectSelect", root);
  if (!sel) return;

  sel.innerHTML = `<option value="">Loading…</option>`;

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .order("project_code", { ascending: true });

  if (error) {
    console.error("Error loading projects:", error);
    sel.innerHTML = `<option value="">Error loading projects</option>`;
    return;
  }

  // Filter Level 1 projects by project_code: those with no dot in code (e.g. "ABC" but not "ABC.01")
  const level1Projects = data.filter(p => !p.project_code.includes("."));

  sel.innerHTML = `<option value="">— Select a Level 1 project —</option>`;
  level1Projects.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.dataset.code = p.project_code;
    opt.dataset.name = p.name;
    opt.textContent = `${p.project_code} – ${p.name}`;
    sel.appendChild(opt);
  });
}

async function loadChildProjects(root, level1ProjectId) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="5">Loading…</td></tr>`;

  // Get the parent project_code first
  const { data: parent } = await client
    .from("projects")
    .select("project_code")
    .eq("id", level1ProjectId)
    .single();

  if (!parent) {
    tbody.innerHTML = `<tr><td colspan="5">Parent project not found.</td></tr>`;
    return;
  }

  const prefix = `${parent.project_code}.`;

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name, revenue_formula, pop_start, pop_end, funding")
    .like("project_code", `${prefix}%`)
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

    const funding = proj.funding != null
      ? Number(proj.funding).toLocaleString()
      : "";

    tr.innerHTML = `
      <td><strong>${proj.project_code}</strong></td>
      <td>${proj.name}</td>
      <td>${proj.revenue_formula || ""}</td>
      <td>${pop}</td>
      <td class="num">${funding}</td>
    `;

    tr.addEventListener("click", () => {
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
