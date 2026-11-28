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
import { normalizeRouteGeometry } from "./route-geometry.js";

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
  const selectedMode = ["walking", "cycling", "driving"].includes(mode)
    ? mode
    : "walking";
  const host = ROUTING_HOSTS[selectedMode] || ROUTING_HOSTS.walking;
  const startLat = Number(start?.lat);
  const startLon = Number(start?.lon);
  const destinationLat = Number(destination?.lat);
  const destinationLon = Number(destination?.lon);

  const validPosition = (lat, lon) =>
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  if (!validPosition(startLat, startLon) || !validPosition(destinationLat, destinationLon)) {
    throw new Error("The start or destination does not contain valid GPS coordinates.");
  }

  // FOSSGIS selects the actual transport profile from the routed-foot / routed-bike /
  // routed-car host prefix. The OSRM profile path segment remains `driving` on these
  // instances; changing the host prefix is what changes the routing profile.
  const coordinates = `${startLon},${startLat};${destinationLon},${destinationLat}`;
  const url = `${host.replace(/\/$/, "")}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=3`;
  // Respect the public FOSSGIS demo server's one-request-per-second limit.
  await waitForRouteSlot();

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);
  let data;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Routing service returned HTTP ${response.status}.`);
    }
    try {
      data = await response.json();
    } catch {
      throw new Error("The routing service returned an unreadable response.");
    }
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Route calculation timed out. Check your connection and try again.");
    }
    if (error instanceof TypeError) {
      throw new Error("Could not reach the routing service. Check your internet connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (data.code !== "Ok" || !Array.isArray(data.routes) || !data.routes.length) {
    throw new Error(
      data.message || "No route was found for these locations and this travel mode.",
    );
  }

  // Validate every candidate geometry before it reaches Leaflet. Invalid alternatives
  // are ignored with a diagnostic; if none contain a drawable line, fail visibly.
  const buildRoute = (candidate, index) => {
    const geometry = normalizeRouteGeometry(candidate.geometry);
    if (geometry.pointCount < 2) {
      console.warn(`[ExerFit routing] Route option ${index + 1} has invalid geometry.`, {
        geometryType: candidate.geometry?.type || "unknown",
        pointCount: geometry.pointCount,
      });
      return null;
    }

    const steps = (candidate.legs || [])
      .flatMap((leg) => leg.steps || [])
      .map((step) => ({
        instruction: simplifyInstruction(step),
        distance: Number(step.distance) || 0,
        duration: Number(step.duration) || 0,
        location: step.maneuver?.location || null,
        type: step.maneuver?.type || "continue",
        modifier: step.maneuver?.modifier || "",
      }));

    return {
      // `coordinates` stays a flat GeoJSON coordinate list for existing route-progress
      // calculations; `geometrySegments` preserves multipart geometry for Leaflet.
      coordinates: geometry.coordinates,
      geometrySegments: geometry.segments,
      distanceMeters: Number(candidate.distance) || 0,
      durationSeconds: Number(candidate.duration) || 0,
      mode: selectedMode,
      steps,
      start: {
        lat: startLat,
        lon: startLon,
        name: start.name || "Your location",
      },
      destination: {
        lat: destinationLat,
        lon: destinationLon,
        name: destination.name || "Destination",
      },
      provider: "FOSSGIS OSRM / OpenStreetMap",
      createdAt: new Date().toISOString(),
    };
  };

  const routeOptions = data.routes
    .map(buildRoute)
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.durationSeconds - b.durationSeconds ||
        a.distanceMeters - b.distanceMeters,
    );
  if (!routeOptions.length) {
    throw new Error(
      "The routing service responded, but its route geometry was missing or invalid. Try another destination.",
    );
  }

  const fastestRoute = routeOptions[0];
  console.debug("[ExerFit routing] Valid route geometry received.", {
    mode: selectedMode,
    options: routeOptions.length,
    points: fastestRoute.coordinates.length,
    segments: fastestRoute.geometrySegments.length,
  });
  return {
    ...fastestRoute,
    routeOptions,
    routeOptionIndex: 0,
    alternatives: routeOptions.slice(1),
  };
}
