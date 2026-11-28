/* FILE PURPOSE: Provides turn-by-turn route navigation and off-route handling. */
/* =========================================================
   FILE: navigation.js
   PURPOSE: Keeps a separate planned route, estimates route progress,
   provides turn guidance, and flags sustained off-route movement.
   Navigation owns its GPS watcher unless an explicit caller shares the
   Activity recorder. Live tracking itself is implemented independently.
========================================================= */
import {
  drawPlannedRoute,
  clearPlannedRoute,
  clearNavigationPosition,
  followNavigationPosition,
} from "./map.js";
import { getRoute } from "./routing-service.js";
import { normalizeRouteGeometry } from "./route-geometry.js";
import { showToast, formatDistance, escapeHTML } from "./ui.js";

let activeRoute = null;
let watchId = null;
let externalGPS = false;
let offRouteCount = 0;
let lastOffRouteNotice = 0;
let lastProgress = null;
let lastPosition = null;
let arrivalNotified = false;

export function getActiveNavigation() {
  return activeRoute;
}

export function isNavigationUsingExternalGPS() {
  return Boolean(activeRoute && externalGPS);
}

// Replace the blue navigation route without changing the selected GPS source.
export function setActiveNavigationRoute(route) {
  if (!activeRoute || !route) return false;
  if (!startNavigation(route, { externalGPS })) return false;
  window.dispatchEvent(
    new CustomEvent("exerfit:navigation-route-updated", { detail: route }),
  );
  return true;
}

function haversine(a, b) {
  const radius = 6371000;
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat),
    dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}
function nearestRouteIndex(point, coordinates) {
  let bestIndex = 0,
    bestDistance = Infinity;
  coordinates.forEach(([lon, lat], index) => {
    const distance = haversine(point, { lat, lon });
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return { index: bestIndex, distance: bestDistance };
}
function remainingDistance(coordinates, index) {
  let remaining = 0;
  for (let i = Math.max(0, index); i < coordinates.length - 1; i += 1) {
    remaining += haversine(
      { lat: coordinates[i][1], lon: coordinates[i][0] },
      { lat: coordinates[i + 1][1], lon: coordinates[i + 1][0] },
    );
  }
  return remaining;
}
function stepIndexes(route) {
  return (route.steps || []).map((step) => {
    if (!step.location) return { ...step, routeIndex: 0 };
    return {
      ...step,
      routeIndex: nearestRouteIndex(
        { lat: step.location[1], lon: step.location[0] },
        route.coordinates,
      ).index,
    };
  });
}

export function startNavigation(route, options = {}) {
  const geometry = normalizeRouteGeometry(
    route?.geometrySegments || route?.geometry || route?.coordinates,
  );
  if (geometry.pointCount < 2) {
    showToast(
      "This route does not contain at least two valid GPS coordinates. Recalculate the route and try again.",
      "error",
      5500,
    );
    return false;
  }
  const normalizedRoute = {
    ...route,
    coordinates: geometry.coordinates,
    geometrySegments: geometry.segments,
  };
  // Navigation is a distinct mode: turn the planned orange route blue.
  const plannedLine = drawPlannedRoute(geometry.segments, "#2878f0");
  if (!plannedLine) {
    showToast(
      "The route was received, but Leaflet could not render its geometry. Check the browser console for route details.",
      "error",
      5500,
    );
    return false;
  }
  stopNavigationWatch();
  clearNavigationPosition();
  activeRoute = { ...normalizedRoute, indexedSteps: stepIndexes(normalizedRoute) };
  externalGPS = Boolean(options.externalGPS);
  offRouteCount = 0;
  lastOffRouteNotice = 0;
  lastPosition = null;
  arrivalNotified = false;
  const state = document.getElementById("nav-guidance");
  if (state) state.classList.remove("is-hidden");
  renderGuidance({
    instruction: "Navigation ready. Move when you are ready.",
    remaining: route.distanceMeters,
    offRoute: false,
  });
  const hostname = window.location.hostname;
  const localHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  const canUseLiveGPS =
    Boolean(window.isSecureContext || localHost) &&
    Boolean(navigator.geolocation);
  if (!externalGPS && canUseLiveGPS) {
    watchId = navigator.geolocation.watchPosition(
      (position) =>
        updateNavigation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (error) => {
        stopNavigationWatch();
        const message =
          error.code === 1
            ? "Location permission was denied. Allow browser location access to use live navigation."
            : error.code === 2
              ? "Your current location is unavailable. Try again in an open area."
              : error.code === 3
                ? "Navigation GPS timed out. Keep ExerFit open and try again."
                : error.message || "Navigation GPS is unavailable.";
        showToast(`Navigation GPS: ${message}`, "warning", 6000);
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 },
    );
  } else if (!externalGPS) {
    showToast(
      "The route is displayed, but live GPS guidance needs an HTTPS connection and location permission.",
      "warning",
      6500,
    );
  }
  window.dispatchEvent(
    new CustomEvent("exerfit:navigation-state", {
      detail: { active: true, externalGPS },
    }),
  );
  showToast("Navigation is ready.", "success");
  return true;
}
export function stopNavigationWatch() {
  if (watchId !== null && navigator.geolocation)
    navigator.geolocation.clearWatch(watchId);
  watchId = null;
}
export function stopNavigation(keepRoute = true) {
  stopNavigationWatch();
  externalGPS = false;
  if (!keepRoute) {
    activeRoute = null;
    clearPlannedRoute();
    clearNavigationPosition();
  }
  const guidance = document.getElementById("nav-guidance");
  if (guidance) guidance.classList.add("is-hidden");
  window.dispatchEvent(
    new CustomEvent("exerfit:navigation-state", { detail: { active: false } }),
  );
}
export function clearNavigation() {
  stopNavigation(false);
  activeRoute = null;
}

export function updateNavigation(position) {
  if (
    !activeRoute ||
    !position ||
    !Number.isFinite(position.lat) ||
    !Number.isFinite(position.lon) ||
    Math.abs(position.lat) > 90 ||
    Math.abs(position.lon) > 180
  )
    return;
  lastPosition = position;
  // Navigation follows the user with a blue position marker. The red dashed
  // movement trail is owned exclusively by the separate Activity tracker.
  followNavigationPosition(position.lat, position.lon, position.accuracy || 0);
  const nearest = nearestRouteIndex(position, activeRoute.coordinates);
  const remaining = remainingDistance(activeRoute.coordinates, nearest.index);
  const canJudgeOffRoute =
    Number.isFinite(position.accuracy) && position.accuracy <= 40;
  if (canJudgeOffRoute && nearest.distance > 55) offRouteCount += 1;
  else offRouteCount = 0;
  const offRoute = offRouteCount >= 2;
  if (offRoute && Date.now() - lastOffRouteNotice > 30000) {
    lastOffRouteNotice = Date.now();
    showToast(
      `You may be about ${Math.round(nearest.distance)} m away from the planned route.`,
      "warning",
      5000,
    );
  }
  const arrived = remaining < 25 && nearest.distance < 60;
  const upcoming = (activeRoute.indexedSteps || []).find(
    (step) => step.routeIndex > nearest.index + 2 && step.type !== "depart",
  );
  const instruction = arrived
    ? "You have arrived at your destination."
    : upcoming?.instruction || "Continue to your destination.";
  if (arrived && !arrivalNotified) {
    arrivalNotified = true;
    showToast("You have arrived at your destination.", "success");
  }
  lastProgress = {
    instruction,
    remaining,
    distanceFromRoute: nearest.distance,
    offRoute,
    arrived,
    accuracy: position.accuracy,
    index: nearest.index,
  };
  renderGuidance(lastProgress);
  window.dispatchEvent(
    new CustomEvent("exerfit:navigation-updated", { detail: lastProgress }),
  );
}
function renderGuidance(progress) {
  const guidance = document.getElementById("nav-guidance");
  if (!guidance) return;
  guidance.classList.toggle("warning", Boolean(progress.offRoute));
  const routeOptions = activeRoute?.routeOptions?.length
    ? activeRoute.routeOptions
    : [activeRoute, ...(activeRoute?.alternatives || [])].filter(Boolean);
  const hasAlternateRoute = routeOptions.length > 1;
  guidance.innerHTML = `<i data-lucide="${progress.offRoute ? "alert-triangle" : "navigation"}"></i><div><strong>${progress.offRoute ? "Off route — check your direction" : escapeHTML(progress.instruction)}</strong><small>${Number.isFinite(progress.remaining) ? `${formatDistance(progress.remaining)} remaining` : "Waiting for GPS"}${Number.isFinite(progress.distanceFromRoute) ? ` · ${Math.round(progress.distanceFromRoute)} m from route` : ""}${progress.accuracy ? ` · GPS ±${Math.round(progress.accuracy)} m` : ""}</small></div><div class="nav-actions">${progress.offRoute ? '<button class="nav-recalculate-button" type="button">Recalculate</button>' : ""}<button class="nav-alternate-button" type="button" ${hasAlternateRoute ? "" : "disabled"}>Find another route</button></div>`;
  guidance
    .querySelector(".nav-recalculate-button")
    ?.addEventListener("click", recalculateNavigation);
  guidance
    .querySelector(".nav-alternate-button")
    ?.addEventListener("click", findAlternativeNavigationRoute);
  if (window.lucide?.createIcons) window.lucide.createIcons();
}
function findAlternativeNavigationRoute() {
  if (!activeRoute) return null;
  const options = activeRoute.routeOptions?.length
    ? activeRoute.routeOptions
    : [activeRoute, ...(activeRoute.alternatives || [])];
  if (options.length < 2) {
    showToast(
      "The routing service did not return another route for this journey.",
      "info",
    );
    return null;
  }
  const currentIndex = Number.isInteger(activeRoute.routeOptionIndex)
    ? activeRoute.routeOptionIndex
    : Math.max(0, options.indexOf(activeRoute));
  const nextIndex = (currentIndex + 1) % options.length;
  const candidate = {
    ...options[nextIndex],
    routeOptions: options,
    routeOptionIndex: nextIndex,
    alternatives: options.filter((_, index) => index !== nextIndex),
    name: activeRoute.name,
  };
  const useExternalGPS = externalGPS;
  startNavigation(candidate, { externalGPS: useExternalGPS });
  window.dispatchEvent(
    new CustomEvent("exerfit:navigation-route-updated", { detail: candidate }),
  );
  showToast(
    `Alternative ${nextIndex + 1} of ${options.length} selected · ${Math.round(candidate.durationSeconds / 60)} min estimated.`,
    "success",
  );
  return candidate;
}

export async function recalculateNavigation() {
  if (!activeRoute || !lastPosition) {
    showToast("Wait for a current GPS fix before recalculating.", "warning");
    return null;
  }
  const useExternalGPS = externalGPS;
  const destination = activeRoute.destination;
  const mode = activeRoute.mode || "walking";
  try {
    showToast("Requesting an updated route…", "info");
    const route = await getRoute(
      {
        lat: lastPosition.lat,
        lon: lastPosition.lon,
        name: "Current location",
      },
      destination,
      mode,
    );
    startNavigation(route, { externalGPS: useExternalGPS });
    window.dispatchEvent(
      new CustomEvent("exerfit:navigation-route-updated", { detail: route }),
    );
    showToast("Route updated from your current location.", "success");
    return route;
  } catch (error) {
    showToast(`Could not recalculate route: ${error.message}`, "error", 5000);
    return null;
  }
}
export function getNavigationProgress() {
  return lastProgress;
}

// Activity panels can be mounted after navigation starts. Repaint turn guidance
// into the newly mounted panel instead of leaving its static placeholder text.
export function refreshNavigationGuidance() {
  if (!activeRoute) return;
  renderGuidance(
    lastProgress || {
      instruction: "Navigation ready. Move when you are ready.",
      remaining: activeRoute.distanceMeters,
      offRoute: false,
    },
  );
}
