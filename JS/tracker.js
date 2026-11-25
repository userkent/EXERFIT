/*
- PURPOSE:
- Leaflet map interaction, location search, weather panels, OSRM route planning,
- route-weather estimates, and outdoor/indoor activity sessions.
 */
(function () {
  "use strict";

  // Setup & Exercise Lists: sets up default map coordinates (Manila), workout types per category, and calorie-burn rates (MET values)
  const EF = window.ExerFit;
  const $ = (selector) => document.querySelector(selector);
  const CONFIG = window.ExerFitConfig || {};
  const byId = (id) => document.getElementById(id);
  const bindIfPresent = (selector, eventName, handler) => {
    const element = $(selector);
    if (element) element.addEventListener(eventName, handler);
    return element;
  };
  const firstPresent = (...ids) => ids.map(byId).find(Boolean) || null;
  const DEFAULT_CENTER = CONFIG.defaultMapCenter || [14.5995, 120.9842];
  const ACTIVITY_OPTIONS = {
    outdoor: ["Running", "Cycling", "Walking", "Hiking"],
    indoor: ["Treadmill", "Stationary Bike", "Rowing Machine", "Jump Rope", "Elliptical"],
    bodyweight: ["Push-ups", "Pull-ups", "Squats", "Planks", "Burpees"],
    gym: ["Bench Press", "Deadlift", "Barbell Squat", "Dumbbell Curl", "Lat Pulldown"],
    mind: ["Yoga", "Meditation", "Stretching", "Pilates", "Breathwork"],
  };
  const MET_VALUES = {
    Running: 7, Cycling: 6.5, Walking: 3.5, Hiking: 5.5,
    Treadmill: 4.5, "Stationary Bike": 5, "Rowing Machine": 6, "Jump Rope": 8, Elliptical: 5,
    "Push-ups": 4, "Pull-ups": 4, Squats: 4, Planks: 3, Burpees: 7,
    "Bench Press": 4, Deadlift: 5, "Barbell Squat": 5, "Dumbbell Curl": 3.5, "Lat Pulldown": 4,
    Yoga: 2.5, Meditation: 1.3, Stretching: 2, Pilates: 3, Breathwork: 1.5,
  };

  // App State Memory: keeps track of map pins, drawn routes, weather data, and your active workout timer
  let map = null;
  let startMarker = null;
  let endMarker = null;
  let currentMarker = null;
  let routeLayer = null;
  let routeWeatherLayer = null;
  let sessionTrailLayer = null;
  let streetTiles = null;
  let satelliteTiles = null;
  let satelliteLabels = null;
  let activeMapStyle = "street";
  let startPoint = null;
  let endPoint = null;
  let startLabel = "";
  let endLabel = "";
  let startPointManual = false;
  let selectedLocation = null;
  let selectedLabel = "";
  let weatherBundle = null;
  let weatherChart = null;
  let routes = [];
  let chosenRouteIndex = 0;
  let routeWeatherData = [];
  let routeMode = "foot";
  let routeDepartureHours = 0;
  let trackerCategory = "outdoor";
  let areaLookupQueue = Promise.resolve();
  let lastAreaLookupAt = 0;
  let areaLookupToken = 0;
  const areaNameCache = new Map();
  const session = {
    active: false,
    paused: false,
    elapsed: 0,
    distance: 0,
    points: [],
    lastPoint: null,
    timer: null,
    watchId: null,
    simulation: true,
    lastGeoUpdate: 0,
    setLogs: [], totalReps: 0, restRemaining: 0, restElapsed: 0,
    holdElapsed: 0, totalVolumeKg: 0, simulationPath: [], simulationCumulative: [], simulationProgressMeters: 0,
  };

  // Unit & Coordinate Helpers: converts kilometers to miles if preferred and checks that GPS coordinates are valid numbers
  function getData() {
    return EF.Store.getData();
  }
  function getDistanceUnit() {
    return getData().settings.distanceUnit || "km";
  }
  function displayDistance(km) {
    return getDistanceUnit() === "mi"
      ? `${(km * 0.621371).toFixed(2)} mi`
      : `${km.toFixed(2)} km`;
  }
  function coordsValid(point) {
    return (
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(Number(point[0])) &&
      Number.isFinite(Number(point[1]))
    );
  }

  // ==========================================
  // MAP INITIALIZATION
  // ==========================================
  // Interactive Map Setup: loads the OpenStreetMap background and lets you click anywhere to pick Start and Destination pins
  function setMapAreaName(name) {
    const label = byId("map-area-name");
    if (label && name) label.textContent = name;
    areaLookupToken += 1;
  }

  function areaNameFromAddress(address, fallback = "Selected map area") {
    if (!address) return fallback;
    const locality =
      address.neighbourhood ||
      address.suburb ||
      address.quarter ||
      address.village ||
      address.town ||
      address.city ||
      address.municipality ||
      address.county ||
      address.state_district ||
      address.state ||
      address.province ||
      "";
    const region = address.state_district || address.state || address.province || "";
    const country = address.country || "";
    const parts = [locality, region, country].filter(
      (part, index, all) => part && all.indexOf(part) === index,
    );
    return parts.length ? parts.join(", ") : fallback;
  }

  async function reverseGeocodeArea(point) {
    const cacheKey = `${Number(point[0]).toFixed(3)},${Number(point[1]).toFixed(3)}`;
    if (areaNameCache.has(cacheKey)) return areaNameCache.get(cacheKey);

    const request = async () => {
      // Nominatim's public service asks clients to keep requests to about one per second.
      const waitMs = Math.max(0, 1100 - (Date.now() - lastAreaLookupAt));
      if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      lastAreaLookupAt = Date.now();

      const base = (CONFIG.geocodingUrl || "https://nominatim.openstreetmap.org/search")
        .replace(/\/search\/?$/, "");
      const endpoint = `${base}/reverse?format=jsonv2&lat=${encodeURIComponent(point[0])}&lon=${encodeURIComponent(point[1])}&zoom=14&addressdetails=1`;
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Area lookup is unavailable.");
      const result = await response.json();
      const name = areaNameFromAddress(result.address, result.display_name || "Selected map area");
      areaNameCache.set(cacheKey, name);
      return name;
    };

    const next = areaLookupQueue.then(request, request);
    areaLookupQueue = next.catch(() => undefined);
    return next;
  }

  async function updateMapAreaName(point, fallback = "Selected map area") {
    const token = ++areaLookupToken;
    const label = byId("map-area-name");
    if (label) label.textContent = fallback;
    try {
      const name = await reverseGeocodeArea(point);
      if (token === areaLookupToken && label) label.textContent = name;
    } catch (error) {
      // The map tiles still show OSM place labels when reverse geocoding is unavailable.
      if (token === areaLookupToken && label) label.textContent = fallback;
    }
  }

  function setMapStyle(style) {
    if (!map || !streetTiles || !satelliteTiles) return;
    const useSatellite = style === "satellite";
    activeMapStyle = useSatellite ? "satellite" : "street";
    if (useSatellite) {
      if (map.hasLayer(streetTiles)) map.removeLayer(streetTiles);
      satelliteTiles.addTo(map);
      satelliteLabels.addTo(map);
    } else {
      if (map.hasLayer(satelliteTiles)) map.removeLayer(satelliteTiles);
      if (map.hasLayer(satelliteLabels)) map.removeLayer(satelliteLabels);
      streetTiles.addTo(map);
    }
    document.querySelectorAll("[data-map-style]").forEach((button) => {
      const active = button.dataset.mapStyle === activeMapStyle;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const status = byId("map-connection-status");
    if (status) status.textContent = useSatellite ? "Satellite imagery · Area labels on" : "OpenStreetMap street view · Area names on";
    window.setTimeout(() => map && map.invalidateSize(), 80);
  }

  function initMap() {
    const host = $("#tracker-map");
    if (!host) return;
    if (!window.L) {
      host.innerHTML =
        '<div class="empty-state map-load-message"><strong>Leaflet could not load</strong><p>Check your internet connection or CDN access, then refresh this page. The map needs Leaflet and OpenStreetMap tile access.</p></div>';
      const status = byId("map-connection-status");
      if (status) status.textContent = "Leaflet unavailable";
      return;
    }

    try {
      map = L.map(host, { zoomControl: true, preferCanvas: true, scrollWheelZoom: true }).setView(
        DEFAULT_CENTER,
        CONFIG.defaultMapZoom || 12,
      );
      const status = byId("map-connection-status");
      streetTiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        minZoom: 2,
        maxZoom: 19,
        updateWhenIdle: true,
        keepBuffer: 3,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      });
      // Esri World Imagery supplies satellite photography; the reference overlay keeps area/place labels visible.
      satelliteTiles = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        minZoom: 1,
        maxZoom: 19,
        attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Sources: Esri, Maxar, Earthstar Geographics',
      });
      satelliteLabels = L.layerGroup([
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
        minZoom: 1,
        maxZoom: 19,
        pane: "overlayPane",
        opacity: 0.95,
        attribution: 'Place labels &copy; Esri',
        }),
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", { minZoom: 1, maxZoom: 19, opacity: 0.95, attribution: 'Road labels &copy; Esri' })
      ]);
      streetTiles.addTo(map);
      let tileLoaded = false;
      streetTiles.on("tileload", () => {
        tileLoaded = true;
        if (status && activeMapStyle === "street") status.textContent = "Street map loaded · Area names visible";
      });
      streetTiles.on("tileerror", () => {
        if (!tileLoaded && status) status.textContent = "Map tiles unavailable · Check internet access";
      });
      [satelliteTiles, satelliteLabels].forEach((layer) => layer.on("tileerror", () => {
        if (status) status.textContent = "Some map imagery could not load · Check your connection";
      }));
      document.querySelectorAll("[data-map-style]").forEach((button) => {
        button.addEventListener("click", () => setMapStyle(button.dataset.mapStyle));
      });
      L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
      routeLayer = L.layerGroup().addTo(map);
      routeWeatherLayer = L.layerGroup().addTo(map);
      sessionTrailLayer = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        const point = [event.latlng.lat, event.latlng.lng];
        if (trackerCategory === "outdoor") {
          if (!startPoint) setStart(point, "Map selection");
          else setEnd(point, "Map selection");
          showMapPopup(point, "Selected map point");
        }
        selectWeatherLocation(point, "Selected map point");
        updateMapAreaName(point, `${point[0].toFixed(4)}, ${point[1].toFixed(4)}`);
      });
      updateMapAreaName(DEFAULT_CENTER, "Loading nearby area name…");
      window.setTimeout(() => map && map.invalidateSize(), 250);
      window.addEventListener("resize", () => map && map.invalidateSize());
      window.setTimeout(() => {
        if (!tileLoaded && status && status.textContent.includes("Loading"))
          status.textContent = "Still loading map tiles…";
      }, 7000);
    } catch (error) {
      console.error("ExerFit map initialization failed:", error);
      host.innerHTML =
        '<div class="empty-state map-load-message"><strong>Map could not be initialized</strong><p>Refresh the page. If the problem continues, check the browser console for a Leaflet error.</p></div>';
      const status = byId("map-connection-status");
      if (status) status.textContent = "Map initialization failed";
    }
  }

  // Start & Destination Map Pins: draws colored circles on the map and updates the coordinates shown in the Route Planner card
  function pointMarker(point, color, title) {
    if (!map) return null;
    return L.circleMarker(point, {
      radius: 9,
      color: "#fff",
      weight: 3,
      fillColor: color,
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(title, { direction: "top", offset: [0, -8] });
  }
  function updatePointMarkers() {
    if (!map) return;
    if (startMarker) map.removeLayer(startMarker);
    if (endMarker) map.removeLayer(endMarker);
    if (startPoint) startMarker = pointMarker(startPoint, "#16a34a", "Start");
    if (endPoint) endMarker = pointMarker(endPoint, "#0f172a", "Destination");
    $("#route-point-labels").innerHTML =
      `<div class="route-point">Start point <small>${startPoint ? `${startLabel || "Selected"} · ${startPoint[0].toFixed(5)}, ${startPoint[1].toFixed(5)}` : "Choose on the map or use My Location"}</small></div><div class="route-point">Destination <small>${endPoint ? `${endLabel || "Selected"} · ${endPoint[0].toFixed(5)}, ${endPoint[1].toFixed(5)}` : "Choose another point on the map"}</small></div>`;
  }
  function setStart(point, label = "Selected point", manual = true) {
    startPoint = point;
    startLabel = label;
    startPointManual = Boolean(manual);
    updatePointMarkers();
  }
  function setEnd(point, label = "Selected point") {
    endPoint = point;
    endLabel = label;
    updatePointMarkers();
  }

  // Map Click Pop-Up Bubble: opens a small menu on the map with buttons to set Start, Destination, Route, or Weather
  function showMapPopup(point, label) {
    if (!map) return;
    const popup = L.popup({ closeButton: true })
      .setLatLng(point)
      .setContent(
        `<div style="min-width:170px"><strong>${EF.Store.escapeHTML(label)}</strong><p style="font-size:11px;margin:3px 0 9px">${point[0].toFixed(5)}, ${point[1].toFixed(5)}</p><div style="display:flex;gap:5px;flex-wrap:wrap"><button class="btn small-btn" data-map-action="start" type="button">Set as start</button><button class="btn secondary small-btn" data-map-action="end" type="button">Set destination</button></div><button class="text-button" style="margin-top:6px" data-map-action="route" type="button">Get route here</button><button class="text-button" style="margin-top:2px" data-map-action="weather" type="button">Weather here</button></div>`,
      );
    map.once("popupopen", (event) => {
      event.popup
        .getElement()
        ?.querySelectorAll("[data-map-action]")
        .forEach((button) =>
          button.addEventListener("click", () => {
            const action = button.dataset.mapAction;
            if (action === "start") setStart(point, label, true);
            if (action === "end") setEnd(point, label);
            if (action === "weather") selectWeatherLocation(point, label);
            if (action === "route") {
              setEnd(point, label);
              selectWeatherLocation(point, label);
            }
            map.closePopup();
            if (action === "route") getRoute();
          }),
        );
    });
    popup.openOn(map);
  }

  async function setManualRoutePoint(kind) {
    const input = byId(kind === "start" ? "manual-start-location" : "manual-destination-location");
    const query = input?.value.trim();
    if (!query) { EF.ui.toast("Enter a place name first.", "error"); return; }
    const button = byId(kind === "start" ? "set-manual-start" : "set-manual-destination");
    if (button) { button.disabled = true; button.textContent = "Searching…"; }
    try {
      const endpoint = `${CONFIG.geocodingUrl || "https://nominatim.openstreetmap.org/search"}?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Place search is temporarily unavailable.");
      const results = await response.json();
      if (!results.length) throw new Error("Place not found. Try a nearby landmark or street.");
      const place = results[0], point = [Number(place.lat), Number(place.lon)];
      const label = areaNameFromAddress(place.address, place.display_name.split(",").slice(0, 3).join(", "));
      if (kind === "start") setStart(point, label, true); else setEnd(point, label);
      map?.flyTo(point, 16, { duration: 1.1 });
      selectWeatherLocation(point, label);
      updateMapAreaName(point, label);
      EF.ui.toast(`${kind === "start" ? "Start" : "Destination"} set: ${label}`);
    } catch (error) { EF.ui.toast(error.message || "Could not find that place.", "error"); }
    finally { if (button) { button.disabled = false; button.textContent = kind === "start" ? "Set start" : "Set destination"; } }
  }

  // Remember Location & Fetch Weather: saves your chosen spot for the Home dashboard and loads its local weather
  function saveLastLocation(point, label) {
    EF.Store.updateData((data) => {
      data.settings.lastCoords = { lat: point[0], lon: point[1] };
      data.settings.lastLocation = label || "Selected location";
    });
  }
  function selectWeatherLocation(point, label) {
    selectedLocation = point;
    selectedLabel = label || "Selected location";
    saveLastLocation(point, selectedLabel);
    $("#weather-place-title").textContent = selectedLabel;
    loadWeather(point[0], point[1]);
  }

  // ==========================================
  // PLACE SEARCH AND GPS LOCATION
  // ==========================================
  // Place Search Box: looks up any city, park, or landmark name using OpenStreetMap and zooms the map there
  async function searchPlace() {
    const query = $("#place-search").value.trim();
    if (!query) {
      EF.ui.toast("Enter a place name first.", "error");
      return;
    }
    $("#search-place").disabled = true;
    $("#search-place").textContent = "Searching…";
    try {
      const endpoint = `${CONFIG.geocodingUrl || "https://nominatim.openstreetmap.org/search"}?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok)
        throw new Error("Place search is temporarily unavailable.");
      const results = await response.json();
      if (!results.length)
        throw new Error("Place not found. Try a nearby town or landmark.");
      const place = results[0];
      const point = [Number(place.lat), Number(place.lon)];
      const shortName = areaNameFromAddress(
        place.address,
        place.display_name.split(",").slice(0, 3).join(", "),
      );
      setMapAreaName(shortName);
      if (trackerCategory === "outdoor") {
        setEnd(point, shortName);
        showMapPopup(point, shortName);
      }
      selectWeatherLocation(point, shortName);
      map?.flyTo(point, 15, { duration: 1.1 });
    } catch (error) {
      EF.ui.toast(error.message || "Place search failed.", "error");
    } finally {
      $("#search-place").disabled = false;
      $("#search-place").textContent = "Search";
    }
  }

  // "My Location" GPS Button: asks your device for your real-world GPS spot and sets it as the Start point
  function locateUser() {
    if (!navigator.geolocation) {
      EF.ui.toast("This browser does not support location services.", "error");
      return;
    }
    $("#my-location").disabled = true;
    $("#my-location").textContent = "Locating…";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = [position.coords.latitude, position.coords.longitude];
        setStart(point, "My location", false);
        selectWeatherLocation(point, "My location");
        updateMapAreaName(point, "My location");
        map?.flyTo(point, 16, { duration: 1.1 });
        showMapPopup(point, "My location");
        $("#my-location").disabled = false;
        $("#my-location").textContent = "My location";
      },
      (error) => {
        const message =
          error.code === 1
            ? "Location permission was denied. Select a start point on the map instead."
            : error.code === 2
              ? "Your location is unavailable. Try selecting a point on the map."
              : "Location request timed out. Please retry.";
        EF.ui.toast(message, "error");
        $("#my-location").disabled = false;
        $("#my-location").textContent = "My location";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  }

  // ==========================================
  // WEATHER DISPLAY
  // ==========================================
  // Load & Display Current Weather: fetches live conditions and updates the Now card, advice box, and best time to exercise
  async function loadWeather(lat, lon) {
    const nowPanel = $("#weather-now");
    nowPanel.innerHTML = '<div class="skeleton" style="height:145px"></div>';
    const result = await EF.Weather.fetchBundle(lat, lon);
    weatherBundle = result;
    renderWeather(result);
  }
  function weatherMessage(currentError, forecastError) {
    return `<div class="empty-state"><strong>Weather information is limited</strong><p>${EF.Store.escapeHTML(currentError || forecastError || "Weather unavailable.")}</p><a href="settings.html" class="text-button">Open Settings →</a></div>`;
  }
  function renderWeather(result) {
    const current = result.current;
    const forecast = result.forecast;
    const offset = current?.timezone_offset ?? current?.timezone ?? forecast?.city?.timezone ?? 0;
    if (!current) {
      if (byId("map-weather-chip")) byId("map-weather-chip").innerHTML = "<span>Weather</span><strong>Forecast unavailable</strong>";
      $("#weather-now").innerHTML = weatherMessage(
        result.errors?.current,
        result.errors?.forecast,
      );
    } else {
      const condition = current.weather?.[0]?.description || "Conditions";
      const updated = EF.Weather.formatLocal(current.dt, offset);
      const weatherSource = result.source || "Live forecast";
      const rainChance = Math.round(Math.max(0, ...(forecast?.list || []).slice(0, 4).map((slot) => (slot.pop || 0) * 100)));
      if (byId("map-weather-chip")) byId("map-weather-chip").innerHTML = `<span>${EF.Store.escapeHTML(condition)}</span><strong>${Math.round(current.main.temp)}°C · ${rainChance}% rain soon</strong>`;
      $("#weather-now").innerHTML =
        `<div class="weather-now"><div><div class="weather-temp">${Math.round(current.main.temp)}°${getData().settings.temperatureUnit || "C"}</div><strong>${EF.Store.escapeHTML(condition)}</strong><div class="muted small">${EF.Store.escapeHTML(current.name || selectedLabel || "Selected location")}</div></div><div class="pill green">Feels like ${Math.round(current.main.feels_like)}°${getData().settings.temperatureUnit || "C"}</div></div><div class="weather-details"><div class="weather-detail">Humidity<strong>${current.main.humidity}%</strong></div><div class="weather-detail">Wind<strong>${Number(current.wind.speed).toFixed(1)} ${getData().settings.temperatureUnit === "F" ? "mph" : "m/s"}</strong></div><div class="weather-detail">Cloudiness<strong>${current.clouds?.all ?? "—"}%</strong></div><div class="weather-detail">Rain<strong>${current.rain?.["1h"] ?? 0} mm</strong></div><div class="weather-detail">Sunrise<strong>${current.sys?.sunrise ? EF.Weather.formatLocal(current.sys.sunrise, offset) : "—"}</strong></div><div class="weather-detail">Sunset<strong>${current.sys?.sunset ? EF.Weather.formatLocal(current.sys.sunset, offset) : "—"}</strong></div></div><p class="small muted" style="margin:10px 0 0">${weatherSource}</p>`;
    }
    if (!forecast) {
      $("#weather-hourly").innerHTML =
        `<p class="small muted">${EF.Store.escapeHTML(result.errors?.forecast || "Forecast unavailable. Retry.")}</p><button class="btn secondary small-btn" id="forecast-retry" type="button">Retry forecast</button>`;
      $("#forecast-retry")?.addEventListener(
        "click",
        () => selectedLocation && loadWeather(...selectedLocation),
      );
      $("#weather-five-day").innerHTML =
        '<p class="small muted">Five-day forecast unavailable.</p>';
      $("#best-time").textContent =
        "Forecast unavailable. Check your connection and refresh.";
    } else {
      renderHourly(forecast, offset);
      renderFiveDay(forecast, offset);
      const best = EF.Weather.bestActivitySlot(forecast);
      const tempUnit = getData().settings.temperatureUnit || "C";
      $("#best-time").textContent = best
        ? `${EF.Weather.formatLocal(best.dt, offset)} · ${Math.round(best.main.temp)}°${tempUnit} · ${best.weather?.[0]?.description || "Suitable conditions"}`
        : "Conditions are poor for outdoor activity, so try an indoor workout.";
    }
    $("#weather-advice").textContent = current
      ? EF.Weather.adviceForActivity(trackerCategory, current, forecast)
      : result.errors?.current ||
        "Weather advice is unavailable until current conditions load.";
    $("#advice-category").textContent = trackerCategory
      .replace("bodyweight", "Bodyweight")
      .replace("mind", "Mind and body");
    renderWeatherChart(forecast, offset);
  }

  // Hourly Forecast Strip: shows clickable 3-hour weather cards that open a pop-up with full wind/humidity details
  function renderHourly(forecast, offset) {
    const slots = forecast.list?.slice(0, 8) || [];
    const savedNote = weatherBundle?.savedDataForecast
      ? '<p class="small muted">Showing the most recently saved forecast data.</p>'
      : "";
    $("#weather-forecast-strip").innerHTML =
      savedNote +
      slots
        .map(
          (slot, index) =>
            `<button class="forecast-slot" type="button" data-forecast-index="${index}"><span>${EF.Weather.formatLocal(slot.dt, offset)}</span><strong>${Math.round(slot.main.temp)}°${getData().settings.temperatureUnit || "C"}</strong><small>${Math.round((slot.pop || 0) * 100)}% rain</small></button>`,
        )
        .join("");
    $("#weather-forecast-strip")
      .querySelectorAll("[data-forecast-index]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const slot = slots[Number(button.dataset.forecastIndex)];
          const tempUnit = getData().settings.temperatureUnit || "C";
          const windUnit = tempUnit === "F" ? "mph" : "m/s";
          EF.ui.openModal(
            "Forecast details",
            `<div class="weather-temp">${Math.round(slot.main.temp)}°${tempUnit}</div><h3>${EF.Store.escapeHTML(slot.weather?.[0]?.description || "Forecast")}</h3><div class="grid two"><div class="profile-data"><small>Local time</small><strong>${EF.Weather.formatLocal(slot.dt, offset)}</strong></div><div class="profile-data"><small>Rain chance</small><strong>${Math.round((slot.pop || 0) * 100)}%</strong></div><div class="profile-data"><small>Feels like</small><strong>${Math.round(slot.main.feels_like)}°${tempUnit}</strong></div><div class="profile-data"><small>Wind</small><strong>${Number(slot.wind.speed).toFixed(1)} ${windUnit}</strong></div><div class="profile-data"><small>Humidity</small><strong>${slot.main.humidity}%</strong></div><div class="profile-data"><small>Cloudiness</small><strong>${slot.clouds?.all ?? "—"}%</strong></div></div>`,
            '<button class="btn" type="button" data-modal-close>Close</button>',
          );
        }),
      );
  }

  // 5-Day Forecast & Hourly Chart: groups forecast data into daily highs/lows and draws a dual-line temperature/rain graph
  function localDayKey(epoch, offset) {
    const date = EF.Weather.localDate(epoch, offset);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  function renderFiveDay(forecast, offset) {
    const groups = new Map();
    (forecast.list || []).forEach((slot) => {
      const key = localDayKey(slot.dt, offset);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(slot);
    });
    $("#weather-five-day").innerHTML = [...groups.entries()]
      .slice(0, 5)
      .map(([key, slots]) => {
        const temps = slots.map((slot) => slot.main.temp);
        const counts = new Map();
        slots.forEach((slot) => {
          const name = slot.weather?.[0]?.main || "Unknown";
          counts.set(name, (counts.get(name) || 0) + 1);
        });
        const common =
          [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
        const pop = Math.max(...slots.map((slot) => slot.pop || 0));
        const labelDate = EF.Weather.formatLocal(slots[0].dt, offset, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        const tempUnit = getData().settings.temperatureUnit || "C";
        return `<div class="setting-row"><div><strong>${labelDate}</strong><small>${EF.Store.escapeHTML(common)} · ${Math.round(pop * 100)}% max rain chance</small></div><strong>${Math.round(Math.max(...temps))}°${tempUnit} / ${Math.round(Math.min(...temps))}°${tempUnit}</strong></div>`;
      })
      .join("");
  }
  function renderWeatherChart(forecast, offset) {
    if (!window.Chart || !$("#weather-chart") || !forecast?.list?.length)
      return;
    const slots = forecast.list.slice(0, 12);
    if (weatherChart) weatherChart.destroy();
    weatherChart = new Chart($("#weather-chart"), {
      type: "line",
      data: {
        labels: slots.map((slot) => EF.Weather.formatLocal(slot.dt, offset)),
        datasets: [
          {
            label: "Temperature",
            data: slots.map((slot) => slot.main.temp),
            borderColor: "#16a34a",
            backgroundColor: "rgba(22,163,74,.12)",
            fill: true,
            tension: 0.35,
            yAxisID: "y",
          },
          {
            label: "Rain chance",
            data: slots.map((slot) => Math.round((slot.pop || 0) * 100)),
            borderColor: "#60a5fa",
            tension: 0.35,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        animation: EF.Motion.motionAllowed() ? { duration: 550 } : false,
        plugins: { legend: { labels: { boxWidth: 10, usePointStyle: true } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
          y: { position: "left" },
          y1: {
            position: "right",
            min: 0,
            max: 100,
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // Weather Tab Switcher: flips between Now, Hourly, and 5-Day forecast views
  document.querySelectorAll("[data-weather-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      const tab = button.dataset.weatherTab;
      document
        .querySelectorAll("[data-weather-tab]")
        .forEach((item) => item.classList.toggle("active", item === button));
      $("#weather-now").style.display = tab === "now" ? "block" : "none";
      $("#weather-hourly").style.display = tab === "hourly" ? "block" : "none";
      $("#weather-five-day").style.display =
        tab === "five-day" ? "block" : "none";
    }),
  );

  // ==========================================
  // ROUTE PLANNER AND WEATHER ALONG THE ROUTE
  // ==========================================
  // Route Summary & Map Drawing: calculates distance/time, draws the green dashed path on the map, and adds "Start" / "Save" buttons
  function removeRouteLayers() {
    routeLayer?.clearLayers();
    routeWeatherLayer?.clearLayers();
  }
  function routeGeometryToLatLngs(route) {
    return (route.geometry?.coordinates || []).map(([lon, lat]) => [lat, lon]);
  }
  function routeDurationSeconds(route) {
    if (routeMode === "foot" && $("#activity-type").value === "Running") {
      const pace = Number(
        getData().settings.runningPaceSecondsPerKm ||
          CONFIG.defaultRunningPaceSecondsPerKm ||
          420,
      );
      return (route.distance / 1000) * pace;
    }
    return Number(route.duration || 0);
  }
  function renderRouteSummary(route, allRoutes, serviceLabel) {
    const distanceKm = route.distance / 1000;
    const estimatedSeconds = routeDurationSeconds(route);
    const minutes = Math.round(estimatedSeconds / 60);
    const timeLabel =
      minutes >= 60
        ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
        : `${minutes} min`;
    const options =
      allRoutes.length > 1
        ? `<div class="field" style="margin-top:10px"><label for="route-alternative">Alternative route</label><select id="route-alternative">${allRoutes.map((item, index) => `<option value="${index}" ${index === chosenRouteIndex ? "selected" : ""}>Route ${index + 1} · ${(item.distance / 1000).toFixed(2)} km</option>`).join("")}</select></div>`
        : "";
    const estimateNote =
      routeMode === "foot" && $("#activity-type").value === "Running"
        ? "Running time uses your saved pace estimate."
        : "Travel time is supplied by the routing service.";
    $("#route-summary").innerHTML =
      `<div class="grid two"><div class="profile-data"><small>Distance</small><strong>${displayDistance(distanceKm)}</strong></div><div class="profile-data"><small>Est. travel time</small><strong>${timeLabel}</strong></div></div><p class="small muted" style="margin:8px 0">${estimateNote} Route service: ${EF.Store.escapeHTML(serviceLabel || "OSRM-compatible service")}</p><p id="route-live-progress" class="small muted" hidden>Remaining distance: ${displayDistance(distanceKm)}</p>${options}<div class="row wrap" style="margin-top:12px"><button class="btn small-btn" id="start-planned-route" type="button">Start this route</button><button class="btn secondary small-btn" id="save-planned-route" type="button">Save route</button></div>`;
    $("#route-alternative")?.addEventListener("change", (event) => {
      chosenRouteIndex = Number(event.target.value);
      drawRoute(allRoutes[chosenRouteIndex]);
      renderRouteSummary(allRoutes[chosenRouteIndex], allRoutes, serviceLabel);
      loadRouteWeather(allRoutes[chosenRouteIndex]);
    });
    bindIfPresent("#start-planned-route", "click", () => {
      if (trackerCategory !== "outdoor") setCategory("outdoor");
      const simulation = $("#simulation-mode");
      if (simulation) simulation.checked = false;
      const progress = document.getElementById("route-live-progress");
      if (progress) progress.hidden = false;
      startSession();
    });
    bindIfPresent("#save-planned-route", "click", saveCurrentRoute);
  }

  function drawRoute(route) {
    if (!map || !routeLayer) return;
    routeLayer.clearLayers();
    routeWeatherLayer.clearLayers();
    const latlngs = routeGeometryToLatLngs(route);
    if (!latlngs.length) return;
    // Draw a white halo behind the green dashed line so the route stands out on any map
    L.polyline(latlngs, {
      color: "#ffffff",
      weight: 10,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(routeLayer);
    L.polyline(latlngs, {
      color: "#16a34a",
      weight: 5,
      opacity: 0.95,
      lineCap: "round",
      lineJoin: "round",
      dashArray: "10 9",
    }).addTo(routeLayer);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [35, 35], maxZoom: 15 });
    if (startPoint)
      pointMarker(startPoint, "#16a34a", "Start").addTo(routeLayer);
    if (endPoint)
      pointMarker(endPoint, "#111827", "Destination").addTo(routeLayer);
  }

  // "Get Route" Button Handler: fetches turn-by-turn directions from OSRM (or falls back to a straight line if offline)
  async function getRoute() {
    if (!startPoint || !endPoint) {
      EF.ui.toast("Choose a start and destination on the map first.", "error");
      return;
    }
    if (EF.Routing.distanceMeters(startPoint, endPoint) < 10) {
      EF.ui.toast(
        "Choose a destination farther away from the start point.",
        "error",
      );
      return;
    }
    routeMode = $("#travel-mode").value;
    $("#get-route").disabled = true;
    $("#get-route").textContent = "Planning…";
    $("#route-summary").innerHTML =
      '<div class="skeleton" style="height:65px"></div>';
    try {
      const result = await EF.Routing.requestRoute(
        startPoint,
        endPoint,
        routeMode,
      );
      routes = result.routes.slice().sort((a, b) => Number(a.distance || Infinity) - Number(b.distance || Infinity));
      chosenRouteIndex = 0;
      drawRoute(routes[0]);
      renderRouteSummary(routes[0], [routes[0]], result.service);
      const instructions = EF.Routing.routeInstructions(routes[0]).slice(0, 12);
      $("#route-instructions").innerHTML = instructions.length
        ? `<h4 style="margin:4px 0">Turn-by-turn preview</h4>${instructions.map((step, index) => `<div class="route-point"><strong>${index + 1}. ${EF.Store.escapeHTML(step.instruction)}</strong><small>${(step.distance / 1000).toFixed(2)} km ${step.name ? `· ${EF.Store.escapeHTML(step.name)}` : ""}</small></div>`).join("")}`
        : '<p class="small muted">Turn instructions are not available for this route.</p>';
      await loadRouteWeather(routes[0]);
      EF.ui.toast(result.cached ? "Loaded a saved route." : "Route planned.");
    } catch (error) {
      if (error.name === "AbortError") return;
      removeRouteLayers();
      routes = [];
      chosenRouteIndex = 0;
      const straightKm = EF.Routing.distanceMeters(startPoint, endPoint) / 1000;
      $("#route-summary").innerHTML =
        `<div class="empty-state"><strong>Street routing unavailable</strong><p>${EF.Store.escapeHTML(error.message || "The routing service is unavailable right now.")}</p><p>Only a straight-line estimate (${displayDistance(straightKm)}) is available. No fake road route will be drawn. Retry when the routing service is online.</p><button class="btn secondary small-btn" id="retry-route" type="button">Retry route</button></div>`;
      bindIfPresent("#retry-route", "click", getRoute);
      $("#route-instructions").innerHTML = "";
      routeWeatherData = [];
      await loadFallbackWeather(startPoint, endPoint);
    } finally {
      $("#get-route").disabled = false;
      $("#get-route").textContent = "Get route";
    }
  }

  // Weather Along the Route: checks weather forecasts at 6 spots along your path and color-codes the route green, yellow, or red
  function riskFor(slot) {
    if (!slot) return "poor";
    const temp = EF.Weather.temperatureCelsius(slot.main?.temp);
    const rain = (slot.pop || 0) * 100;
    const wind = EF.Weather.windMetersPerSecond(slot.wind?.speed || 0);
    const condition = (slot.weather?.[0]?.main || "").toLowerCase();
    if (
      condition.includes("thunder") ||
      rain > 60 ||
      wind > 12 ||
      temp > 35 ||
      temp < 0
    )
      return "poor";
    if (rain >= 30 || wind >= 8 || wind > 12 || temp < 10 || temp > 32)
      return "caution";
    return "good";
  }
  function closestForecastSlot(forecast, targetEpoch) {
    const list = forecast?.list || [];
    if (!list.length) return null;
    return list.reduce(
      (best, slot) =>
        Math.abs(slot.dt - targetEpoch) < Math.abs(best.dt - targetEpoch)
          ? slot
          : best,
      list[0],
    );
  }

  async function loadRouteWeather(route, departureHours = routeDepartureHours) {
    routeDepartureHours = Number(departureHours) || 0;
    const geometry = route.geometry?.coordinates || [];
    const samples = EF.Routing.sampleGeometry(geometry, 6);
    routeWeatherData = [];
    if (!samples.length) return;
    $("#route-weather").innerHTML =
      '<div class="skeleton" style="height:100px"></div><p class="small muted">Checking forecast along up to six route points…</p>';
    const departure =
      Math.floor(Date.now() / 1000) + routeDepartureHours * 3600;
    for (let index = 0; index < samples.length; index += 2) {
      const batch = samples.slice(index, index + 2);
      const fetched = await Promise.all(
        batch.map(async (sample) => {
          const [lat, lon] = sample.coordinate;
          const response = await EF.Weather.fetchForecast(lat, lon);
          const arrival =
            departure + routeDurationSeconds(route) * (sample.fraction || 0);
          const slot = response.ok
            ? closestForecastSlot(response.data, arrival)
            : null;
          return { sample, response, slot, arrival };
        }),
      );
      routeWeatherData.push(...fetched);
    }
    routeWeatherData.sort(
      (a, b) => a.sample.coordinateIndex - b.sample.coordinateIndex,
    );
    renderRouteWeather(geometry, route);
  }

  // Route Weather Map Overlay & Summary: draws colored checkpoints along the route and shows a "Good to go / Caution / Poor" verdict
  function renderRouteWeather(geometry, route) {
    routeWeatherLayer?.clearLayers();
    const known = routeWeatherData.filter((item) => item.slot);
    if (!known.length) {
      $("#route-weather").innerHTML =
        '<div class="empty-state"><strong>Route weather unavailable</strong>Set an OpenWeather key in Settings to evaluate forecast conditions along the route.</div>';
      return;
    }
    const severityOrder = { good: 0, caution: 1, poor: 2 };
    let worst = "good";
    routeWeatherData.forEach((item) => {
      if (!item.slot) return;
      const risk = riskFor(item.slot);
      if (severityOrder[risk] > severityOrder[worst]) worst = risk;
      const [lat, lon] = item.sample.coordinate;
      const offset = item.response.data.city?.timezone || 0;
      const color =
        risk === "good"
          ? "#16a34a"
          : risk === "caution"
            ? "#d18a22"
            : "#dc4545";
      const tempUnit = getData().settings.temperatureUnit || "C";
      const windUnit = tempUnit === "F" ? "mph" : "m/s";
      L.circleMarker([lat, lon], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>${EF.Weather.formatLocal(item.arrival, offset)} arrival</strong><br>${Math.round(item.slot.main.temp)}°${tempUnit} · ${EF.Store.escapeHTML(item.slot.weather?.[0]?.main || "Weather")}<br>Rain ${Math.round((item.slot.pop || 0) * 100)}% · Wind ${Number(item.slot.wind?.speed || 0).toFixed(1)} ${windUnit}`,
        )
        .addTo(routeWeatherLayer);
    });

    // Color-code each section of the route green, yellow, or red based on its weather risk
    for (let index = 1; index < routeWeatherData.length; index += 1) {
      const a = routeWeatherData[index - 1].sample.coordinateIndex;
      const b = routeWeatherData[index].sample.coordinateIndex;
      const slice = geometry.slice(a, b + 1).map(([lon, lat]) => [lat, lon]);
      const slot = routeWeatherData[index].slot;
      if (slice.length > 1 && slot) {
        const risk = riskFor(slot);
        const color =
          risk === "good"
            ? "#16a34a"
            : risk === "caution"
              ? "#d18a22"
              : "#dc4545";
        L.polyline(slice, {
          color,
          weight: 7,
          opacity: 0.92,
          lineCap: "round",
        }).addTo(routeWeatherLayer);
      }
    }

    const verdict =
      worst === "good"
        ? "Good to go"
        : worst === "caution"
          ? "Bring rain protection or choose a sheltered route"
          : "Consider another time or an indoor workout";
    const routeItems = routeWeatherData
      .map((item, index) => {
        if (!item.slot)
          return `<div class="route-point"><strong>Point ${index + 1}</strong><small>Weather unavailable</small></div>`;
        const offset = item.response.data.city?.timezone || 0;
        const slot = item.slot;
        const risk = riskFor(slot);
        const tempUnit = getData().settings.temperatureUnit || "C";
        const windUnit = tempUnit === "F" ? "mph" : "m/s";
        return `<div class="route-point"><strong>${index + 1}. ${EF.Weather.formatLocal(item.arrival, offset)} · ${Math.round(slot.main.temp)}°${tempUnit}</strong><small>${EF.Store.escapeHTML(slot.weather?.[0]?.description || "Weather")} · Rain ${Math.round((slot.pop || 0) * 100)}% · Wind ${Number(slot.wind?.speed || 0).toFixed(1)} ${windUnit} · ${risk.toUpperCase()}</small></div>`;
      })
      .join("");

    // Departure Time Selector: lets you test leaving now, in +3 hours, or +6 hours to see if the weather improves
    $("#route-weather").innerHTML =
      `<div class="between"><strong>${verdict}</strong><span class="pill ${worst === "good" ? "green" : ""}">${worst.toUpperCase()}</span></div>
      <div class="field" style="margin-top:10px"><label for="route-departure">Planned departure time</label><select id="route-departure"><option value="0" ${routeDepartureHours === 0 ? "selected" : ""}>Leave now</option><option value="3" ${routeDepartureHours === 3 ? "selected" : ""}>In 3 hours</option><option value="6" ${routeDepartureHours === 6 ? "selected" : ""}>In 6 hours</option></select></div>
      <div class="route-points" style="margin-top:10px">${routeItems}</div>`;
    bindIfPresent("#route-departure", "change", (event) =>
      loadRouteWeather(route, Number(event.target.value)),
    );
  }

  // Offline / Straight-Line Fallback Weather: checks weather at Start and Destination when detailed turn-by-turn routing fails
  async function loadFallbackWeather(start, end) {
    const [a, b] = await Promise.all([
      EF.Weather.fetchForecast(start[0], start[1]),
      EF.Weather.fetchForecast(end[0], end[1]),
    ]);
    if (!a.ok && !b.ok) {
      $("#route-weather").innerHTML =
        '<p class="small muted">Endpoint weather is unavailable until an OpenWeather key is configured.</p>';
      return;
    }
    const tempUnit = getData().settings.temperatureUnit || "C";
    const startSlot = a.ok ? a.data.list?.[0] : null;
    const endSlot = b.ok ? b.data.list?.[0] : null;
    $("#route-weather").innerHTML =
      `<p class="small muted">Showing endpoint weather only because the full route geometry could not be loaded.</p>
      <div class="route-points">
        <div class="route-point"><strong>Start point</strong><small>${startSlot ? `${Math.round(startSlot.main.temp)}°${tempUnit} · ${EF.Store.escapeHTML(startSlot.weather?.[0]?.description || "")}` : "Unavailable"}</small></div>
        <div class="route-point"><strong>Destination</strong><small>${endSlot ? `${Math.round(endSlot.main.temp)}°${tempUnit} · ${EF.Store.escapeHTML(endSlot.weather?.[0]?.description || "")}` : "Unavailable"}</small></div>
      </div>`;
  }

  // ==========================================
  // SAVED ROUTES
  // ==========================================
  // Save, Load & Delete Favorite Routes: lets you save planned routes into browser storage and reload them later with one click
  function saveCurrentRoute() {
    const route = routes[chosenRouteIndex];
    if (!route || !startPoint || !endPoint) return;
    const name = `${startLabel || "Start"} to ${endLabel || "Destination"}`;
    EF.Store.updateData((data) => {
      data.routes.unshift({
        id: EF.Store.createId("route"),
        name,
        mode: routeMode,
        start: startPoint,
        end: endPoint,
        distance: route.distance,
        duration: routeDurationSeconds(route),
        geometry: route.geometry,
        savedAt: new Date().toISOString(),
      });
    });
    renderSavedRoutes();
    EF.ui.toast("Route saved.");
  }

  function renderSavedRoutes() {
    const host = $("#saved-routes-list") || $("#saved-routes");
    if (!host) return;
    const saved = getData().routes || [];
    if (!saved.length) {
      host.innerHTML =
        '<p class="small muted">Saved routes will appear here so you can reload them anytime.</p>';
      return;
    }
    host.innerHTML = saved
      .map(
        (item) => `<div class="route-point">
      <div class="between"><strong>${EF.Store.escapeHTML(item.name)}</strong><span class="pill">${displayDistance((item.distance || 0) / 1000)}</span></div>
      <small>${EF.Store.escapeHTML(item.mode || "foot")} · Saved ${new Date(item.savedAt).toLocaleDateString()}</small>
      <div class="row" style="margin-top:6px"><button class="text-button" type="button" data-load-route="${EF.Store.escapeHTML(item.id)}">Load</button><button class="text-button" type="button" data-delete-route="${EF.Store.escapeHTML(item.id)}">Remove</button></div>
    </div>`,
      )
      .join("");

    host.querySelectorAll("[data-load-route]").forEach((button) =>
      button.addEventListener("click", () => {
        const item = getData().routes.find(
          (entry) => entry.id === button.dataset.loadRoute,
        );
        if (!item) return;
        setStart(item.start, item.name.split(" to ")[0] || "Start");
        setEnd(item.end, item.name.split(" to ")[1] || "Destination");
        routeMode = item.mode || "foot";
        $("#travel-mode").value = routeMode;
        routes = [
          {
            distance: item.distance,
            duration: item.duration,
            geometry: item.geometry,
          },
        ];
        chosenRouteIndex = 0;
        drawRoute(routes[0]);
        renderRouteSummary(routes[0], routes, "Saved route");
        loadRouteWeather(routes[0]);
      }),
    );

    host.querySelectorAll("[data-delete-route]").forEach((button) =>
      button.addEventListener("click", () => {
        EF.Store.updateData((data) => {
          data.routes = data.routes.filter(
            (entry) => entry.id !== button.dataset.deleteRoute,
          );
        });
        renderSavedRoutes();
        EF.ui.toast("Saved route removed.");
      }),
    );
  }

  // ==========================================
  // LIVE ACTIVITY SESSION (GPS OR SIMULATION)
  // ==========================================
  // Category-aware tracker controls and session workflows.
  function setCategory(category) {
    if (session.active) { EF.ui.toast("Finish the current session before changing categories.", "warning"); return; }
    trackerCategory = ACTIVITY_OPTIONS[category] ? category : "outdoor";
    document.querySelectorAll("[data-category]").forEach((button) => {
      const active = button.dataset.category === trackerCategory;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const select = $("#activity-type");
    select.innerHTML = ACTIVITY_OPTIONS[trackerCategory].map((name) => `<option value="${EF.Store.escapeHTML(name)}">${EF.Store.escapeHTML(name)}</option>`).join("");
    ["outdoor", "indoor", "bodyweight", "gym", "mind"].forEach((key) => {
      const panel = byId(`${key}-controls`);
      if (panel) panel.hidden = key !== trackerCategory;
    });
    const outdoor = trackerCategory === "outdoor";
    const modePill = byId("tracker-mode-pill");
    if (modePill) modePill.innerHTML = `<span class="dot"></span>${outdoor ? "Outdoor GPS &amp; route tools" : trackerCategory === "indoor" ? "Indoor workout mode" : trackerCategory === "bodyweight" ? "Sets &amp; reps mode" : trackerCategory === "gym" ? "Strength logging mode" : "Mindful session mode"}`;
    if (byId("tracker-map-panel")) byId("tracker-map-panel").hidden = false;
    if (byId("route-planner-panel")) byId("route-planner-panel").hidden = !outdoor;
    const controlsGrid = document.querySelector(".tracker-controls-grid");
    if (controlsGrid) controlsGrid.classList.toggle("activity-only", !outdoor);
    ["my-location", "clear-route"].forEach((id) => { if (byId(id)) byId(id).hidden = !outdoor; });
    const legend = document.querySelector(".map-legend");
    if (legend) legend.hidden = !outdoor;
    if (map) {
      if (outdoor) {
        routeLayer?.addTo(map); routeWeatherLayer?.addTo(map); sessionTrailLayer?.addTo(map);
        updatePointMarkers();
      } else {
        [routeLayer, routeWeatherLayer, sessionTrailLayer].forEach((layer) => { if (layer && map.hasLayer(layer)) map.removeLayer(layer); });
        sessionTrailLayer?.clearLayers();
        [startMarker, endMarker, currentMarker].forEach((marker) => { if (marker) map.removeLayer(marker); });
        startMarker = null; endMarker = null; currentMarker = null;
      }
    }
    Object.assign(session, { elapsed: 0, distance: 0, points: [], lastPoint: null, setLogs: [], totalReps: 0, restRemaining: 0, restElapsed: 0, holdElapsed: 0, totalVolumeKg: 0 });
    updateActivitySpecificFields();
    resetCategoryReadouts();
    if (weatherBundle?.current && $("#weather-advice") && $("#advice-category")) {
      $("#weather-advice").textContent = EF.Weather.adviceForActivity(trackerCategory, weatherBundle.current);
      $("#advice-category").textContent = trackerCategory === "mind" ? "Mind and body" : trackerCategory[0].toUpperCase() + trackerCategory.slice(1);
    }
    window.setTimeout(() => map && map.invalidateSize(), 100);
  }

  function updateActivitySpecificFields() {
    const type = $("#activity-type").value;
    const toggle = (id, visible) => { const node = byId(id); if (node) node.hidden = !visible; };
    const plank = trackerCategory === "bodyweight" && type === "Planks";
    const jump = trackerCategory === "indoor" && type === "Jump Rope";
    const rower = trackerCategory === "indoor" && type === "Rowing Machine";
    const incline = trackerCategory === "indoor" && ["Treadmill", "Elliptical"].includes(type);
    toggle("bodyweight-target-reps-field", !plank);
    toggle("bodyweight-hold-target-field", plank);
    toggle("bodyweight-completed-reps-field", !plank);
    toggle("bodyweight-completed-hold-field", plank);
    toggle("bodyweight-hold-metric", plank);
    toggle("indoor-distance-field", !jump);
    toggle("indoor-distance-metric", !jump);
    toggle("indoor-intensity-field", !jump);
    toggle("indoor-incline-field", incline);
    toggle("indoor-count-field", jump || rower);
    if ($("#indoor-count-label")) $("#indoor-count-label").textContent = rower ? "Strokes" : "Jump count";
    const metricLabel = type === "Treadmill" ? "Speed (km/h)" : type === "Stationary Bike" ? "Speed / resistance level" : type === "Rowing Machine" ? "Split / intensity" : "Resistance / intensity";
    if ($("#indoor-intensity-label")) $("#indoor-intensity-label").textContent = metricLabel;
    if ($("#indoor-output-label")) $("#indoor-output-label").textContent = jump ? "Jump count" : rower ? "Strokes / intensity" : "Speed / intensity";
    toggle("mind-target-field", $("#mind-duration-mode")?.value === "target");
  }

  function formatClock(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const hours = Math.floor(value / 3600), minutes = Math.floor((value % 3600) / 60), secs = Math.floor(value % 60);
    return hours ? `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}` : `${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
  }
  function estimateCalories(type, seconds) {
    return Math.round((MET_VALUES[type] || 4) * (Number(getData().profile.weight) || 70) * (Math.max(0, seconds) / 3600));
  }
  function fmtSummaryDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(total / 60), remaining = Math.floor(total % 60);
    return `${minutes}m ${remaining}s`;
  }
  function selectedIndoorDistance() { return Math.max(0, Number($("#indoor-distance-input")?.value) || 0); }

  function updateSessionReadout() {
    const type = $("#activity-type")?.value || "Activity";
    const calories = estimateCalories(type, session.elapsed);
    if (trackerCategory === "outdoor") {
      if ($("#track-time")) $("#track-time").textContent = formatClock(session.elapsed);
      if ($("#track-distance")) $("#track-distance").textContent = displayDistance(session.distance);
      if ($("#track-calories")) $("#track-calories").textContent = `${calories} kcal`;
      const pace = session.distance > 0.02 ? session.elapsed / session.distance : 0;
      if ($("#track-pace")) $("#track-pace").textContent = type === "Cycling" ? (pace ? `${(3600 / pace).toFixed(1)} km/h` : "—") : (pace ? `${Math.floor(pace/60)}:${String(Math.round(pace%60)).padStart(2,"0")} /km` : "—");
    } else if (trackerCategory === "indoor") {
      const distance = type === "Jump Rope" ? null : selectedIndoorDistance();
      if ($("#indoor-time")) $("#indoor-time").textContent = formatClock(session.elapsed);
      if ($("#indoor-distance")) $("#indoor-distance").textContent = distance === null ? "Not used" : `${distance.toFixed(2)} km`;
      if ($("#indoor-calories")) $("#indoor-calories").textContent = `${calories} kcal`;
      const count = Number($("#indoor-count-input")?.value) || 0, intensity = Number($("#indoor-intensity-input")?.value) || 0, incline = Number($("#indoor-incline-input")?.value) || 0;
      if ($("#indoor-output-value")) $("#indoor-output-value").textContent = type === "Jump Rope" ? `${count} jumps` : type === "Rowing Machine" ? `${count} strokes${intensity ? ` · ${intensity}` : ""}` : `${intensity || "—"}${type === "Treadmill" && intensity ? " km/h" : ""}${incline ? ` · ${incline}% incline` : ""}`;
    } else if (trackerCategory === "bodyweight") {
      const activeTime = Math.max(0, session.elapsed - session.restElapsed), planned = Math.max(1, Number($("#bodyweight-target-sets")?.value) || 1), complete = session.setLogs.length >= planned;
      if ($("#bodyweight-current-set")) $("#bodyweight-current-set").textContent = `${Math.min(session.setLogs.length + 1, planned)} / ${planned}`;
      if ($("#bodyweight-total-reps")) $("#bodyweight-total-reps").textContent = session.totalReps;
      if ($("#bodyweight-total-sets")) $("#bodyweight-total-sets").textContent = session.setLogs.length;
      if ($("#bodyweight-active-time")) $("#bodyweight-active-time").textContent = formatClock(activeTime);
      if ($("#bodyweight-rest-timer")) $("#bodyweight-rest-timer").textContent = session.restRemaining ? formatClock(session.restRemaining) : (session.setLogs.length ? "Ready" : "—");
      if ($("#bodyweight-hold-time")) $("#bodyweight-hold-time").textContent = formatClock(session.holdElapsed);
      if ($("#bodyweight-calories")) $("#bodyweight-calories").textContent = `${estimateCalories(type, activeTime)} kcal`;
      if ($("#bodyweight-log-set")) { $("#bodyweight-log-set").disabled = !session.active || session.paused || session.restRemaining > 0 || complete; $("#bodyweight-log-set").textContent = complete ? "Planned sets complete" : session.setLogs.length ? "Log set / Next set" : "Log first set"; }
    } else if (trackerCategory === "gym") {
      if ($("#gym-total-volume")) $("#gym-total-volume").textContent = `${session.totalVolumeKg.toFixed(1)} kg`;
      if ($("#gym-sets-completed")) $("#gym-sets-completed").textContent = session.setLogs.length;
      if ($("#gym-session-time")) $("#gym-session-time").textContent = formatClock(session.elapsed);
      if ($("#gym-calories")) $("#gym-calories").textContent = `${estimateCalories(type, Math.max(0, session.elapsed - session.restElapsed))} kcal`;
      if ($("#gym-rest-timer")) $("#gym-rest-timer").textContent = session.restRemaining ? formatClock(session.restRemaining) : (session.setLogs.length ? "Ready" : "—");
      if ($("#gym-complete-set")) $("#gym-complete-set").disabled = !session.active || session.paused || session.restRemaining > 0;
    } else if (trackerCategory === "mind") {
      const targetMode = $("#mind-duration-mode")?.value === "target", target = (Number($("#mind-target-minutes")?.value) || 10) * 60, remaining = Math.max(0, target - session.elapsed);
      if ($("#mind-session-timer")) $("#mind-session-timer").textContent = formatClock(targetMode ? remaining : session.elapsed);
      if ($("#mind-timer-caption")) $("#mind-timer-caption").textContent = targetMode ? (remaining ? "Time remaining" : "Target duration reached") : "Open-ended session";
      if ($("#mind-duration")) $("#mind-duration").textContent = formatClock(session.elapsed);
      if ($("#mind-cycles")) $("#mind-cycles").textContent = Number($("#mind-cycles-input")?.value) || 0;
      if ($("#mind-calories")) $("#mind-calories").textContent = `${calories} kcal`;
    }
    const plannedRoute = routes[chosenRouteIndex], progress = byId("route-live-progress");
    if (trackerCategory === "outdoor" && plannedRoute && progress && !progress.hidden) progress.textContent = `Remaining distance: ${displayDistance(Math.max(0, plannedRoute.distance / 1000 - session.distance))}`;
  }

  function resetCategoryReadouts() {
    ["indoor-distance-input","indoor-intensity-input","indoor-count-input","indoor-incline-input","mind-cycles-input"].forEach((id) => { const el = byId(id); if (el) el.value = ["indoor-count-input","indoor-incline-input","mind-cycles-input"].includes(id) ? "0" : ""; });
    if ($("#bodyweight-total-reps")) $("#bodyweight-total-reps").textContent = "0";
    if ($("#bodyweight-total-sets")) $("#bodyweight-total-sets").textContent = "0";
    if ($("#gym-total-volume")) $("#gym-total-volume").textContent = "0 kg";
    if ($("#gym-sets-completed")) $("#gym-sets-completed").textContent = "0";
    if ($("#gym-set-log")) $("#gym-set-log").innerHTML = "";
    updateSessionReadout();
  }

  function recordPoint(point) {
    if (!coordsValid(point)) return;
    if (session.lastPoint) { const meters = EF.Routing.distanceMeters(session.lastPoint, point); if (meters >= 2 && meters < 500) session.distance += meters / 1000; }
    session.lastPoint = point; session.points.push(point);
    if (map) {
      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.circleMarker(point, { radius: 8, color: "#fff", weight: 3, fillColor: "#16a34a", fillOpacity: 1 }).addTo(map);
      if (session.points.length > 1 && sessionTrailLayer) {
        sessionTrailLayer.clearLayers();
        L.polyline(session.points, { color: "#16a34a", weight: 4 }).addTo(sessionTrailLayer);
      }
    }
  }

  function prepareSimulationPath() {
    const coordinates = routes[chosenRouteIndex]?.geometry?.coordinates || [];
    session.simulationPath = coordinates.map(([lon, lat]) => [lat, lon]);
    session.simulationCumulative = [0];
    for (let i = 1; i < session.simulationPath.length; i++) {
      session.simulationCumulative[i] = session.simulationCumulative[i - 1] + EF.Routing.distanceMeters(session.simulationPath[i - 1], session.simulationPath[i]);
    }
    session.simulationProgressMeters = 0;
    return session.simulationPath.length > 1;
  }

  function advanceSimulationAlongRoute() {
    if (session.simulationPath.length < 2) return;
    session.simulationProgressMeters = Math.min(session.simulationCumulative.at(-1), session.simulationProgressMeters + 1.5);
    const target = session.simulationProgressMeters;
    let index = session.simulationCumulative.findIndex((distance) => distance >= target);
    if (index <= 0) index = 1;
    const previousDistance = session.simulationCumulative[index - 1], segmentDistance = session.simulationCumulative[index] - previousDistance;
    const fraction = segmentDistance > 0 ? (target - previousDistance) / segmentDistance : 0;
    const a = session.simulationPath[index - 1], b = session.simulationPath[index];
    recordPoint([a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]);
  }

  async function startSession() {
    if (session.active) return;
    const outdoor = trackerCategory === "outdoor";
    const wantsSimulation = outdoor && Boolean($("#simulation-mode")?.checked);
    if (outdoor && wantsSimulation && !prepareSimulationPath()) {
      EF.ui.toast("Plan a route first to simulate movement along real streets. Choose a start and destination, then tap Get route.", "error");
      return;
    }

    let initialGpsPoint = null;
    if (outdoor && !wantsSimulation && navigator.geolocation) {
      const startButton = $("#track-start");
      if (startButton) { startButton.disabled = true; startButton.textContent = "Getting GPS…"; }
      try {
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }));
        initialGpsPoint = [position.coords.latitude, position.coords.longitude];
        if (!startPointManual) {
          setStart(initialGpsPoint, "Live GPS location", false);
          if (endPoint) {
            try {
              routeMode = $("#travel-mode").value;
              const refreshed = await EF.Routing.requestRoute(initialGpsPoint, endPoint, routeMode);
              routes = refreshed.routes; chosenRouteIndex = 0; drawRoute(routes[0]);
              renderRouteSummary(routes[0], routes, refreshed.service);
            } catch (routeError) { console.warn("Could not refresh route from current GPS position:", routeError); }
          }
        }
        map?.flyTo(initialGpsPoint, Math.max(map.getZoom(), 16), { duration: 0.8 });
        updateMapAreaName(initialGpsPoint, "Your current GPS position");
      } catch (error) {
        if (startButton) { startButton.disabled = false; startButton.textContent = "Start session"; }
        EF.ui.toast(error.code === 1 ? "Location permission is needed for GPS tracking. Enable Simulation mode or allow location access." : "Could not get a GPS fix. Try again or enable Simulation mode.", "error");
        return;
      }
    } else if (outdoor && !wantsSimulation && !navigator.geolocation) {
      EF.ui.toast("This browser does not support GPS. Enable Simulation mode after planning a route.", "error");
      return;
    }

    Object.assign(session, { active: true, paused: false, elapsed: 0, distance: 0, points: [], lastPoint: null, setLogs: [], totalReps: 0, restRemaining: 0, restElapsed: 0, holdElapsed: 0, totalVolumeKg: 0, simulationProgressMeters: 0 });
    if (currentMarker && map) { map.removeLayer(currentMarker); currentMarker = null; }
    if (sessionTrailLayer) sessionTrailLayer.clearLayers();
    session.simulation = wantsSimulation;
    if (session.simulation && session.simulationPath.length) recordPoint(session.simulationPath[0]);
    else if (initialGpsPoint) recordPoint(initialGpsPoint);
    if ($("#session-finish-summary")) $("#session-finish-summary").hidden = true;
    $("#track-start").disabled = true; $("#track-start").textContent = "Start session";
    $("#track-pause").disabled = false; $("#track-finish").disabled = false;
    $("#activity-type").disabled = true;
    if ($("#simulation-mode")) $("#simulation-mode").disabled = true;
    if ($("#tracking-state")) $("#tracking-state").textContent = session.simulation ? "Route simulation active" : "GPS tracking active";
    if (outdoor && !session.simulation && navigator.geolocation) {
      session.watchId = navigator.geolocation.watchPosition((pos) => {
        if (session.paused) return;
        if (pos.coords.accuracy && pos.coords.accuracy > 60) return;
        const point = [pos.coords.latitude, pos.coords.longitude];
        const now = Date.now();
        if (session.lastPoint && session.lastGeoUpdate) {
          const seconds = Math.max(1, (now - session.lastGeoUpdate) / 1000);
          const speed = EF.Routing.distanceMeters(session.lastPoint, point) / seconds;
          const maxPlausibleSpeed = $("#activity-type").value === "Cycling" ? 35 : 12;
          if (speed > maxPlausibleSpeed) return; // Reject obvious GPS jumps instead of drawing a diagonal spike.
        }
        session.lastGeoUpdate = now;
        recordPoint(point);
        if (map && session.points.length % 3 === 0) map.panTo(point, { animate: true, duration: 0.35 });
      }, () => { if ($("#tracking-state")) $("#tracking-state").textContent = "GPS signal weak — waiting for location"; }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 });
    }
    session.timer = window.setInterval(() => {
      if (session.paused) return;
      session.elapsed++;
      if (session.restRemaining > 0) { session.restRemaining--; session.restElapsed++; if (!session.restRemaining) EF.ui.toast("Rest complete. Ready for the next set."); }
      if (session.simulation && trackerCategory === "outdoor") advanceSimulationAlongRoute();
      if (trackerCategory === "bodyweight" && $("#activity-type").value === "Planks" && session.restRemaining === 0) session.holdElapsed++;
      updateSessionReadout();
      if (trackerCategory === "mind" && $("#mind-duration-mode").value === "target" && session.elapsed >= (Number($("#mind-target-minutes").value) || 10) * 60) {
        session.paused = true; $("#tracking-state").textContent = "Target reached — finish to save"; $("#track-pause").textContent = "Resume";
      }
    }, 1000);
    updateSessionReadout();
  }

  function logBodyweightSet() {
    if (!session.active || session.paused || session.restRemaining) return;
    const plank = $("#activity-type").value === "Planks", target = Math.max(1, Number($("#bodyweight-target-sets").value) || 1);
    if (session.setLogs.length >= target) return;
    const manualHold = Number($("#bodyweight-completed-hold").value) || 0;
    const value = plank ? Math.max(1, manualHold || session.holdElapsed || 1) : Math.max(0, Number($("#bodyweight-completed-reps").value) || 0);
    session.setLogs.push(plank ? { holdSeconds: value } : { reps: value });
    if (!plank) session.totalReps += value;
    else { session.holdElapsed = 0; $("#bodyweight-completed-hold").value = ""; }
    session.restRemaining = session.setLogs.length < target ? Math.max(0, Number($("#bodyweight-rest-duration").value) || 0) : 0;
    updateSessionReadout();
  }

  function logGymSet() {
    if (!session.active || session.paused || session.restRemaining) return;
    const weight = Math.max(0, Number($("#gym-weight").value) || 0), reps = Math.max(1, Number($("#gym-reps").value) || 1), unit = $("#gym-weight-unit").value;
    const weightKg = unit === "lbs" ? weight * 0.45359237 : weight;
    const item = { weight, unit, weightKg: Number(weightKg.toFixed(3)), reps, volumeKg: Number((weightKg * reps).toFixed(2)) };
    session.setLogs.push(item); session.totalReps += reps; session.totalVolumeKg += item.volumeKg;
    const row = document.createElement("div"); row.className = "set-log-row"; row.textContent = `Set ${session.setLogs.length}: ${weight} ${unit} × ${reps} reps`; $("#gym-set-log").prepend(row);
    session.restRemaining = Math.max(0, Number($("#gym-rest-duration").value) || 0);
    updateSessionReadout();
  }

  function togglePauseSession() {
    if (!session.active) return;
    session.paused = !session.paused;
    $("#track-pause").textContent = session.paused ? "Resume" : "Pause";
    $("#tracking-state").textContent = session.paused ? "Paused" : "Session active";
    updateSessionReadout();
  }

  function finishSession() {
    if (!session.active) return;
    window.clearInterval(session.timer);
    if (session.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(session.watchId);
    session.active = false; session.paused = false; session.timer = null; session.watchId = null;
    const type = $("#activity-type").value, duration = Math.max(1, session.elapsed), notes = $("#session-notes")?.value.trim() || "";
    const record = { id: EF.Store.createId("activity"), type, category: trackerCategory, date: new Date().toISOString(), duration, distance: 0, calories: estimateCalories(type, duration), reps: session.totalReps, sets: session.setLogs.length, notes, route: null, simulation: false, setDetails: session.setLogs };
    if (trackerCategory === "outdoor") {
      const pace = session.distance > 0 ? duration / session.distance : 0;
      Object.assign(record, { distance: Number(session.distance.toFixed(3)), paceSecondsPerKm: Number(pace.toFixed(1)), speedKph: pace ? Number((3600 / pace).toFixed(2)) : 0, route: session.points.length > 1 ? session.points : null, simulation: session.simulation });
    } else if (trackerCategory === "indoor") {
      const jump = type === "Jump Rope";
      Object.assign(record, { distance: jump ? 0 : Number(selectedIndoorDistance().toFixed(3)), intensity: Number($("#indoor-intensity-input").value) || 0, incline: Number($("#indoor-incline-input").value) || 0, machineCount: Number($("#indoor-count-input").value) || 0, countLabel: jump ? "jumps" : type === "Rowing Machine" ? "strokes" : "", activeMetric: type === "Treadmill" ? "speed" : type === "Stationary Bike" ? "speed / resistance" : "intensity" });
    } else if (trackerCategory === "bodyweight") {
      const plank = type === "Planks";
      Object.assign(record, { reps: plank ? 0 : session.totalReps, totalHoldSeconds: plank ? session.setLogs.reduce((sum, item) => sum + (item.holdSeconds || 0), 0) : 0, targetSets: Math.max(1, Number($("#bodyweight-target-sets").value) || 1), targetReps: plank ? 0 : Math.max(0, Number($("#bodyweight-target-reps").value) || 0), targetHoldSeconds: plank ? Math.max(0, Number($("#bodyweight-hold-target").value) || 0) : 0, activeDuration: Math.max(0, duration - session.restElapsed), restSeconds: session.restElapsed });
      record.calories = estimateCalories(type, record.activeDuration);
    } else if (trackerCategory === "gym") {
      Object.assign(record, { volumeKg: Number(session.totalVolumeKg.toFixed(2)), weightUnit: $("#gym-weight-unit").value, activeDuration: Math.max(0, duration - session.restElapsed), restSeconds: session.restElapsed });
      record.calories = estimateCalories(type, record.activeDuration);
    } else if (trackerCategory === "mind") {
      Object.assign(record, { focus: $("#mind-focus").value || "", mood: $("#mind-mood").value || "", durationMode: $("#mind-duration-mode").value, targetDuration: $("#mind-duration-mode").value === "target" ? (Number($("#mind-target-minutes").value) || 0) * 60 : 0, cycles: Number($("#mind-cycles-input").value) || 0 });
    }
    EF.Store.updateData((data) => data.activities.push(record));
    // A completed session should leave a clean map for the next activity.
    removeRouteLayers();
    sessionTrailLayer?.clearLayers();
    if (startMarker) { map?.removeLayer(startMarker); startMarker = null; }
    if (endMarker) { map?.removeLayer(endMarker); endMarker = null; }
    if (currentMarker) { map?.removeLayer(currentMarker); currentMarker = null; }
    startPoint = null; endPoint = null; startLabel = ""; endLabel = "";
    routes = []; routeWeatherData = []; chosenRouteIndex = 0;
    updatePointMarkers();
    if (byId("route-summary")) byId("route-summary").innerHTML = '<p class="small muted">Session finished. Plan a new route when you are ready.</p>';
    if (byId("route-instructions")) byId("route-instructions").innerHTML = "";
    if (byId("route-weather")) byId("route-weather").innerHTML = "";
    let summary = `${fmtSummaryDuration(duration)} · ${record.calories} kcal estimated`;
    if (trackerCategory === "outdoor") summary = `${Number(record.distance).toFixed(2)} km · ${type === "Cycling" && record.speedKph ? `${record.speedKph} km/h` : record.paceSecondsPerKm ? `${Math.floor(record.paceSecondsPerKm / 60)}:${String(Math.round(record.paceSecondsPerKm % 60)).padStart(2, "0")} /km` : "Pace not recorded"} · ${summary}`;
    else if (trackerCategory === "indoor") {
      const machineDistance = record.distance ? `${record.distance.toFixed(2)} km machine distance` : "No distance recorded";
      const machineCount = record.machineCount ? `${record.machineCount} ${record.countLabel}` : "";
      const intensityText = record.intensity ? `${record.intensity} ${record.activeMetric === "speed" ? "km/h" : record.activeMetric === "speed / resistance" ? "speed / resistance" : "intensity"}` : "";
      const inclineText = record.incline ? `${record.incline}% incline` : "";
      summary = [machineDistance, machineCount, intensityText, inclineText, summary].filter(Boolean).join(" · ");
    }
    else if (trackerCategory === "bodyweight") summary = `${record.sets} sets · ${record.reps} reps${record.totalHoldSeconds ? ` · ${record.totalHoldSeconds}s total hold` : ""} · ${fmtSummaryDuration(record.activeDuration)} active · ${record.calories} kcal estimated`;
    else if (trackerCategory === "gym") summary = `${record.volumeKg.toFixed(1)} kg total volume · ${record.sets} sets · ${record.reps} reps · ${summary}`;
    else if (trackerCategory === "mind") summary = `${fmtSummaryDuration(duration)}${record.focus ? ` · ${record.focus}` : ""}${record.cycles ? ` · ${record.cycles} cycles / rounds` : ""}${record.mood ? ` · Mood: ${record.mood}` : ""} · ${record.calories} kcal estimated`;
    if ($("#session-finish-summary-text")) $("#session-finish-summary-text").textContent = summary;
    if ($("#session-finish-summary")) $("#session-finish-summary").hidden = false;
    $("#track-start").disabled = false; $("#track-pause").disabled = true; $("#track-pause").textContent = "Pause"; $("#track-finish").disabled = true;
    $("#activity-type").disabled = false;
    if ($("#simulation-mode")) $("#simulation-mode").disabled = false;
    if ($("#tracking-state")) $("#tracking-state").textContent = "Saved to History";
    if ($("#session-notes")) $("#session-notes").value = "";
    if ($("#bodyweight-log-set")) $("#bodyweight-log-set").disabled = true;
    if ($("#gym-complete-set")) $("#gym-complete-set").disabled = true;
    EF.ui.toast("Workout saved to your History!");
  }
  // ==========================================
  // EVENT LISTENERS AND INITIALIZATION
  // ==========================================
  // Connect All Buttons & Startup: wires up map search, route buttons, category tabs, and session controls on page load
  bindIfPresent("#search-place", "click", searchPlace);
  bindIfPresent("#place-search", "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchPlace();
    }
  });
  bindIfPresent("#my-location", "click", locateUser);
  bindIfPresent("#set-manual-start", "click", () => setManualRoutePoint("start"));
  bindIfPresent("#set-manual-destination", "click", () => setManualRoutePoint("destination"));
  bindIfPresent("#get-route", "click", getRoute);
  bindIfPresent("#swap-points", "click", () => {
    [startPoint, endPoint] = [endPoint, startPoint];
    [startLabel, endLabel] = [endLabel, startLabel];
    updatePointMarkers();
  });
  bindIfPresent("#clear-route", "click", () => {
    startPoint = null;
    endPoint = null;
    startPointManual = false;
    startLabel = "";
    endLabel = "";
    routes = [];
    chosenRouteIndex = 0;
    routeWeatherData = [];
    updatePointMarkers();
    removeRouteLayers();
    const summary = $("#route-summary");
    const instructions = $("#route-instructions");
    const weather = $("#route-weather");
    if (summary) summary.innerHTML = '<p class="small muted">Select two points on the map and click Get route.</p>';
    if (instructions) instructions.innerHTML = "";
    if (weather) weather.innerHTML = '<p class="small muted">Plan a route to check forecast conditions along the path.</p>';
  });

  document.querySelectorAll("[data-category]").forEach((button) =>
    button.addEventListener("click", () => setCategory(button.dataset.category)),
  );
  bindIfPresent("#activity-type", "change", () => { updateActivitySpecificFields(); updateSessionReadout(); });
  bindIfPresent("#bodyweight-log-set", "click", logBodyweightSet);
  bindIfPresent("#gym-complete-set", "click", logGymSet);
  bindIfPresent("#mind-duration-mode", "change", () => { updateActivitySpecificFields(); updateSessionReadout(); });
  ["#indoor-distance-input", "#indoor-intensity-input", "#indoor-count-input", "#indoor-incline-input", "#mind-cycles-input"].forEach((selector) => bindIfPresent(selector, "input", updateSessionReadout));
  bindIfPresent("#session-start", "click", startSession);
  bindIfPresent("#track-start", "click", startSession);
  bindIfPresent("#session-pause", "click", togglePauseSession);
  bindIfPresent("#track-pause", "click", togglePauseSession);
  bindIfPresent("#session-finish", "click", finishSession);
  bindIfPresent("#track-finish", "click", finishSession);
  bindIfPresent("#refresh-weather", "click", () => {
    if (selectedLocation) loadWeather(selectedLocation[0], selectedLocation[1]);
  });

  // Startup sequence: initialize Leaflet before optional tracker controls. A missing optional
  // control must never prevent the OpenStreetMap tiles from appearing.
  initMap();
  setCategory("outdoor");
  const defaultAct = getData().settings.defaultActivity;
  if (defaultAct) {
    const oldNames = { Walk: "Walking", Run: "Running", Ride: "Cycling", Hike: "Hiking" };
    const compatibleDefault = oldNames[defaultAct] || defaultAct;
    const foundCat = Object.keys(ACTIVITY_OPTIONS).find((cat) => ACTIVITY_OPTIONS[cat].includes(compatibleDefault));
    if (foundCat) {
      setCategory(foundCat);
      $("#activity-type").value = compatibleDefault;
      updateActivitySpecificFields();
    }
  }
  renderSavedRoutes();
  const savedCoords = getData().settings.lastCoords;
  if (savedCoords)
    selectWeatherLocation(
      [savedCoords.lat, savedCoords.lon],
      getData().settings.lastLocation || "Saved location",
    );
  else selectWeatherLocation(DEFAULT_CENTER, "Manila (default)");
})();
