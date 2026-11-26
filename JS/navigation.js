/* =========================================================
   FILE: navigation.js
   PURPOSE: Keeps a separate planned route, estimates route progress,
   provides turn guidance, and flags sustained off-route movement.
   GPS is supplied by this module when navigating alone, or by the
   activity recorder when a user follows a route while recording.
========================================================= */
import { drawPlannedRoute, clearPlannedRoute } from "./map.js";
import { getRoute } from "./routing-service.js";
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
  if (!route?.coordinates?.length) {
    showToast("This route does not contain route geometry.", "error");
    return false;
  }
  stopNavigationWatch();
  activeRoute = { ...route, indexedSteps: stepIndexes(route) };
  externalGPS = Boolean(options.externalGPS);
  offRouteCount = 0;
  lastOffRouteNotice = 0;
  lastPosition = null;
  arrivalNotified = false;
  drawPlannedRoute(route.coordinates);
  const state = document.getElementById("nav-guidance");
  if (state) state.classList.remove("is-hidden");
  renderGuidance({
    instruction: "Navigation ready. Move when you are ready.",
    remaining: route.distanceMeters,
    offRoute: false,
  });
  if (!externalGPS && navigator.geolocation) {
    watchId = navigator.geolocation.watchPosition(
      (position) =>
        updateNavigation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (error) => showToast(`Navigation GPS: ${error.message}`, "warning"),
      { enableHighAccuracy: true, maximumAge: 2500, timeout: 15000 },
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
    !Number.isFinite(position.lon)
  )
    return;
  lastPosition = position;
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
  guidance.innerHTML = `<i data-lucide="${progress.offRoute ? "alert-triangle" : "navigation"}"></i><div><strong>${progress.offRoute ? "Off route — check your direction" : escapeHTML(progress.instruction)}</strong><small>${Number.isFinite(progress.remaining) ? `${formatDistance(progress.remaining)} remaining` : "Waiting for GPS"}${Number.isFinite(progress.distanceFromRoute) ? ` · ${Math.round(progress.distanceFromRoute)} m from route` : ""}${progress.accuracy ? ` · GPS ±${Math.round(progress.accuracy)} m` : ""}</small></div>${progress.offRoute ? '<button class="nav-recalculate-button" type="button">Recalculate</button>' : ""}`;
  guidance
    .querySelector(".nav-recalculate-button")
    ?.addEventListener("click", recalculateNavigation);
  if (window.lucide?.createIcons) window.lucide.createIcons();
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
