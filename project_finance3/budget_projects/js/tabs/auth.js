// js/tabs/auth.js
import { $ } from "../lib/dom.js";

export const template = /*html*/ `
  <article class="full-width-card max-w-xl mx-auto">
    <!-- Header -->
    <div class="px-4 pt-3 pb-2 border-b border-slate-200">
      <h3 class="text-base font-semibold text-slate-900">Sign In</h3>
      <p class="text-[11px] text-slate-600 mt-1">
        Access your project planning workspace. You can create an account, sign in, or request a password reset.
      </p>
      <div
        id="authMessages"
        class="mt-2 text-xs min-h-[1.25rem]"
      ></div>
    </div>

    <!-- Content -->
    <div class="px-4 py-4 space-y-6">
      <!-- Sign In -->
      <section>
        <h4 class="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Sign In
        </h4>
        <form
          id="signInForm"
          class="form-vertical space-y-2"
          style="max-width: 520px;"
        >
          <label class="flex flex-col text-xs text-slate-700">
            <span class="mb-0.5">Email</span>
            <input
              type="email"
              id="signInEmail"
              required
              class="border border-slate-300 rounded-md px-2 py-1 text-xs
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>

          <label class="flex flex-col text-xs text-slate-700">
            <span class="mb-0.5">Password</span>
            <input
              type="password"
              id="signInPassword"
              required
              class="border border-slate-300 rounded-md px-2 py-1 text-xs
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>

          <button
            type="submit"
            class="mt-2 inline-flex items-center justify-center px-3 py-1.5
                   text-xs font-medium rounded-md shadow-sm
                   bg-blue-600 hover:bg-blue-700 text-white"
          >
            Sign In
          </button>
        </form>
      </section>

      <hr class="border-slate-200" />

      <!-- Sign Up -->
      <section>
        <h4 class="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Sign Up
        </h4>
        <form
          id="signUpForm"
          class="form-vertical space-y-2"
          style="max-width: 520px;"
        >
          <label class="flex flex-col text-xs text-slate-700">
            <span class="mb-0.5">Email</span>
            <input
              type="email"
              id="signUpEmail"
              required
              class="border border-slate-300 rounded-md px-2 py-1 text-xs
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>

          <label class="flex flex-col text-xs text-slate-700">
            <span class="mb-0.5">Password</span>
            <input
              type="password"
              id="signUpPassword"
              required
              class="border border-slate-300 rounded-md px-2 py-1 text-xs
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>

          <button
            type="submit"
            class="mt-2 inline-flex items-center justify-center px-3 py-1.5
                   text-xs font-medium rounded-md shadow-sm
                   bg-slate-800 hover:bg-slate-900 text-white"
          >
            Create Account
          </button>
        </form>
      </section>

      <hr class="border-slate-200" />

      <!-- Password Reset -->
      <section>
        <h4 class="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
          Password Reset
        </h4>
        <form
          id="resetForm"
          class="form-vertical space-y-2"
          style="max-width: 520px;"
        >
          <label class="flex flex-col text-xs text-slate-700">
            <span class="mb-0.5">Email</span>
            <input
              type="email"
              id="resetEmail"
              required
              class="border border-slate-300 rounded-md px-2 py-1 text-xs
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>

          <button
            type="submit"
            class="mt-2 inline-flex items-center justify-center px-3 py-1.5
                   text-xs font-medium rounded-md shadow-sm
                   bg-slate-500 hover:bg-slate-600 text-white"
          >
            Send Reset Link
          </button>
        </form>
      </section>
    </div>
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
