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
  const DEFAULT_CENTER = CONFIG.defaultMapCenter || [14.5995, 120.9842];
  const ACTIVITY_OPTIONS = {
    outdoor: ["Walk", "Run", "Ride", "Hike"],
    indoor: [
      "Treadmill",
      "Stationary bike",
      "Elliptical",
      "Jump rope",
      "Stair climber",
    ],
    bodyweight: [
      "Push-ups",
      "Sit-ups",
      "Squats",
      "Lunges",
      "Jumping jacks",
      "Burpees",
    ],
    gym: ["Strength training", "Weightlifting"],
    mind: ["Yoga", "Stretching", "Plank", "Pilates"],
  };
  const MET_VALUES = {
    Walk: 3.5,
    Run: 7,
    Ride: 6.5,
    Hike: 5.5,
    Treadmill: 4.5,
    "Stationary bike": 5,
    Elliptical: 5,
    "Jump rope": 8,
    "Stair climber": 6,
    "Push-ups": 4,
    "Sit-ups": 3,
    Squats: 4,
    Lunges: 4,
    "Jumping jacks": 5,
    Burpees: 7,
    "Strength training": 4,
    Weightlifting: 4,
    Yoga: 2.5,
    Stretching: 2,
    Plank: 3,
    Pilates: 3,
  };

  // App State Memory: keeps track of map pins, drawn routes, weather data, and your active workout timer
  let map = null;
  let startMarker = null;
  let endMarker = null;
  let currentMarker = null;
  let routeLayer = null;
  let routeWeatherLayer = null;
  let startPoint = null;
  let endPoint = null;
  let startLabel = "";
  let endLabel = "";
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
  function initMap() {
    const host = $("#tracker-map");
    if (!window.L) {
      host.innerHTML =
        '<div class="empty-state"><strong>Map library unavailable</strong>Check your internet connection and refresh the page. The rest of Tracker remains available.</div>';
      return;
    }
    map = L.map(host, { zoomControl: true, preferCanvas: true }).setView(
      DEFAULT_CENTER,
      CONFIG.defaultMapZoom || 12,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    routeWeatherLayer = L.layerGroup().addTo(map);
    map.on("click", (event) => {
      const point = [event.latlng.lat, event.latlng.lng];
      if (!startPoint) setStart(point, "Map selection");
      else if (!endPoint) setEnd(point, "Map selection");
      else setEnd(point, "Map selection");
      selectWeatherLocation(point, "Selected map point");
      showMapPopup(point, "Selected map point");
    });
    setTimeout(() => map.invalidateSize(), 200);
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
  function setStart(point, label = "Selected point") {
    startPoint = point;
    startLabel = label;
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
            if (action === "start") setStart(point, label);
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
      const endpoint = `${CONFIG.geocodingUrl || "https://nominatim.openstreetmap.org/search"}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
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
      const shortName = place.display_name.split(",").slice(0, 2).join(",");
      setEnd(point, shortName);
      selectWeatherLocation(point, shortName);
      map?.flyTo(point, 15, { duration: 1.1 });
      showMapPopup(point, shortName);
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
        setStart(point, "My location");
        selectWeatherLocation(point, "My location");
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
    const offset = current?.timezone ?? forecast?.city?.timezone ?? 0;
    if (!current)
      $("#weather-now").innerHTML = weatherMessage(
        result.errors?.current,
        result.errors?.forecast,
      );
    else {
      const condition = current.weather?.[0]?.description || "Conditions";
      const updated = EF.Weather.formatLocal(current.dt, offset);
      const weatherSource = result.savedDataCurrent
        ? `Showing saved data from ${updated} local time`
        : "OpenWeather live data";
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
        "Forecast unavailable. Add or test your API key in Settings.";
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
      ? EF.Weather.adviceForActivity(trackerCategory, current)
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
    if (routeMode === "foot" && $("#activity-type").value === "Run") {
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
      routeMode === "foot" && $("#activity-type").value === "Run"
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
    $("#start-planned-route").addEventListener("click", () => {
      if (trackerCategory !== "outdoor") setCategory("outdoor");
      $("#simulation-mode").checked = false;
      const progress = document.getElementById("route-live-progress");
      if (progress) progress.hidden = false;
      startSession();
    });
    $("#save-planned-route").addEventListener("click", saveCurrentRoute);
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
      routes = result.routes;
      chosenRouteIndex = 0;
      drawRoute(routes[0]);
      renderRouteSummary(routes[0], routes, result.service);
      const instructions = EF.Routing.routeInstructions(routes[0]).slice(0, 12);
      $("#route-instructions").innerHTML = instructions.length
        ? `<h4 style="margin:4px 0">Turn-by-turn preview</h4>${instructions.map((step, index) => `<div class="route-point"><strong>${index + 1}. ${EF.Store.escapeHTML(step.instruction)}</strong><small>${(step.distance / 1000).toFixed(2)} km ${step.name ? `· ${EF.Store.escapeHTML(step.name)}` : ""}</small></div>`).join("")}`
        : '<p class="small muted">Turn instructions are not available for this route.</p>';
      await loadRouteWeather(routes[0]);
      EF.ui.toast(result.cached ? "Loaded a saved route." : "Route planned.");
    } catch (error) {
      if (error.name === "AbortError") return;
      const line = [startPoint, endPoint];
      removeRouteLayers();
      if (map)
        L.polyline(line, {
          color: "#d18a22",
          weight: 4,
          dashArray: "8 8",
        }).addTo(routeLayer);
      const straightKm = EF.Routing.distanceMeters(startPoint, endPoint) / 1000;
      $("#route-summary").innerHTML =
        `<div class="empty-state"><strong>Detailed routing unavailable</strong><p>${EF.Store.escapeHTML(error.message || "Public routing service is unavailable.")}</p><p>Straight-line fallback: ${displayDistance(straightKm)}. This is not a navigable route.</p><button class="btn secondary small-btn" id="retry-route" type="button">Retry route</button></div>`;
      $("#retry-route").addEventListener("click", getRoute);
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
    $("#route-departure").addEventListener("change", (event) =>
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
    const host = $("#saved-routes-list");
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
  // Category & Exercise Selector: updates the workout dropdown and shows GPS/simulation controls only for outdoor activities
  function setCategory(category) {
    trackerCategory = category;
    document
      .querySelectorAll("[data-category]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.category === category),
      );
    const select = $("#activity-type");
    const list = ACTIVITY_OPTIONS[category] || ACTIVITY_OPTIONS.outdoor;
    select.innerHTML = list
      .map(
        (name) =>
          `<option value="${EF.Store.escapeHTML(name)}">${EF.Store.escapeHTML(name)}</option>`,
      )
      .join("");
    const isOutdoor = category === "outdoor";
    $("#outdoor-controls").hidden = !isOutdoor;
    $("#indoor-controls").hidden = isOutdoor;
    if (weatherBundle?.current) {
      $("#weather-advice").textContent = EF.Weather.adviceForActivity(
        category,
        weatherBundle.current,
      );
      $("#advice-category").textContent = category
        .replace("bodyweight", "Bodyweight")
        .replace("mind", "Mind and body");
    }
  }

  // Live Timer, Distance, Pace & Calorie Updater: refreshes the on-screen stopwatch and estimates calories burned using MET values
  function formatClock(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hrs > 0
      ? `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      : `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function estimateCalories(type, seconds) {
    const met = MET_VALUES[type] || 4;
    const weightKg = Number(getData().profile.weight) || 70;
    return Math.round(met * weightKg * (seconds / 3600));
  }
  function updateSessionReadout() {
    $("#session-time").textContent = formatClock(session.elapsed);
    $("#session-distance").textContent = displayDistance(session.distance);
    const paceSeconds =
      session.distance > 0.02 ? session.elapsed / session.distance : 0;
    $("#session-pace").textContent =
      paceSeconds > 0
        ? `${Math.floor(paceSeconds / 60)}:${String(Math.round(paceSeconds % 60)).padStart(2, "0")} /km`
        : "—";
    $("#session-calories").textContent =
      `${estimateCalories($("#activity-type").value, session.elapsed)} kcal`;

    // Update remaining distance if the user is following a planned route
    const planned = routes[chosenRouteIndex];
    const progressEl = document.getElementById("route-live-progress");
    if (planned && progressEl && !progressEl.hidden) {
      const remaining = Math.max(0, planned.distance / 1000 - session.distance);
      progressEl.textContent = `Remaining distance: ${displayDistance(remaining)}`;
    }
  }

  // Record GPS / Simulated Trail Point: adds each new coordinate to the recorded path, adds distance, and moves your live dot on the map
  function recordPoint(point) {
    if (!coordsValid(point)) return;
    if (session.lastPoint) {
      const stepMeters = EF.Routing.distanceMeters(session.lastPoint, point);
      if (stepMeters >= 2 && stepMeters < 500)
        session.distance += stepMeters / 1000;
    }
    session.lastPoint = point;
    session.points.push(point);
    if (map) {
      if (currentMarker) map.removeLayer(currentMarker);
      currentMarker = L.circleMarker(point, {
        radius: 8,
        color: "#fff",
        weight: 3,
        fillColor: "#16a34a",
        fillOpacity: 1,
      }).addTo(map);
      if (session.points.length > 1)
        L.polyline(session.points, { color: "#16a34a", weight: 4 }).addTo(
          routeLayer,
        );
    }
  }

  // Start, Pause, Resume & Finish Workout Controls: manages the stopwatch, real device GPS watch, or simulated movement
  function startSession() {
    if (session.active) return;
    session.active = true;
    session.paused = false;
    session.elapsed = 0;
    session.distance = 0;
    session.points = [];
    session.lastPoint = null;
    session.simulation =
      trackerCategory === "outdoor" && $("#simulation-mode").checked;
    $("#session-start").disabled = true;
    $("#session-pause").disabled = false;
    $("#session-finish").disabled = false;
    $("#session-status").textContent = session.simulation
      ? "Running (simulation mode)"
      : "Session active";

    if (trackerCategory === "outdoor") {
      if (session.simulation) {
        const origin = startPoint || selectedLocation || DEFAULT_CENTER;
        recordPoint(origin);
      } else if (navigator.geolocation) {
        session.watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (!session.paused)
              recordPoint([pos.coords.latitude, pos.coords.longitude]);
          },
          () => {
            $("#session-status").textContent =
              "GPS signal weak — timer still running";
          },
          { enableHighAccuracy: true, maximumAge: 5000 },
        );
      }
    }

    session.timer = window.setInterval(() => {
      if (session.paused) return;
      session.elapsed += 1;
      if (session.simulation && session.lastPoint) {
        const next = [
          session.lastPoint[0] + 0.00003,
          session.lastPoint[1] + 0.000035,
        ];
        recordPoint(next);
      }
      updateSessionReadout();
    }, 1000);
    updateSessionReadout();
  }

  function togglePauseSession() {
    if (!session.active) return;
    session.paused = !session.paused;
    $("#session-pause").textContent = session.paused ? "Resume" : "Pause";
    $("#session-status").textContent = session.paused
      ? "Paused"
      : "Session active";
  }

  function finishSession() {
    if (!session.active) return;
    window.clearInterval(session.timer);
    if (session.watchId != null && navigator.geolocation)
      navigator.geolocation.clearWatch(session.watchId);
    session.active = false;
    session.paused = false;
    session.timer = null;
    session.watchId = null;

    const type = $("#activity-type").value;
    const duration = Math.max(1, session.elapsed);
    const reps = Number($("#session-reps")?.value || 0);
    const sets = Number($("#session-sets")?.value || 0);
    const notes = $("#session-notes").value.trim();

    EF.Store.updateData((data) => {
      data.activities.push({
        id: EF.Store.createId("activity"),
        type,
        category: trackerCategory,
        date: new Date().toISOString(),
        duration,
        distance: Number(session.distance.toFixed(3)),
        calories: estimateCalories(type, duration),
        reps,
        sets,
        notes,
        route: session.points.length > 1 ? session.points : null,
        simulation: session.simulation,
      });
    });

    $("#session-start").disabled = false;
    $("#session-pause").disabled = true;
    $("#session-pause").textContent = "Pause";
    $("#session-finish").disabled = true;
    $("#session-status").textContent = "Saved to History";
    $("#session-notes").value = "";
    EF.ui.toast("Workout saved to your History!");
  }

  // ==========================================
  // EVENT LISTENERS AND INITIALIZATION
  // ==========================================
  // Connect All Buttons & Startup: wires up map search, route buttons, category tabs, and session controls on page load
  $("#search-place").addEventListener("click", searchPlace);
  $("#place-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchPlace();
    }
  });
  $("#my-location").addEventListener("click", locateUser);
  $("#get-route").addEventListener("click", getRoute);
  $("#swap-points").addEventListener("click", () => {
    [startPoint, endPoint] = [endPoint, startPoint];
    [startLabel, endLabel] = [endLabel, startLabel];
    updatePointMarkers();
  });
  $("#clear-route").addEventListener("click", () => {
    startPoint = null;
    endPoint = null;
    startLabel = "";
    endLabel = "";
    routes = [];
    chosenRouteIndex = 0;
    routeWeatherData = [];
    updatePointMarkers();
    removeRouteLayers();
    $("#route-summary").innerHTML =
      '<p class="small muted">Select two points on the map and click Get route.</p>';
    $("#route-instructions").innerHTML = "";
    $("#route-weather").innerHTML =
      '<p class="small muted">Plan a route to check forecast conditions along the path.</p>';
  });

  document
    .querySelectorAll("[data-category]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        setCategory(button.dataset.category),
      ),
    );
  $("#session-start").addEventListener("click", startSession);
  $("#session-pause").addEventListener("click", togglePauseSession);
  $("#session-finish").addEventListener("click", finishSession);

  // Startup sequence: build the map, load the user's preferred workout type, show saved routes, and load last location weather
  initMap();
  setCategory("outdoor");
  const defaultAct = getData().settings.defaultActivity;
  if (defaultAct) {
    const foundCat = Object.keys(ACTIVITY_OPTIONS).find((cat) =>
      ACTIVITY_OPTIONS[cat].includes(defaultAct),
    );
    if (foundCat) {
      setCategory(foundCat);
      $("#activity-type").value = defaultAct;
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
