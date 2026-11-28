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
import { toLeafletSegments } from "./route-geometry.js";

let map;
let baseLayer;
let hybridLabelLayer;
let userMarker;
let navigationPositionMarker;
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
let mapResizeTimer = null;

function scheduleMapResize() {
  if (mapResizeTimer) window.clearTimeout(mapResizeTimer);
  mapResizeTimer = window.setTimeout(() => {
    if (map) map.invalidateSize({ pan: false });
  }, 160);
}

const toLatLngs = (geometry) => toLeafletSegments(geometry).flat();
const group = () => window.L.layerGroup();

export function initMap() {
  if (!window.L)
    throw new Error(
      "Leaflet did not load. Check the internet connection and refresh the page.",
    );
  map = L.map("map", {
    zoomControl: false,
    // Use Leaflet's standard SVG overlay renderer for predictable visible route paths.
    // Route tracks remain independent layers; they no longer depend on custom renderers.
    preferCanvas: false,
    scrollWheelZoom: true,
  }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
  // Leaflet's built-in overlay pane sits above map tiles (tilePane: 200) and
  // below markers (markerPane: 600), so paths stay visible without covering pins.
  const routeOverlayPane = map.getPane("overlayPane");
  if (routeOverlayPane) routeOverlayPane.style.zIndex = 450;

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
  // Navigation uses a dedicated blue position marker, distinct from the red
  // dashed actual-movement trail and the orange planned route.
  const blueNavigationIcon = L.divIcon({
    className: "exerfit-navigation-position-icon",
    html: '<span class="exerfit-navigation-position-dot"><span></span></span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
  if (!navigationPositionMarker) {
    navigationPositionMarker = L.marker([lat, lon], {
      icon: blueNavigationIcon,
      zIndexOffset: 1200,
    }).addTo(map);
  } else {
    navigationPositionMarker.setIcon(blueNavigationIcon);
    navigationPositionMarker.setLatLng([lat, lon]);
  }
  navigationPositionMarker.bindPopup(
    `<strong>Navigation position</strong><br><small>GPS accuracy: ${Math.round(accuracy)} m</small>`,
  );
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
export function drawPlannedRoute(geometry, color = "#f28a36") {
  if (!map) return null;
  // Route planning is orange; once turn-by-turn navigation begins the same
  // geometry is redrawn blue. These remain one independently managed route layer.
  const isNavigationRoute = color.toLowerCase() === "#2878f0";
  color = isNavigationRoute ? "#2878f0" : "#f28a36";
  const latLngSegments = toLeafletSegments(geometry);
  const pointCount = latLngSegments.reduce((sum, segment) => sum + segment.length, 0);
  if (pointCount < 2) {
    console.warn("[ExerFit map] Planned route has no valid LineString geometry.", {
      geometryType: geometry?.type || (Array.isArray(geometry) ? "coordinates" : typeof geometry),
    });
    clearPlannedRoute();
    return null;
  }
  if (plannedLine) map.removeLayer(plannedLine);
  // A normal GeoJSON LineString is sent to Leaflet as a flat LatLng array.
  // MultiLineString geometry stays nested so disconnected segments are preserved.
  const leafletRoute = latLngSegments.length === 1
    ? latLngSegments[0]
    : latLngSegments;
  plannedLine = L.polyline(leafletRoute, {
    pane: "overlayPane",
    className: isNavigationRoute
      ? "exerfit-navigation-route-line"
      : "exerfit-planned-route-line",
    color,
    weight: 8,
    opacity: 1,
    lineCap: "round",
    lineJoin: "round",
    smoothFactor: 1,
    interactive: false,
    bubblingMouseEvents: false,
  }).addTo(map);
  plannedLine.bringToFront();
  const renderedPath = plannedLine.getElement?.();
  const pathDataLength = renderedPath?.getAttribute("d")?.length || 0;
  if (renderedPath) {
    // Keep the actual SVG stroke explicit so broad site-wide SVG styles cannot
    // make the route transparent or collapse its stroke styling.
    renderedPath.style.stroke = color;
    renderedPath.style.strokeWidth = "8px";
    renderedPath.style.strokeOpacity = "1";
    renderedPath.style.fill = "none";
    renderedPath.style.strokeLinecap = "round";
    renderedPath.style.strokeLinejoin = "round";
  }
  console.debug(`[ExerFit map] ${isNavigationRoute ? "Navigation" : "Planned"} route rendered.`, {
    segments: latLngSegments.length,
    points: pointCount,
    renderer: "Leaflet default overlay renderer",
    pane: plannedLine.options.pane,
    svgPathAttached: Boolean(renderedPath),
    pathDataLength,
    firstPoint: latLngSegments[0][0],
    lastPoint: latLngSegments.at(-1).at(-1),
  });
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

// Removes only the blue live-navigation position marker. It never touches
// the independently recorded red GPS trail.
export function clearNavigationPosition() {
  if (map && navigationPositionMarker) map.removeLayer(navigationPositionMarker);
  navigationPositionMarker = null;
}

export function drawRecordedTrack(points) {
  if (!map) return null;
  const latLngs = toLatLngs(points);
  if (latLngs.length < 2) return liveTrackLine || null;
  if (!liveTrackLine)
    liveTrackLine = L.polyline(latLngs, {
      pane: "overlayPane",
      className: "exerfit-live-tracking-line",
      color: "#e53945",
      weight: 5,
      opacity: 0.58,
      dashArray: "10 9",
      dashOffset: "0",
      lineCap: "round",
      lineJoin: "round",
      smoothFactor: 1,
      interactive: false,
      bubblingMouseEvents: false,
    }).addTo(map);
  else liveTrackLine.setLatLngs(latLngs);
  liveTrackLine.bringToFront();
  return liveTrackLine;
}
export function clearRecordedTrack() {
  if (map && liveTrackLine) map.removeLayer(liveTrackLine);
  liveTrackLine = null;
}
export function drawHistoryTrack(points) {
  if (!map || !points?.length) return;
  if (selectedHistoryLine) map.removeLayer(selectedHistoryLine);
  const latLngs = toLatLngs(points);
  if (latLngs.length < 2) return;
  selectedHistoryLine = L.polyline(latLngs, {
    pane: "overlayPane",
    className: "exerfit-history-track-line",
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
    const geometry = route.geometrySegments || route.geometry || route.coordinates;
    const routeSegments = toLeafletSegments(geometry);
    if (savedLayerVisible && routeSegments.some((segment) => segment.length > 1))
      L.polyline(routeSegments, {
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
      const points = toLatLngs(activity.points);
      if (points.length < 2) return;
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
  clearNavigationPosition();
  clearRecordedTrack();
  clearHistoryTrack();
  clearDestination();
}
