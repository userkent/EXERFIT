/*
- PURPOSE:
- Account preferences, theme and motion controls, OpenWeather key testing,
- password updates, reminders, privacy preferences, and data import/export.
 */
(function () {
  "use strict";

  // Setup: grabs the main app object, helper shortcuts to select elements and save settings, and eye icons for password boxes
  const EF = window.ExerFit;
  const $ = (selector) => document.querySelector(selector);
  const getData = () => EF.Store.getData();
  const saveSettings = (patch) =>
    EF.Store.updateData((data) => {
      Object.assign(data.settings, patch);
    });
  const eyeOpen =
    '<img src="images/input/icons/eye-open.svg" alt="" aria-hidden="true">';
  const eyeClosed =
    '<img src="images/input/icons/eye-closed.svg" alt="" aria-hidden="true">';

  // Settings Tab Switcher: switches between the 7 settings panels (Appearance, Preferences, Weather API, etc.) when a tab button is clicked
  function showTab(name) {
    document
      .querySelectorAll("[data-settings-tab]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.settingsTab === name),
      );
    document
      .querySelectorAll("[data-settings-section]")
      .forEach((section) =>
        section.classList.toggle(
          "active",
          section.dataset.settingsSection === name,
        ),
      );
  }
  document
    .querySelectorAll("[data-settings-tab]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showTab(button.dataset.settingsTab),
      ),
    );

  // Fill Saved Settings: loads your current saved preferences into every dropdown, toggle switch, and input box on the page
  function populate() {
    const settings = getData().settings;
    $("#setting-theme").value = settings.theme || "system";
    $("#setting-accent").value = settings.accent || "#16a34a";
    $("#setting-motion").value = settings.motion || "full";
    $("#setting-distance").value = settings.distanceUnit || "km";
    $("#setting-temperature").value = settings.temperatureUnit || "C";
    $("#setting-active-goal").value = settings.activeGoalMinutes || 30;
    $("#setting-default-activity").value = settings.defaultActivity || "Walk";
    $("#setting-running-pace").value = settings.runningPaceSecondsPerKm || 420;
    $("#weather-api-key").value = settings.apiKey || "";
    $("#api-key-status").textContent = settings.apiKey
      ? "A key is saved in this browser."
      : "No key saved yet.";
    $("#daily-reminder").checked = Boolean(settings.dailyReminder);
    $("#reminder-time").value = settings.reminderTime || "18:00";
    $("#weekly-summary").checked = Boolean(settings.weeklySummary);
    $("#profile-visibility").value = settings.profileVisibility || "private";
    $("#show-routes").checked = Boolean(settings.showRoutes);
  }

  // Appearance & Workout Defaults: saves theme, accent color, motion, units, daily goal, and default workout immediately on change
  $("#setting-theme").addEventListener("change", (event) => {
    saveSettings({ theme: event.target.value });
    EF.layout.applyTheme();
    EF.ui.toast("Theme updated.");
  });
  $("#setting-accent").addEventListener("input", (event) => {
    saveSettings({ accent: event.target.value });
    EF.layout.applyTheme();
  });
  $("#setting-motion").addEventListener("change", (event) => {
    saveSettings({ motion: event.target.value });
    EF.Motion.init();
    EF.ui.toast("Motion preference saved.");
  });
  $("#setting-distance").addEventListener("change", (event) =>
    saveSettings({ distanceUnit: event.target.value }),
  );
  $("#setting-temperature").addEventListener("change", (event) =>
    saveSettings({ temperatureUnit: event.target.value }),
  );
  $("#setting-active-goal").addEventListener("change", (event) =>
    saveSettings({
      activeGoalMinutes: Math.max(
        1,
        Math.min(240, Number(event.target.value) || 30),
      ),
    }),
  );
  $("#setting-default-activity").addEventListener("change", (event) =>
    saveSettings({ defaultActivity: event.target.value }),
  );
  $("#setting-running-pace").addEventListener("change", (event) =>
    saveSettings({
      runningPaceSecondsPerKm: Math.max(
        180,
        Math.min(1800, Number(event.target.value) || 420),
      ),
    }),
  );

  // Weather API Key Controls: saves, clears, or tests your OpenWeather key using Manila coordinates as a sample check
  $("#save-api-key").addEventListener("click", () => {
    const key = $("#weather-api-key").value.trim();
    saveSettings({ apiKey: key });
    $("#api-key-status").textContent = key
      ? "Key saved. Use Test key to verify it."
      : "No key saved.";
    EF.ui.toast(
      key ? "Weather key saved in this browser." : "Weather key cleared.",
    );
  });
  $("#clear-api-key").addEventListener("click", () => {
    $("#weather-api-key").value = "";
    saveSettings({ apiKey: "" });
    $("#api-key-status").textContent = "No key saved.";
    EF.ui.toast("Weather key cleared.");
  });
  $("#test-api-key").addEventListener("click", async () => {
    const key = $("#weather-api-key").value.trim();
    if (!key) {
      $("#api-key-status").textContent = "Paste an API key first.";
      return;
    }
    $("#api-key-status").textContent = "Testing key with a sample location…";
    const result = await EF.Weather.fetchBundle(14.5995, 120.9842, key);
    const ok = Boolean(result.current || result.forecast);
    $("#api-key-status").textContent = ok
      ? "The key returned weather data successfully."
      : result.errors.current ||
        result.errors.forecast ||
        "The key could not be verified.";
    $("#api-key-status").style.color = ok ? "var(--green)" : "var(--danger)";
  });

  // Reminders & Privacy Switches: asks browser notification permission when daily reminders turn on and saves toggle states
  $("#daily-reminder").addEventListener("change", async (event) => {
    if (
      event.target.checked &&
      "Notification" in window &&
      Notification.permission === "default"
    )
      await Notification.requestPermission();
    saveSettings({ dailyReminder: event.target.checked });
    EF.ui.toast(
      event.target.checked
        ? "Daily reminder preference saved."
        : "Daily reminder turned off.",
    );
  });
  $("#reminder-time").addEventListener("change", (event) =>
    saveSettings({ reminderTime: event.target.value }),
  );
  $("#weekly-summary").addEventListener("change", (event) =>
    saveSettings({ weeklySummary: event.target.checked }),
  );
  $("#profile-visibility").addEventListener("change", (event) =>
    saveSettings({ profileVisibility: event.target.value }),
  );
  $("#show-routes").addEventListener("change", (event) =>
    saveSettings({ showRoutes: event.target.checked }),
  );

  // Show/Hide Password Eye Icons & Copy Block: toggles password visibility and prevents copying or right-clicking password fields
  document.querySelectorAll("[data-settings-password]").forEach((button) => {
    const input = document.getElementById(button.dataset.settingsPassword);
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
    });
    ["copy", "cut", "contextmenu"].forEach((name) =>
      input.addEventListener(name, (event) => event.preventDefault()),
    );
  });

  // Live Password Strength Meter: checks the 4 password rules + confirmation match as you type a new password
  const passwordChecks = (value) => [
    value.length >= 8,
    /[A-Z]/.test(value),
    /[a-z]/.test(value),
    /\d/.test(value),
  ];
  function updateChangePasswordFeedback() {
    const value = $("#new-password").value;
    const confirmation = $("#confirm-new-password").value;
    const started = value.length > 0 || confirmation.length > 0;
    $("#settings-password-checks").hidden = !started;
    const labels = [
      "At least 8 characters",
      "One uppercase letter",
      "One lowercase letter",
      "One number",
    ];
    const checks = passwordChecks(value);
    const matches = confirmation.length > 0 && value === confirmation;
    checks.forEach((good, index) =>
      document
        .querySelector(
          `[data-settings-rule="${["length", "upper", "lower", "number"][index]}"]`,
        )
        ?.classList.toggle("good", good),
    );
    document
      .querySelector('[data-settings-rule="match"]')
      ?.classList.toggle("good", matches);
    const count = checks.filter(Boolean).length + (matches ? 1 : 0);
    $("#settings-password-progress").style.width = `${count * 20}%`;
    $("#settings-password-hint").textContent =
      `${count} of 5 requirements complete`;
    const missingIndex = checks.findIndex((good) => !good);
    const pop = $("#settings-password-pop");
    if (value.length && missingIndex >= 0) {
      pop.textContent = labels[missingIndex];
      pop.style.display = "block";
    } else if (confirmation.length && !matches) {
      pop.textContent = "Your confirmation does not match yet.";
      pop.style.display = "block";
    } else pop.style.display = "none";
    $("#settings-confirm-hint").textContent = confirmation.length
      ? matches
        ? "Passwords match."
        : "Passwords do not match yet."
      : "";
  }
  $("#new-password").addEventListener("input", updateChangePasswordFeedback);
  $("#confirm-new-password").addEventListener(
    "input",
    updateChangePasswordFeedback,
  );
  updateChangePasswordFeedback();

  // Update Password Button Handler: verifies your old password, checks the new password rules, and saves the new password
  $("#change-password-button").addEventListener("click", () => {
    const user = EF.Store.currentUser();
    const current = $("#current-password").value;
    const next = $("#new-password").value;
    const confirm = $("#confirm-new-password").value;
    const status = $("#change-password-status");
    if (!user || current !== user.password) {
      status.textContent = "The current password is incorrect.";
      status.style.color = "var(--danger)";
      return;
    }
    if (!passwordChecks(next).every(Boolean)) {
      status.textContent = "The new password does not meet all requirements.";
      status.style.color = "var(--danger)";
      return;
    }
    if (next !== confirm) {
      status.textContent = "The new password confirmation does not match.";
      status.style.color = "var(--danger)";
      return;
    }
    const users = EF.Store.getUsers();
    const match = users.find((item) => item.id === user.id);
    if (match) match.password = next;
    if (!EF.Store.saveUsers(users)) {
      status.textContent =
        "Could not save the updated password in this browser.";
      status.style.color = "var(--danger)";
      return;
    }
    ["#current-password", "#new-password", "#confirm-new-password"].forEach(
      (selector) => ($(selector).value = ""),
    );
    updateChangePasswordFeedback();
    status.textContent = "Password updated for this local demo account.";
    status.style.color = "var(--green)";
    EF.ui.toast("Password updated.");
  });

  // Export & Import Backups: downloads your data as a JSON backup or CSV spreadsheet, or restores from a saved JSON file
  function exportCSV() {
    const activities = getData().activities;
    const keys = [
      "type",
      "category",
      "date",
      "duration",
      "distance",
      "calories",
      "reps",
      "sets",
      "notes",
    ];
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      keys.join(","),
      ...activities.map((item) =>
        keys.map((key) => quote(item[key])).join(","),
      ),
    ].join("\n");
    EF.Store.downloadFile("exerfit-activities.csv", csv, "text/csv");
  }
  $("#export-json").addEventListener("click", () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      email: EF.Store.currentUser()?.email,
      data: getData(),
    };
    EF.Store.downloadFile(
      "exerfit-backup.json",
      JSON.stringify(payload, null, 2),
      "application/json",
    );
    EF.ui.toast("JSON backup exported.");
  });
  $("#export-settings-csv").addEventListener("click", exportCSV);
  $("#import-json-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const candidate = parsed.data || parsed;
      if (
        !candidate ||
        typeof candidate !== "object" ||
        !Array.isArray(candidate.activities) ||
        !Array.isArray(candidate.goals) ||
        !candidate.profile ||
        !candidate.settings
      )
        throw new Error("This file is not a valid ExerFit backup.");
      EF.Store.saveData(candidate);
      populate();
      EF.layout.applyTheme();
      EF.ui.toast("Account data imported.");
    } catch (error) {
      EF.ui.toast(error.message || "Could not import this file.", "error");
    }
    event.target.value = "";
  });

  // Delete Workouts & Delete Account: wipes all workouts or permanently deletes your local account after typing "DELETE"
  $("#delete-activities").addEventListener("click", () =>
    EF.ui.confirmDelete("all activities", () => {
      EF.Store.updateData((data) => {
        data.activities = [];
      });
      EF.ui.toast("All activity records were deleted.");
    }),
  );
  $("#delete-account").addEventListener("click", () => {
    const user = EF.Store.currentUser();
    if (!user) return;
    EF.ui.confirmDelete(
      "your local account and all account data",
      () => {
        const users = EF.Store.getUsers().filter((item) => item.id !== user.id);
        EF.Store.saveUsers(users);
        try {
          localStorage.removeItem(`exerfit_data_${user.id}`);
        } catch (error) {
          console.warn(error);
        }
        EF.Store.setSession(null);
        window.location.href = "index.html";
      },
      "DELETE",
    );
  });

  // Startup: fills all settings controls with your current preferences when the page opens
  populate();
})();
