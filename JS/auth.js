
/*
- PURPOSE:
- Local demo registration, login, password feedback, and password visibility controls.
- Passwords are plain text in localStorage for this classroom-only front-end demo.
 */
(function () {
  "use strict";

  // Setup: grabs the login/signup forms from the page and stops running if they aren't found
  const EF = (window.ExerFit = window.ExerFit || {});
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  if (!loginForm || !signupForm || !EF.Store) return;

  // Eye Icons: stores the SVG drawings for the open eye (show password) and crossed-out eye (hide password)
  const eyeOpen =
    '<img src="images/input/icons/eye-open.svg" alt="" aria-hidden="true">';
  const eyeClosed =
    '<img src="images/input/icons/eye-closed.svg" alt="" aria-hidden="true">';

  // Show/Hide Password Button: switches password boxes between dots (••••) and readable text when the eye icon is clicked
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const render = () => {
      const visible = input.type === "text";
      button.innerHTML = visible ? eyeOpen : eyeClosed;
      button.setAttribute(
        "aria-label",
        visible ? "Hide password" : "Show password",
      );
      button.setAttribute("aria-pressed", String(visible));
    };
    render();
    button.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      render();
      input.focus();
    });
  });

  // Block Copying Passwords: stops users from copying, cutting, or right-clicking inside password boxes (pasting still works)
  document
    .querySelectorAll(
      'input[type="password"], input[autocomplete="new-password"]',
    )
    .forEach((input) => {
      ["copy", "cut", "contextmenu"].forEach((eventName) =>
        input.addEventListener(eventName, (event) => event.preventDefault()),
      );
    });

  // Tab Switcher (Log in vs. Sign up): flips between the two forms and updates the page title text
  const loginTab = document.getElementById("login-tab");
  const signupTab = document.getElementById("signup-tab");
  function showMode(mode) {
    const signup = mode === "signup";
    loginForm.classList.toggle("active", !signup);
    signupForm.classList.toggle("active", signup);
    loginTab.classList.toggle("active", !signup);
    signupTab.classList.toggle("active", signup);
    loginTab.setAttribute("aria-selected", String(!signup));
    signupTab.setAttribute("aria-selected", String(signup));
    document.getElementById("auth-heading").textContent = signup
      ? "Create your account."
      : "Welcome back.";
    document.getElementById("auth-subheading").textContent = signup
      ? "Set up your local activity space."
      : "Log in to continue to your activity space.";
  }
  loginTab.addEventListener("click", () => showMode("login"));
  signupTab.addEventListener("click", () => showMode("signup"));

  // Check URL for Starting Mode: opens the Sign up tab automatically if the link ends with "?mode=signup"
  const initialMode = new URLSearchParams(window.location.search).get("mode");
  showMode(initialMode === "signup" ? "signup" : "login");

  // Sign-Up Form Rules: grabs the sign-up inputs and sets the 4 password rules (8+ chars, uppercase, lowercase, number)
  const signupPassword = document.getElementById("signup-password");
  const confirmPassword = document.getElementById("signup-confirm");
  const signupEmail = document.getElementById("signup-email");
  const signupName = document.getElementById("signup-name");
  const createButton = document.getElementById("create-account");
  const rules = [
    {
      key: "length",
      label: "At least 8 characters",
      test: (value) => value.length >= 8,
    },
    {
      key: "upper",
      label: "One uppercase letter",
      test: (value) => /[A-Z]/.test(value),
    },
    {
      key: "lower",
      label: "One lowercase letter",
      test: (value) => /[a-z]/.test(value),
    },
    { key: "number", label: "One number", test: (value) => /\d/.test(value) },
  ];

  // Email Format Checker: makes sure the typed email looks like "name@domain.com"
  function emailIsValid(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
  }

  // Live Password Strength Checker: updates the progress bar, rule badges, and unlocks the "Create account" button when ready
  function updatePasswordFeedback() {
    const value = signupPassword.value;
    const confirmation = confirmPassword.value;
    const started = value.length > 0 || confirmation.length > 0;
    document.getElementById("password-checks").hidden = !started;

    // Light up each rule badge as it passes
    const results = rules.map((rule) => ({ ...rule, good: rule.test(value) }));
    results.forEach((result) => {
      const chip = document.querySelector(`[data-rule="${result.key}"]`);
      chip?.classList.toggle("good", result.good);
    });

    // Update the 0% to 100% progress bar and text counter
    const matching = confirmation.length > 0 && value === confirmation;
    const passed =
      results.filter((item) => item.good).length + (matching ? 1 : 0);
    document.getElementById("password-progress").style.width =
      `${passed * 20}%`;
    document.getElementById("password-hint").textContent = started
      ? `${passed} of 5 requirements complete`
      : "Start typing to see your password progress.";

    // Show a yellow tip box telling the user what rule they are still missing
    const pop = document.getElementById("password-pop");
    if (value.length) {
      const missing = results.find((item) => !item.good);
      pop.style.display = missing
        ? "block"
        : confirmation.length && !matching
          ? "block"
          : "none";
      pop.textContent = missing
        ? missing.label
        : confirmation.length && !matching
          ? "Your confirmation does not match yet."
          : "Password requirements complete.";
    } else pop.style.display = "none";

    // Tell the user if the two password boxes match
    const confirmHint = document.getElementById("confirm-hint");
    confirmHint.textContent = confirmation.length
      ? matching
        ? "Passwords match."
        : "Passwords do not match yet."
      : "";
    confirmHint.style.color = matching ? "var(--green)" : "var(--muted)";

    // Enable the "Create account" button only when name, email, password rules, and password match are all valid
    const allGood =
      results.every((item) => item.good) &&
      matching &&
      emailIsValid(signupEmail.value) &&
      signupName.value.trim().length > 0;
    createButton.disabled = !allGood;
  }

  // Run the live check every time the user types in any sign-up box
  [signupPassword, confirmPassword, signupEmail, signupName].forEach((input) =>
    input.addEventListener("input", updatePasswordFeedback),
  );
  updatePasswordFeedback();

  // Log In Button Handler: checks if the email and password match a saved user, then sends them to the Home page
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = document
      .getElementById("login-email")
      .value.trim()
      .toLowerCase();
    const password = document.getElementById("login-password").value;
    const user = EF.Store.getUsers().find(
      (item) =>
        item.email.toLowerCase() === email && item.password === password,
    );
    const error = document.getElementById("login-error");
    if (!emailIsValid(email) || !password) {
      error.textContent = "Enter a valid email address and password.";
      return;
    }
    if (!user) {
      error.textContent =
        "We could not find an account with those details. Check them or create an account.";
      return;
    }
    EF.Store.setSession(user.id);
    window.location.href = "home.html";
  });

  // Create Account Button Handler: saves the new user into browser storage, logs them in, and opens the Home page
  signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updatePasswordFeedback();
    const error = document.getElementById("signup-error");
    if (createButton.disabled) {
      error.textContent =
        "Complete the highlighted requirements before creating an account.";
      return;
    }
    const email = signupEmail.value.trim().toLowerCase();
    const users = EF.Store.getUsers();
    if (users.some((item) => item.email.toLowerCase() === email)) {
      error.textContent =
        "An account with this email already exists. Log in instead.";
      return;
    }
    const user = {
      id: EF.Store.createId("user"),
      name: signupName.value.trim(),
      email,
      password: signupPassword.value,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    if (!EF.Store.saveUsers(users)) {
      error.textContent = "The account could not be saved in this browser.";
      return;
    }
    EF.Store.setSession(user.id);
    EF.Store.getData(user.id);
    window.location.href = "home.html";
  });
})();