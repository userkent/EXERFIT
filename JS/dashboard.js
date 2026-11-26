/* =========================================================
   FILE: dashboard.js
   PURPOSE: Starts the signed-in dashboard and connects the modules.
   Responsibilities: panel navigation, destination routing, map settings,
   profile access, settings, and cross-module updates.
========================================================= */
import { requireAuth, signOut } from "./auth.js";
import {
  getCurrentUser,
  getUserData,
  saveUserData,
  createId,
  updateUser,
} from "./storage.js";
import {
  initMap,
  setMapType,
  getMap,
  locateOnMap,
  centerOn,
  showDestination,
  drawPlannedRoute,
  clearAllRouteDrawings,
  refreshDataLayers,
  setSavedLayerVisible,
  setActivityLayerVisible,
  setHeatmapMode,
  restoreMapPreferences,
  setMapStatus,
} from "./map.js";
import { searchLocations, getRoute } from "./routing-service.js";
import {
  startNavigation,
  clearNavigation,
  stopNavigation,
} from "./navigation.js";
import { mountActivityPanel } from "./activity.js";
import { mountSavedRoutesPanel } from "./saved-routes.js";
import { mountWorkoutPanel } from "./workout-planner.js";
import { mountHistoryPanel } from "./activity-history.js";
import { setWeatherPosition, mountWeatherSettings } from "./weather.js";
import {
  profileStatisticsMarkup,
  refreshDashboardStats,
} from "./statistics.js";
import {
  showToast,
  openModal,
  closeModal,
  bindModalChrome,
  escapeHTML,
  formatDistance,
  formatDuration,
  refreshIcons,
} from "./ui.js";
import { initDraggableCards } from "./drag-cards.js";

if (requireAuth()) initializeDashboard();

let currentRoute = null;
let selectedDestination = null;
let lastKnownPosition = null;
let currentPanel = "overview";
let destinationPickMode = false;

function initializeDashboard() {
  try {
    initMap();
  } catch (error) {
    showToast(error.message || "Map could not be initialized.", "error", 6000);
    console.error(error);
  }
  bindModalChrome();
  restoreMapPreferences();
  updateHeaderProfile();
  refreshDashboardStats();
  bindPanelNavigation();
  bindMapControls();
  bindDestinationSearch();
  bindMapSettings();
  bindProfileAndSettings();
  bindAppEvents();
  initDraggableCards();
  setMapStatus("Map ready");
  refreshIcons();
}

function updateHeaderProfile() {
  const user = getCurrentUser();
  if (!user) return;
  const nickname = document.getElementById("header-nickname");
  if (nickname) nickname.textContent = user.nickname;
  const avatar = document.getElementById("header-avatar");
  if (avatar) {
    avatar.replaceChildren();
    if (isValidAvatarData(user.avatar)) {
      const image = document.createElement("img");
      image.src = user.avatar;
      image.alt = `${user.nickname}'s profile photo`;
      avatar.append(image);
    } else {
      avatar.textContent = getInitials(user.fullName || user.nickname);
    }
  }
}
function isValidAvatarData(value) {
  return (
    typeof value === "string" &&
    /^data:image\/(?:jpeg|png|webp);base64,/i.test(value)
  );
}
function getInitials(text) {
  return String(text || "EF")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function bindPanelNavigation() {
  document
    .querySelectorAll("[data-open-panel]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openPanel(button.dataset.openPanel),
      ),
    );
  document
    .getElementById("close-panel")
    ?.addEventListener("click", () => openPanel("overview"));
  document
    .getElementById("collapse-panel")
    ?.addEventListener("click", () =>
      toggleFloatingPanel("main-panel", "collapse-panel"),
    );
  document
    .getElementById("collapse-map-settings")
    ?.addEventListener("click", () =>
      toggleFloatingPanel("map-settings-panel", "collapse-map-settings"),
    );

  // Bind the Strava-style side hide/reveal buttons. These hide only the card, not the map.
  bindPanelSideToggle(
    "main-panel",
    "panel-side-toggle",
    "Hide activity panel",
    "Show activity panel",
  );
  bindPanelSideToggle(
    "map-settings-panel",
    "map-settings-side-toggle",
    "Hide map settings",
    "Show map settings",
  );

  // Keep the reveal tab attached to the visible edge of the panel after resizing or dragging.
  window.addEventListener("resize", () => {
    positionPanelSideToggle("main-panel", "panel-side-toggle");
    positionPanelSideToggle("map-settings-panel", "map-settings-side-toggle");
  });

  window.addEventListener("exerfit:open-panel", (event) =>
    openPanel(event.detail?.panel || "overview"),
  );
}

// Collapse hides the contents but leaves the panel heading and an up-arrow control visible.
function toggleFloatingPanel(panelId, buttonId) {
  const panel = document.getElementById(panelId);
  const button = document.getElementById(buttonId);
  if (!panel || !button) return;
  const isCollapsed = panel.classList.toggle("is-collapsed");
  button.setAttribute("aria-expanded", String(!isCollapsed));
  button.setAttribute(
    "aria-label",
    isCollapsed ? "Expand panel" : "Collapse panel",
  );
  button.title = isCollapsed ? "Show panel contents" : "Hide panel contents";
  button.innerHTML = `<i data-lucide="${isCollapsed ? "chevron-up" : "chevron-down"}"></i>`;
  refreshIcons(button);
  window.setTimeout(() => getMap()?.invalidateSize(), 120);
}

function expandFloatingPanel(panelId, buttonId) {
  const panel = document.getElementById(panelId);
  const button = document.getElementById(buttonId);
  if (!panel || !button) return;
  panel.classList.remove("is-collapsed");
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-label", "Collapse panel");
  button.title = "Hide panel contents";
  button.innerHTML = '<i data-lucide="chevron-down"></i>';
  refreshIcons(button);
}
// Bind one side toggle to a floating panel.
function bindPanelSideToggle(panelId, toggleId, hideLabel, showLabel) {
  const panel = document.getElementById(panelId);
  const toggle = document.getElementById(toggleId);
  if (!panel || !toggle || toggle.dataset.bound === "true") return;
  toggle.dataset.bound = "true";

  toggle.addEventListener("click", () => {
    const isHidden = panel.classList.toggle("is-side-hidden");
    toggle.setAttribute("aria-expanded", String(!isHidden));
    toggle.setAttribute("aria-label", isHidden ? showLabel : hideLabel);
    toggle.title = isHidden ? showLabel : hideLabel;
    toggle.innerHTML = `<i data-lucide="${isHidden ? "chevron-right" : "chevron-left"}"></i>`;
    refreshIcons(toggle);
    positionPanelSideToggle(panelId, toggleId);
    window.setTimeout(() => getMap()?.invalidateSize(), 260);
  });

  positionPanelSideToggle(panelId, toggleId);
}

// Position the reveal tab at the panel edge. When hidden, keep the tab visible at the screen edge.
function positionPanelSideToggle(panelId, toggleId) {
  const panel = document.getElementById(panelId);
  const toggle = document.getElementById(toggleId);
  const workspace = document.querySelector(".map-workspace");
  if (!panel || !toggle || !workspace) return;

  const workspaceRect = workspace.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const hidden = panel.classList.contains("is-side-hidden");
  const closed = panel.classList.contains("is-hidden");
  toggle.classList.toggle("is-hidden", closed);
  if (closed) return;
  const toggleWidth = toggle.offsetWidth || 34;
  const toggleHeight = toggle.offsetHeight || 52;

  // The tab stays on the left screen edge when the card is hidden.
  const left = hidden
    ? 0
    : Math.max(0, panelRect.right - workspaceRect.left - 1);
  const top = Math.max(
    12,
    Math.min(
      workspace.clientHeight - toggleHeight - 12,
      panelRect.top - workspaceRect.top + (panelRect.height - toggleHeight) / 2,
    ),
  );

  toggle.style.left = `${left}px`;
  toggle.style.top = `${top}px`;
  toggle.style.right = "auto";
}

function openPanel(panel) {
  currentPanel = panel;
  const main = document.getElementById("main-panel");
  const container = document.getElementById("panel-content");
  const title = document.getElementById("panel-title");
  const eyebrow = document.getElementById("panel-eyebrow");
  const titles = {
    activity: ["Activity", "OUTDOOR TRACKING"],
    routes: ["Saved routes", "YOUR ROUTE LIBRARY"],
    workouts: ["Workout planner", "INDOOR TRAINING"],
    history: ["History", "YOUR PROGRESS"],
    settings: ["Settings", "PREFERENCES"],
  };
  document
    .querySelectorAll(".nav-item")
    .forEach((button) =>
      button.classList.toggle(
        "active",
        button.dataset.openPanel === panel ||
          (panel === "overview" && button.dataset.openPanel === "overview"),
      ),
    );
  document.getElementById("map-settings-panel").classList.add("is-hidden");
  if (panel === "overview") {
    expandFloatingPanel("main-panel", "collapse-panel");
    main.classList.add("is-hidden");
    main.classList.remove("is-side-hidden");
    positionPanelSideToggle("main-panel", "panel-side-toggle");
    getMap()?.invalidateSize();
    return;
  }
  const [panelTitle, panelEyebrow] = titles[panel] || titles.activity;
  title.textContent = panelTitle;
  eyebrow.textContent = panelEyebrow;
  expandFloatingPanel("main-panel", "collapse-panel");
  main.classList.remove("is-hidden");
  main.classList.remove("is-side-hidden");
  positionPanelSideToggle("main-panel", "panel-side-toggle");
  container.innerHTML = "";
  if (panel === "activity") mountActivityPanel(container);
  else if (panel === "routes") mountSavedRoutesPanel(container);
  else if (panel === "workouts") mountWorkoutPanel(container);
  else if (panel === "history") mountHistoryPanel(container);
  else if (panel === "settings") mountSettingsPanel(container);
  window.setTimeout(() => getMap()?.invalidateSize(), 100);
}

function bindMapControls() {
  // Standard map controls remain independent from route planning.
  document
    .getElementById("zoom-in")
    ?.addEventListener("click", () => getMap()?.zoomIn());
  document
    .getElementById("zoom-out")
    ?.addEventListener("click", () => getMap()?.zoomOut());
  document.getElementById("locate-me")?.addEventListener("click", locateUser);

  // Route planning is opt-in: the map does nothing special until this button is clicked.
  document
    .getElementById("set-destination-map")
    ?.addEventListener("click", () =>
      setDestinationPickMode(!destinationPickMode),
    );

  // Only clicks made while destination-picking mode is active create a route destination.
  getMap()?.on("click", (event) => {
    if (!destinationPickMode) return;
    const { lat, lng } = event.latlng;
    selectMapDestination(lat, lng);
  });

  document
    .getElementById("header-weather")
    ?.addEventListener("click", () => openPanel("settings"));
}

function setDestinationPickMode(enabled) {
  destinationPickMode = enabled;
  const button = document.getElementById("set-destination-map");
  const mapElement = document.getElementById("map");
  if (!button || !mapElement) return;

  button.classList.toggle("is-active", enabled);
  button.setAttribute("aria-pressed", String(enabled));
  button.title = enabled
    ? "Click the map to set your destination"
    : "Set destination on map";
  mapElement.classList.toggle("is-picking-destination", enabled);
  setMapStatus(
    enabled ? "Click the map to choose your destination" : "Map ready",
  );
  showToast(
    enabled
      ? "Destination mode is on. Click anywhere on the map."
      : "Destination mode cancelled.",
    enabled ? "info" : "warning",
  );
}
function locateUser() {
  if (!navigator.geolocation) {
    showToast("This browser does not support geolocation.", "error");
    return;
  }
  setMapStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      lastKnownPosition = {
        lat: latitude,
        lon: longitude,
        accuracy,
        name: "Your location",
        timestamp: Date.now(),
      };
      locateOnMap(latitude, longitude, accuracy);
      centerOn(latitude, longitude, 16);
      setWeatherPosition(latitude, longitude);
      setMapStatus(`Location found · ±${Math.round(accuracy)} m`);
      showToast("Your current location is on the map.", "success");
    },
    (error) => {
      setMapStatus("Location unavailable");
      const messages = {
        1: "Location permission was denied. Allow it in your browser settings.",
        2: "Your location is currently unavailable.",
        3: "The location request timed out. Try again.",
      };
      showToast(messages[error.code] || error.message, "warning", 5000);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
  );
}
function getCurrentPosition() {
  if (
    lastKnownPosition &&
    Date.now() - lastKnownPosition.timestamp < 2 * 60 * 1000
  )
    return Promise.resolve(lastKnownPosition);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support GPS location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        lastKnownPosition = {
          lat: latitude,
          lon: longitude,
          accuracy,
          name: "Your location",
          timestamp: Date.now(),
        };
        locateOnMap(latitude, longitude, accuracy);
        setWeatherPosition(latitude, longitude);
        resolve(lastKnownPosition);
      },
      (error) =>
        reject(
          new Error(
            error.code === 1
              ? "Allow location access to create a route from your current position."
              : "Could not get your current location. Try the Locate Me button.",
          ),
        ),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  });
}

function bindDestinationSearch() {
  const form = document.getElementById("location-search-form");
  const resultsContainer = document.getElementById("search-results");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = document.getElementById("location-query").value.trim();
    if (query.length < 3) {
      showToast("Type at least 3 characters to search.", "warning");
      return;
    }
    resultsContainer.classList.remove("is-hidden");
    resultsContainer.innerHTML =
      '<div class="search-empty">Searching OpenStreetMap…</div>';
    setMapStatus("Searching places…");
    try {
      const results = await searchLocations(query);
      if (!results.length) {
        resultsContainer.innerHTML =
          '<div class="search-empty">No matching places were found. Try a nearby landmark or a more specific name.</div>';
        setMapStatus("No search results");
        return;
      }
      resultsContainer.innerHTML = results
        .map(
          (result) =>
            `<button class="search-result" type="button" data-place-id="${escapeHTML(result.id)}"><i data-lucide="map-pin"></i><span><strong>${escapeHTML(result.name)}</strong><small>${escapeHTML(result.address)}</small></span></button>`,
        )
        .join("");
      refreshIcons(resultsContainer);
      setMapStatus(
        `${results.length} place${results.length === 1 ? "" : "s"} found`,
      );
      resultsContainer.querySelectorAll("[data-place-id]").forEach((button) =>
        button.addEventListener("click", () => {
          const place = results.find(
            (item) => String(item.id) === button.dataset.placeId,
          );
          if (place) selectDestination(place, resultsContainer);
        }),
      );
    } catch (error) {
      resultsContainer.innerHTML = `<div class="search-empty">${escapeHTML(error.message)}</div>`;
      setMapStatus("Search unavailable");
      showToast(error.message, "error", 5000);
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".map-top-left"))
      resultsContainer?.classList.add("is-hidden");
  });
}

async function selectMapDestination(lat, lon) {
  // A map-picked destination uses coordinates directly; no place search is required.
  const place = {
    id: `map-${Date.now()}`,
    name: "Pinned destination",
    address: "Selected on map",
    lat,
    lon,
  };
  setDestinationPickMode(false);
  await selectDestination(place, document.getElementById("search-results"));
}

async function selectDestination(place, resultsContainer) {
  selectedDestination = place;
  resultsContainer.classList.add("is-hidden");
  showDestination(place.lat, place.lon, place.name);
  centerOn(place.lat, place.lon, 14);
  setMapStatus("Calculating route…");
  try {
    const start = await getCurrentPosition();
    const mode = document.getElementById("travel-mode").value;
    const route = await getRoute(start, place, mode);
    currentRoute = { ...route, name: `${start.name} to ${place.name}` };
    drawPlannedRoute(route.coordinates);
    displayRouteSummary(route, place);
    setMapStatus("Route ready");
    showToast(
      "A route was generated from your current GPS location.",
      "success",
    );
  } catch (error) {
    setMapStatus("Route unavailable");
    showToast(error.message, "error", 5500);
  }
}
function displayRouteSummary(route, place) {
  const card = document.getElementById("route-summary");
  card.hidden = false;
  document.getElementById("route-destination-title").textContent = place.name;
  document.getElementById("route-distance").textContent = formatDistance(
    route.distanceMeters,
  );
  document.getElementById("route-duration").textContent = formatDuration(
    route.durationSeconds * 1000,
  );
  document.getElementById("route-mode-label").textContent =
    route.mode[0].toUpperCase() + route.mode.slice(1);
  const instructions = (route.steps || [])
    .slice(0, 5)
    .map(
      (step) =>
        `<div class="instruction-item"><i data-lucide="arrow-up-right"></i><span>${escapeHTML(step.instruction)}<small>${formatDistance(step.distance)}</small></span></div>`,
    )
    .join("");
  document.getElementById("route-instructions").innerHTML =
    instructions ||
    '<p class="settings-note">The routing service did not return turn details for this route.</p>';
  refreshIcons(card);
}
function bindRouteActions() {
  document
    .getElementById("save-current-route")
    ?.addEventListener("click", () => {
      if (!currentRoute) return;
      openModal({
        title: "Save this route",
        content: `<p>Give your route a name so you can load it later from Add Route.</p><label class="form-field"><span>Route name</span><input id="route-name-input" class="modal-form-input" maxlength="60" value="${escapeHTML(currentRoute.name || "My route")}"></label>`,
        confirmText: "Save route",
        onConfirm: (close) => {
          const name = document.getElementById("route-name-input").value.trim();
          if (!name) {
            showToast("Enter a route name.", "warning");
            return;
          }
          const data = getUserData();
          data.routes.unshift({
            ...currentRoute,
            id: createId("route"),
            name,
            createdAt: new Date().toISOString(),
          });
          saveUserData(data);
          refreshDataLayers();
          close();
          showToast("Route saved to your route library.", "success");
        },
      });
    });
  document
    .getElementById("start-route-navigation")
    ?.addEventListener("click", () => {
      if (!currentRoute) return;
      if (startNavigation(currentRoute)) openPanel("activity");
    });
  document.getElementById("clear-route")?.addEventListener("click", () => {
    clearNavigation();
    clearAllRouteDrawings();
    currentRoute = null;
    selectedDestination = null;
    document.getElementById("route-summary").hidden = true;
    setMapStatus("Map ready");
  });
}

function bindMapSettings() {
  const panel = document.getElementById("map-settings-panel");
  document
    .getElementById("open-map-settings")
    ?.addEventListener("click", () => {
      document.getElementById("main-panel").classList.add("is-hidden");
      expandFloatingPanel("map-settings-panel", "collapse-map-settings");
      panel.classList.remove("is-hidden");
      panel.classList.remove("is-side-hidden");
      positionPanelSideToggle("map-settings-panel", "map-settings-side-toggle");
      document
        .querySelectorAll(".nav-item")
        .forEach((button) =>
          button.classList.toggle(
            "active",
            button.dataset.openPanel === "overview",
          ),
        );
      window.setTimeout(() => getMap()?.invalidateSize(), 100);
    });
  document
    .getElementById("close-map-settings")
    ?.addEventListener("click", () => {
      panel.classList.add("is-hidden");
      panel.classList.remove("is-side-hidden");
      positionPanelSideToggle("map-settings-panel", "map-settings-side-toggle");
      expandFloatingPanel("map-settings-panel", "collapse-map-settings");
      window.setTimeout(() => getMap()?.invalidateSize(), 100);
    });
  document
    .querySelectorAll("[data-map-type]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        setMapType(button.dataset.mapType),
      ),
    );
  document
    .getElementById("layer-saved-routes")
    ?.addEventListener("change", (event) =>
      setSavedLayerVisible(event.target.checked),
    );
  document
    .getElementById("layer-activity-routes")
    ?.addEventListener("change", (event) =>
      setActivityLayerVisible(event.target.checked),
    );
  document.querySelectorAll("[data-heatmap]").forEach((button) =>
    button.addEventListener("click", () => {
      setHeatmapMode(button.dataset.heatmap);
      document
        .querySelectorAll("[data-heatmap]")
        .forEach((item) => item.classList.toggle("is-active", item === button));
    }),
  );
  document
    .getElementById("open-map-settings")
    ?.setAttribute("aria-expanded", "false");
  document
    .querySelectorAll("[data-map-type]")
    .forEach((button) =>
      button.classList.toggle(
        "is-active",
        button.dataset.mapType ===
          (getUserData().preferences.mapType || "standard"),
      ),
    );
}

function mountSettingsPanel(container) {
  mountWeatherSettings(container);
  const user = getCurrentUser();
  container.insertAdjacentHTML(
    "beforeend",
    `<section class="panel-section"><div class="panel-section-title"><span>Account</span><small>Prototype settings</small></div><div class="list-card"><h3>${escapeHTML(user.fullName)}</h3><p>@${escapeHTML(user.nickname)} · ${escapeHTML(user.email)}</p><div class="list-card-actions"><button class="button button-secondary" id="settings-edit-profile" type="button"><i data-lucide="user-round-pen"></i> Edit profile</button><button class="button button-danger" id="settings-logout" type="button"><i data-lucide="log-out"></i> Log out</button></div></div></section><section class="panel-section"><div class="panel-section-title"><span>Map preferences</span></div><button class="button button-secondary" id="settings-map-open" type="button" style="width:100%"><i data-lucide="layers-3"></i> Open map settings</button></section><p class="settings-note">Prototype accounts and activity records are stored only in this browser. Clearing site data removes them.</p>`,
  );
  refreshIcons(container);
  container
    .querySelector("#settings-edit-profile")
    ?.addEventListener("click", openProfile);
  container
    .querySelector("#settings-logout")
    ?.addEventListener("click", confirmLogout);
  container
    .querySelector("#settings-map-open")
    ?.addEventListener("click", () => {
      expandFloatingPanel("map-settings-panel", "collapse-map-settings");
      document
        .getElementById("map-settings-panel")
        .classList.remove("is-hidden");
      document
        .getElementById("map-settings-panel")
        .classList.remove("is-side-hidden");
      positionPanelSideToggle("map-settings-panel", "map-settings-side-toggle");
      document.getElementById("main-panel").classList.add("is-hidden");
    });
}

function bindProfileAndSettings() {
  document
    .getElementById("open-settings")
    ?.addEventListener("click", () => openPanel("settings"));
  document
    .getElementById("open-profile")
    ?.addEventListener("click", openProfile);
  bindRouteActions();
}
function openProfile() {
  const user = getCurrentUser();
  if (!user) return;

  // Keep a pending copy so a user can preview or remove a photo before saving changes.
  let pendingAvatar = user.avatar || "";
  let avatarWasChanged = false;

  openModal({
    title: "Your profile",
    content: `<div class="profile-summary-head"><span class="avatar profile-photo-preview" id="profile-avatar-preview">${getInitials(user.fullName || user.nickname)}</span><div><h3>${escapeHTML(user.fullName)}</h3><p>@${escapeHTML(user.nickname)} · ${escapeHTML(user.email)}</p></div></div>
      <div class="profile-photo-editor">
        <div class="profile-photo-actions">
          <label class="button button-secondary" for="profile-photo-input"><i data-lucide="image-plus"></i> Choose photo</label>
          <input class="profile-photo-file" id="profile-photo-input" type="file" accept="image/png,image/jpeg,image/webp">
          <button class="button button-quiet" id="profile-photo-remove" type="button">Remove photo</button>
          <small>PNG, JPG, or WebP. The image is resized before being saved in this browser.</small>
        </div>
      </div>
      ${profileStatisticsMarkup()}
      <div class="form-field" style="margin-top:15px"><label for="profile-fullname">Full name</label><input class="modal-form-input" id="profile-fullname" maxlength="80" value="${escapeHTML(user.fullName)}"></div>
      <div class="form-field"><label for="profile-nickname">Nickname</label><input class="modal-form-input" id="profile-nickname" maxlength="30" value="${escapeHTML(user.nickname)}"></div>`,
    confirmText: "Save profile",
    onConfirm: (close) => {
      const fullName = document.getElementById("profile-fullname").value.trim();
      const nickname = document.getElementById("profile-nickname").value.trim();
      if (!fullName || nickname.length < 3 || /\s/.test(nickname)) {
        showToast(
          "Enter a full name and a nickname of at least 3 characters without spaces.",
          "warning",
        );
        return;
      }
      const current = getCurrentUser();
      const allUsers = JSON.parse(
        localStorage.getItem("exerfit.users") || "[]",
      );
      if (
        allUsers.some(
          (item) =>
            item.id !== current.id &&
            item.nickname.toLowerCase() === nickname.toLowerCase(),
        )
      ) {
        showToast("That nickname is already in use.", "warning");
        return;
      }
      try {
        const changes = { fullName, nickname };
        if (avatarWasChanged) changes.avatar = pendingAvatar;
        updateUser(current.id, changes);
        updateHeaderProfile();
        close();
        showToast("Profile updated.", "success");
      } catch (error) {
        showToast(error.message || "Could not save profile changes.", "error");
      }
    },
  });

  const preview = document.getElementById("profile-avatar-preview");
  const fileInput = document.getElementById("profile-photo-input");
  const removeButton = document.getElementById("profile-photo-remove");
  if (pendingAvatar && isValidAvatarData(pendingAvatar))
    renderProfilePreview(preview, pendingAvatar, user.nickname);

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("Choose a PNG, JPG, or WebP image.", "warning");
      fileInput.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("Choose an image smaller than 8 MB.", "warning");
      fileInput.value = "";
      return;
    }
    try {
      pendingAvatar = await createProfilePhotoData(file);
      avatarWasChanged = true;
      renderProfilePreview(preview, pendingAvatar, user.nickname);
      showToast(
        "Photo preview updated. Save your profile to keep it.",
        "success",
      );
    } catch (error) {
      showToast(error.message || "That image could not be opened.", "error");
    }
  });

  removeButton?.addEventListener("click", () => {
    pendingAvatar = "";
    avatarWasChanged = true;
    renderProfilePreview(preview, "", user.fullName || user.nickname);
    if (fileInput) fileInput.value = "";
  });
}

function renderProfilePreview(container, imageData, initialsSource) {
  if (!container) return;
  container.replaceChildren();
  if (isValidAvatarData(imageData)) {
    const image = document.createElement("img");
    image.src = imageData;
    image.alt = "Profile photo preview";
    container.append(image);
  } else {
    container.textContent = getInitials(initialsSource);
  }
}

/**
 * Crops a selected picture to a square avatar and compresses it to reduce localStorage use.
 * @param {File} file User-selected image file.
 * @returns {Promise<string>} A compact JPEG data URL.
 */
function createProfilePhotoData(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const squareSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - squareSize) / 2;
      const sourceY = (image.naturalHeight - squareSize) / 2;
      const canvas = document.createElement("canvas");
      const outputSize = 480;
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Image editing is not available in this browser."));
        return;
      }
      context.drawImage(
        image,
        sourceX,
        sourceY,
        squareSize,
        squareSize,
        0,
        0,
        outputSize,
        outputSize,
      );

      // Reduce JPEG quality in small steps if a detailed photo is still too large.
      let quality = 0.86;
      let imageData = canvas.toDataURL("image/jpeg", quality);
      while (imageData.length > 420000 && quality > 0.55) {
        quality -= 0.08;
        imageData = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(imageData);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be loaded."));
    };
    image.src = objectUrl;
  });
}
function confirmLogout() {
  openModal({
    title: "Log out of ExerFit?",
    content:
      "<p>Your saved browser data will remain on this device. Logging out ends this local prototype session.</p>",
    confirmText: "Log out",
    confirmVariant: "button-danger",
    onConfirm: (close) => {
      close();
      signOut();
    },
  });
}

function bindAppEvents() {
  document
    .getElementById("main-panel")
    .addEventListener("transitionend", () => getMap()?.invalidateSize());
  window.addEventListener("exerfit:data-changed", () => {
    refreshDataLayers();
    refreshDashboardStats();
    if (currentPanel === "routes")
      mountSavedRoutesPanel(document.getElementById("panel-content"));
    if (currentPanel === "history")
      mountHistoryPanel(document.getElementById("panel-content"));
  });
  window.addEventListener("exerfit:activity-saved", refreshDashboardStats);
  window.addEventListener("exerfit:navigation-updated", (event) => {
    const summary = document.getElementById("route-instructions");
    if (summary && currentRoute) {
      const progress = event.detail;
      summary.insertAdjacentHTML(
        "afterbegin",
        `<div class="instruction-item"><i data-lucide="navigation"></i><span>${escapeHTML(progress.instruction)}<small>${formatDistance(progress.remaining)} remaining</small></span></div>`,
      );
      while (summary.children.length > 5) summary.lastElementChild.remove();
      refreshIcons(summary);
    }
  });
  window.addEventListener("exerfit:map-type-changed", () =>
    setMapStatus("Map style updated"),
  );
  window.addEventListener("exerfit:navigation-route-updated", (event) => {
    currentRoute = event.detail;
    if (
      !document.getElementById("route-summary").hidden &&
      currentRoute.destination
    )
      displayRouteSummary(currentRoute, currentRoute.destination);
  });
}

refreshIcons();
