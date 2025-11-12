// /js/tabs/auth.js
import { client } from "../api/supabase.js";

export const template = /*html*/`
  <article>
    <h3>Sign in</h3>
    <div id="authState" style="margin-bottom:.5rem">Loading session…</div>

    <div class="grid" style="max-width:360px">
      <input id="email" type="email" placeholder="you@example.com" autocomplete="username email">
      <input id="pwd" type="password" placeholder="Password" autocomplete="current-password">
    </div>

    <div class="grid" style="max-width:360px;margin-top:.5rem">
      <button id="signin"  type="button">Sign in</button>
      <button id="signup"  type="button" class="secondary">Sign up</button>
      <button id="signout" type="button" class="contrast">Sign out</button>
    </div>

    <div class="grid" style="max-width:360px;margin-top:.5rem">
      <button id="reset"   type="button" class="outline">Reset password</button>
    </div>

    <small id="msg"></small>
  </article>
`;

export async function init(root) {
  console.log("[auth] init() (delegated handlers)");
  root.innerHTML = template;

  const msg = (t, isErr = false) => {
    const m = root.querySelector('#msg');
    if (!m) return console.warn("[auth] #msg missing; wanted to show:", t);
    m.textContent = t;
    m.style.color = isErr ? '#b00' : 'inherit';
  };

  // Initial session state
  try {
    const { data } = await client.auth.getSession();
    const who = data.session?.user?.email || null;
    root.querySelector('#authState').textContent = who ? `Signed in: ${who}` : 'Not signed in';
  } catch (e) {
    console.error("[auth] getSession error:", e);
  }

  // Delegated click handler (one handler covers all buttons)
  document.addEventListener('click', onClick, { capture: true });

  async function onClick(ev) {
    const id = ev.target?.id;
    if (!id) return;
    if (!root.contains(ev.target)) return; // ignore clicks outside this tab
    console.log(`[auth] click -> #${id}`);

    const email = root.querySelector('#email')?.value.trim() || '';
    const password = root.querySelector('#pwd')?.value || '';

    try {
      if (id === 'signin') {
        msg('Signing in…');
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) { console.warn("[auth] signIn error:", error); return msg(error.message, true); }
        root.querySelector('#authState').textContent = `Signed in: ${data.user.email}`;
        msg('OK');
        location.hash = '#grants'; // redirect to protected tab
      } else if (id === 'signup') {
        msg('Signing up…');
        const { data, error } = await client.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/#/auth` }
        });
        if (error) { console.warn("[auth] signUp error:", error); return msg(error.message, true); }
        if (data.session?.user) {
          root.querySelector('#authState').textContent = `Signed in: ${data.session.user.email}`;
          msg('Signed up & signed in!');
          location.hash = '#grants';
        } else {
          msg('Check your email to confirm.');
        }
      } else if (id === 'signout') {
        await client.auth.signOut();
        root.querySelector('#authState').textContent = 'Not signed in';
        msg('Signed out.');
      } else if (id === 'reset') {
        if (!email) return msg('Enter your email first', true);
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/#/auth?mode=rp`
        });
        msg(error ? error.message : 'Reset link sent. Check your email.');
      }
    } catch (e) {
      console.error("[auth] click handler exception:", e);
      msg(e.message || String(e), true);
    }
  }

  // Recovery flow: set new password after reset link
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (params.get('mode') === 'rp') {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="grid" style="max-width:360px;margin-top:1rem">
        <input id="newpwd" type="password" placeholder="New password" autocomplete="new-password">
        <button id="setpwd" type="button">Set new password</button>
      </div>`;
    root.appendChild(wrap);

    document.addEventListener('click', async (e) => {
      if (e.target?.id !== 'setpwd' || !root.contains(e.target)) return;
      const newPwd = root.querySelector('#newpwd')?.value || '';
      const { error } = await client.auth.updateUser({ password: newPwd });
      msg(error ? error.message : 'Password updated. You can sign in now.');
    }, { capture: true });
  }
}
