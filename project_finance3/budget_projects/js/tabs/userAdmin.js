// js/userAdmin.js
import { client } from "../api/supabase.js";
import { $, h } from "../lib/dom.js";

export const template = /*html*/ `
  <article class="full-width-card">
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-slate-700">
        <span class="font-medium">User &amp; Project Access (Admin)</span>
      </div>
      <div id="userAdminMessage" class="text-[11px] text-slate-500 mt-1 min-h-[1.1rem]">
        Only admins can open this page. Use it to mark admins and assign which Level 1 projects each user can see in the planner.
      </div>
    </div>

    <div class="px-4 py-3 space-y-3">
      <section class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <!-- Users -->
        <div class="border border-slate-200 rounded-md bg-white p-2 text-xs">
          <div class="flex items-center justify-between mb-1">
            <h4 class="font-semibold text-[11px] uppercase tracking-wide text-slate-700">
              Users
            </h4>
          </div>
          <div class="border border-slate-200 rounded-md max-h-[320px] overflow-y-auto">
            <table class="min-w-full text-xs">
              <thead class="bg-slate-50">
                <tr>
                  <th class="px-2 py-1 text-left text-[11px] font-semibold text-slate-700">Email</th>
                  <th class="px-2 py-1 text-center text-[11px] font-semibold text-slate-700">Admin</th>
                </tr>
              </thead>
              <tbody id="userAdminUsersBody">
                <tr>
                  <td colspan="2" class="px-2 py-4 text-center text-[11px] text-slate-500">
                    Loading…
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Project access -->
        <div class="md:col-span-2 border border-slate-200 rounded-md bg-white p-2 text-xs">
          <h4 class="font-semibold text-[11px] uppercase tracking-wide text-slate-700 mb-1">
            Level 1 Project Access
          </h4>
          <p class="text-[11px] text-slate-500 mb-2">
            Select a user on the left to edit their project access.
          </p>
          <div id="userAdminAccessPanel" class="space-y-2">
            <div class="text-[11px] text-slate-400">
              No user selected.
            </div>
          </div>
        </div>
      </section>
    </div>
  </article>
`;

export const userAdminTab = {
  template,
  async init({ root }) {
    const msgEl = $("#userAdminMessage", root);
    const usersBody = $("#userAdminUsersBody", root);
    const accessPanel = $("#userAdminAccessPanel", root);

    // 1) Check admin flag via RPC
    const { data: isAdmin, error: adminErr } = await client.rpc("is_admin");

    if (adminErr) {
      console.error("[UserAdmin] is_admin rpc error", adminErr);
    }

    if (!isAdmin) {
      if (msgEl) {
        msgEl.textContent =
          "You are not an admin or cannot access the admin console.";
      }
      if (usersBody) {
        usersBody.innerHTML = `
          <tr>
            <td colspan="2" class="px-2 py-4 text-center text-[11px] text-slate-500">
              Access denied.
            </td>
          </tr>`;
      }
      if (accessPanel) {
        accessPanel.innerHTML = `
          <div class="text-[11px] text-red-500">
            Access denied. Only admins can edit users and project access.
          </div>`;
      }
      return;
    }

    if (msgEl) {
      msgEl.textContent = "You are an admin. Use this page to manage access.";
    }

    // 2) Load user list (emails + admin flag).
    //    We’ll use auth.users via a helper RPC so we don’t deal with auth.* directly.
    const { data: users, error: usersErr } = await client.rpc(
      "get_app_users_for_admin"
    );

    if (usersErr) {
      console.error("[UserAdmin] get_app_users_for_admin error", usersErr);
      usersBody.innerHTML = `
        <tr>
          <td colspan="2" class="px-2 py-4 text-center text-[11px] text-red-500">
            Failed to load users.
          </td>
        </tr>`;
      return;
    }

    // 3) Load Level 1 projects once
    const { data: projects, error: projErr } = await client
      .from("projects")
      .select("id, project_code, name")
      .order("project_code");

    if (projErr) {
      console.error("[UserAdmin] load projects error", projErr);
    }

    const level1Projects = (projects || []).filter(
      (p) => !p.project_code.includes(".")
    );

    // Helper: render access checkboxes for one user
    async function loadUserAccess(user) {
      if (!accessPanel) return;
      accessPanel.innerHTML = `
        <div class="mb-1 text-[11px]">
          Editing access for <span class="font-semibold">${user.email}</span>
        </div>
        <div id="userAdminProjectList" class="border border-slate-200 rounded-md max-h-[320px] overflow-y-auto">
          <table class="min-w-full text-xs">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-2 py-1 text-left text-[11px] font-semibold text-slate-700">Level 1 Project</th>
                <th class="px-2 py-1 text-center text-[11px] font-semibold text-slate-700">Can Access</th>
              </tr>
            </thead>
            <tbody id="userAdminProjectBody">
              <tr>
                <td colspan="2" class="px-2 py-4 text-center text-[11px] text-slate-500">
                  Loading…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `;

      const projectBody = $("#userAdminProjectBody", root);
      if (!projectBody) return;

      const { data: memberships, error: memErr } = await client
        .from("project_memberships")
        .select("project_id")
        .eq("user_id", user.id);

      if (memErr) {
        console.error("[UserAdmin] load memberships error", memErr);
        projectBody.innerHTML = `
          <tr>
            <td colspan="2" class="px-2 py-4 text-center text-[11px] text-red-500">
              Failed to load project access.
            </td>
          </tr>`;
        return;
      }

      const memberSet = new Set((memberships || []).map((m) => m.project_id));

      projectBody.innerHTML = "";
      level1Projects.forEach((p) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="px-2 py-1 text-[11px]">${p.project_code} – ${p.name}</td>
          <td class="px-2 py-1 text-center">
            <input
              type="checkbox"
              data-project-id="${p.id}"
              ${memberSet.has(p.id) ? "checked" : ""}
            />
          </td>
        `;
        projectBody.appendChild(tr);
      });

      // Wire checkbox changes
      projectBody.addEventListener("change", async (e) => {
        const cb = e.target;
        if (cb.tagName !== "INPUT") return;
        const projectId = cb.dataset.projectId;
        if (!projectId) return;

        if (cb.checked) {
          // add membership
          const { error: insErr } = await client
            .from("project_memberships")
            .insert({
              user_id: user.id,
              project_id: projectId,
            });
          if (insErr) {
            console.error("[UserAdmin] insert membership error", insErr);
            cb.checked = false;
          }
        } else {
          // remove membership
          const { error: delErr } = await client
            .from("project_memberships")
            .delete()
            .eq("user_id", user.id)
            .eq("project_id", projectId);
          if (delErr) {
            console.error("[UserAdmin] delete membership error", delErr);
            cb.checked = true;
          }
        }
      });
    }

    // 4) Render users list + click handlers
    usersBody.innerHTML = "";
    users.forEach((u) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50 cursor-pointer";
      tr.innerHTML = `
        <td class="px-2 py-1 text-[11px]">${u.email}</td>
        <td class="px-2 py-1 text-center">
          <input type="checkbox" data-user-id="${u.id}" ${
        u.is_admin ? "checked" : ""
      } />
        </td>
      `;
      // row click -> load project access
      tr.addEventListener("click", (evt) => {
        // avoid double-trigger when clicking the checkbox
        if (evt.target.tagName === "INPUT") return;
        loadUserAccess(u);
      });

      // admin checkbox change
      const adminCheckbox = tr.querySelector("input[type='checkbox']");
      adminCheckbox.addEventListener("change", async () => {
        const makeAdmin = adminCheckbox.checked;
        if (makeAdmin) {
          const { error: upErr } = await client
            .from("admins")
            .upsert({
              user_id: u.id,
              email: u.email,
              is_admin: true,
            });
          if (upErr) {
            console.error("[UserAdmin] upsert admin error", upErr);
            adminCheckbox.checked = !makeAdmin;
          }
        } else {
          const { error: delErr } = await client
            .from("admins")
            .delete()
            .eq("user_id", u.id);
          if (delErr) {
            console.error("[UserAdmin] delete admin error", delErr);
            adminCheckbox.checked = !makeAdmin;
          }
        }
      });

      usersBody.appendChild(tr);
    });
  },
};
