// js/router.js
// Simple hash router for single-page app
// Supports: #grant, #budget, #actuals, #bva, #metrics

const routes = {
  '#grant': () => import('./tabs/grant-info.js').then(m => m.grantTab),
  '#budget': () => import('./tabs/budget.js').then(m => m.budgetTab),
  '#actuals': () => import('./tabs/actuals.js').then(m => m.actualsTab),
  '#bva': () => import('./tabs/bva.js').then(m => m.bvaTab),
  '#metrics': () => import('./tabs/metrics.js').then(m => m.metricsTab),
};

// Default tab
const DEFAULT_ROUTE = '#grant';

// Main container where tabs render
const appContainer = document.getElementById('app');

// Navigation links (update these in your HTML)
const navLinks = [
  { hash: '#grant', label: 'Grant Info' },
  { hash: '#budget', label: 'Budget' },
  { hash: '#actuals', label: 'Actuals' },
  { hash: '#bva', label: 'Budget vs Actual' },
  { hash: '#metrics', label: 'Metrics' },
];

let currentTab = null;

// Initialize router
export function initRouter() {
  renderNav();
  window.addEventListener('hashchange', handleRoute);
  handleRoute(); // initial load
}

function handleRoute() {
  const hash = window.location.hash || DEFAULT_ROUTE;
  const route = routes[hash];

  if (!route) {
    console.warn(`No route for ${hash}, falling back to default`);
    navigateTo(DEFAULT_ROUTE);
    return;
  }

  loadTab(route, hash);
}

async function loadTab(loader, hash) {
  if (currentTab && currentTab.hash === hash) return;

  appContainer.innerHTML = '<div class="p-8 text-center">Loading...</div>';

      // After loading the tab module
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const grantId = urlParams.get('grant');
    
    // Pass grantId to init if supported
    if (typeof init === 'function') {
      await init(appContainer, { grantId });
    }
  try {
    const { template, init } = await loader();
    appContainer.innerHTML = template;

    // Highlight active nav
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('font-bold', link.dataset.hash === hash);
    });

    // Store current
    currentTab = { hash, init };

    // Initialize tab
    if (typeof init === 'function') {
      await init(appContainer);
    }
  } catch (err) {
    console.error('Failed to load tab:', err);
    appContainer.innerHTML = `<div class="p-8 text-red-600">Error loading tab: ${err.message}</div>`;
  }
}

function renderNav() {
  const nav = document.getElementById('nav') || createNavContainer();
  nav.innerHTML = navLinks.map(link => `
    <a href="${link.hash}" 
       class="nav-link px-4 py-2 text-sm hover:bg-slate-100 rounded-md transition ${window.location.hash === link.hash ? 'font-bold' : ''}"
       data-hash="${link.hash}">
      ${link.label}
    </a>
  `).join('');
}

function createNavContainer() {
  const nav = document.createElement('nav');
  nav.id = 'nav';
  nav.className = 'flex gap-2 p-4 bg-white border-b sticky top-0 z-10 flex-wrap';
  document.body.insertBefore(nav, document.body.firstChild);
  return nav;
}

function navigateTo(hash) {
  window.location.hash = hash;
}

// Optional: expose for debugging
window.navigateTo = navigateTo;
