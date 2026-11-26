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
import { showToast } from "./ui.js";

let map;
let baseLayer;
let hybridLabelLayer;
let userMarker;
let destinationMarker;
let plannedLine;
let liveTrackLine;
let selectedHistoryLine;
let savedRouteLayer;
let activityRouteLayer;
let heatmapLayer;
let currentMapType = "standard";
let savedLayerVisible = true;
let activityLayerVisible = true;
let heatmapMode = "off";
let tileErrorShown = false;

const toLatLngs = (coordinates) =>
  (coordinates || []).map((point) =>
    Array.isArray(point) ? [point[1], point[0]] : [point.lat, point.lon],
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
  map.attributionControl.addAttribution(
    'Search & routing data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">FOSSGIS routing</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Fix the map</a>',
  );
  savedRouteLayer = group().addTo(map);
  activityRouteLayer = group().addTo(map);
  heatmapLayer = group().addTo(map);
  setMapType(getUserData().preferences.mapType || "standard", false);
  refreshDataLayers();
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
  const chosen = ["standard", "dark", "satellite", "hybrid"].includes(type)
    ? type
    : "standard";
  const view = getMapView();
  if (baseLayer) map.removeLayer(baseLayer);
  if (hybridLabelLayer) {
    map.removeLayer(hybridLabelLayer);
    hybridLabelLayer = null;
  }
  const provider = TILE_PROVIDERS[chosen === "hybrid" ? "satellite" : chosen];
  baseLayer = L.tileLayer(provider.url, {
    attribution: provider.attribution,
    maxZoom: 19,
    crossOrigin: true,
  }).addTo(map);
  attachTileFeedback(baseLayer);
  if (chosen === "hybrid") {
    // Hybrid is genuine Esri imagery with the provider's reference labels.
    const labelProvider = TILE_PROVIDERS.hybridLabels;
    hybridLabelLayer = L.tileLayer(labelProvider.url, {
      attribution: labelProvider.attribution,
      maxZoom: 19,
      pane: "overlayPane",
    }).addTo(map);
    attachTileFeedback(hybridLabelLayer);
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
  layer.on("tileerror", () => {
    setMapStatus("Map tiles unavailable");
    if (!tileErrorShown) {
      tileErrorShown = true;
      showToast(
        "Some map tiles could not be loaded. Check your connection or choose another map type.",
        "warning",
        5000,
      );
    }
  });
  layer.on("load", () => {
    tileErrorShown = false;
    setMapStatus("Map ready");
  });
}

export function setMapStatus(message) {
  const status = document.getElementById("map-status");
  if (status) status.querySelector("span:last-child").textContent = message;
}
export function locateOnMap(lat, lon, accuracy = 0) {
  if (!map) return;
  const latLng = [lat, lon];

  // Use a real PNG asset for the user's GPS position instead of CSS geometry.
  // This keeps the marker visually consistent and prevents the oval/distorted
  // marker that can occur when a span is used as a Leaflet divIcon.
  const userLocationIcon = L.icon({
    iconUrl: new URL("../assets/icons/map-pin.png", import.meta.url).href,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  });

  if (!userMarker) {
    userMarker = L.marker(latLng, {
      icon: userLocationIcon,
      zIndexOffset: 1000,
    }).addTo(map);
  } else {
    // Reuse the same PNG icon while only moving the marker to the latest GPS position.
    userMarker.setLatLng(latLng);
    userMarker.setIcon(userLocationIcon);
  }
  userMarker.bindPopup(
    `<strong>Your location</strong><br><small>GPS accuracy: ${Math.round(accuracy)} m</small>`,
  );
  return userMarker;
}
export function centerOn(lat, lon, zoom = 16) {
  if (map) map.setView([lat, lon], zoom, { animate: true });
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
  if (!map || !coordinates?.length) return;
  if (plannedLine) map.removeLayer(plannedLine);
  plannedLine = L.polyline(toLatLngs(coordinates), {
    color,
    weight: 5,
    opacity: 0.95,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(map);
  if (plannedLine.getBounds().isValid())
    map.fitBounds(plannedLine.getBounds(), { padding: [55, 55], maxZoom: 16 });
  return plannedLine;
}
export function clearPlannedRoute() {
  if (map && plannedLine) map.removeLayer(plannedLine);
  plannedLine = null;
}
export function drawRecordedTrack(points) {
  if (!map) return;
  const latLngs = (points || []).map((point) => [point.lat, point.lon]);
  if (!liveTrackLine)
    liveTrackLine = L.polyline(latLngs, {
      color: "#318e68",
      weight: 5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
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
  clearRecordedTrack();
  clearHistoryTrack();
  clearDestination();
}
