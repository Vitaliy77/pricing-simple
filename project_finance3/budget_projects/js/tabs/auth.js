// js/tabs/auth.js
import { $ } from "../lib/dom.js";

export const template = /*html*/ `
  <article style="max-width:480px;margin:0 auto;">
    <h3>Sign In</h3>

    <section id="authMessages" style="min-height:1.5rem;font-size:0.9rem;"></section>

    <section style="margin-top:0.75rem;">
      <h4>Sign In</h4>
      <form id="signInForm" class="form-vertical">
        <label>
          Email
          <input type="email" id="signInEmail" required />
        </label>
        <label>
          Password
          <input type="password" id="signInPassword" required />
        </label>
        <button type="submit">Sign In</button>
      </form>
    </section>

    <section style="margin-top:1.5rem;">
      <h4>Sign Up</h4>
      <form id="signUpForm" class="form-vertical">
        <label>
          Email
          <input type="email" id="signUpEmail" required />
        </label>
        <label>
          Password
          <input type="password" id="signUpPassword" required />
        </label>
        <button type="submit">Create Account</button>
      </form>
    </section>

    <section style="margin-top:1.5rem;">
      <h4>Password Reset</h4>
      <form id="resetForm" class="form-vertical">
        <label>
          Email
          <input type="email" id="resetEmail" required />
        </label>
        <button type="submit">Send Reset Link</button>
      </form>
    </section>
  </article>
`;

export const authTab = {
  template,
  init({ root, client }) {
    const msgBox = $("#authMessages", root);

    function showMessage(text, type = "info") {
      if (!msgBox) return;
      msgBox.textContent = text;
      msgBox.style.color =
        type === "error" ? "#b91c1c" : type === "success" ? "#166534" : "#374151";
    }

    const signInForm = $("#signInForm", root);
    const signUpForm = $("#signUpForm", root);
    const resetForm  = $("#resetForm", root);

    if (signInForm) {
      signInForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("#signInEmail", root).value.trim();
        const password = $("#signInPassword", root).value;

        showMessage("Signing in...");
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          console.error(error);
          showMessage(error.message || "Sign in failed", "error");
        } else {
          showMessage("Signed in!", "success");
        }
      });
    }

    if (signUpForm) {
      signUpForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("#signUpEmail", root).value.trim();
        const password = $("#signUpPassword", root).value;

        showMessage("Creating account...");
        const { error } = await client.auth.signUp({ email, password });
        if (error) {
          console.error(error);
          showMessage(error.message || "Sign up failed", "error");
        } else {
          showMessage("Check your email to confirm your account.", "success");
        }
      });
    }

    if (resetForm) {
      resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("#resetEmail", root).value.trim();
        showMessage("Sending reset link...");
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) {
          console.error(error);
          showMessage(error.message || "Reset failed", "error");
        } else {
          showMessage("If that email exists, a reset link has been sent.", "success");
        }
      });
    }
  },
};
