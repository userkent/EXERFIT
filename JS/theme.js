/* =========================================================
   FILE: theme.js
   PURPOSE: Applies and remembers the user's light or dark theme.
   MODIFY HERE: Change the default theme in DEFAULT_THEME.
========================================================= */
const THEME_KEY = "exerfit.theme";
const DEFAULT_THEME = "light";

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "dark" || saved === "light" ? saved : DEFAULT_THEME;
  } catch (error) {
    // If browser storage is disabled, keep the site usable with the default theme.
    return DEFAULT_THEME;
  }
}

function applyTheme(theme) {
  const safeTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = safeTheme;

  // Match the browser tab color to the selected theme.
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor)
    themeColor.setAttribute(
      "content",
      safeTheme === "dark" ? "#101914" : "#f4f7f3",
    );

  // Use the dark-green logo on light surfaces and the bright logo on dark surfaces.
  document.querySelectorAll("[data-theme-logo]").forEach((image) => {
    const logoPath =
      safeTheme === "dark" ? image.dataset.darkSrc : image.dataset.lightSrc;
    if (logoPath && image.getAttribute("src") !== logoPath)
      image.setAttribute("src", logoPath);
  });

  // The icon previews the theme that will be enabled when clicked.
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const nextTheme = safeTheme === "dark" ? "light" : "dark";
    const icon = nextTheme === "dark" ? "moon" : "sun";
    button.innerHTML = `<i data-lucide="${icon}"></i>`;
    button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    button.title = `Switch to ${nextTheme} mode`;
  });

  window.lucide?.createIcons();
  window.dispatchEvent(
    new CustomEvent("exerfit:theme-changed", { detail: { theme: safeTheme } }),
  );
}

export function initTheme() {
  let currentTheme = readSavedTheme();
  applyTheme(currentTheme);

  // Bind after applying saved preferences so the button starts in the correct state.
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    if (button.dataset.themeBound === "true") return;
    button.dataset.themeBound = "true";
    button.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, currentTheme);
      } catch (error) {
        /* Theme still changes for this page view. */
      }
      applyTheme(currentTheme);
    });
  });
}
