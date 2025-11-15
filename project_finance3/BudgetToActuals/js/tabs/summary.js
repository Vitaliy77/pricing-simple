// js/tabs/summary.js
import { client } from '../api/supabase.js';
import { $ } from '../lib/dom.js';
import { getSelectedGrantId, onGrantChange } from '../lib/grantContext.js';

export const template = /*html*/`
  <article>
    <h3>Grant Summary</h3>
    <small id="msg"></small>

    <section id="grantMeta" style="margin-top:0.75rem;max-width:800px;"></section>
    <section id="kpis" style="margin-top:0.75rem;max-width:800px;"></section>
    <section id="totals" style="margin-top:0.75rem;max-width:800px;"></section>
  </article>
`;

let rootEl = null;
let unsubscribe = null;

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $('#msg', rootEl);
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isErr ? '#b00' : 'inherit';
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = '';
    }, 3500);
  }
}

function esc(x) {
  return (x ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function fmt2(n) {
  return Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function init(root) {
  rootEl = root;
  rootEl.innerHTML = template;
  msg('');

  // react to grant changes
  if (unsubscribe) unsubscribe();
  unsubscribe = onGrantChange(id => {
    if (!rootEl || !rootEl.isConnected) {
      if (unsubscribe) unsubscribe();
      return;
    }
    if (id) loadSummary(id);
    else showNoGrant();
  });

  const grantId = getSelectedGrantId();
  if (!grantId) {
    showNoGrant();
    return;
  }
  await loadSummary(grantId);
}

function showNoGrant() {
  if (!rootEl) return;
  $('#grantMeta', rootEl).innerHTML = `
    <p style="color:#666;">
      No grant selected. Go to <strong>Grant Selection</strong> tab and choose a grant.
    </p>
  `;
  $('#kpis', rootEl).innerHTML = '';
  $('#totals', rootEl).innerHTML = '';
  msg('');
}

async function loadSummary(grantId) {
  msg('Loading…');
  try {
    const [gRes, labRes, catRes, dirRes, actRes] = await Promise.all([
      client.from('grants')
        .select('id,name,grant_id,start_date,end_date,amount')
        .eq('id', grantId)
        .single(),
      client.from('budget_labor')
        .select('category_id,hours')
        .eq('grant_id', grantId),
      client.from('labor_categories')
        .select('id,hourly_rate')
        .eq('is_active', true),
      client.from('budget_direct')
        .select('amount')
        .eq('grant_id', grantId),
      client.from('actuals_net')
        .select('amount_net')
        .eq('grant_id', grantId),
    ]);

    if (gRes.error) throw gRes.error;
    if (labRes.error) throw labRes.error;
    if (catRes.error) throw catRes.error;
    if (dirRes.error) throw dirRes.error;
    if (actRes.error) throw actRes.error;

    const grant = gRes.data;
    const laborRows = labRes.data || [];
    const cats = catRes.data || [];
    const directRows = dirRes.data || [];
    const actualRows = actRes.data || [];

    const rateById = Object.fromEntries(
      cats.map(c => [c.id, Number(c.hourly_rate ?? 0)])
    );

    // Budget
    let budgetLabor = 0;
    laborRows.forEach(r => {
      const hrs = Number(r.hours ?? 0);
      const rate = rateById[r.category_id] ?? 0;
      budgetLabor += hrs * rate;
    });

    const budgetDirect = directRows.reduce(
      (sum, r) => sum + Number(r.amount ?? 0),
      0
    );
    const budgetTotal = budgetLabor + budgetDirect;

    // Actuals (we currently don't split labor vs ODC in actuals_net, so treat as "Total")
    const actualTotal = actualRows.reduce(
      (sum, r) => sum + Number(r.amount_net ?? 0),
      0
    );
    const varTotal = budgetTotal - actualTotal;
    const pctSpent = budgetTotal > 0 ? (actualTotal / budgetTotal) * 100 : 0;

    renderMeta(grant);
    renderKpis({ budgetTotal, actualTotal, varTotal, pctSpent });
    renderTotals({ budgetLabor, budgetDirect, budgetTotal, actualTotal, varTotal });

    msg('');
  } catch (e) {
    console.error('[summary] loadSummary error', e);
    msg(e.message || String(e), true);
  }
}

function renderMeta(grant) {
  if (!rootEl) return;
  const meta = $('#grantMeta', rootEl);
  if (!meta) return;

  const pop = `${grant.start_date || '—'} → ${grant.end_date || '—'}`;
  const amt = fmt2(grant.amount ?? 0);

  meta.innerHTML = `
    <div style="
      border:1px solid #ddd;
      border-radius:0.4rem;
      padding:0.75rem 0.9rem;
      background:#fafafa;
    ">
      <h4 style="margin:0 0 0.4rem 0;">${esc(grant.name)}</h4>
      <p style="margin:0.1rem 0;font-size:0.9rem;">
        <strong>Grant ID:</strong> ${esc(grant.grant_id || '—')}
      </p>
      <p style="margin:0.1rem 0;font-size:0.9rem;">
        <strong>Period of performance:</strong> ${esc(pop)}
      </p>
      <p style="margin:0.1rem 0;font-size:0.9rem;">
        <strong>Total award:</strong> $${amt}
      </p>
    </div>
  `;
}

function renderKpis({ budgetTotal, actualTotal, varTotal, pctSpent }) {
  if (!rootEl) return;
  const k = $('#kpis', rootEl);
  if (!k) return;

  k.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:0.75rem;">
      <div style="flex:1 1 160px;border:1px solid #eee;border-radius:0.4rem;padding:0.6rem;">
        <div style="font-size:0.8rem;color:#666;">Budget total</div>
        <div style="font-size:1rem;font-weight:600;">$${fmt2(budgetTotal)}</div>
      </div>
      <div style="flex:1 1 160px;border:1px solid #eee;border-radius:0.4rem;padding:0.6rem;">
        <div style="font-size:0.8rem;color:#666;">Actual to date</div>
        <div style="font-size:1rem;font-weight:600;">$${fmt2(actualTotal)}</div>
      </div>
      <div style="flex:1 1 160px;border:1px solid #eee;border-radius:0.4rem;padding:0.6rem;">
        <div style="font-size:0.8rem;color:#666;">Variance (Budget - Actual)</div>
        <div style="font-size:1rem;font-weight:600;">$${fmt2(varTotal)}</div>
      </div>
      <div style="flex:1 1 160px;border:1px solid #eee;border-radius:0.4rem;padding:0.6rem;">
        <div style="font-size:0.8rem;color:#666;">% of budget spent</div>
        <div style="font-size:1rem;font-weight:600;">${fmt2(pctSpent)}%</div>
      </div>
    </div>
  `;
}

function renderTotals({ budgetLabor, budgetDirect, budgetTotal, actualTotal, varTotal }) {
  if (!rootEl) return;
  const t = $('#totals', rootEl);
  if (!t) return;

  t.innerHTML = `
    <h4 style="margin:0.5rem 0 0.25rem 0;">Budget vs Actual (Totals)</h4>
    <div class="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th>Budget</th>
            <th>Actual</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Labor (budgeted)</td>
            <td>$${fmt2(budgetLabor)}</td>
            <td>—</td>
            <td>—</td>
          </tr>
          <tr>
            <td>Other Direct (budgeted)</td>
            <td>$${fmt2(budgetDirect)}</td>
            <td>—</td>
            <td>—</td>
          </tr>
          <tr>
            <td><strong>Total</strong></td>
            <td><strong>$${fmt2(budgetTotal)}</strong></td>
            <td><strong>$${fmt2(actualTotal)}</strong></td>
            <td><strong>$${fmt2(varTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
