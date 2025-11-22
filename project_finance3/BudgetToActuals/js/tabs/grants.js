// js/tabs/grants.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";
import { setSelectedGrantId } from "../lib/grantContext.js";

// Helper: format number with no decimals
const fmt0 = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export const template = /*html*/ `
  <article>
    <h3>Grant Setup</h3>

    <!-- ====================== CREATE / EDIT FORM ====================== -->
    <section style="margin-bottom:1.5rem;">
      <div style="max-width:1200px;margin:0 auto;">
        <h4 style="margin-bottom:0.5rem;">Create / Edit Grant</h4>

        <!-- Table-based form that perfectly matches the table below -->
        <div style="margin-bottom:0.4rem;overflow:hidden;border-radius:6px;">
          <table style="width:100%;table-layout:fixed;border-collapse:collapse;">
            <colgroup>
              <col style="width:23.3%">
              <col style="width:14.0%">
              <col style="width:23.3%">
              <col style="width:11.6%">
              <col style="width:14.0%">
              <col style="width:14.0%">
              <col style="width:8%">   <!-- Status placeholder -->
              <col style="width:5%">   <!-- Actions placeholder -->
            </colgroup>
            <tbody>
              <tr>
                <td style="padding:0 0.35rem 0.6rem 0.35rem;">
                  <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;">
                    Grant name
                  </label>
                  <input id="g_name" type="text" placeholder="Grant Name"
                         style="width:100%;box-sizing:border-box;">
                </td>
                <td style="padding:0 0.35rem 0.6rem 0.35rem;">
                  <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;">
                    Grant ID
                  </label>
                  <input id="g_id" type="text" placeholder="Grant ID"
                         style="width:100%;box-sizing:border-box;">
                </td>
                <td style="padding:0 0.35rem 0.6rem 0.35rem;">
                  <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;">
                    Funder
                  </label>
                  <input id="g_funder" type="text" placeholder="Funder"
                         style="width:100%;box-sizing:border-box;">
                </td>
                <td style="padding:0 0.35rem 0.6rem 0.35rem;">
                  <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;">
                    Total award
                  </label>
                  <input id="g_total" type="number" step="1" min="0" placeholder="Total Award"
                         style="width:100%;box-sizing:border-box;text-align:right;">
                </td>
                <td style="padding:0 0.35rem 0.6rem 0.35rem;">
                  <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;">
                    Start
                  </label>
                  <input id="g_from" type="date"
                         style="width:100%;box-sizing:border-box;">
                </td>
                <td style="padding:0 0.35rem 0.6rem 0.35rem;">
                  <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;">
                    End
                  </label>
                  <input id="g_to" type="date"
                         style="width:100%;box-sizing:border-box;">
                </td>
                <td></td><td></td> <!-- empty Status & Actions cells -->
              </tr>
            </tbody>
          </table>
        </div>

        <div style="display:flex;gap:0.5rem;align-items:center;">
          <button id="create" type="button">Create</button>
          <button id="cancelEdit" type="button" class="secondary" style="display:none;">
            Cancel edit
          </button>
          <small id="msg"></small>
        </div>
      </div>
    </section>

    <!-- ====================== ALL GRANTS TABLE ====================== -->
    <section>
      <div style="max-width:1200px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
          <h4 style="margin:0;">All Grants</h4>
          <button id="refreshGrants" type="button" class="secondary"
                  style="font-size:0.8rem;padding:0.15rem 0.5rem;">
            Refresh
          </button>
        </div>

        <div class="scroll-x">
          <table id="tbl" style="width:100%;table-layout:fixed;">
            <colgroup>
              <col style="width:23.3%">
              <col style="width:14.0%">
              <col style="width:23.3%">
              <col style="width:11.6%">
              <col style="width:14.0%">
              <col style="width:14.0%">
              <col style="width:8%">
              <col style="width:5%">
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                <th>Grant ID</th>
                <th>Funder</th>
                <th>Total Award</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </section>
  </article>
`;

export async function init(root) {
  root.innerHTML = template;

  let editingGrantId = null;

  const msg = (t, e = false) => {
    const m = $("#msg", root);
    if (!m) return;
    m.textContent = t || "";
    m.style.color = e ? "#b00" : "inherit";
    if (t) setTimeout(() => m.textContent === t && (m.textContent = ""), 4000);
  };

  const $createBtn = $("#create", root);
  const $cancelEdit = $("#cancelEdit", root);

  function clearForm() {
    $("#g_name", root).value = "";
    $("#g_id", root).value = "";
    $("#g_funder", root).value = "";
    $("#g_total", root).value = "";
    $("#g_from", root).value = "";
    $("#g_to", root).value = "";
  }

  function setCreateMode() {
    editingGrantId = null;
    $createBtn.textContent = "Create";
    $cancelEdit.style.display = "none";
  }

  function setEditMode(grant) {
    editingGrantId = grant.id;
    $("#g_name", root).value = grant.name || "";
    $("#g_id", root).value = grant.grant_id || "";
    $("#g_funder", root).value = grant.funder || "";
    $("#g_total", root).value = grant.total_award != null ? String(grant.total_award) : "";
    $("#g_from", root).value = grant.start_date || "";
    $("#g_to", root).value = grant.end_date || "";
    $createBtn.textContent = "Update";
    $cancelEdit.style.display = "inline-block";
    msg(`Editing grant: ${grant.name}`);
  }

  // CREATE / UPDATE
  $createBtn.onclick = async () => {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return msg("Sign in first", true);

    const name = $("#g_name", root).value.trim();
    const grant_id = $("#g_id", root).value.trim() || null;
    const funder = $("#g_funder", root).value.trim() || null;
    const total_award = Math.round(Number($("#g_total", root).value || 0));
    const start_date = $("#g_from", root).value || null;
    const end_date = $("#g_to", root).value || null;

    if (!name || !start_date || !end_date) {
      return msg("Name, start date, and end date are required.", true);
    }

    const rowBase = { name, grant_id, funder, total_award, start_date, end_date };

    try {
      if (editingGrantId) {
        const { error, data } = await client
          .from("grants")
          .update({ ...rowBase, pm_user_id: user.id })
          .eq("id", editingGrantId)
          .select("id");

        if (error || !data?.length) return msg(error?.message || "Update failed", true);
        msg("Grant updated.");
      } else {
        const { error, data } = await client
          .from("grants")
          .insert({ ...rowBase, status: "active", pm_user_id: user.id })
          .select("id");

        if (error) return msg(error.message, true);
        msg("Grant created.");
      }

      clearForm();
      setCreateMode();
      await load();
    } catch (err) {
      console.error(err);
      msg("Unexpected error", true);
    }
  };

  $cancelEdit.onclick = () => {
    clearForm();
    setCreateMode();
    msg("Edit cancelled.");
  };

  $("#refreshGrants", root).onclick = () => load();

  async function load() {
    msg("Loading…");
    const { data, error } = await client
      .from("grants")
      .select("id,name,grant_id,funder,start_date,end_date,total_award,status,created_at")
      .order("created_at", { ascending: false });

    if (error) return msg(error.message, true);

    const tbody = $("#tbl tbody", root);
    tbody.innerHTML = "";

    data.forEach((g) => {
      const tr = h("<tr></tr>");
      tr.innerHTML = `
        <td>${g.name}</td>
        <td>${g.grant_id || ""}</td>
        <td>${g.funder || ""}</td>
        <td style="text-align:right;">${fmt0(g.total_award)}</td>
        <td>${g.start_date || ""}</td>
        <td>${g.end_date || ""}</td>
        <td>${g.status || ""}</td>
        <td>
          <button type="button" data-grant="${g.id}" class="secondary"
                  style="font-size:0.75rem;padding:0.1rem 0.4rem;margin-right:0.25rem;">
            Use
          </button>
          <button type="button" data-edit-grant="${g.id}" class="secondary"
                  style="font-size:0.75rem;padding:0.1rem 0.4rem;">
            Edit
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Wire buttons
    tbody.querySelectorAll("[data-grant]").forEach((b) =>
      b.addEventListener("click", () => {
        setSelectedGrantId(b.dataset.grant);
        msg("Current grant selected");
      })
    );
    tbody.querySelectorAll("[data-edit-grant]").forEach((b) => {
      b.addEventListener("click", () => {
        const grant = data.find((x) => x.id == b.dataset.editGrant);
        if (grant) setEditMode(grant);
      });
    });

    msg("");
  }

  await load();
}
