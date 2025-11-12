// /js/tabs/auth.js
import { client } from "../api/supabase.js";
import { $ } from "../lib/dom.js";

export const template = /*html*/`
  <article>
    <h3>Sign in</h3>
    <div id="authState" style="margin-bottom:.5rem"></div>
    <div class="grid" style="max-width:360px">
      <input id="email" type="email" placeholder="you@example.com">
      <input id="pwd" type="password" placeholder="Password">
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
  const msg = (t, e=false)=> {
    const m = $('#msg', root);
    if (!m) return console.warn("[auth] #msg not found; text:", t);
    m.textContent = t;
    m.style.color = e ? '#b00' : 'inherit';
  };

  try {
    console.log("[auth] init()");
    const { data } = await client.auth.getSession();
    const who = data.session?.user?.email || null;
    $('#authState', root).textContent = who ? `Signed in: ${who}` : 'Not signed in';
  } catch (e) {
    console.error("[auth] getSession error:", e);
  }

  // Bind handlers (with logs)
  const signInBtn  = $('#signin',  root);
  const signUpBtn  = $('#signup',  root);
  const signOutBtn = $('#signout', root);
  const resetBtn   = $('#reset',   root);

  if (!signInBtn || !signUpBtn || !signOutBtn) {
    console.error("[auth] buttons missing – template not mounted?");
    return;
  }

  signInBtn.addEventListener("click", async () => {
    console.log("[auth] signin click");
    msg('Signing in…');
    try {
      const email = $('#email',root).value.trim();
      const password = $('#pwd',root).value;
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        console.warn("[auth] signIn error:", error);
        return msg(error.message, true);
      }
      console.log("[auth] signIn OK:", data?.user?.email);
      $('#authState', root).textContent = `Signed in: ${data.user.email}`;
      msg('OK');
      // optional: redirect to grants
      // location.hash = '#grants';
    } catch (e) {
      console.error("[auth] signIn exception:", e);
      msg(e.message || String(e), true);
    }
  });

  signUpBtn.addEventListener("click", async () => {
    console.log("[auth] signup click");
    msg('Signing up…');
    const email = $('#email',root).value.trim();
    const password = $('#pwd',root).value;
    try {
      const { data, error } = await client.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${location.origin}/#/auth` }
      });
      if (error) {
        console.warn("[auth] signUp error:", error);
        return msg(error.message, true);
      }
      // If email confirmations are OFF, session returns immediately:
      if (data.session?.user) {
        console.log("[auth] signup immediate session");
        $('#authState', root).textContent = `Signed in: ${data.session.user.email}`;
        return msg('Signed up & signed in!');
      }
      msg('Check your email to confirm.');
    } catch (e) {
      console.error("[auth] signUp exception:", e);
      msg(e.message || String(e), true);
    }
  });

  signOutBtn.addEventListener("click", async () => {
    console.log("[auth] signout click");
    await client.auth.signOut();
    $('#authState', root).textContent = 'Not signed in';
    msg('Signed out.');
  });

  // Reset password
  resetBtn.addEventListener("click", async () => {
    console.log("[auth] reset click");
    const email = $('#email', root).value.trim();
    if (!email) return msg('Enter your email first', true);
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/#/auth?mode=rp`
    });
    msg(error ? error.message : 'Reset link sent. Check your email.');
  });

  // If coming back from a reset link, show "set new password"
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (params.get('mode') === 'rp') {
    console.log("[auth] recovery mode");
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="grid" style="max-width:360px;margin-top:1rem">
        <input id="newpwd" type="password" placeholder="New password">
        <button id="setpwd" type="button">Set new password</button>
      </div>`;
    root.appendChild(wrap);
    $('#setpwd', wrap).onclick = async () => {
      console.log("[auth] set new password");
      const newPwd = $('#newpwd', wrap).value;
      const { error } = await client.auth.updateUser({ password: newPwd });
      msg(error ? error.message : 'Password updated. You can sign in now.');
    };
  }
}
