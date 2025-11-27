async function loadChildProjects(root, level1ProjectId) {
  const tbody = $("#childProjectsBody", root);
  if (!tbody || !level1ProjectId) {
    tbody && (tbody.innerHTML = `<tr><td colspan="5">Select a Level 1 project above.</td></tr>`);
    return;
  }

  tbody.innerHTML = `<tr><td colspan="5">Loading child projects…</td></tr>`;

  const { data: parent } = await client
    .from("projects")
    .select("project_code")
    .eq("id", level1ProjectId)
    .single();

  if (!parent) {
    tbody.innerHTML = `<tr><td colspan="5">Parent project not found.</td></tr>`;
    return;
  }

  const { data, error } = await client
    .from("projects")
    .select("id, project_code, name, revenue_formula, pop_start, pop_end, funding")
    .like("project_code", `${parent.project_code}.%`)
    .order("project_code");

  if (error || !data?.length) {
    tbody.innerHTML = `<tr><td colspan="5">No child projects found.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  data.forEach(proj => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.classList.add("hover:bg-blue-50", "transition-colors");

    const pop = proj.pop_start && proj.pop_end
      ? `${new Date(proj.pop_start).toLocaleDateString()} – ${new Date(proj.pop_end).toLocaleDateString()}`
      : "";

    const funding = proj.funding ? Number(proj.funding).toLocaleString() : "";

    tr.innerHTML = `
      <td><strong>${proj.project_code}</strong></td>
      <td>${proj.name}</td>
      <td>${proj.revenue_formula || ""}</td>
      <td>${pop}</td>
      <td class="num">${funding}</td>
    `;

    // THIS IS THE CRITICAL LINE — WAS MISSING OR BROKEN BEFORE
    tr.addEventListener("click", () => {
      console.log("[ProjectSelect] User clicked project → setting selected project:", proj);

      setSelectedProject({
        id: proj.id,
        project_code: proj.project_code,
        name: proj.name,
      });

      // Visual feedback
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("bg-blue-100"));
      tr.classList.add("bg-blue-100", "font-medium");
    });

    tbody.appendChild(tr);
  });
}
