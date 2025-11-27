// js/main.js
import { client } from "./api/supabase.js";
import { $, h } from "./lib/dom.js";

import { authTab } from "./tabs/auth.js";
import { projectSelectTab } from "./tabs/projectSelect.js";
import { newProjectsTab } from "./tabs/newProjects.js";
import { summaryPlanTab } from "./tabs/summaryPlan.js";
import { revenueBudgetTab } from "./tabs/revenueBudget.js";
import { costBudgetTab } from "./tabs/costBudget.js";
import { adminTab } from "./tabs/admin.js";

const tabs = {
  auth: authTab,
  projectSelect: projectSelectTab,
  newProjects: newProjectsTab,
  summaryPlan: summaryPlanTab,
  revenueBudget: revenueBudgetTab,
  costBudget: costBudgetTab,
  admin: adminTab,
};

let currentSession = null;

async function loadSession() {
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.error("auth.getSession error", error);
    return null;
  }
  currentSession = data.session;
  updateAuthUI();
  return currentSession;
}

function updateAuthUI() {
  const userSpan = $("#currentUser");
  if (!userSpan) return;
  if (currentSession?.user) {
    userSpan.textContent = currentSession.user.email || "Signed in";
  } else {
    userSpan.textContent = "Not signed in";
  }
}

function renderTab(tabKey) {
  const mainEl = $("#appMain");
  if (!mainEl) return;

  // Guard: only auth tab if not signed in
  if (!currentSession && tabKey !== "auth") {
    tabKey = "auth";
  }

  const tab = tabs[tabKey] || tabs.auth;
  mainEl.innerHTML = tab.template;

  // Update active button
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("tab-active", btn.dataset.tab === tabKey);
  });

  if (typeof tab.init === "function") {
    tab.init({ root: mainEl, session: currentSession, client });
  }
}

function initNav() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const key = e.currentTarget.dataset.tab;
      renderTab(key);
    });
  });
}

async function main() {
  initNav();
  await loadSession();

  // Listen for auth changes
  client.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    updateAuthUI();
    // If user just logged in, jump to projectSelect tab
    if (session) {
      renderTab("projectSelect");
    } else {
      renderTab("auth");
    }
  });

  // Initial tab
  if (currentSession) {
    renderTab("projectSelect");
  } else {
    renderTab("auth");
  }
}

document.addEventListener("DOMContentLoaded", main);
