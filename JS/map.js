/* FILE PURPOSE: Initializes Leaflet, map layers, markers, routes, and map preferences. */
/* =========================================================
   FILE: map.js
   PURPOSE: Initializes Leaflet and renders the map, markers, routes,
   activity tracks, and data-backed map overlays.
   MODIFY HERE: Change the map's default center, zoom, or tile provider
   in config.js. The user's map view is not reset when a panel opens.
========================================================= */
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  TILE_PROVIDERS,
} from "./config.js";
import { getUserData, updatePreferences } from "./storage.js";

let map;
let baseLayer;
let hybridLabelLayer;
let userMarker;
let destinationMarker;
let plannedLine;
let navigationTrailLine;
let liveTrackLine;
let selectedHistoryLine;
let savedRouteLayer;
let activityRouteLayer;
let heatmapLayer;
let currentMapType = "standard";
let savedLayerVisible = true;
let activityLayerVisible = true;
let heatmapMode = "off";
let mapResizeTimer = null;

function scheduleMapResize() {
  if (mapResizeTimer) window.clearTimeout(mapResizeTimer);
  mapResizeTimer = window.setTimeout(() => {
    if (map) map.invalidateSize({ pan: false });
  }, 160);
}

const toLatLngs = (coordinates) =>
  (Array.isArray(coordinates) ? coordinates : [])
    .map((point) => {
      const lat = Array.isArray(point) ? Number(point[1]) : Number(point?.lat);
      const lon = Array.isArray(point) ? Number(point[0]) : Number(point?.lon);
      return [lat, lon];
    })
    .filter(
      ([lat, lon]) =>
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180,
    );
const group = () => window.L.layerGroup();

export function initMap() {
  if (!window.L)
    throw new Error(
      "Leaflet did not load. Check the internet connection and refresh the page.",
    );
  map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
    scrollWheelZoom: true,
  }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
  // Keep route lines above map tiles while keeping location/destination markers visible.
  const plannedPane = map.createPane("exerfitPlannedRoutePane");
  plannedPane.style.zIndex = 430;
  plannedPane.style.pointerEvents = "none";
  const navigationPane = map.createPane("exerfitNavigationTrailPane");
  navigationPane.style.zIndex = 440;
  navigationPane.style.pointerEvents = "none";
  const activityPane = map.createPane("exerfitActivityTrackPane");
  activityPane.style.zIndex = 450;
  activityPane.style.pointerEvents = "none";
  // Allow the map canvas to zoom beyond a provider's native tile level; Leaflet scales the last tile.
  map.setMaxZoom(20);
  map.attributionControl.addAttribution(
    'Search & routing data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS routing</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Fix the map</a>',
  );
  savedRouteLayer = group().addTo(map);
  activityRouteLayer = group().addTo(map);
  heatmapLayer = group().addTo(map);
  setMapType(getUserData().preferences.mapType || "standard", false);
  refreshDataLayers();
  window.addEventListener("resize", scheduleMapResize, { passive: true });
  window.addEventListener("orientationchange", scheduleMapResize, {
    passive: true,
  });
  window.visualViewport?.addEventListener("resize", scheduleMapResize, {
    passive: true,
  });
  window.setTimeout(scheduleMapResize, 220);
  return map;
}
export function getMap() {
  return map;
}
export function getMapView() {
  return map ? { center: map.getCenter(), zoom: map.getZoom() } : null;
}

// Replace the base tile layer without changing center or zoom.
export function setMapType(type, persist = true) {
  if (!map) return;
  const chosen = ["standard", "satellite"].includes(type) ? type : "standard";
  const view = getMapView();
  if (baseLayer) map.removeLayer(baseLayer);
  if (hybridLabelLayer) {
    map.removeLayer(hybridLabelLayer);
    hybridLabelLayer = null;
  }
  const provider = TILE_PROVIDERS[chosen];
  baseLayer = L.tileLayer(provider.url, {
    attribution: provider.attribution,
    // Keep zoom interactive past native tile resolution by scaling the latest available tile.
    maxNativeZoom: provider.maxNativeZoom || 18,
    maxZoom: provider.maxZoom || 20,
    crossOrigin: true,
  }).addTo(map);
  attachTileFeedback(baseLayer);

  // Satellite imagery needs transparent reference overlays for labels and roads.
  if (chosen === "satellite") {
    const transportLayer = L.tileLayer(
      TILE_PROVIDERS.hybridTransportation.url,
      {
        attribution: TILE_PROVIDERS.hybridTransportation.attribution,
        maxNativeZoom: TILE_PROVIDERS.hybridTransportation.maxNativeZoom || 19,
        maxZoom: TILE_PROVIDERS.hybridTransportation.maxZoom || 20,
        pane: "overlayPane",
        zIndex: 610,
        crossOrigin: true,
      },
    );
    const placeLayer = L.tileLayer(TILE_PROVIDERS.hybridLabels.url, {
      attribution: TILE_PROVIDERS.hybridLabels.attribution,
      maxNativeZoom: TILE_PROVIDERS.hybridLabels.maxNativeZoom || 19,
      maxZoom: TILE_PROVIDERS.hybridLabels.maxZoom || 20,
      pane: "overlayPane",
      zIndex: 620,
      crossOrigin: true,
    });
    hybridLabelLayer = L.layerGroup([transportLayer, placeLayer]).addTo(map);
  }
  currentMapType = chosen;
  if (view) map.setView(view.center, view.zoom, { animate: false });
  if (persist) updatePreferences({ mapType: chosen });
  document
    .querySelectorAll("[data-map-type]")
    .forEach((button) =>
      button.classList.toggle("is-active", button.dataset.mapType === chosen),
    );
  window.dispatchEvent(
    new CustomEvent("exerfit:map-type-changed", { detail: { type: chosen } }),
  );
  window.setTimeout(() => map.invalidateSize(), 80);
}
export function getMapType() {
  return currentMapType;
}

function attachTileFeedback(layer) {
  // A missing tile is non-blocking; successful tile loads restore the normal status.
  layer.on("load", () => setMapStatus("Map ready"));
}

export function setMapStatus(message) {
  const status = document.getElementById("map-status");
  if (status) status.querySelector("span:last-child").textContent = message;
}
export function locateOnMap(lat, lon, accuracy = 0) {
  if (!map) return;
  const latLng = [lat, lon];
  // Use the real PNG marker asset instead of a CSS-drawn location shape.
  // The PNG path is relative to JS/map.js and therefore works on GitHub Pages.
  const userLocationIcon = L.icon({
    iconUrl: "../assets/icons/map-pin.png",
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -38],
    className: "exerfit-gps-icon",
  });
  if (!userMarker) {
    userMarker = L.marker(latLng, {
      icon: userLocationIcon,
      zIndexOffset: 1000,
    }).addTo(map);
  } else {
    userMarker.setIcon(userLocationIcon);
    userMarker.setLatLng(latLng);
  }
  userMarker.bindPopup(
    `<strong>Your location</strong><br><small>GPS accuracy: ${Math.round(accuracy)} m</small>`,
  );
  return userMarker;
}
export function centerOn(lat, lon, zoom = 16) {
  if (map) map.setView([lat, lon], zoom, { animate: true });
}

// Keep the live GPS marker and camera centered on the user during turn-by-turn navigation.
export function followNavigationPosition(lat, lon, accuracy = 0) {
  if (!map) return;
  locateOnMap(lat, lon, accuracy);
  if (map.getZoom() < 16) map.setZoom(16, { animate: false });
  map.panTo([lat, lon], { animate: true, duration: 0.35 });
}
export function showDestination(lat, lon, label = "Destination") {
  if (!map) return;
  const icon = L.divIcon({
    className: "",
    html: '<span class="exerfit-destination-marker"><b></b></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
  if (!destinationMarker)
    destinationMarker = L.marker([lat, lon], { icon }).addTo(map);
  else destinationMarker.setLatLng([lat, lon]);
  destinationMarker.bindPopup(
    `<strong>${String(label).replace(/[&<>"']/g, "")}</strong>`,
  );
}
export function clearDestination() {
  if (map && destinationMarker) map.removeLayer(destinationMarker);
  destinationMarker = null;
}
export function drawPlannedRoute(coordinates, color = "#e98e62") {
  if (!map) return null;
  const latLngs = toLatLngs(coordinates);
  if (latLngs.length < 2) {
    clearPlannedRoute();
    return null;
  }
  if (plannedLine) map.removeLayer(plannedLine);
  plannedLine = L.polyline(latLngs, {
    pane: "exerfitPlannedRoutePane",
    color,
    weight: 7,
    opacity: 0.98,
    lineCap: "round",
    lineJoin: "round",
    smoothFactor: 1,
    interactive: false,
  }).addTo(map);
  plannedLine.bringToFront();
  const bounds = plannedLine.getBounds();
  if (bounds.isValid()) {
    scheduleMapResize();
    window.setTimeout(() => {
      if (!map || !plannedLine) return;
      map.invalidateSize({ pan: false });
      map.fitBounds(plannedLine.getBounds(), {
        padding: [45, 45],
        maxZoom: 16,
        animate: false,
      });
    }, 220);
  }
  return plannedLine;
}
export function clearPlannedRoute() {
  if (map && plannedLine) map.removeLayer(plannedLine);
  plannedLine = null;
}

// Draws the user's actual movement while turn-by-turn navigation is active.
// This is separate from the planned route and from saved Activity tracks.
export function drawNavigationTrail(points) {
  if (!map) return null;
  const latLngs = (Array.isArray(points) ? points : [])
    .map((point) => [Number(point?.lat), Number(point?.lon)])
    .filter(
      ([lat, lon]) =>
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lon) <= 180,
    );
  if (latLngs.length < 2) return navigationTrailLine || null;
  if (!navigationTrailLine) {
    navigationTrailLine = L.polyline(latLngs, {
      pane: "exerfitNavigationTrailPane",
      color: "#246fe5",
      weight: 6,
      opacity: 0.98,
      lineCap: "round",
      lineJoin: "round",
      smoothFactor: 1,
      interactive: false,
    }).addTo(map);
  } else {
    navigationTrailLine.setLatLngs(latLngs);
  }
  navigationTrailLine.bringToFront();
  return navigationTrailLine;
}
export function clearNavigationTrail() {
  if (map && navigationTrailLine) map.removeLayer(navigationTrailLine);
  navigationTrailLine = null;
}

export function drawRecordedTrack(points) {
  if (!map) return;
  const latLngs = (points || [])
    .map((point) => [Number(point.lat), Number(point.lon)])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (latLngs.length < 2) return;
  if (!liveTrackLine)
    liveTrackLine = L.polyline(latLngs, {
      pane: "exerfitActivityTrackPane",
      color: "#318e68",
      weight: 5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    }).addTo(map);
  else liveTrackLine.setLatLngs(latLngs);
}
export function clearRecordedTrack() {
  if (map && liveTrackLine) map.removeLayer(liveTrackLine);
  liveTrackLine = null;
}
export function drawHistoryTrack(points) {
  if (!map || !points?.length) return;
  if (selectedHistoryLine) map.removeLayer(selectedHistoryLine);
  const latLngs = points.map((point) => [point.lat, point.lon]);
  selectedHistoryLine = L.polyline(latLngs, {
    color: "#4e83a4",
    weight: 5,
    dashArray: "7 7",
    opacity: 0.95,
  }).addTo(map);
  map.fitBounds(selectedHistoryLine.getBounds(), {
    padding: [55, 55],
    maxZoom: 16,
  });
}
export function clearHistoryTrack() {
  if (map && selectedHistoryLine) map.removeLayer(selectedHistoryLine);
  selectedHistoryLine = null;
}

// Rebuild saved/activity overlays from actual data belonging to the signed-in user.
export function refreshDataLayers() {
  if (!map) return;
  const data = getUserData();
  savedRouteLayer.clearLayers();
  activityRouteLayer.clearLayers();
  heatmapLayer.clearLayers();
  (data.routes || []).forEach((route) => {
    if (savedLayerVisible && route.coordinates?.length > 1)
      L.polyline(toLatLngs(route.coordinates), {
        color: "#7b9c80",
        weight: 3,
        opacity: 0.75,
        dashArray: "5 6",
      })
        .bindPopup(
          `<strong>${String(route.name || "Saved route").replace(/[&<>"']/g, "")}</strong>`,
        )
        .addTo(savedRouteLayer);
  });
  (data.activities || []).forEach((activity) => {
    if (activityLayerVisible && activity.points?.length > 1) {
      const points = activity.points.map((point) => [point.lat, point.lon]);
      L.polyline(points, { color: "#4b8eb0", weight: 3, opacity: 0.65 })
        .bindPopup(
          `<strong>${String(activity.type || "Activity")}</strong><br>${(activity.distanceMeters / 1000).toFixed(2)} km`,
        )
        .addTo(activityRouteLayer);
    }
  });
  if (heatmapMode !== "off") {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    (data.activities || []).forEach((activity) => {
      const stamp = new Date(
        activity.startedAt || activity.date || 0,
      ).getTime();
      const points = (activity.points || [])
        .filter((point) => {
          if (heatmapMode === "week" && stamp < cutoff) return false;
          if (heatmapMode === "night") {
            const hour = new Date(point.timestamp).getHours();
            return hour >= 18 || hour < 6;
          }
          return true;
        })
        .map((point) => [point.lat, point.lon]);
      if (points.length > 1)
        L.polyline(points, {
          color: "#e68c5f",
          weight: 11,
          opacity: 0.17,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(heatmapLayer);
    });
  }
  if (savedLayerVisible) savedRouteLayer.addTo(map);
  else map.removeLayer(savedRouteLayer);
  if (activityLayerVisible) activityRouteLayer.addTo(map);
  else map.removeLayer(activityRouteLayer);
  if (heatmapMode !== "off") heatmapLayer.addTo(map);
  else map.removeLayer(heatmapLayer);
}
export function setSavedLayerVisible(visible) {
  savedLayerVisible = Boolean(visible);
  updatePreferences({ savedLayer: savedLayerVisible });
  refreshDataLayers();
}
export function setActivityLayerVisible(visible) {
  activityLayerVisible = Boolean(visible);
  updatePreferences({ activityLayer: activityLayerVisible });
  refreshDataLayers();
}
export function setHeatmapMode(mode) {
  heatmapMode = ["off", "all", "week", "night"].includes(mode) ? mode : "off";
  updatePreferences({ heatmap: heatmapMode });
  refreshDataLayers();
  const note = document.getElementById("heatmap-note");
  const count = getUserData().activities.filter(
    (item) => (item.points || []).length > 1,
  ).length;
  if (note)
    note.textContent = count
      ? `${count} recorded GPS activity${count === 1 ? "" : "ies"} available. The overlay uses your saved tracks.`
      : "A heatmap appears after you save GPS activities. No sample tracks are added.";
}
export function restoreMapPreferences() {
  const preferences = getUserData().preferences || {};
  savedLayerVisible = preferences.savedLayer !== false;
  activityLayerVisible = preferences.activityLayer !== false;
  heatmapMode = preferences.heatmap || "off";
  document.getElementById("layer-saved-routes") &&
    (document.getElementById("layer-saved-routes").checked = savedLayerVisible);
  document.getElementById("layer-activity-routes") &&
    (document.getElementById("layer-activity-routes").checked =
      activityLayerVisible);
  document
    .querySelectorAll("[data-heatmap]")
    .forEach((button) =>
      button.classList.toggle(
        "is-active",
        button.dataset.heatmap === heatmapMode,
      ),
    );
  setHeatmapMode(heatmapMode);
}
export function clearAllRouteDrawings() {
  clearPlannedRoute();
  clearNavigationTrail();
  clearRecordedTrack();
  clearHistoryTrack();
  clearDestination();
}
