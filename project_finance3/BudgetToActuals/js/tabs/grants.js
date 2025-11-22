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
      <h4 style="margin-bottom:0.5rem;">Create / Edit Grant</h4>

      <!-- Table-based form that matches All Grants column widths/order -->
      <div style="margin-bottom:0.4rem;overflow:hidden;border-radius:6px;">
        <table style="width:100%;table-layout:fixed;border-collapse:collapse;">
          <colgroup>
            <col style="width:23.3%"> <!-- Name / Grant name -->
            <col style="width:14.0%"> <!-- Grant ID -->
            <col style="width:23.3%"> <!-- Funder -->
            <col style="width:11.6%"> <!-- Start -->
            <col style="width:14.0%"> <!-- End -->
            <col style="width:14.0%"> <!-- Total Award -->
            <col style="width:8%">   <!-- Status -->
            <col style="width:5%">   <!-- Actions -->
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
              <td style="padding:0 0.35rem 0.6rem 0.35rem;">
                <label style="display:block;margin-bottom:0.25rem;font-weight:600;font-size:0.9rem;">
                  Total award
                </label>
                <input id="g_total" type="number" step="1" min="0" placeholder="Total Award"
                       style="width:100%;box-sizing:border-box;text-align:right;">
              </td>
              <td></td>
              <td></td>
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
    </section>

    <!-- ====================== ALL GRANTS TABLE ====================== -->
    <section>
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
              <th>Start</th>
              <th>End</th>
              <th>Total Award</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
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
    if (t) {
      setTimeout(() => {
        if (m.textContent === t) m.textContent = "";
      }, 4000);
    }
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
    $("#g_total", root).value =
      grant.total_award != null ? String(grant.total_award) : "";
    $("#g_from", root).value = grant.start_date || "";
    $("#g_to", root).value = grant.end_date || "";
    $createBtn.textContent = "Update";
    $cancelEdit.style.display = "inline-block";
    msg(`Editing grant: ${grant.name}`);
  }

  // CREATE / UPDATE
  $createBtn.onclick = async () => {
    const { data: userRes, error: authErr } = await client.auth.getUser();
    if (authErr) {
      console.error("[grants] auth error", authErr);
    }
    const user = userRes?.user || null;
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

    const rowBase = {
      name,
      grant_id,
      funder,
      total_award,
      start_date,
      end_date,
    };

    try {
      if (editingGrantId) {
        const { data, error } = await client
          .from("grants")
          .update({ ...rowBase, pm_user_id: user.id })
          .eq("id", editingGrantId)
          .select("id");

        if (error) {
          console.error("[grants] update error", error);
          return msg(error.message, true);
        }
        if (!data || !data.length) {
          return msg("Update did not affect any rows.", true);
        }

        msg("Grant updated.");
      } else {
        const { error } = await client
          .from("grants")
          .insert({ ...rowBase, status: "active", pm_user_id: user.id });

        if (error) {
          console.error("[grants] insert error", error);
          return msg(error.message, true);
        }

        msg("Grant created.");
      }

      clearForm();
      setCreateMode();
      await load();
    } catch (err) {
      console.error("[grants] create/update exception", err);
      msg(String(err?.message || err), true);
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
      .select(
        "id,name,grant_id,funder,start_date,end_date,total_award,status,created_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[grants] load error", error);
      msg(error.message, true);
      return;
    }

    const tb = $("#tbl tbody", root);
    tb.innerHTML = "";

    (data || []).forEach((g) => {
      const tr = h("<tr></tr>");
      tr.innerHTML = `
        <td>${g.name}</td>
        <td>${g.grant_id || ""}</td>
        <td>${g.funder || ""}</td>
        <td>${g.start_date || ""}</td>
        <td>${g.end_date || ""}</td>
        <td style="text-align:right;">${fmt0(g.total_award)}</td>
        <td>${g.status || ""}</td>
        <td>
          <button
            type="button"
            data-grant="${g.id}"
            class="secondary"
            style="font-size:0.75rem;padding:0.1rem 0.4rem;margin-right:0.25rem;"
          >
            Use
          </button>
          <button
            type="button"
            data-edit-grant="${g.id}"
            class="secondary"
            style="font-size:0.75rem;padding:0.1rem 0.4rem;"
          >
            Edit
          </button>
        </td>
      `;
      tb.appendChild(tr);
    });

    // Wire "Use" buttons
    tb.querySelectorAll("button[data-grant]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-grant");
        if (!id) return;
        setSelectedGrantId(id);
        msg("Current grant set. Other tabs will use it.");
      });
    });

    // Wire "Edit" buttons
    tb.querySelectorAll("button[data-edit-grant]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.getAttribute("data-edit-grant");
        if (!id) return;
        const grant = (data || []).find((g) => String(g.id) === String(id));
        if (!grant) return;
        setEditMode(grant);
      });
    });

    msg("");
  }

  await load();
}
