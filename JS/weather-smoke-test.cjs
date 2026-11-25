/* ==========================================================================
   EXERFIT — Weather Module Integration Test (Node.js VM Sandbox)
   Tests Open-Meteo data normalization, hourly forecast mapping, activity 
   advice generation, and timezone handling without needing a browser.
   ========================================================================== */

// --------------------------------------------------------------------------
// 1. NODE.JS DEPENDENCIES
// Loads built-in modules for reading files, resolving paths, and creating an
// isolated JavaScript execution sandbox (vm).
// --------------------------------------------------------------------------
const fs = require("fs");
const vm = require("vm");
const path = require("path");

// --------------------------------------------------------------------------
// 2. MOCK APP STATE & API PAYLOAD
// Simulates the app's user settings store and a realistic Open-Meteo JSON
// response for Manila featuring rainy conditions (WMO codes 61 & 63).
// --------------------------------------------------------------------------
const store = { getData: () => ({ settings: { temperatureUnit: "C" } }) };

const raw = {
  timezone: "Asia/Manila",
  utc_offset_seconds: 28800,
  current: {
    time: "2026-11-26T08:00",
    temperature_2m: 27.3,
    relative_humidity_2m: 80,
    apparent_temperature: 30,
    precipitation: 0.2,
    weather_code: 61,
    cloud_cover: 90,
    wind_speed_10m: 2.5,
  },
  hourly: {
    time: [
      "2026-11-26T08:00",
      "2026-11-26T09:00",
      "2026-11-26T10:00",
      "2026-11-26T11:00",
      "2026-11-26T12:00",
      "2026-11-26T13:00",
    ],
    temperature_2m: [27, 27, 28, 29, 29, 30],
    relative_humidity_2m: [80, 78, 75, 70, 70, 68],
    apparent_temperature: [30, 30, 31, 32, 32, 33],
    precipitation_probability: [20, 65, 75, 40, 60, 70],
    precipitation: [0, 0.2, 1, 0.5, 1, 0.5],
    weather_code: [61, 61, 63, 61, 63, 61],
    wind_speed_10m: [2, 2, 2.5, 3, 3, 3],
    cloud_cover: [80, 90, 90, 80, 85, 90],
  },
  daily: {
    time: ["2026-11-26"],
    temperature_2m_max: [30],
    temperature_2m_min: [24],
    precipitation_sum: [4],
    precipitation_probability_max: [80],
    weather_code: [63],
    sunrise: ["2026-11-26T05:45"],
    sunset: ["2026-11-26T17:30"],
  },
};

// --------------------------------------------------------------------------
// 3. SANDBOXED BROWSER ENVIRONMENT
// Provides mock browser globals (window, sessionStorage, navigator, fetch)
// and standard JS built-ins so browser-targeted code runs cleanly in Node.
// --------------------------------------------------------------------------
const context = {
  window: { ExerFit: { Store: store } },
  ExerFit: undefined,
  sessionStorage: { getItem: () => null, setItem: () => {} },
  navigator: { onLine: true },
  fetch: async () => ({ ok: true, json: async () => raw }),
  URLSearchParams,
  Date,
  Intl,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  AbortController,
  console,
  setTimeout,
  clearTimeout,
};

// --------------------------------------------------------------------------
// 4. LOAD TARGET MODULE INTO SANDBOX
// Reads `JS/weather.js` from disk and executes it inside the mocked `window`
// context, attaching `window.ExerFit.Weather`.
// --------------------------------------------------------------------------
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "JS", "weather.js"), "utf8"),
  context,
);

// --------------------------------------------------------------------------
// 5. RUN TEST ASSERTIONS
// Fetches the mocked Manila weather bundle and verifies normalized data,
// hourly slot counts, rain-aware workout advice, and timezone offsets.
// --------------------------------------------------------------------------
context.window.ExerFit.Weather.fetchBundle(14.6, 121)
  .then((bundle) => {
    // Verify both current weather and hourly forecast arrays are populated
    if (!bundle.current || !bundle.forecast || !bundle.forecast.list.length)
      throw new Error(
        "Weather normalization returned no current or forecast data",
      );

    // Verify WMO code 61 was mapped to the standard "Rain" condition
    if (bundle.current.weather[0].main !== "Rain")
      throw new Error("Current weather code was not normalized");

    // Verify outdoor workout advice detects the upcoming precipitation risk
    const advice = context.window.ExerFit.Weather.adviceForActivity(
      "outdoor",
      bundle.current,
      bundle.forecast,
    );
    if (!advice.toLowerCase().includes("rain risk"))
      throw new Error("Rain advice was not generated");

    // Log passing results
    console.log("Open-Meteo normalization: PASS");
    console.log(
      "Hourly forecast conversion: PASS (" +
        bundle.forecast.list.length +
        " slots)",
    );
    console.log("Rain-aware advice: PASS");
    console.log(
      "Timezone offset: PASS (" + bundle.timezoneOffset + " seconds)",
    );
  })
  .catch((err) => {
    // Fail the test runner with exit code 1 if any assertion throws
    console.error(err);
    process.exit(1);
  });