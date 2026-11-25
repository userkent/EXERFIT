/*
- WHO BUILT WHAT:
- Developer 1: [Name and contribution]
- Developer 2: [Name and contribution]
 *
- PURPOSE:
- Builds the shared signed-in navigation, applies the global theme, and exposes
- small UI helpers used by every authenticated page.
 */
(function () {
  "use strict";

  // Setup & Navigation Links: stores the list of sidebar/bottom menu pages, their icons, and top bar titles
  const EF = (window.ExerFit = window.ExerFit || {});
  const NAV_ITEMS = [
    ["home", "Home", "home.html", "home"],
    ["tracker", "Tracker", "tracker.html", "tracker"],
    ["goals", "Goals", "goals.html", "goals"],
    ["history", "History", "history.html", "history"],
    ["settings", "Settings", "settings.html", "settings"],
    ["profile", "Profile", "profile.html", "profile"],
  ];
  const TITLES = {
    home: "Your activity overview",
    tracker: "Plan and track your session",
    goals: "Build consistency at your pace",
    history: "Your activity timeline",
    settings: "Make ExerFit yours",
    profile: "Your profile",
  };

  // Theme & Accent Color Applier: switches between Light and Dark mode, sets your chosen accent color, and swaps the logo color
  function getData() {
    return EF.Store?.getData();
  }
  function applyTheme() {
    const settings = getData()?.settings || {};
    const selected = settings.theme || "system";
    const dark =
      selected === "dark" ||
      (selected === "system" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    document.body.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.setProperty(
      "--green",
      settings.accent || "#16a34a",
    );
    document.querySelectorAll("[data-exerfit-logo]").forEach((image) => {
      image.src = dark ? image.dataset.logoDark : image.dataset.logoLight;
    });
  }

  // Menu Link Builder: turns the list of pages above into clickable HTML links and highlights the active page
  function navMarkup(active, mobile = false) {
    return NAV_ITEMS.map(([id, label, href, icon]) => {
      const iconState = active === id ? "-active" : "";
      return `
      <a class="nav-link ${active === id ? "active" : ""}" href="${href}" ${active === id ? 'aria-current="page"' : ""}>
        <img class="nav-icon" src="images/input/icons/nav-${icon}${iconState}.svg" alt="" aria-hidden="true"><span>${label}</span>
      </a>`;
    }).join("");
  }

  // Workout Reminder Checker: pops up a browser notification at your chosen reminder time if the page is open
  function checkReminder(settings) {
    if (
      !settings?.dailyReminder ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const now = new Date();
    const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const key = `exerfit_reminder_shown_${EF.Store.currentUser()?.id}_${EF.Store.localDateKey(now)}`;
    try {
      if (
        current === settings.reminderTime &&
        localStorage.getItem(key) !== "1"
      ) {
        new Notification("A gentle ExerFit reminder", {
          body: "Take a moment to check in with your activity plan. Your pace is your own.",
        });
        localStorage.setItem(key, "1");
      }
    } catch (error) {
      console.warn("Reminder state could not be saved:", error);
    }
  }

  // Main Page Frame Builder: checks if you're logged in, draws the sidebar, top bar, and mobile menu, and starts theme/reminder checks
  function mount() {
    const page = document.body.dataset.appPage;
    if (!page) return;

    // Kick back to the login screen if no user is logged in
    const user = EF.Store?.currentUser();
    if (!user) {
      window.location.replace("auth.html?mode=login");
      return;
    }

    // Prepare the user's display name, first name, and profile picture (or initials)
    const data = getData();
    const displayName = data?.profile?.fullName || user.name || "Member";
    const firstName = displayName.trim().split(/\s+/)[0];
    const initials = displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
    const avatar = data?.profile?.avatar;
    const avatarHTML = avatar
      ? `<img src="${avatar}" alt="">`
      : EF.Store.escapeHTML(initials || "E");

    // Fill in the Left Sidebar, Top Header Bar, and Mobile Bottom Menu
    document.getElementById("sidebar-root").innerHTML = `
      <aside class="sidebar" aria-label="Main application navigation">
        <a href="home.html"><img class="sidebar-logo" data-exerfit-logo data-logo-light="images/input/logo/exerfit-logo-light-mode.png" data-logo-dark="images/input/logo/exerfit-logo-dark-mode.png" src="images/input/logo/exerfit-logo-light-mode.png" alt="ExerFit"></a>
        <p class="sidebar-label">Workspace</p><nav class="nav-list">${navMarkup(page)}</nav>
        <div class="sidebar-bottom"><div class="user-mini"><div class="avatar">${avatarHTML}</div><div><strong>${EF.Store.escapeHTML(displayName)}</strong><small>Local demo account</small></div></div><button class="btn ghost full small-btn" id="logout-button" type="button">Log out</button></div>
      </aside>`;
    document.getElementById("topbar-root").innerHTML = `
      <header class="topbar"><img class="mobile-brand" data-exerfit-logo data-logo-light="images/input/logo/exerfit-logo-light-mode.png" data-logo-dark="images/input/logo/exerfit-logo-dark-mode.png" src="images/input/logo/exerfit-logo-light-mode.png" alt="ExerFit"><div class="topbar-title">${TITLES[page] || "ExerFit"}</div><div class="topbar-right"><span class="topbar-greeting">Hello, ${EF.Store.escapeHTML(firstName)}</span><a class="avatar" href="profile.html" aria-label="Open profile">${avatarHTML}</a></div></header>`;
    document.getElementById("mobile-nav-root").innerHTML =
      `<nav class="mobile-bottom-nav" aria-label="Mobile navigation">${navMarkup(page, true)}</nav>`;

    // Connect the "Log out" button and watch for device Light/Dark mode changes
    document.getElementById("logout-button")?.addEventListener("click", () => {
      EF.Store.setSession(null);
      window.location.href = "index.html";
    });
    applyTheme();
    window
      .matchMedia?.("(prefers-color-scheme: dark)")
      .addEventListener?.("change", () => {
        if ((getData()?.settings?.theme || "system") === "system") applyTheme();
      });

    // Start page animations and check for daily reminders every 30 seconds
    document.querySelector(".page-content")?.classList.add("page-enter");
    EF.Motion?.init();
    checkReminder(data.settings);
    window.setInterval(() => checkReminder(getData()?.settings), 30_000);
  }

  // Toast Notification Helper: shows a small pop-up message in the corner of the screen that fades away after a few seconds
  function toast(message, type = "success", duration = 3400) {
    let region = document.getElementById("toast-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "toast-region";
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    const item = document.createElement("div");
    item.className = `toast ${type === "error" ? "error" : ""}`;
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateX(12px)";
      window.setTimeout(() => item.remove(), 250);
    }, duration);
  }

  // Pop-Up Window (Modal) Helper: creates a reusable dialog box on top of the page (used for Quick Log, Edit Goal, etc.)
  function openModal(title, bodyHTML, actionsHTML = "") {
    let backdrop = document.getElementById("global-modal");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "global-modal";
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML =
        '<section class="modal" role="dialog" aria-modal="true" aria-labelledby="global-modal-title"><div class="modal-head"><h3 id="global-modal-title"></h3><button class="icon-btn" type="button" data-modal-close aria-label="Close dialog">×</button></div><div class="modal-body"></div><div class="modal-actions row" style="justify-content:flex-end;margin-top:18px"></div></section>';
      document.body.appendChild(backdrop);
    }
    backdrop.querySelector("#global-modal-title").textContent = title;
    backdrop.querySelector(".modal-body").innerHTML = bodyHTML;
    backdrop.querySelector(".modal-actions").innerHTML = actionsHTML;
    backdrop.classList.add("open");
    const close = () => backdrop.classList.remove("open");
    backdrop.querySelectorAll("[data-modal-close]").forEach((button) => {
      button.onclick = close;
    });
    backdrop.onclick = (event) => {
      if (event.target === backdrop) close();
    };
    const esc = (event) => {
      if (event.key === "Escape") {
        close();
        document.removeEventListener("keydown", esc);
      }
    };
    document.addEventListener("keydown", esc);
    return {
      backdrop,
      close,
      body: backdrop.querySelector(".modal-body"),
      actions: backdrop.querySelector(".modal-actions"),
    };
  }

  // Delete Confirmation Pop-Up: asks "Are you sure?" (and optionally requires typing a word like DELETE) before deleting something
  function confirmDelete(label, onConfirm, requireWord = "") {
    const dialog = openModal(
      "Confirm deletion",
      `
      <div style="text-align:center;padding:6px 5px 12px">
        <svg viewBox="0 0 100 100" width="80" height="80" role="img" aria-label="Trash can illustration"><path d="M24 32h52l-4 54H28z" fill="#dcfce7" stroke="#16a34a" stroke-width="4"/><path d="M18 25h64M39 17h22M43 42v31M57 42v31" fill="none" stroke="#16a34a" stroke-width="5" stroke-linecap="round"/><path d="M35 8 45 18M65 8 55 18" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/></svg>
        <h3 style="margin:8px 0">Delete ${EF.Store.escapeHTML(label)}?</h3><p class="muted">This action cannot be undone. Please check that you selected the correct item.</p>
        ${requireWord ? `<div class="field" style="text-align:left"><label for="delete-confirm-word">Type ${requireWord} to confirm</label><input id="delete-confirm-word" autocomplete="off" placeholder="${requireWord}"></div>` : ""}
      </div>`,
      '<button type="button" class="btn secondary" data-cancel>Cancel</button><button type="button" class="btn danger" data-confirm disabled>Delete</button>',
    );
    const confirm = dialog.actions.querySelector("[data-confirm]");
    const input = dialog.body.querySelector("#delete-confirm-word");
    if (input)
      input.addEventListener("input", () => {
        confirm.disabled = input.value !== requireWord;
      });
    else confirm.disabled = false;
    dialog.actions.querySelector("[data-cancel]").onclick = dialog.close;
    confirm.onclick = () => {
      dialog.close();
      onConfirm();
    };
  }

  // Share Tools & Startup: makes toast, modals, and layout helpers available to all pages and runs mount() when ready
  EF.ui = { toast, openModal, confirmDelete };
  EF.layout = { init: mount, applyTheme };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
