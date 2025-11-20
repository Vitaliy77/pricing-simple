// js/tabs/assignments.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>Admin – Project Assignments</h3>

    <section style="margin-bottom:0.75rem;">
      <p>Select an employee to manage which projects they can charge time to.</p>
      <label style="max-width:400px;">
        Employee
        <select id="asgEmployee">
          <option value="">— Select employee —</option>
        </select>
      </label>
      <small id="asgMsg"></small>
    </section>

    <section id="asgBodySection">
      <p>No employee selected.</p>
    </section>
  </article>
`;

let rootEl = null;
let employees = [];
let projects = [];
let assignments = []; // project_assignments rows for selected employee

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#asgMsg", rootEl);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

export async function init(root) {
  rootEl = root;
  root.innerHTML = template;

  await Promise.all([loadEmployees(), loadProjects()]);

  $("#asgEmployee", rootEl).addEventListener("change", async (e) => {
    const id = e.target.value || null;
    if (!id) {
      $("#asgBodySection", rootEl).innerHTML = "<p>No employee selected.</p>";
      return;
    }
    await loadAssignmentsForEmployee(id);
  });
}

async function loadEmployees() {
  const sel = $("#asgEmployee", rootEl);
  sel.innerHTML = '<option value="">— Select employee —</option>';

  const { data, error } = await client
    .from("employees")
    .select("id,first_name,last_name,is_active")
    .order("first_name", { ascending: true });

  if (error) {
    console.error("[assignments] employees error", error);
    msg(error.message, true);
    return;
  }

  employees = data || [];
  employees.forEach((e) => {
    const opt = new Option(
      `${e.first_name} ${e.last_name}${e.is_active ? "" : " (inactive)"}`,
      e.id
    );
    sel.appendChild(opt);
  });
}

async function loadProjects() {
  const { data, error } = await client
    .from("projects")
    .select("id,project_code,name,status")
    .order("project_code", { ascending: true });

  if (error) {
    console.error("[assignments] projects error", error);
    msg(error.message, true);
    return;
  }
  projects = data || [];
}

async function loadAssignmentsForEmployee(empId) {
  msg("Loading…");
  const { data, error } = await client
    .from("project_assignments")
    .select("id,project_id,is_active")
    .eq("employee_id", empId);

  if (error) {
    console.error("[assignments] load error", error);
    msg(error.message, true);
    return;
  }

  assignments = data || [];
  renderAssignments(empId);
  msg("");
}

function renderAssignments(empId) {
  const container = $("#asgBodySection", rootEl);
  const assignedIds = new Set(
    assignments.filter(a => a.is_active).map(a => a.project_id)
  );

  const tbl = h(`
    <table class="data-grid compact-grid">
      <thead>
        <tr>
          <th>Assign</th>
          <th>Project code</th>
          <th>Name</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `);

  const tbody = tbl.querySelector("tbody");

  projects.forEach((p) => {
    const tr = h("<tr></tr>");
    const checked = assignedIds.has(p.id) ? "checked" : "";
    tr.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" data-proj="${p.id}" ${checked}>
      </td>
      <td>${p.project_code}</td>
      <td>${p.name}</td>
      <td>${p.status}</td>
    `;
    tbody.appendChild(tr);
  });

  container.innerHTML = "";
  container.appendChild(tbl);

  tbody.querySelectorAll("input[type=checkbox]").forEach((chk) => {
    chk.addEventListener("change", async () => {
      const projectId = chk.getAttribute("data-proj");
      const isChecked = chk.checked;
      await toggleAssignment(empId, projectId, isChecked);
    });
  });
}

async function toggleAssignment(empId, projectId, on) {
  try {
    msg("Saving…");

    const existing = assignments.find(
      (a) => a.employee_id === empId && a.project_id === projectId
    );

    if (!existing) {
      if (!on) {
        msg("");
        return;
      }
      const { error } = await client
        .from("project_assignments")
        .insert({
          employee_id: empId,
          project_id: projectId,
          is_active: true,
        });
      if (error) throw error;
    } else {
      const { error } = await client
        .from("project_assignments")
        .update({ is_active: on })
        .eq("id", existing.id);
      if (error) throw error;
    }

    await loadAssignmentsForEmployee(empId);
    msg("Saved.");
  } catch (e) {
    console.error("[assignments] toggle error", e);
    msg(e.message || String(e), true);
  }
}

export const assignmentsTab = { template, init };
