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
      <h4 style="margin-bottom:0.5rem;">Create Grant</h4>

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
              <th>Set Current</th>
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

  // Create grant
  $("#create", root).onclick = async () => {
    const { data: userRes } = await client.auth.getUser();
    const user = userRes?.user || null;
    if (!user) return msg("Sign in first", true);

    const name = $("#g_name", root).value.trim();
    const grant_id = $("#g_id", root).value.trim() || null;
    const funder = $("#g_funder", root).value.trim() || null;
    const total_award = Math.round(Number($("#g_total", root).value || 0)); // ← Whole dollars
    const start_date = $("#g_from", root).value || null;
    const end_date = $("#g_to", root).value || null;

    if (!name || !start_date || !end_date) {
      return msg("Name, start date, and end date are required.", true);
    }

    const row = {
      name,
      grant_id,
      funder,
      total_award,
      start_date,
      end_date,
      status: "active",
      pm_user_id: user.id,
    };

    const { error } = await client.from("grants").insert(row);
    if (error) {
      console.error("[grants] insert error", error);
      return msg(error.message, true);
    }

    msg("Grant created.");
    // Clear form
    $("#g_name", root).value = "";
    $("#g_id", root).value = "";
    $("#g_funder", root).value = "";
    $("#g_total", root).value = "";
    $("#g_from", root).value = "";
    $("#g_to", root).value = "";

    await load();
  };

  $("#refreshGrants", root).onclick = () => load();

  async function load() {
    msg("Loading…");
    const { data, error } = await client
      .from("grants")
      .select("id,name,grant_id,funder,start_date,end_date,total_award,status,created_at")
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
          <button type="button" data-grant="${g.id}" class="secondary" style="font-size:0.75rem;padding:0.1rem 0.4rem;">
            Use
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

    msg("");
  }

  await load();
}
