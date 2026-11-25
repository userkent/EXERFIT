/*
- PURPOSE:
- OSRM-compatible route requests, route caching, distance calculations, and geometry sampling.
 */
(function () {
  "use strict";

  // Setup & Map Routing Servers: sets up the default web addresses used to get walking, biking, and driving directions
  const EF = window.ExerFit = window.ExerFit || {};
  const fallback = {
    foot: { baseUrl: "https://routing.openstreetmap.de/routed-foot", profile: "driving" },
    bike: { baseUrl: "https://routing.openstreetmap.de/routed-bike", profile: "driving" },
    car: { baseUrl: "https://routing.openstreetmap.de/routed-car", profile: "driving" },
    backupCar: { baseUrl: "https://router.project-osrm.org", profile: "driving" }
  };
  const ROUTES = { ...(window.ExerFitConfig?.routing || fallback) };
  let activeController = null;
  let lastRequestAt = 0;
  const toRadians = (degrees) => degrees * Math.PI / 180;

  // Straight-Line Distance Calculator: measures the exact distance in meters between two GPS points on the Earth
  function distanceMeters(a, b) {
    const dLat = toRadians(b[0] - a[0]); const dLon = toRadians(b[1] - a[1]);
    const lat1 = toRadians(a[0]); const lat2 = toRadians(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(h));
  }

  // Temporary Route Memory (Cache): saves recently searched routes for 1 hour so the app doesn't ask the map server twice for the same path
  function cacheKey(start, end, mode) {
    return `exerfit_route_${mode}_${[...start, ...end].map((n) => Number(n).toFixed(3)).join("_")}`;
  }
  function readRouteCache(key) {
    try { const data = JSON.parse(sessionStorage.getItem(key) || "null"); return data && Date.now() - data.savedAt < 60 * 60 * 1000 ? data.routes : null; }
    catch { return null; }
  }
  function writeRouteCache(key, routes) { try { sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), routes })); } catch (error) { console.warn("Route cache unavailable:", error); } }

  // Route Finder: asks the online map server for turn-by-turn directions between your start point and destination
  async function requestRoute(start, end, mode = "foot") {
    if (!Array.isArray(start) || !Array.isArray(end) || start.length < 2 || end.length < 2) throw new Error("Choose a start and destination first.");

    // Return the saved route immediately if we already looked it up recently
    const key = cacheKey(start, end, mode); const cached = readRouteCache(key);
    if (cached) return { routes: cached, cached: true, service: "session cache" };

    // Cancel any unfinished route request and wait 1 second between searches so we don't overload the free server
    if (activeController) activeController.abort();
    const delay = Math.max(0, 1000 - (Date.now() - lastRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    activeController = new AbortController(); lastRequestAt = Date.now();

    // Build the web request for Walk, Ride, or Drive and fetch the route path (using a backup server for driving if needed)
    const modeKey = mode === "ride" ? "bike" : mode === "drive" ? "car" : "foot";
    const service = ROUTES[modeKey] || fallback[modeKey];
    const coordText = `${Number(start[1])},${Number(start[0])};${Number(end[1])},${Number(end[0])}`;
    const routeUrl = (config) => `${config.baseUrl}/route/v1/${config.profile || "driving"}/${coordText}?overview=full&geometries=geojson&steps=true&alternatives=false`;
    const configs = [service];
    if (mode === "drive") configs.push(ROUTES.backupCar || fallback.backupCar);
    let lastError = null;
    for (const config of configs) {
      try {
        const response = await fetch(routeUrl(config), { signal: activeController.signal, headers: { Accept: "application/json" } });
        const result = await response.json();
        if (!response.ok || result.code !== "Ok" || !Array.isArray(result.routes) || !result.routes.length) throw new Error(result.message || result.code || `Routing service returned ${response.status}.`);
        writeRouteCache(key, result.routes);
        return { routes: result.routes, cached: false, service: config.baseUrl };
      } catch (error) {
        if (error.name === "AbortError") throw error;
        lastError = error;
      }
    }
    throw lastError || new Error("Routing service is unavailable.");
  }

  // Evenly Spaced Route Checkpoints: picks up to 6 evenly spaced spots along your route (used to check weather along the path)
  function sampleGeometry(coordinates, count = 6) {
    if (!Array.isArray(coordinates) || !coordinates.length) return [];
    const limit = Math.min(6, Math.max(2, count));
    if (coordinates.length === 1) return [{ coordinate: [coordinates[0][1], coordinates[0][0]], coordinateIndex: 0, fraction: 0 }];

    // Measure the total route distance step-by-step so checkpoints are spaced evenly by meters
    const cumulative = [0];
    for (let index = 1; index < coordinates.length; index += 1) {
      const previous = [coordinates[index - 1][1], coordinates[index - 1][0]];
      const current = [coordinates[index][1], coordinates[index][0]];
      cumulative[index] = cumulative[index - 1] + distanceMeters(previous, current);
    }
    const total = cumulative[cumulative.length - 1] || 1;
    const selected = [];
    for (let index = 0; index < limit; index += 1) {
      const fraction = index / (limit - 1);
      const targetDistance = total * fraction;
      let position = cumulative.findIndex((value) => value >= targetDistance);
      if (position < 0) position = coordinates.length - 1;
      const pair = coordinates[position];
      selected.push({ coordinate: [pair[1], pair[0]], coordinateIndex: position, fraction });
    }
    return selected;
  }

  // Turn-by-Turn Directions Reader: converts the map server's raw step data into simple text directions and distances
  function routeInstructions(route) {
    const steps = route?.legs?.flatMap((leg) => leg.steps || []) || [];
    return steps.map((step) => ({
      instruction: step.maneuver?.type === "arrive" ? "Arrive at destination" : `${step.maneuver?.modifier ? `${step.maneuver.modifier} ` : ""}${step.name || step.ref || step.maneuver?.type || "Continue"}`.trim(),
      distance: step.distance || 0,
      name: step.name || ""
    })).filter((step) => step.instruction);
  }

  // Share Tools: makes these route-planning helpers available to the Tracker page
  EF.Routing = { requestRoute, distanceMeters, sampleGeometry, routeInstructions };
})();