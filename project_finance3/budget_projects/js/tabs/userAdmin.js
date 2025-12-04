// js/tabs/userAdmin.js
import { $, h } from "../lib/dom.js";
import { client } from "../api/supabase.js";

let _uaUsers = [];
let _uaProjects = [];
let _uaSelectedUserId = null;
let _uaSelectedUserIsAdmin = false;
let _uaUserProjectSet = new Set(); // project_ids for current user

export const template = /*html*/ `
  <article class="full-width-card">
    <!-- HEADER -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <h3 class="text-sm font-semibold text-slate-900">
        User &amp; Project Access (Admin)
      </h3>
      <p class="mt-1 text-[11px] text-slate-600">
        Only admins can open this page. Use it to mark admins and assign which Level 1
        projects each user can see in the planner.
      </p>
      <div id="userAdminMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]"></div>
    </div>

    <!-- BODY -->
    <div class="px-4 py-3">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Users list -->
        <section>
          <h4 class="text-[11px] font-semibold text-slate-800 uppercase tracking-wide mb-1">
            Users
          </h4>
          <div class="border border-slate-200 rounded-md bg-white max-h-[360px] overflow-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 text-[11px] text-slate-600">
                <tr>
                  <th class="px-2 py-1 text-left">Email</th>
                  <th class="px-2 py-1 text-center">Admin</th>
                </tr>
              </thead>
              <tbody id="userAdminUsersBody">
                <tr>
                  <td colspan="2" class="text-center text-[11px] text-slate-500 py-4">
                    Loading users…
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Project access -->
        <section>
          <h4 class="text-[11px] font-semibold text-slate-800 uppercase tracking-wide mb-1">
            Level 1 Project Access
          </h4>
          <div
            id="userAdminProjectsBox"
            class="border border-slate-200 rounded-md bg-white max-h-[360px] overflow-auto p-2 text-xs"
          >
            <p class="text-[11px] text-slate-500">
              Select a user on the left to edit their project access.
            </p>
          </div>
        </section>
      </div>
    </div>
  </article>
`;

export const userAdminTab = {
  template,
  async init({ root }) {
    const msg = $("#userAdminMessage", root);
    msg.textContent = "Checking admin access…";

    // 1) Load users via admin-only RPC
    const { data: users, error: usersErr } = await client.rpc("list_app_users");

    if (usersErr) {
      console.error("[UserAdmin] list_app_users error", usersErr);
      msg.textContent =
        "You are not an admin or cannot access the admin console.";
      const tbody = $("#userAdminUsersBody", root);
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="2" class="text-center text-[11px] text-red-500 py-4">
              Access denied.
            </td>
          </tr>
        `;
      }
      return;
    }

    _uaUsers = users || [];

    // 2) Load Level 1 projects (admins can see all)
    const { data: projects, error: projErr } = await client
      .from("projects")
      .select("id, project_code, name")
      .order("project_code");

    if (projErr) {
      console.error("[UserAdmin] load projects error", projErr);
      msg.textContent = "Error loading projects.";
      return;
    }

    _uaProjects = (projects || []).filter(
      (p) => !p.project_code.includes(".") // Level 1 only
    );

    msg.textContent = "Select a user on the left.";

    renderUsers(root);
  },
};

// ─────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────

function renderUsers(root) {
  const tbody = $("#userAdminUsersBody", root);
  if (!tbody) return;

  if (!_uaUsers.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="2" class="text-center text-[11px] text-slate-500 py-4">
          No users found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  _uaUsers.forEach((u) => {
    const tr = document.createElement("tr");
    tr.className =
      "cursor-pointer hover:bg-slate-50 border-b border-slate-100 text-[11px]";
    tr.dataset.userId = u.id;

    const isSel = u.id === _uaSelectedUserId;
    if (isSel) {
      tr.classList.add("bg-blue-50");
    }

    tr.innerHTML = `
      <td class="px-2 py-1">${u.email}</td>
      <td class="px-2 py-1 text-center">
        <input
          type="checkbox"
          class="ua-admin-toggle"
          data-user-id="${u.id}"
          ${u.is_admin ? "checked" : ""}
        />
      </td>
    `;

    tr.addEventListener("click", (evt) => {
      // avoid double-handling when click on checkbox
      if (evt.target && evt.target.classList.contains("ua-admin-toggle")) return;
      handleSelectUser(root, u.id);
    });

    tbody.appendChild(tr);
  });

  // Wire admin toggles
  tbody.querySelectorAll(".ua-admin-toggle").forEach((input) => {
    input.addEventListener("change", async (e) => {
      e.stopPropagation();
      const userId = e.target.dataset.userId;
      const isAdmin = e.target.checked;
      await handleToggleAdmin(userId, isAdmin, root);
    });
  });
}

async function handleSelectUser(root, userId) {
  _uaSelectedUserId = userId;
  const u = _uaUsers.find((x) => x.id === userId);
  _uaSelectedUserIsAdmin = !!u?.is_admin;

  // Reload rows to update highlight
  renderUsers(root);

  const msg = $("#userAdminMessage", root);
  msg.textContent = `Editing access for ${u?.email || ""}`;

  // Load memberships for this user
  const { data: mem, error: memErr } = await client
    .from("project_memberships")
    .select("project_id")
    .eq("user_id", userId);

  if (memErr) {
    console.error("[UserAdmin] load memberships error", memErr);
    msg.textContent = "Error loading user project access.";
    _uaUserProjectSet = new Set();
  } else {
    _uaUserProjectSet = new Set((mem || []).map((m) => m.project_id));
  }

  renderProjectAccess(root);
}

function renderProjectAccess(root) {
  const box = $("#userAdminProjectsBox", root);
  if (!box) return;

  if (!_uaSelectedUserId) {
    box.innerHTML = `
      <p class="text-[11px] text-slate-500">
        Select a user on the left to edit their project access.
      </p>
    `;
    return;
  }

  if (!_uaProjects.length) {
    box.innerHTML = `
      <p class="text-[11px] text-slate-500">
        No Level 1 projects found.
      </p>
    `;
    return;
  }

  box.innerHTML = "";

  const list = document.createElement("div");
  list.className = "space-y-1";

  _uaProjects.forEach((p) => {
    const div = document.createElement("div");
    div.className = "flex items-center gap-2 text-[11px]";

    const id = `ua-proj-${p.id}`;
    const checked = _uaUserProjectSet.has(p.id);

    div.innerHTML = `
      <input
        type="checkbox"
        id="${id}"
        class="ua-project-toggle h-3 w-3"
        data-project-id="${p.id}"
        ${checked ? "checked" : ""}
      />
      <label for="${id}" class="cursor-pointer">
        <span class="font-mono">${p.project_code}</span>
        <span class="text-slate-600">– ${p.name}</span>
      </label>
    `;

    list.appendChild(div);
  });

  box.appendChild(list);

  box.querySelectorAll(".ua-project-toggle").forEach((input) => {
    input.addEventListener("change", async (e) => {
      const projectId = e.target.dataset.projectId;
      const checked = e.target.checked;
      await handleToggleProject(projectId, checked, root);
    });
  });
}

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

async function handleToggleAdmin(userId, isAdmin, root) {
  const msg = $("#userAdminMessage", root);
  msg.textContent = "Updating admin flag…";

  const { error } = await client.rpc("set_user_admin", {
    p_user_id: userId,
    p_is_admin: isAdmin,
  });

  if (error) {
    console.error("[UserAdmin] set_user_admin error", error);
    msg.textContent = "Error updating admin flag.";
    // revert checkbox visually
    const u = _uaUsers.find((x) => x.id === userId);
    if (u) {
      const old = !!u.is_admin;
      u.is_admin = old;
      renderUsers(root);
    }
    return;
  }

  const u = _uaUsers.find((x) => x.id === userId);
  if (u) u.is_admin = isAdmin;

  if (userId === _uaSelectedUserId) {
    _uaSelectedUserIsAdmin = isAdmin;
  }

  msg.textContent = "Admin flag updated.";
}

async function handleToggleProject(projectId, checked, root) {
  if (!_uaSelectedUserId) return;
  const msg = $("#userAdminMessage", root);
  msg.textContent = "Updating project access…";

  if (checked) {
    const { error } = await client
      .from("project_memberships")
      .insert({ user_id: _uaSelectedUserId, project_id: projectId });

    if (error) {
      console.error("[UserAdmin] grant project error", error);
      msg.textContent = "Error granting project access.";
      return;
    }
    _uaUserProjectSet.add(projectId);
  } else {
    const { error } = await client
      .from("project_memberships")
      .delete()
      .eq("user_id", _uaSelectedUserId)
      .eq("project_id", projectId);

    if (error) {
      console.error("[UserAdmin] revoke project error", error);
      msg.textContent = "Error revoking project access.";
      return;
    }
    _uaUserProjectSet.delete(projectId);
  }

  msg.textContent = "Project access updated.";
}
