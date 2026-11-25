/*
 * PURPOSE:
 * Safe example configuration. Copy this file to config.js for local overrides.
 */
window.ExerFitConfig = {
  // Public demo endpoints. These services may change their usage rules.
  weatherBaseUrl: "https://api.openweathermap.org/data/2.5",
  geocodingUrl: "https://nominatim.openstreetmap.org/search",
  routing: {
    foot: {
      baseUrl: "https://routing.openstreetmap.de/routed-foot",
      profile: "driving",
    },
    bike: {
      baseUrl: "https://routing.openstreetmap.de/routed-bike",
      profile: "driving",
    },
    car: {
      baseUrl: "https://routing.openstreetmap.de/routed-car",
      profile: "driving",
    },
    backupCar: {
      baseUrl: "https://router.project-osrm.org",
      profile: "driving",
    },
  },
  defaultMapCenter: [14.5995, 120.9842],
  defaultMapZoom: 12,
  defaultRunningPaceSecondsPerKm: 420,
};
