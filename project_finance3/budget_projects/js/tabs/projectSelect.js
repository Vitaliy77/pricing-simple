// js/tabs/projectSelect.js
import { $, h } from "../lib/dom.js";
import {
  setSelectedProject,
  setPlanContext,
  getPlanContext,
} from "../lib/projectContext.js";
import { client } from "../api/supabase.js";

export const template = /*html*/`
  <article class="full-width-card">
    <!-- HEADER -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <h3 class="text-sm font-semibold text-slate-900">
        Select Budget &amp; Project
      </h3>
      <p class="mt-1 text-[11px] text-slate-600">
        Choose a plan year, version, plan type, and a Level 1 project. Then click a child project to work with.
        Your selection will carry over to Revenue, Cost, and P&amp;L tabs.
      </p>
    </div>

    <!-- BODY -->
    <div class="px-4 py-3 space-y-3">
      <!-- Plan selectors -->
      <section class="flex flex-wrap gap-3 items-end text-xs">
        <label class="flex flex-col min-w-[110px]">
          <span class="mb-0.5 text-[11px] text-slate-700">Plan Year</span>
          <select id="planYearSelect" class="px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
          </select>
        </label>

        <label class="flex flex-col min-w-[180px]">
          <span class="mb-0.5 text-[11px] text-slate-700">Plan Version</span>
          <select id="planVersionSelect" class="px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Loading...</option>
          </select>
        </label>

        <label class="flex flex-col min-w-[140px]">
          <span class="mb-0.5 text-[11px] text-slate-700">Plan Type</span>
          <select id="planTypeSelect" class="px-2 py-1 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="Working">Working</option>
            <option value="Final">Final</option>
          </select>
        </label>

        <label class="flex flex-col min-w-[320px] flex-1">
          <span class="mb-0.5 text-[11px] text-slate-700">Level 1 Project</span>
          <select id="level1ProjectSelect" class="px-2 py-1 border border-slate-300 rounded-md text-xs w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Loading...</option>
          </select>
        </label>
      </section>

      <!-- Message -->
      <section id="projMessage" class="min-h-[1.25rem] text-[11px] text-slate-500"></section>

      <!-- Child projects table -->
      <section class="space-y-1">
        <h4 class="text-[11px] font-semibold text-slate-800 uppercase tracking-wide">
          Child Projects
          <span class="font-normal normal-case text-[11px] text-slate-500">
            (click to select)
          </span>
        </h4>
        <div class="scroll-x border border-slate-200 rounded-md bg-white overflow-x-auto">
          <table class="data-grid text-xs w-full">
            <thead class="bg-slate-50">
              <tr>
                <th class="text-left">Code</th>
                <th class="text-left">Name</th>
                <th class="text-left">Revenue Formula</th>
                <th class="text-left">PoP</th>
                <th class="text-right">Funding</th>
              </tr>
            </thead>
            >
            <tbody id="childProjectsBody">
              <tr>
                <td colspan="5" class="text-center text-[11px] text-slate-500 py-4">
                  Select a Level 1 project above.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
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

    // Load dropdowns
    await Promise.all([
      loadPlanVersions(root),
      loadLevel1Projects(root),
    ]);

    const ctx = getPlanContext();

    // Set defaults from context (or pick first option)
    yearSel.value = ctx.year ?? yearSel.options[0]?.value ?? "2026";
    typeSel.value = ctx.planType ?? "Working";

    if (ctx.versionId && verSel.querySelector(`option[value="${ctx.versionId}"]`)) {
      verSel.value = ctx.versionId;
    } else if (verSel.options.length > 1) {
      verSel.selectedIndex = 1;
    }

    if (ctx.level1ProjectId && lvl1Sel.querySelector(`option[value="${ctx.level1ProjectId}"]`)) {
      lvl1Sel.value = ctx.level1ProjectId;
      await loadChildProjects(root, ctx.level1ProjectId);
    } else if (lvl1Sel.options.length > 1) {
      lvl1Sel.selectedIndex = 1;
      const firstId = lvl1Sel.value;
      setPlanContext({ level1ProjectId: firstId });
      await loadChildProjects(root, firstId);
    }

    // Event listeners
    yearSel.addEventListener("change", () => {
      setPlanContext({ year: parseInt(yearSel.value, 10) || null });
    });

    verSel.addEventListener("change", () => {
      const opt = verSel.selectedOptions[0];
      setPlanContext({
        versionId: verSel.value || null,
        versionLabel: opt?.textContent.trim() || null,
        versionCode: opt?.dataset.code || null,
      });
    });

    typeSel.addEventListener("change", () => {
      setPlanContext({ planType: typeSel.value });
    });

    lvl1Sel.addEventListener("change", async () => {
      const opt = lvl1Sel.selectedOptions[0];
      const id = opt?.value || null;
      setPlanContext({
        level1ProjectId: id,
        level1ProjectCode: opt?.dataset.code || null,
        level1ProjectName: opt?.dataset.name || null,
      });
      setSelectedProject(null);
      await loadChildProjects(root, id);
    });

    msg.textContent = "Ready – select a project to begin.";
  },
};

// Load Plan Versions
async function loadPlanVersions(root) {
  const sel = $("#planVersionSelect", root);
  sel.innerHTML = '<option value="">Loading versions...</option>';

  const { data, error } = await client
    .from("plan_versions")
    .select("id, code, description")
    .order("sort_order", { ascending: true });

  if (error || !data?.length) {
    sel.innerHTML = '<option value="">Error loading versions</option>';
    console.error("[ProjectSelect] Plan versions error:", error);
    return;
  }

  sel.innerHTML = '<option value="">– Select version –</option>';
  data.forEach(pv => {
    const opt = new Option(`${pv.code} - ${pv.description}`, pv.id);
    opt.dataset.code = pv.code;
    sel.appendChild(opt);
  });
}

// Load Level 1 Projects
async function loadLevel1Projects(root) {
  const sel = $("#level1ProjectSelect", root);
  sel.innerHTML = '<option value="">Loading projects...</option>';

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name")
    .order("project_code");

  if (error || !data) {
    sel.innerHTML = '<option value="">Error loading projects</option>';
    console.error("[ProjectSelect] Projects error:", error);
    return;
  }

  const level1 = data.filter(p => !p.project_code.includes("."));

  sel.innerHTML = '<option value="">– Select Level 1 project –</option>';
  level1.forEach(p => {
    const opt = new Option(`${p.project_code} - ${p.name}`, p.id);
    opt.dataset.code = p.project_code;
    opt.dataset.name = p.name;
    sel.appendChild(opt);
  });
}

// Load Child Projects
async function loadChildProjects(root, level1ProjectId) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody) return;

  if (!level1ProjectId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-[11px] text-slate-500 py-4">Select a Level 1 project above.</td></tr>';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-[11px] text-slate-500 py-4">Loading...</td></tr>';

  // Get parent project_code
  const { data: parent } = await client
    .from("projects")
    .select("project_code")
    .eq("id", level1ProjectId)
    .single();

  if (!parent) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-[11px] text-slate-500 py-4">Parent project not found.</td></tr>';
    return;
  }

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name, revenue_formula, pop_start, pop_end, funding")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-[11px] text-slate-500 py-4">No child projects found.</td></tr>';
    return;
  }

  tbody.innerHTML = "";

  data.forEach(proj => {
    // Fixed: safe multi-line ternary with parentheses
    const pop = proj.pop_start && proj.pop_end
      ? `${new Date(proj.pop_start).toLocaleDateString()} – ${new Date(proj.pop_end).toLocaleDateString()}`
      : "";

    const funding = proj.funding ? Number(proj.funding).toLocaleString() : "";

    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.className = "hover:bg-blue-50 transition-colors";

    tr.innerHTML = `
      <td><strong>${proj.project_code}</strong></td>
      <td>${proj.name || ""}</td>
      <td>${proj.revenue_formula || ""}</td>
      <td>${pop}</td>
      <td class="text-right font-medium">${funding}</td>
    `;

    tr.addEventListener("click", () => {
      // Clear previous selection
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("bg-blue-100", "font-semibold"));
      tr.classList.add("bg-blue-100", "font-semibold");

      setSelectedProject(proj);
      setPlanContext({
        projectId: proj.id,
        projectName: proj.name,
        projectCode: proj.project_code,
      });

      const msg = $("#projMessage", root);
      if (msg) {
        msg.textContent = `Selected: ${proj.project_code} – ${proj.name}`;
      }
    });

    tbody.appendChild(tr);
  });
}
