/*
 * WHO BUILT WHAT:
 * Developer 1: [Name and contribution]
 * Developer 2: [Name and contribution]
 *
 * PURPOSE:
 * Local developer-only overrides. This file is ignored by Git.
 */
// ==========================================
// LOCAL CONFIGURATION OVERRIDES
// ==========================================
// HOW TO EDIT THIS SECTION:
// Add only the settings you need to override from config.ex.js.
// Keep real API keys out of this file when sharing the project.
window.ExerFitLocalConfig = {
  // Example: openWeatherApiKey: "your-local-key-here",
  // Example: defaultMapZoom: 13
};

// Merge local overrides into the shared defaults before page modules load.
// The routing object is merged separately so one custom route profile does not
// accidentally remove the other default route services.
window.ExerFitConfig = {
  ...(window.ExerFitConfig || {}),
  ...window.ExerFitLocalConfig,
  routing: {
    ...(window.ExerFitConfig?.routing || {}),
    ...(window.ExerFitLocalConfig.routing || {}),
  },
};
