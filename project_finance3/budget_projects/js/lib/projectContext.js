// js/lib/projectContext.js

let _selectedProject = null;

/**
 * project: { id, project_code, name }
 */
export function setSelectedProject(project) {
  _selectedProject = project;

  // Update header display
  const el = document.getElementById("currentProject");
  if (!el) return;

  if (!project) {
    el.textContent = "";
    return;
  }

  const code = project.project_code || project.code || "";
  const name = project.name || "";
  el.textContent = `${code} ${name}`.trim();
}

export function getSelectedProject() {
  return _selectedProject;
}

export function getSelectedProjectId() {
  return _selectedProject?.id ?? null;
}
