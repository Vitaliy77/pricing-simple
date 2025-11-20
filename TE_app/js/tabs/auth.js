// js/tabs/auth.js
import { client } from "../api/supabase.js";
import { $ } from "../lib/dom.js";

export const template = /*html*/ `
  <article>
    <h3>Sign in</h3>

    <section style="max-width:480px;margin-bottom:1rem;">
      <p>
        Enter your work email. If it matches an employee record,
        we will send you a magic sign-in link.
      </p>
      <label>
        Email
        <input id="authEmail" type="email" autocomplete="email">
      </label>
      <div style="margin-top:0.5rem;display:flex;gap:0.5rem;align-items:center;">
        <button id="authSend" type="button" class="btn-sm">Send magic link</button>
        <button id="authSignOut" type="button" class="btn-sm secondary">Sign out</button>
        <small id="authMsg"></small>
      </div>
    </section>

    <section id="authStatusSection">
      <p>Checking current session…</p>
    </section>
  </article>
`;

let rootEl = null;

function msg(text, isErr = false) {
  if (!rootEl) return;
  const el = $("#authMsg", rootEl);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isErr ? "#b00" : "inherit";
  if (text) {
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 4000);
  }
}

export async function init(root) {
  rootEl = root;
  root.innerHTML = template;

  $("#authSend", root).addEventListener("click", sendMagicLink);
  $("#authSignOut", root).addEventListener("click", signOut);

  await refreshStatus();
}

async function refreshStatus() {
  const status = $("#authStatusSection", rootEl);
  const statusUser = $("#userStatus");
  const { data, error } = await client.auth.getUser();

  if (error || !data?.user) {
    status.innerHTML = "<p>Not signed in.</p>";
    if (statusUser) statusUser.textContent = "Not signed in";
    return;
  }

  const user = data.user;
  const email = user.email || "";

  // Try to find employee record
  const { data: empRows } = await client
    .from("employees")
    .select("first_name,last_name,is_admin")
    .eq("email", email.toLowerCase())
    .limit(1);

  const emp = empRows?.[0] || null;

  status.innerHTML = `
    <p>Signed in as <strong>${email}</strong>${
      emp
        ? ` (${emp.first_name} ${emp.last_name}${
            emp.is_admin ? ", admin" : ""
          })`
        : ""
    }.</p>
    <p>If you cannot access timesheets, ask admin to link your email to an employee record.</p>
  `;
  if (statusUser) statusUser.textContent = `Signed in: ${email}`;
}

async function sendMagicLink() {
  const email = $("#authEmail", rootEl).value.trim().toLowerCase();
  if (!email) {
    msg("Enter email.", true);
    return;
  }

  // Check if email exists in employees table
  const { data: empRows, error: empErr } = await client
    .from("employees")
    .select("id")
    .eq("email", email)
    .limit(1);

  if (empErr) {
    console.error("[auth] employees lookup error", empErr);
    msg(empErr.message, true);
    return;
  }

  if (!empRows || !empRows.length) {
    msg("This email is not linked to any employee. Ask admin to add you.", true);
    return;
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error) {
    console.error("[auth] magic link error", error);
    msg(error.message, true);
    return;
  }

  msg("Magic link sent. Check your email.");
}

async function signOut() {
  await client.auth.signOut();
  msg("Signed out.");
  await refreshStatus();
}

export const authTab = { template, init };
