// js/tabs/auth.js
import { client } from "../api/supabase.js";

export const template = /*html*/`
  <article>
    <h3>Sign in</h3>
    <div id="authState" style="margin-bottom:.5rem">Loading session…</div>

    <!-- Email + Password stacked, wider -->
    <div class="grid" style="max-width:720px; grid-template-columns:1fr; gap:0.25rem;">
      <label>
        Email
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="username email"
          style="width:100%;"
        >
      </label>
      <label>
        Password
        <input
          id="pwd"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
          style="width:100%;"
        >
      </label>
    </div>

    <!-- Buttons row (also widened a bit for consistency) -->
    <div class="grid" style="max-width:720px;margin-top:.5rem;gap:0.35rem;">
      <button id="signin" type="button">Sign in</button>
      <button id="signup" type="button" class="secondary">Sign up</button>
      <button id="signout" type="button" class="contrast">Sign out</button>
    </div>

    <div class="grid" style="max-width:720px;margin-top:.5rem;">
      <button id="reset" type="button" class="outline">Reset password</button>
    </div>

    <small id="msg"></small>
  </article>
`;

export async function init(root) {
  console.log("[auth] init()");
  root.innerHTML = template;

  const msg = (t, isErr = false) => {
    const m = root.querySelector('#msg');
    if (!m) return console.warn("[auth] #msg missing; wanted to show:", t);
    m.textContent = t;
    m.style.color = isErr ? '#b00' : 'inherit';
    if (t) {
      setTimeout(() => {
        if (m.textContent === t) m.textContent = "";
      }, 5000);
    }
  };

  // Initial session state
  try {
    const { data } = await client.auth.getSession();
    const who = data.session?.user?.email || null;
    const stateEl = root.querySelector('#authState');
    if (stateEl) stateEl.textContent = who ? `Signed in: ${who}` : 'Not signed in';
  } catch (e) {
    console.error("[auth] getSession error:", e);
  }

  // Delegated click handler
  const handleClick = async (ev) => {
    const id = ev.target?.id;
    if (!id || !root.contains(ev.target)) return;

    console.log(`[auth] click -> #${id}`);
    const email = root.querySelector('#email')?.value.trim() || '';
    const password = root.querySelector('#pwd')?.value || '';

    try {
      if (id === 'signin') {
        msg('Signing in…');
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) return msg(error.message, true);

        location.hash = '#grants';
        if (root.isConnected) {
          const el = root.querySelector('#authState');
          if (el) el.textContent = `Signed in: ${data.user.email}`;
          msg('Signed in!');
        }

      } else if (id === 'signup') {
        msg('Signing up…');
        const { data, error } = await client.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/#/auth` }
        });
        if (error) return msg(error.message, true);

        if (data.session?.user) {
          location.hash = '#grants';
          if (root.isConnected) {
            root.querySelector('#authState').textContent = `Signed in: ${data.session.user.email}`;
            msg('Signed up & signed in!');
          }
        } else {
          msg('Check your email to confirm.');
        }

      } else if (id === 'signout') {
        await client.auth.signOut();
        if (root.isConnected) {
          root.querySelector('#authState').textContent = 'Not signed in';
          msg('Signed out.');
        }

      } else if (id === 'reset') {
        if (!email) return msg('Enter your email first', true);
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/#/auth?mode=rp`
        });
        msg(error ? error.message : 'Reset link sent. Check your email.');
      }
    } catch (e) {
      console.error("[auth] click handler exception:", e);
      if (root.isConnected) msg(e.message || String(e), true);
    }
  };

  document.addEventListener('click', handleClick, { capture: true });

  // Recovery flow: set new password after reset link
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (params.get('mode') === 'rp') {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="grid" style="max-width:720px;margin-top:1rem;gap:0.25rem;">
        <label>
          New Password
          <input id="newpwd" type="password" placeholder="Enter new password" autocomplete="new-password" style="width:100%;">
        </label>
        <button id="setpwd" type="button">Set new password</button>
      </div>`;
    root.appendChild(wrap);

    const setPwdHandler = async (e) => {
      if (e.target?.id !== 'setpwd' || !root.contains(e.target)) return;
      const newPwd = root.querySelector('#newpwd')?.value || '';
      if (!newPwd) return msg('Password required', true);

      const { error } = await client.auth.updateUser({ password: newPwd });
      if (root.isConnected) {
        msg(error ? error.message : 'Password updated. You can sign in now.', error);
      }
    };

    document.addEventListener('click', setPwdHandler, { capture: true });
  }
}
