import { client } from "../api/supabase.js";
import { $ } from "../lib/dom.js";

export const template = /*html*/`
  <article>
    <h3>Sign in</h3>
    <div id="authState"></div>
    <div class="grid">
      <input id="email" type="email" placeholder="you@example.com">
      <input id="pwd" type="password" placeholder="Password">
    </div>
    <div class="grid">
      <button id="signin">Sign in</button>
      <button id="signup" class="secondary">Sign up</button>
      <button id="signout" class="contrast">Sign out</button>
    </div>
    <small id="msg"></small>
  </article>
`;

export async function init(root) {
  const msg = (t, e=false)=> { $('#msg', root).textContent=t; $('#msg', root).style.color=e?'#b00':'inherit'; };
  const sess = await client.auth.getSession();
  $('#authState', root).textContent = sess.data.session ? `Signed in: ${sess.data.session.user.email}` : 'Not signed in';

  $('#signin', root).onclick = async () => {
    msg('Signing in…');
    const { error, data } = await client.auth.signInWithPassword({ email: $('#email',root).value.trim(), password: $('#pwd',root).value });
    if (error) return msg(error.message, true);
    $('#authState', root).textContent = `Signed in: ${data.user.email}`;
    msg('OK');
  };
  $('#signup', root).onclick = async () => {
    msg('Signing up…');
    const { error } = await client.auth.signUp({ email: $('#email',root).value.trim(), password: $('#pwd',root).value });
    msg(error ? error.message : 'Check your email to confirm.');
  };
  $('#signout', root).onclick = async () => {
    await client.auth.signOut(); msg('Signed out.');
    $('#authState', root).textContent = 'Not signed in';
  };
}
