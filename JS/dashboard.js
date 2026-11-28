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
  clearDestination,
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
  setActiveNavigationRoute,
} from "./navigation.js";
import { mountActivityPanel, startLiveTracking, getTracker } from "./activity.js";
import { mountSavedRoutesPanel } from "./saved-routes.js";
import { mountWorkoutPanel } from "./workout-planner.js";
import { mountHistoryPanel } from "./activity-history.js";
import {
  setWeatherPosition,
  fetchWeatherForMap,
  mountWeatherSettings,
} from "./weather.js";
import {
  profileStatisticsMarkup,
  refreshDashboardStats,
} from "./statistics.js";
import {
  showToast,
  openModal,
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
  bindTravelModeSelection();
  bindMapDestinationPicker();
  bindMapOverlayHideControls();
  bindFindAnotherRoute();
  bindWeatherMapMode();
  bindMapSettings();
  bindRouteActions();
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
  document
    .getElementById("zoom-in")
    ?.addEventListener("click", () => getMap()?.zoomIn());
  document
    .getElementById("zoom-out")
    ?.addEventListener("click", () => getMap()?.zoomOut());
  document.getElementById("locate-me")?.addEventListener("click", locateUser);
  document
    .getElementById("header-weather")
    ?.addEventListener("click", () => openPanel("settings"));
}
function isLocationContextSecure() {
  const hostname = window.location.hostname;
  const localHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
  return Boolean(window.isSecureContext || localHost);
}
function locateUser() {
  if (!isLocationContextSecure()) {
    showToast(
      "Live location requires HTTPS on phones and tablets. Open ExerFit through a secure HTTPS address, then allow location access.",
      "warning",
      7000,
    );
    setMapStatus("Secure connection needed for GPS");
    return;
  }
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
  if (!isLocationContextSecure()) {
    return Promise.reject(
      new Error(
        "Live GPS requires a secure HTTPS connection on mobile devices. Open ExerFit over HTTPS and allow location access.",
      ),
    );
  }
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
  const searchInput = document.getElementById("location-query");
  if (!form || !resultsContainer || !searchInput) return;

  if (window.matchMedia("(max-width: 430px)").matches)
    searchInput.placeholder = "Search places";

  // Suggestions are built locally from recent searches and saved routes.
  // Do not send autocomplete requests to the public Nominatim service.
  let availablePlaces = [];
  let searchRequestId = 0;

  const setSuggestionsOpen = (open) => {
    resultsContainer.classList.toggle("is-hidden", !open);
    searchInput.setAttribute("aria-expanded", String(open));
  };

  const addPlace = (place, label, idPrefix, list) => {
    if (
      !place ||
      !Number.isFinite(Number(place.lat)) ||
      !Number.isFinite(Number(place.lon))
    )
      return;
    const name = String(place.name || place.label || "Saved destination");
    const address = String(place.address || "Previously selected destination");
    const query = String(searchInput.value || "")
      .trim()
      .toLowerCase();
    if (query && !`${name} ${address}`.toLowerCase().includes(query)) return;
    const key = `${Number(place.lat).toFixed(5)},${Number(place.lon).toFixed(5)}`;
    if (list.some((item) => item.key === key)) return;
    list.push({
      key,
      id: `${idPrefix}-${list.length + 1}`,
      name,
      address,
      lat: Number(place.lat),
      lon: Number(place.lon),
      category: place.category || "saved",
      sourceLabel: label,
    });
  };

  const renderPlaceGroup = (title, places) => {
    if (!places.length) return "";
    const buttons = places
      .map((place) => {
        availablePlaces.push(place);
        return `<button class="search-result" type="button" role="option" data-place-id="${escapeHTML(place.id)}"><i data-lucide="map-pin"></i><span><strong>${escapeHTML(place.name)}</strong><small>${escapeHTML(place.sourceLabel)} · ${escapeHTML(place.address)}</small></span></button>`;
      })
      .join("");
    return `<div class="search-suggestions-heading">${escapeHTML(title)}</div>${buttons}`;
  };

  const renderLocalSuggestions = () => {
    const query = searchInput.value.trim();
    const data = getUserData();
    const recent = Array.isArray(data.preferences?.recentDestinationSearches)
      ? data.preferences.recentDestinationSearches
      : [];
    const savedRoutes = Array.isArray(data.routes) ? data.routes : [];
    const recentPlaces = [];
    const savedPlaces = [];

    recent
      .slice(0, 6)
      .forEach((place) =>
        addPlace(place, "Recent search", "recent", recentPlaces),
      );
    savedRoutes
      .slice()
      .reverse()
      .forEach((route) =>
        addPlace(route.destination, "Saved route", "saved", savedPlaces),
      );

    availablePlaces = [];
    let markup = renderPlaceGroup("RECENT SEARCHES", recentPlaces.slice(0, 4));
    markup += renderPlaceGroup("SAVED DESTINATIONS", savedPlaces.slice(0, 4));

    if (query.length >= 3) {
      markup += `<button class="search-result search-query-suggestion" type="button" data-search-query><i data-lucide="search"></i><span><strong>Search for “${escapeHTML(query)}”</strong><small>Look up this place on the map</small></span></button>`;
    } else if (!markup) {
      markup = `<div class="search-empty">Type at least 3 characters to search, or use a recent or saved destination.</div>`;
    }

    resultsContainer.innerHTML = markup;
    refreshIcons(resultsContainer);
    setSuggestionsOpen(true);
  };

  const performMapSearch = async () => {
    const query = searchInput.value.trim();
    if (query.length < 3) {
      showToast("Type at least 3 characters to search.", "warning");
      return;
    }

    const requestId = ++searchRequestId;
    setSuggestionsOpen(true);
    resultsContainer.innerHTML =
      '<div class="search-empty">Searching OpenStreetMap…</div>';
    setMapStatus("Searching places…");

    try {
      const results = await searchLocations(query);
      if (requestId !== searchRequestId) return;
      if (!results.length) {
        resultsContainer.innerHTML =
          '<div class="search-empty">No matching places were found. Try a nearby landmark or a more specific name.</div>';
        setMapStatus("No search results");
        return;
      }

      availablePlaces = results;
      resultsContainer.innerHTML =
        '<div class="search-suggestions-heading">MAP SEARCH RESULTS</div>' +
        results
          .map(
            (result) =>
              `<button class="search-result" type="button" role="option" data-place-id="${escapeHTML(result.id)}"><i data-lucide="map-pin"></i><span><strong>${escapeHTML(result.name)}</strong><small>${escapeHTML(result.address)}</small></span></button>`,
          )
          .join("");
      refreshIcons(resultsContainer);
      setMapStatus(
        `${results.length} place${results.length === 1 ? "" : "s"} found`,
      );
    } catch (error) {
      if (requestId !== searchRequestId) return;
      resultsContainer.innerHTML = `<div class="search-empty">${escapeHTML(error.message)}</div>`;
      setMapStatus("Search unavailable");
      showToast(error.message, "error", 5000);
    }
  };

  searchInput.addEventListener("focus", renderLocalSuggestions);
  searchInput.addEventListener("input", () => {
    // Invalidate an older submitted search so it cannot replace newer suggestions.
    searchRequestId += 1;
    renderLocalSuggestions();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await performMapSearch();
  });

  resultsContainer.addEventListener("click", async (event) => {
    const placeButton = event.target.closest("[data-place-id]");
    if (placeButton) {
      const place = availablePlaces.find(
        (item) => String(item.id) === placeButton.dataset.placeId,
      );
      if (place) await selectDestination(place, resultsContainer);
      return;
    }
    if (event.target.closest("[data-search-query]")) await performMapSearch();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setSuggestionsOpen(false);
    if (event.key === "ArrowDown") {
      const firstResult = resultsContainer.querySelector(".search-result");
      if (firstResult && !resultsContainer.classList.contains("is-hidden")) {
        event.preventDefault();
        firstResult.focus();
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".header-search-wrap")) setSuggestionsOpen(false);
  });
}

function rememberDestinationSearch(place) {
  if (
    !place ||
    !Number.isFinite(Number(place.lat)) ||
    !Number.isFinite(Number(place.lon))
  )
    return;
  const data = getUserData();
  data.preferences ||= {};
  const previous = Array.isArray(data.preferences.recentDestinationSearches)
    ? data.preferences.recentDestinationSearches
    : [];
  const key = `${Number(place.lat).toFixed(5)},${Number(place.lon).toFixed(5)}`;
  data.preferences.recentDestinationSearches = [
    {
      name: String(place.name || "Saved destination"),
      address: String(place.address || "Previously selected destination"),
      lat: Number(place.lat),
      lon: Number(place.lon),
      category: String(place.category || "place"),
    },
    ...previous.filter((item) => {
      if (
        !item ||
        !Number.isFinite(Number(item.lat)) ||
        !Number.isFinite(Number(item.lon))
      )
        return false;
      return (
        `${Number(item.lat).toFixed(5)},${Number(item.lon).toFixed(5)}` !== key
      );
    }),
  ].slice(0, 6);
  saveUserData(data);
}

async function selectDestination(place, resultsContainer) {
  selectedDestination = place;
  rememberDestinationSearch(place);
  resultsContainer?.classList.add("is-hidden");
  document
    .getElementById("location-query")
    ?.setAttribute("aria-expanded", "false");
  showDestination(place.lat, place.lon, place.name);
  centerOn(place.lat, place.lon, 14);
  await recalculateSelectedRoute();
}

// Rebuilds the route from the latest GPS position using the currently selected travel mode.
async function recalculateSelectedRoute() {
  if (!selectedDestination) {
    showToast("Choose a destination before refreshing the route.", "warning");
    return null;
  }

  const refreshButton = document.getElementById("refresh-destination-route");
  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.setAttribute("aria-busy", "true");
    refreshButton.classList.add("is-loading");
  }
  setMapStatus("Calculating route…");

  try {
    const start = await getCurrentPosition();
    const mode = document.getElementById("travel-mode")?.value || "walking";
    const route = await getRoute(start, selectedDestination, mode);
    currentRoute = {
      ...route,
      name: `${start.name} to ${selectedDestination.name || "Destination"}`,
    };

    // If navigation is already active, replace its guidance route without starting activity recording.
    const navigationSwitched = setActiveNavigationRoute(currentRoute);
    const routeLine = navigationSwitched
      ? true
      : drawPlannedRoute(currentRoute.geometrySegments || currentRoute.coordinates);
    if (!routeLine)
      throw new Error(
        "The route was calculated, but the map could not draw its route line. Please refresh the map and try again.",
      );
    displayRouteSummary(currentRoute, selectedDestination);

    // Weather is tied to the selected destination and is refreshed after a new route profile is calculated.
    fetchWeatherForMap(
      selectedDestination.lat,
      selectedDestination.lon,
      "Route destination weather",
    ).catch((error) => showToast(error.message, "warning", 3500));

    setMapStatus("Route ready");
    return currentRoute;
  } catch (error) {
    setMapStatus("Route unavailable");
    showToast(error.message, "error", 5500);
    return null;
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.removeAttribute("aria-busy");
      refreshButton.classList.remove("is-loading");
    }
  }
}

// Keep the mode buttons, compact current-mode icon, and hidden routing value in sync.
function bindTravelModeSelection() {
  const valueInput = document.getElementById("travel-mode");
  const options = [...document.querySelectorAll("[data-travel-mode]")];
  const panel = document.getElementById("travel-mode-panel");
  const toggle = document.getElementById("travel-mode-toggle");
  const currentIcon = document.getElementById("travel-mode-current-icon");
  const currentLabel = document.getElementById("travel-mode-current-label");
  if (!valueInput || !options.length) return;

  const modeIcons = {
    walking: "footprints",
    cycling: "bike",
    driving: "car-front",
  };
  const updateCompactMode = (mode, label) => {
    if (currentIcon) {
      currentIcon.innerHTML = `<i data-lucide="${modeIcons[mode] || "route"}"></i>`;
      refreshIcons(currentIcon);
    }
    if (currentLabel) currentLabel.textContent = `${label} selected`;
  };

  options.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.travelMode;
      valueInput.value = mode;
      options.forEach((option) => {
        const selected = option === button;
        option.classList.toggle("is-active", selected);
        option.setAttribute("aria-checked", String(selected));
      });
      const modeLabel =
        button.querySelector("span")?.textContent || "Travel mode";
      updateCompactMode(mode, modeLabel);
      const routeNote = document.getElementById("route-mode-prompt");
      if (routeNote)
        routeNote.textContent = `Mode changed to ${modeLabel}. Refresh the route to update distance, time, and directions.`;
      showToast(
        `${modeLabel} selected. Press Refresh route on the destination card to recalculate.`,
        "info",
        2600,
      );
    });
  });

  toggle?.addEventListener("click", () => {
    const collapsed = panel?.classList.toggle("is-collapsed") || false;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute(
      "aria-label",
      collapsed ? "Show travel mode options" : "Hide travel mode options",
    );
    toggle.title = collapsed
      ? "Show travel mode options"
      : "Hide travel mode options";
    toggle.innerHTML = `<i data-lucide="${collapsed ? "chevron-down" : "chevron-up"}"></i>`;
    refreshIcons(toggle);
  });
}

function bindMapOverlayHideControls() {
  const routeCard = document.getElementById("route-summary");
  const restoreRoute = document.getElementById("restore-route-summary");
  const weatherCard = document.getElementById("map-weather-card");
  const restoreWeather = document.getElementById("restore-weather-card");
  const statsCard = document.getElementById("dashboard-overview-card");
  const restoreStats = document.getElementById("restore-dashboard-stats");

  document
    .getElementById("hide-route-summary")
    ?.addEventListener("click", () => {
      if (routeCard) routeCard.hidden = true;
      restoreRoute?.classList.remove("is-hidden");
    });
  restoreRoute?.addEventListener("click", () => {
    if (routeCard) routeCard.hidden = false;
    restoreRoute.classList.add("is-hidden");
    window.setTimeout(() => getMap()?.invalidateSize(), 80);
  });

  document
    .getElementById("hide-weather-card")
    ?.addEventListener("click", () => {
      if (weatherCard) {
        weatherCard.dataset.userHidden = "true";
        weatherCard.classList.add("is-hidden");
      }
      restoreWeather?.classList.remove("is-hidden");
    });
  restoreWeather?.addEventListener("click", () => {
    if (weatherCard) {
      delete weatherCard.dataset.userHidden;
      weatherCard.classList.remove("is-hidden");
    }
    restoreWeather.classList.add("is-hidden");
  });

  document
    .getElementById("hide-dashboard-stats")
    ?.addEventListener("click", () => {
      statsCard?.classList.add("is-hidden");
      restoreStats?.classList.remove("is-hidden");
    });
  restoreStats?.addEventListener("click", () => {
    statsCard?.classList.remove("is-hidden");
    restoreStats.classList.add("is-hidden");
  });
}

function bindMapDestinationPicker() {
  const button = document.getElementById("set-destination-map");
  const map = getMap();
  if (!button || !map) return;

  let pickingDestination = false;

  const setPickingState = (enabled) => {
    pickingDestination = enabled;
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    map.getContainer().classList.toggle("is-picking-destination", enabled);
    map.getContainer().style.cursor = enabled ? "crosshair" : "";
    setMapStatus(
      enabled ? "Click the map to set your destination" : "Map ready",
    );
  };

  button.addEventListener("click", () => {
    setPickingState(!pickingDestination);
    if (pickingDestination)
      showToast("Click anywhere on the map to set your destination.", "info");
  });

  map.on("click", async (event) => {
    if (!pickingDestination) return;

    setPickingState(false);
    const place = {
      id: `map-${Date.now()}`,
      name: "Map destination",
      address: `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`,
      lat: event.latlng.lat,
      lon: event.latlng.lng,
    };

    selectedDestination = place;
    showDestination(place.lat, place.lon, place.name);
    setMapStatus("Calculating route…");

    const route = await recalculateSelectedRoute();
    if (route)
      showToast(
        "GPS route is ready. Press Navigate when you are ready.",
        "success",
      );
  });
}

function displayRouteSummary(route, place) {
  const card = document.getElementById("route-summary");
  if (!card) return;
  card.hidden = false;
  document.getElementById("restore-route-summary")?.classList.add("is-hidden");
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
  const alternateButton = document.getElementById("find-another-route");
  const alternatives =
    route.routeOptions?.length > 1 || (route.alternatives || []).length > 0;
  if (alternateButton) alternateButton.disabled = !alternatives;
  const modePrompt = document.getElementById("route-mode-prompt");
  if (modePrompt)
    modePrompt.textContent = "Route calculated for the selected travel mode.";
  const optionNote = document.getElementById("route-option-note");
  if (optionNote) {
    const total = route.routeOptions?.length || 1;
    const index = (route.routeOptionIndex || 0) + 1;
    optionNote.textContent =
      total > 1
        ? `Route ${index} of ${total} · ${index === 1 ? "Fastest estimated route" : "Alternative route"}`
        : "Fastest available route for this travel mode";
  }
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
      const activeTracker = getTracker();
      const useActivityGPS = Boolean(
        activeTracker?.isRecording && !activeTracker?.isPaused,
      );
      if (startNavigation(currentRoute, { externalGPS: useActivityGPS }))
        openPanel("activity");
    });
  document
    .getElementById("start-live-tracking")
    ?.addEventListener("click", () => {
      // Mount Activity first so the recorder status/metrics update immediately.
      openPanel("activity");
      startLiveTracking();
    });
  document
    .getElementById("refresh-destination-route")
    ?.addEventListener("click", recalculateSelectedRoute);
  document
    .getElementById("refresh-route-weather")
    ?.addEventListener("click", async () => {
      if (!selectedDestination) return;
      const button = document.getElementById("refresh-route-weather");
      button.disabled = true;
      try {
        await fetchWeatherForMap(
          selectedDestination.lat,
          selectedDestination.lon,
          "Route destination weather",
        );
      } catch (error) {
        showToast(error.message, "warning", 3500);
      } finally {
        button.disabled = false;
      }
    });
  document.getElementById("clear-route")?.addEventListener("click", () => {
    // Clear only route guidance. The independent red dashed live GPS track
    // must remain visible if the user clears a route while tracking.
    clearNavigation();
    clearDestination();
    currentRoute = null;
    selectedDestination = null;
    document.getElementById("route-summary").hidden = true;
    document
      .getElementById("restore-route-summary")
      ?.classList.add("is-hidden");
    setMapStatus("Map ready");
  });
}

function bindFindAnotherRoute() {
  document
    .getElementById("find-another-route")
    ?.addEventListener("click", () => {
      if (!currentRoute) return;
      const options = currentRoute.routeOptions?.length
        ? currentRoute.routeOptions
        : [currentRoute, ...(currentRoute.alternatives || [])];
      if (options.length < 2) {
        showToast(
          "The routing service did not return another route for this journey.",
          "info",
        );
        return;
      }
      const currentIndex = Number.isInteger(currentRoute.routeOptionIndex)
        ? currentRoute.routeOptionIndex
        : Math.max(0, options.indexOf(currentRoute));
      const nextIndex = (currentIndex + 1) % options.length;
      currentRoute = {
        ...options[nextIndex],
        name: currentRoute.name,
        routeOptions: options,
        routeOptionIndex: nextIndex,
        alternatives: options.filter((_, index) => index !== nextIndex),
      };
      const navigationSwitched = setActiveNavigationRoute(currentRoute);
      const routeLine = navigationSwitched
        ? true
        : drawPlannedRoute(currentRoute.geometrySegments || currentRoute.coordinates);
      if (!routeLine) {
        showToast(
          "This alternative route could not be drawn on the map. Try another route.",
          "error",
        );
        return;
      }
      displayRouteSummary(
        currentRoute,
        selectedDestination || { name: "Destination" },
      );
      setMapStatus("Alternative route ready");
      showToast(
        `Route ${nextIndex + 1} of ${options.length} selected · ${Math.round(currentRoute.durationSeconds / 60)} min estimated.`,
        "success",
      );
    });
}

function bindWeatherMapMode() {
  const button = document.getElementById("weather-map-mode");
  const map = getMap();
  if (!button || !map) return;
  let active = false;
  button.addEventListener("click", () => {
    active = !active;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    map.getContainer().classList.toggle("is-weather-picking", active);
    map.getContainer().style.cursor = active ? "crosshair" : "";
    setMapStatus(active ? "Click the map to view weather" : "Map ready");
    if (active)
      showToast("Click anywhere on the map to see the weather there.", "info");
  });
  map.on("click", async (event) => {
    if (!active) return;
    setMapStatus("Loading weather…");
    try {
      await fetchWeatherForMap(
        event.latlng.lat,
        event.latlng.lng,
        "Map location",
      );
      setMapStatus("Weather loaded");
    } catch (error) {
      showToast(error.message, "warning", 5000);
      setMapStatus("Weather unavailable");
    }
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
