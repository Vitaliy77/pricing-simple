// js/lib/projectContext.js
let _selectedProject = null;

let _planContext = {
  year: null,
  versionId: null,
  versionCode: null,
  versionLabel: null,        // e.g. "BUDGET – Annual Budget"
  planType: "Working",
  level1ProjectId: null,
  level1ProjectCode: null,
  level1ProjectName: null,
};

// Update main project header (lowest-level project)
function updateProjectHeader() {
  const el = document.getElementById("currentProject");
  if (!el) return;

  if (!_selectedProject) {
    el.textContent = "No project selected";
    return;
  }

  const code = _selectedProject.project_code || "";
  const name = _selectedProject.name || "";
  el.textContent = `${code} – ${name}`.trim();
}

// Update plan context header (version + type + L1 project)
function updatePlanContextHeader() {
  const el = document.getElementById("planContextHeader");
  if (!el) return;

  const parts = [];

  if (_planContext.versionLabel) {
    parts.push(_planContext.versionLabel);
  } else if (_planContext.versionCode) {
    parts.push(_planContext.versionCode);
  }

  if (_planContext.planType) {
    parts.push(`${_planContext.planType} version`);
  }

  if (_planContext.level1ProjectCode) {
    const l1 = `Level 1 Project: ${_planContext.level1ProjectCode}` +
      (_planContext.level1ProjectName ? ` – ${_planContext.level1ProjectName}` : "");
    parts.push(l1);
  }

  el.textContent = parts.length ? parts.join(" · ") : "No plan selected";
}

export function setSelectedProject(project) {
  _selectedProject = project || null;
  updateProjectHeader();
  updatePlanContextHeader();
}

export function getSelectedProject() {
  return _selectedProject;
}

export function getSelectedProjectId() {
  return _selectedProject?.id ?? null;
}

export function setPlanContext(partial) {
  _planContext = { ..._planContext, ...partial };
  updatePlanContextHeader();
}

export function getPlanContext() {
  return { ..._planContext }; // immutable copy
}
