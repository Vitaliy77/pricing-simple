// js/tabs/compare.js
import { client } from '../api/supabase.js';
import { $, h } from '../lib/dom.js';
import { getSelectedGrantId } from '../lib/grantContext.js';

export const template = /*html*/`
  <article>
    <h3>Budget vs Actual</h3>

    <div class="grid" style="max-width:420px;margin-bottom:0.75rem">
      <label>
        Grant
        <select id="grantSelect"></select>
      </label>
    </div>

    <small id="msg"></small>

    <div id="summary" style="margin-top:1rem"></div>
  </article>
`;

export async function init(root) {
  root.innerHTML = template;

  const msg = (t, isErr = false) => {
    const el = $('#msg', root);
    if (!el) return;
    el.textContent = t;
    el.style.color = isErr ? '#b00' : 'inherit';
  };

  // Load grants into dropdown
  async function loadGrants() {
    msg('Loading grants…');
    const { data, error } = await client
      .from('grants')
      .select('id,name,grant_id,status')
      .eq('status', 'active')
      .order('name', { ascending: true });

    if (error) {
      console.error('[compare] loadGrants error', error);
      msg(error.message, true);
      return;
    }

    const sel = $('#grantSelect', root);
    sel.innerHTML = '';

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— Select grant —';
    sel.appendChild(opt0);

    (data || []).forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.name} (${g.grant_id || 'no code'})`;
      sel.appendChild(opt);
    });

    // If we have a "current grant" selected on Grants tab, use it
    const current = window.__currentGrantId || '';
    if (current && data?.some(g => g.id === current)) {
      sel.value = current;
      loadCompareForGrant(current);
    } else {
      msg('Select a grant to see Budget vs Actual.');
    }

    // Change handler
    sel.onchange = () => {
      const gid = sel.value || null;
      if (!gid) {
        $('#summary', root).innerHTML = '';
        msg('Select a grant to see Budget vs Actual.');
        return;
      }
      loadCompareForGrant(gid);
    };
  }

  async function loadCompareForGrant(grantId) {
    msg('Loading…');

    try {
      const [labRes, dirRes, catsRes, actRes] = await Promise.all([
        // Budget labor: hours per labor category
        client
          .from('budget_labor')
          .select('category_id,hours')
          .eq('grant_id', grantId),

        // Budget other direct: amounts
        client
          .from('budget_direct')
          .select('amount')
          .eq('grant_id', grantId),

        // Labor categories: rates
        client
          .from('labor_categories')
          .select('id,hourly_rate')
          .eq('is_active', true),

        // Actuals: aggregated net amount per grant (from view)
        client
          .from('actuals_net')
          .select('amount_net,grant_id')
          .eq('grant_id', grantId)
      ]);

      if (labRes.error) throw labRes.error;
      if (dirRes.error) throw dirRes.error;
      if (catsRes.error) throw catsRes.error;
      if (actRes.error) throw actRes.error;

      const laborRows = labRes.data || [];
      const directRows = dirRes.data || [];
      const cats      = catsRes.data || [];
      const actuals   = actRes.data || [];

      // Map labor_category_id -> hourly rate
      const rateById = Object.fromEntries(
        cats.map(c => [c.id, Number(c.hourly_rate ?? 0)])
      );

      // ----- Budget totals -----
      let budgetLabor = 0;
      laborRows.forEach(r => {
        const hrs  = Number(r.hours ?? 0);
        const rate = rateById[r.category_id] ?? 0;
        budgetLabor += hrs * rate;
      });

      const budgetDirect = directRows.reduce(
        (sum, r) => sum + Number(r.amount ?? 0),
        0
      );

      const budgetTotal = budgetLabor + budgetDirect;

      // ----- Actual totals (from actuals_net) -----
      const actualTotal = actuals.reduce(
        (sum, a) => sum + Number(a.amount_net ?? 0),
        0
      );

      // For now, treat all actuals as "direct" to keep UI structure
      const actualLabor  = 0;
      const actualDirect = actualTotal;

      // ----- Variances -----
      const varLabor  = budgetLabor  - actualLabor;
      const varDirect = budgetDirect - actualDirect;
      const varTotal  = budgetTotal  - actualTotal;

      renderSummary(root, {
        budgetLabor,
        budgetDirect,
        budgetTotal,
        actualLabor,
        actualDirect,
        actualTotal,
        varLabor,
        varDirect,
        varTotal,
      });

      msg(actuals.length
        ? `Loaded Budget vs Actual for ${actuals.length} actual rows.`
        : 'No actuals found for this grant yet.'
      );
    } catch (e) {
      console.error('[compare] loadCompareForGrant error', e);
      msg(e.message || String(e), true);
    }
  }

  function renderSummary(root, s) {
    const format = (v) =>
      (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00');

    const html = `
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Budget</th>
            <th>Actual</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Labor</th>
            <td>${format(s.budgetLabor)}</td>
            <td>${format(s.actualLabor)}</td>
            <td>${format(s.varLabor)}</td>
          </tr>
          <tr>
            <th>Other Direct</th>
            <td>${format(s.budgetDirect)}</td>
            <td>${format(s.actualDirect)}</td>
            <td>${format(s.varDirect)}</td>
          </tr>
          <tr>
            <th>Total</th>
            <td><strong>${format(s.budgetTotal)}</strong></td>
            <td><strong>${format(s.actualTotal)}</strong></td>
            <td><strong>${format(s.varTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
    `;

    $('#summary', root).innerHTML = html;
  }

  // Kick things off
  await loadGrants();
}
