/* FILE PURPOSE: Connects location search and routing requests to external map services. */
/* =========================================================
   FILE: routing-service.js
   PURPOSE: Connects location search and route requests to OpenStreetMap
   services. Search is intentionally submitted by the user. Dashboard
   suggestions use local recent/saved destinations; no autocomplete requests
   are sent to public Nominatim.
   LIMIT: Public geocoding/routing endpoints are best-effort demo services.
========================================================= */
import { NOMINATIM_URL, ROUTING_HOSTS } from "./config.js";

const searchCache = new Map();
function createRateLimiter(intervalMs) {
  let queue = Promise.resolve();
  let nextAllowedAt = 0;
  return async function waitForSlot() {
    let release;
    const previous = queue;
    queue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const wait = Math.max(0, nextAllowedAt - Date.now());
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
    nextAllowedAt = Date.now() + intervalMs;
    release();
  };
}
const waitForGeocodeSlot = createRateLimiter(1050);
const waitForRouteSlot = createRateLimiter(1050);

export async function searchLocations(query) {
  const text = String(query || "").trim();
  if (text.length < 3)
    throw new Error("Enter at least 3 characters to search.");
  const cacheKey = text.toLowerCase();
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);
  // Public Nominatim policy asks applications to stay at or below 1 request/second.
  await waitForGeocodeSlot();
  const url = new URL(NOMINATIM_URL);
  url.search = new URLSearchParams({
    q: text,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
  }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Location search failed (${response.status}). Try again later.`,
    );
  const results = await response.json();
  const formatted = results
    .map((item) => ({
      id: item.place_id,
      name: item.name || item.display_name.split(",")[0],
      address: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      category: item.type || item.class,
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon));
  searchCache.set(cacheKey, formatted);
  if (searchCache.size > 30)
    searchCache.delete(searchCache.keys().next().value);
  return formatted;
}

function simplifyInstruction(step) {
  const maneuver = step.maneuver || {};
  const type = maneuver.type || "continue";
  const modifier = maneuver.modifier ? ` ${maneuver.modifier}` : "";
  const road = step.name ? ` onto ${step.name}` : "";
  const labels = {
    depart: "Start",
    arrive: "Arrive at your destination",
    turn: `Turn${modifier}${road}`,
    "new name": `Continue${road}`,
    continue: `Continue${road}`,
    merge: `Merge${modifier}${road}`,
    "on ramp": `Take the ramp${modifier}${road}`,
    "off ramp": `Take the exit${modifier}${road}`,
    fork: `Keep ${maneuver.modifier || "going"}${road}`,
    roundabout: `Enter the roundabout${road}`,
    rotary: `Enter the rotary${road}`,
    "exit roundabout": `Exit the roundabout${road}`,
    "end of road": `At the end of the road, turn${modifier}`,
  };
  return labels[type] || `Continue${road}`;
}

export async function getRoute(start, destination, mode = "walking") {
  const host = ROUTING_HOSTS[mode] || ROUTING_HOSTS.walking;
  const coordinates = `${start.lon},${start.lat};${destination.lon},${destination.lat}`;
  const url = `${host}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=3`;
  // Respect the public FOSSGIS demo server's one-request-per-second limit.
  await waitForRouteSlot();
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Routing service returned ${response.status}.`);
  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.length)
    throw new Error(
      "No route was found for these locations and this travel mode.",
    );
  // OSRM returns the recommended route and any alternatives. Rank the returned
  // options by estimated travel time so the initial route is the fastest available.
  const buildRoute = (candidate) => {
    const steps = (candidate.legs || [])
      .flatMap((leg) => leg.steps || [])
      .map((step) => ({
        instruction: simplifyInstruction(step),
        distance: step.distance || 0,
        duration: step.duration || 0,
        location: step.maneuver?.location || null,
        type: step.maneuver?.type || "continue",
        modifier: step.maneuver?.modifier || "",
      }));
    return {
      coordinates: candidate.geometry.coordinates,
      distanceMeters: candidate.distance,
      durationSeconds: candidate.duration,
      mode,
      steps,
      start: {
        lat: start.lat,
        lon: start.lon,
        name: start.name || "Your location",
      },
      destination: {
        lat: destination.lat,
        lon: destination.lon,
        name: destination.name || "Destination",
      },
      provider: "FOSSGIS OSRM / OpenStreetMap",
      createdAt: new Date().toISOString(),
    };
  };
  const routeOptions = data.routes
    .map(buildRoute)
    .sort(
      (a, b) =>
        a.durationSeconds - b.durationSeconds ||
        a.distanceMeters - b.distanceMeters,
    );
  const fastestRoute = routeOptions[0];
  return {
    ...fastestRoute,
    routeOptions,
    routeOptionIndex: 0,
    alternatives: routeOptions.slice(1),
  };
}
