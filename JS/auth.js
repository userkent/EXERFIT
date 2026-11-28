/* FILE PURPOSE: Handles sign-up, login, session checks, and authentication UI. */
/* =========================================================
   FILE: auth.js
   PURPOSE: Creates prototype accounts, signs users in/out, and guards the dashboard.
   SECURITY NOTE: Passwords are stored in localStorage for demonstration only.
   Replace this module with backend authentication before real deployment.
========================================================= */
import {
  createUser,
  findUser,
  getCurrentUser,
  setSession,
  clearSession,
  updateUser,
} from "./storage.js";
import { showToast, refreshIcons } from "./ui.js";
import { initTheme } from "./theme.js";

// Apply the saved color theme before the user interacts with the page.
initTheme();

export function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.replace("login.html");
    return false;
  }
  return true;
}
export function signOut() {
  clearSession();
  window.location.replace("../index.html");
}

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");

// Check each required password rule separately so the user can see progress.
function getPasswordRules(password) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    alphanumeric: /^[A-Za-z0-9]+$/.test(password),
  };
}

// Update the strength meter and live checklist while a user types.
function updatePasswordFeedback() {
  if (!signupForm) return;
  const passwordInput = signupForm.elements.password;
  const confirmInput = signupForm.elements.confirm;
  const password = passwordInput.value;
  const rules = getPasswordRules(password);
  const ruleNames = Object.keys(rules);
  const score = password ? ruleNames.filter((rule) => rules[rule]).length : 0;
  const strengthLabels = [
    "Not entered",
    "Very weak",
    "Weak",
    "Fair",
    "Good",
    "Strong",
  ];
  const strength = document.getElementById("password-strength-label");
  const track = document.getElementById("password-strength-track");
  const fill = document.getElementById("password-strength-fill");

  if (strength) strength.textContent = strengthLabels[score];
  if (track) {
    track.dataset.level = String(score);
    track.setAttribute("aria-valuenow", String(score));
  }
  if (fill) fill.style.width = `${score * 20}%`;

  ruleNames.forEach((rule) => {
    const item = document.querySelector(`[data-password-rule="${rule}"]`);
    if (!item) return;
    item.classList.toggle("is-valid", rules[rule]);
    const icon = rules[rule] ? "check-circle-2" : "circle";
    // Lucide turns the original <i> into an <svg>, so replace either element before refreshing.
    const currentIcon = item.querySelector("svg, i");
    if (currentIcon) {
      const iconPlaceholder = document.createElement("i");
      iconPlaceholder.setAttribute("data-lucide", icon);
      currentIcon.replaceWith(iconPlaceholder);
    }
  });
  refreshIcons(document.getElementById("password-feedback"));

  const matchMessage = document.getElementById("password-match");
  if (matchMessage) {
    const confirmation = confirmInput.value;
    matchMessage.classList.remove("is-match", "is-mismatch");
    if (!confirmation) {
      matchMessage.textContent = "";
    } else if (password === confirmation) {
      matchMessage.textContent = "Passwords match.";
      matchMessage.classList.add("is-match");
    } else {
      matchMessage.textContent = "Passwords do not match yet.";
      matchMessage.classList.add("is-mismatch");
    }
  }
}

// Password visibility controls use a button with its own eye/eye-off icon.
document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.setAttribute(
      "aria-label",
      reveal ? "Hide password" : "Show password",
    );
    button.innerHTML = `<i data-lucide="${reveal ? "eye-off" : "eye"}"></i>`;
    refreshIcons(button);
  });
});

if (signupForm) {
  // Recalculate password quality and confirmation immediately as the user types.
  signupForm.elements.password.addEventListener(
    "input",
    updatePasswordFeedback,
  );
  signupForm.elements.confirm.addEventListener("input", updatePasswordFeedback);
  updatePasswordFeedback();
}

if (loginForm) {
  // A signed-in user does not need to see the login form again.
  if (getCurrentUser()) window.location.replace("dashboard.html");
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const identity = loginForm.elements.identity.value.trim();
    const password = loginForm.elements.password.value;
    const message = document.getElementById("login-message");
    message.textContent = "";
    message.classList.remove("success");
    const user = findUser(identity);
    if (!user || user.password !== password) {
      message.textContent =
        "We could not match those details. Check your email/nickname and password.";
      return;
    }
    setSession(user.id);
    message.textContent = "Login successful. Opening your dashboard…";
    message.classList.add("success");
    window.setTimeout(() => window.location.assign("dashboard.html"), 350);
  });
}

if (signupForm) {
  if (getCurrentUser()) window.location.replace("dashboard.html");
  signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = signupForm;
    const nickname = form.elements.nickname.value.trim();
    const fullName = form.elements.fullname.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    const confirm = form.elements.confirm.value;
    const message = document.getElementById("signup-message");
    message.textContent = "";
    message.classList.remove("success");
    if (!nickname || !fullName || !email || !password || !confirm) {
      message.textContent = "Complete all fields to create your account.";
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.textContent = "Enter a valid email address.";
      return;
    }
    if (nickname.length < 3 || /\s/.test(nickname)) {
      message.textContent =
        "Nickname must be at least 3 characters and contain no spaces.";
      return;
    }
    const passwordRules = getPasswordRules(password);
    if (!Object.values(passwordRules).every(Boolean)) {
      message.textContent = passwordRules.alphanumeric
        ? "Your password must have at least 8 characters, one uppercase letter, one lowercase letter, and one number."
        : "Use letters and numbers only. Spaces and special characters are not allowed.";
      return;
    }
    if (password !== confirm) {
      message.textContent =
        "The passwords do not match. Enter the same password in both fields.";
      return;
    }
    if (findUser(email) || findUser(nickname)) {
      message.textContent = "That email or nickname is already registered.";
      return;
    }
    try {
      const user = {
        id: `user-${Date.now().toString(36)}`,
        nickname,
        fullName,
        email,
        password,
        createdAt: new Date().toISOString(),
      };
      createUser(user);
      setSession(user.id);
      message.textContent = "Your account is ready. Opening your dashboard…";
      message.classList.add("success");
      window.setTimeout(() => window.location.assign("dashboard.html"), 350);
    } catch (error) {
      message.textContent = error.message || "Could not create your account.";
    }
  });
}

refreshIcons();
