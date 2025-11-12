import { client } from './api/supabase.js';
import { $ } from './lib/dom.js';
import * as authTab    from './tabs/auth.js';
import * as grantsTab  from './tabs/grants.js';
import * as budgetTab  from './tabs/budget.js';
import * as actualsTab from './tabs/actuals.js';
import * as compareTab from './tabs/compare.js';
import * as summaryTab from './tabs/summary.js';

const routes = {
  '#auth':    authTab,
  '#grants':  grantsTab,
  '#budget':  budgetTab,
  '#actuals': actualsTab,
  '#compare': compareTab,
  '#summary': summaryTab,
};

async function render() {
  const hash = location.hash || '#auth';
  const mod  = routes[hash] || authTab;
  $('#app').innerHTML = mod.template;
  await mod.init($('#app'));
}

window.addEventListener('hashchange', render);
window.addEventListener('load', render);

// keep profile row in sync (create profile on first sign-in)
client.auth.onAuthStateChange(async (_e, session) => {
  const user = session?.user;
  if (user) {
    await fetchOrCreateProfile(user);
  }
});

async function fetchOrCreateProfile(user) {
  const { data } = await client.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!data) await client.from('profiles').insert({ id: user.id, email: user.email, full_name: user.user_metadata?.name || null }).select();
}
