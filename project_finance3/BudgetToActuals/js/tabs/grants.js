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

    <section style="margin-bottom:1rem;">
      <h4 style="margin-bottom:0.5rem;">Create / Edit Grant</h4>

      <!-- Grant form row with explicit widths -->
      <div
        class="grid"
        style="
          max-width: 1200px;
          grid-template-columns: 2.5fr 1.5fr 2.5fr 1.25fr 1.5fr 1.5fr;
          gap: 0.4rem;
          margin-bottom: 0.4rem;
        "
      >
        <label>
          Grant name
          <input
            id="g_name"
            type="text"
            placeholder="Grant Name"
            style="width:100%;"
          >
        </label>

        <label>
          Grant ID
          <input
            id="g_id"
            type="text"
            placeholder="Grant ID"
            style="width:100%;"
          >
        </label>

        <label>
          Funder
          <input
            id="g_funder"
            type="text"
            placeholder="Funder"
            style="width:100%;"
          >
        </label>

        <label>
          Total award
          <input
            id="g_total"
            type="number"
            step="1"
            min="0"
            placeholder="Total Award"
            style="width:100%;text-align:right;"
          >
        </label>

        <label>
          Start
          <input
            id="g_from"
            type="date"
            style="width:100%;"
          >
        </label>

        <label>
          End
          <input
            id="g_to"
            type="date"
            style="width:100%;"
          >
        </label>
      </div>

      <div style="margin-top:0.5rem; display:flex; gap:0.5rem; align-items:center;">
        <button id="create" type="button">Create</button>
        <button id="cancelEdit" type="button" class="secondary" style="display:none;">
          Cancel edit
        </button>
        <small id="msg"></small>
      </div>
    </section>

    <section>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem;">
        <h4 style="margin:0;">All Grants</h4>
        <button id="refreshGrants" type="button" class="secondary" style="font-size:0.8rem;padding:0.15rem 0.5rem;">
          Refresh
        </button>
      </div>
      <div class="scroll-x">
        <table id="tbl" style="min-width:100%;">
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

  // Create / Update grant
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
    const total_award = Math.round(Number($("#g_total", root).value || 0)); // whole dollars
    const start_date = $("#g_from", root).value || null;
    const end_date = $("#g_to", root).value || null;

    if (!name || !start_date || !end_date) {
      return msg("Name, start date, and end date are required.", true);
    }

    // Only the editable fields (don't always touch status / pm_user_id)
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
        // UPDATE existing grant: only editable fields
        const { error } = await client
          .from("grants")
          .update(rowBase)
          .eq("id", editingGrantId);

        if (error) {
          console.error("[grants] update error", error);
          return msg(error.message, true);
        }

        msg("Grant updated.");
      } else {
        // CREATE new grant: also set status + pm_user_id
        const insertRow = {
          ...rowBase,
          status: "active",
          pm_user_id: user.id,
        };

        const { error } = await client.from("grants").insert(insertRow);
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

  // Cancel edit
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
        <td>${fmt0(g.total_award)}</td>
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
