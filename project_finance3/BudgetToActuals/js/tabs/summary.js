// /js/tabs/summary.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/`
  <article>
    <h3>Grant Summary</h3>

    <label>
      Grant:
      <select id="sumGrant">
        <option value="">— Select a grant —</option>
      </select>
    </label>
    <small id="sumMsg"></small>

    <section id="sumContent" style="margin-top:1.5rem"></section>
  </article>
`;

let rootEl = null;

const esc = (x) =>
  (x ?? "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;");

const fmtMoney = (n) =>
  (n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "");

const msg = (t, isErr = false) => {
  if (!rootEl) return;
  const el = $("#sumMsg", rootEl);
  if (!el) return;
  el.textContent = t || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (t) {
    setTimeout(() => {
      if (el.textContent === t) el.textContent = "";
    }, 4000);
  }
};

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;

  await loadGrantOptions();

  // Auto-select default grant from Grants tab, if set
  const storedId = localStorage.getItem("selectedGrantId") || "";
  if (storedId) {
    const sel = $("#sumGrant", rootEl);
    if (sel) {
      sel.value = storedId;
      if (sel.value === storedId) {
        await loadSummaryForGrant(storedId);
      }
    }
  }

  $("#sumGrant", rootEl).addEventListener("change", async (e) => {
    const id = e.target.value || null;
    if (!id) {
      $("#sumContent", rootEl).innerHTML = "";
      return;
    }
    await loadSummaryForGrant(id);
  });
}

async function loadGrantOptions() {
  const sel = $("#sumGrant", rootEl);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a grant —</option>';

  const { data, error } = await client
    .from("grants")
    .select("id,name,grant_id,status")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) {
    console.error("[summary] loadGrantOptions error", error);
    msg(error.message, true);
    return;
  }

  (data || []).forEach((g) => {
    const label = g.grant_id ? `${g.name} (${g.grant_id})` : g.name;
    sel.appendChild(new Option(label, g.id));
  });
}

async function loadSummaryForGrant(grantId) {
  msg("Loading…");

  try {
    // 1) basic grant info
    const { data: grant, error: gErr } = await client
      .from("grants")
      .select("id,name,grant_id,funder,start_date,end_date,total_award")
      .eq("id", grantId)
      .single();
    if (gErr) throw gErr;
    if (!grant) throw new Error("Grant not found.");

    // 2) budget pieces + labor rates
    const [labRes, dirRes, catsRes] = await Promise.all([
      client
        .from("budget_labor")
        .select("category_id,hours")
        .eq("grant_id", grantId),
      client
        .from("budget_direct")
        .select("amount")
        .eq("grant_id", grantId),
      client
        .from("labor_categories")
        .select("id,hourly_rate")
        .eq("is_active", true),
    ]);

    if (labRes.error) throw labRes.error;
    if (dirRes.error) throw dirRes.error;
    if (catsRes.error) throw catsRes.error;

    const laborRows = labRes.data || [];
    const directRows = dirRes.data || [];
    const cats = catsRes.data || [];
    const rateById = Object.fromEntries(
      cats.map((c) => [c.id, Number(c.hourly_rate ?? 0)])
    );

    // 3) compute budget totals
    let budgetLabor = 0;
    laborRows.forEach((r) => {
      const hrs = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      budgetLabor += hrs * rate;
    });

    let budgetDirect = 0;
    directRows.forEach((r) => {
      budgetDirect += Number(r.amount ?? 0);
    });

    const budgetTotal = budgetLabor + budgetDirect;
    const awardTotal = Number(grant.total_award ?? 0);
    const pctAwardBudgeted =
      awardTotal > 0 ? (budgetTotal / awardTotal) * 100 : 0;

    // 4) simple time metrics
    const today = new Date();
    const todayMid = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const start = grant.start_date ? new Date(grant.start_date) : null;
    const end = grant.end_date ? new Date(grant.end_date) : null;

    let daysTotal = null;
    let daysPassed = null;
    let pctTimePassed = null;

    if (start && end && !isNaN(start) && !isNaN(end)) {
      const startMid = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate()
      );
      const endMid = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate()
      );
      daysTotal = Math.max(
        1,
        Math.round((endMid - startMid) / (1000 * 60 * 60 * 24)) + 1
      );
      const clampDate =
        todayMid > endMid ? endMid : todayMid < startMid ? startMid : todayMid;
      daysPassed = Math.round(
        (clampDate - startMid) / (1000 * 60 * 60 * 24)
      );
      if (daysPassed < 0) daysPassed = 0;
      if (daysPassed > daysTotal) daysPassed = daysTotal;
      pctTimePassed = (daysPassed / daysTotal) * 100;
    }

    // 5) Actuals placeholder (0 for now)
    const actualTotal = 0;
    const varianceTotal = budgetTotal - actualTotal;

    renderSummary({
      grant,
      budgetLabor,
      budgetDirect,
      budgetTotal,
      awardTotal,
      pctAwardBudgeted,
      daysTotal,
      daysPassed,
      pctTimePassed,
      actualTotal,
      varianceTotal,
    });

    msg("");
  } catch (e) {
    console.error("[summary] loadSummaryForGrant error", e);
    msg(e.message || String(e), true);
  }
}

function renderSummary(m) {
  const box = $("#sumContent", rootEl);
  if (!box) return;

  const g = m.grant;

  box.innerHTML = `
    <section>
      <h4>${esc(g.name)}${g.grant_id ? ` (${esc(g.grant_id)})` : ""}</h4>
      <p>
        <strong>Funder:</strong> ${esc(g.funder || "—")}<br>
        <strong>Period:</strong> ${fmtDate(g.start_date)} – ${fmtDate(
    g.end_date
  )}<br>
        <strong>Award total:</strong> $${fmtMoney(m.awardTotal)}
      </p>
    </section>

    <section style="margin-top:1rem">
      <h5>Budget overview</h5>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th style="text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Budget – Labor</td>
            <td style="text-align:right;">$${fmtMoney(m.budgetLabor)}</td>
          </tr>
          <tr>
            <td>Budget – Other Direct Costs</td>
            <td style="text-align:right;">$${fmtMoney(m.budgetDirect)}</td>
          </tr>
          <tr>
            <td><strong>Budget – Total</strong></td>
            <td style="text-align:right;"><strong>$${fmtMoney(
              m.budgetTotal
            )}</strong></td>
          </tr>
          <tr>
            <td>% of award budgeted</td>
            <td style="text-align:right;">${m.pctAwardBudgeted.toFixed(
              1
            )}%</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section style="margin-top:1rem">
      <h5>Time & spend (placeholder)</h5>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th style="text-align:right;">Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Time passed in grant</td>
            <td style="text-align:right;">
              ${
                m.daysTotal != null && m.daysPassed != null
                  ? `${m.daysPassed} of ${m.daysTotal} days (${m.pctTimePassed.toFixed(
                      1
                    )}%)`
                  : "—"
              }
            </td>
          </tr>
          <tr>
            <td>Actual spend (ITD)</td>
            <td style="text-align:right;">$${fmtMoney(m.actualTotal)}</td>
          </tr>
          <tr>
            <td>Variance (Budget – Actual)</td>
            <td style="text-align:right;">$${fmtMoney(m.varianceTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:0.8rem;color:#666;margin-top:0.25rem;">
        Actuals are currently treated as $0. Once we hook in your actuals data,
        this section will reflect real spend.
      </p>
    </section>
  `;
}
