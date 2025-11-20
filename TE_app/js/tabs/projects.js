// js/tabs/projects.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>Admin – Projects</h3>

    <section style="margin-bottom:1rem;">
      <h4 style="margin-bottom:0.4rem;">Create / Edit Project</h4>
      <form id="prjForm" class="grid" style="max-width:900px;gap:0.5rem;
        grid-template-columns: 1.2fr 2fr 1.5fr 1fr 1fr 1fr;">
        <input type="hidden" id="prjId">

        <label>
          Project code
          <input id="prjCode" type="text" placeholder="PRJ-001">
        </label>

        <label>
          Name
          <input id="prjName" type="text">
        </label>

        <label>
          Client
          <input id="prjClient" type="text">
        </label>

        <label>
          Start
          <input id="prjStart" type="date">
        </label>

        <label>
          End
          <input id="prjEnd" type="date">
        </label>

        <label>
          Status
          <select id="prjStatus">
            <option value="active">Active</option>
            <option value="on_hold">On hold</option>
            <option value="closed">Closed</option>
          </select>
        </label>
      </form>

      <div style="margin-top:0.5rem;display:flex;gap:0.5rem;align-items:center;">
        <button id="prjSave" type="button" class="btn-sm">Save</button>
        <button id="prjNew" type="button" class="btn-sm secondary">New</button>
        <small id="prjMsg"></small>
      </div>
    </section>

    <section>
      <h4 style="margin-bottom:0.4rem;">All Projects</h4>
      <div class="scroll-x">
        <table class="data-grid compact-grid" id="prjTable">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Client</th>
              <th>Period</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </section>
  </article>
`;

let rootEl = null;
let projects = [];

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#prjMsg", rootEl);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

const fmtDate = d => (d ? new Date(d).toISOString().slice(0, 10) : "");

export async function init(root) {
  rootEl = root;
  root.innerHTML = template;

  $("#prjSave", root).addEventListener("click", saveProject);
  $("#prjNew", root).addEventListener("click", () => fillForm(null));

  await loadProjects();
}

async function loadProjects() {
  msg("Loading…");
  const { data, error } = await client
    .from("projects")
    .select("*")
    .order("start_date", { ascending: true });

  if (error) {
    console.error("[projects] load error", error);
    msg(error.message, true);
    return;
  }

  projects = data || [];
  renderProjectsTable();
  fillForm(null);
  msg("");
}

function renderProjectsTable() {
  const tb = $("#prjTable tbody", rootEl);
  tb.innerHTML = "";

  projects.forEach((p) => {
    const tr = h("<tr></tr>");
    tr.innerHTML = `
      <td>${p.project_code}</td>
      <td>${p.name}</td>
      <td>${p.client_name || ""}</td>
      <td>${fmtDate(p.start_date)} – ${fmtDate(p.end_date)}</td>
      <td>${p.status}</td>
      <td>
        <button type="button" class="btn-sm secondary" data-id="${p.id}">
          Edit
        </button>
      </td>
    `;
    tb.appendChild(tr);
  });

  tb.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const row = projects.find((p) => p.id === id);
      fillForm(row || null);
    });
  });
}

function fillForm(p) {
  $("#prjId", rootEl).value = p?.id || "";
  $("#prjCode", rootEl).value = p?.project_code || "";
  $("#prjName", rootEl).value = p?.name || "";
  $("#prjClient", rootEl).value = p?.client_name || "";
  $("#prjStart", rootEl).value = fmtDate(p?.start_date) || "";
  $("#prjEnd", rootEl).value = fmtDate(p?.end_date) || "";
  $("#prjStatus", rootEl).value = p?.status || "active";
}

async function saveProject() {
  const id = $("#prjId", rootEl).value || null;
  const project_code = $("#prjCode", rootEl).value.trim();
  const name = $("#prjName", rootEl).value.trim();
  const client_name = $("#prjClient", rootEl).value.trim() || null;
  const start_date = $("#prjStart", rootEl).value || null;
  const end_date = $("#prjEnd", rootEl).value || null;
  const status = $("#prjStatus", rootEl).value || "active";

  if (!project_code || !name || !start_date || !end_date) {
    msg("Code, name, start, end are required.", true);
    return;
  }

  const row = {
    project_code,
    name,
    client_name,
    start_date,
    end_date,
    status,
  };

  try {
    msg("Saving…");
    let error;
    if (id) {
      const res = await client.from("projects").update(row).eq("id", id);
      error = res.error;
    } else {
      const res = await client.from("projects").insert(row);
      error = res.error;
    }
    if (error) throw error;
    msg("Saved.");
    await loadProjects();
  } catch (e) {
    console.error("[projects] save error", e);
    msg(e.message || String(e), true);
  }
}

export const projectsTab = { template, init };
