// js/main.js
import { client } from "./api/supabase.js";
import { $, $$ } from "./lib/dom.js";

import { authTab } from "./tabs/auth.js";
import { adminEmployeesTab } from "./tabs/admin-employees.js";
import { projectsTab } from "./tabs/projects.js";
import { assignmentsTab } from "./tabs/assignments.js";
import { timesheetTab } from "./tabs/timesheet.js";
import { timesheetApprovalsTab } from "./tabs/timesheet-approvals.js";

const tabs = {
  auth: authTab,
  adminEmployees: adminEmployeesTab,
  projects: projectsTab,
  assignments: assignmentsTab,
  timesheet: timesheetTab,
  approvals: timesheetApprovalsTab,
};

async function showTab(name) {
  const tab = tabs[name] || tabs.auth;
  const root = $("#appRoot");
  // Clear existing
  root.innerHTML = "<p>Loading…</p>";
  // Highlight nav
  $$(".main-nav button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  // Init tab
  await tab.init(root);
}

function initNav() {
  $$(".main-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabName = btn.dataset.tab;
      window.location.hash = tabName;
      showTab(tabName);
    });
  });
}

async function bootstrap() {
  initNav();

  let initial = window.location.hash.replace("#", "");
  if (!initial || !tabs[initial]) initial = "auth";
  await showTab(initial);

  window.addEventListener("hashchange", () => {
    const name = window.location.hash.replace("#", "") || "auth";
    showTab(name);
  });
}

bootstrap();
