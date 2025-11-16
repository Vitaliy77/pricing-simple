// js/tabs/grantSelect.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";
import { getSelectedGrantId, setSelectedGrantId } from "../lib/grantContext.js";

export const template = /*html*/ `
  <article>
    <h3>Grant Selection</h3>
    <section style="max-width:600px;margin-bottom:1rem;">
      <div class="grid" style="row-gap:0.35rem;">
        <label>
          Grant
          <select id="grantSelectMain">
            <option value="">— Select a grant —</option>
          </select>
        </label>
      </div>
      <div style="margin-top:0.5rem;display:flex;gap:0.5rem;align-items:center;">
        <button id="grantSetCurrent" type="button">Set as current grant</button>
        <small id="msg"></small>
      </div>
    </section>

    <section>
      <h4 style="margin-bottom:0.35rem;">Current Grant</h4>
      <div id="grantCurrentInfo"></div>
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

  // Load active grants
  async function load() {
    const sel = $("#grantSelectMain", root);
    sel.innerHTML = '<option value="">— Select a grant —</option>';

    const { data, error } = await client
      .from("grants")
      .select("id,name,grant_id,start_date,end_date,total_award,status")
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.error("[grantSelect] load error", error);
      msg(error.message, true);
      return;
    }

    (data || []).forEach((g) => {
      const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
      sel.appendChild(new Option(label, g.id));
    });

    // Try to preselect from global context
    const current = getSelectedGrantId();
    if (current && sel.querySelector(`option[value="${current}"]`)) {
      sel.value = current;
      await showCurrent(current);
    } else {
      await showCurrent(null);
    }
  }

  async function showCurrent(grantId) {
    const box = $("#grantCurrentInfo", root);
    box.innerHTML = "";

    if (!grantId) {
      box.textContent = "No grant selected.";
      return;
    }

    const { data, error } = await client
      .from("grants")
      .select("id,name,grant_id,start_date,end_date,total_award,status,funder")
      .eq("id", grantId)
      .maybeSingle();

    if (error) {
      console.error("[grantSelect] showCurrent error", error);
      box.textContent = error.message;
      return;
    }
    if (!data) {
      box.textContent = "Grant not found.";
      return;
    }

    const div = h(`<div style="border:1px solid #ddd;border-radius:4px;padding:0.75rem;font-size:0.9rem;">
      <div><strong>${data.name}</strong> ${data.grant_id ? `(${data.grant_id})` : ""}</div>
      <div>Funder: ${data.funder || "—"}</div>
      <div>Period: ${data.start_date || ""} → ${data.end_date || ""}</div>
      <div>Total Award: ${data.total_award != null ? Number(data.total_award).toLocaleString() : "—"}</div>
      <div>Status: ${data.status || "—"}</div>
    </div>`);
    box.appendChild(div);
  }

  $("#grantSetCurrent", root).onclick = async () => {
    const sel = $("#grantSelectMain", root);
    const id = sel.value || null;
    if (!id) return msg("Select a grant first.", true);
    setSelectedGrantId(id);
    await showCurrent(id);
    msg("Current grant saved.");
  };

  await load();
}
