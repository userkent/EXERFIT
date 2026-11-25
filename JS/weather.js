/*
 * PURPOSE:
 * OpenWeather current conditions and five-day/three-hour forecasts,
 * ten-minute session cache, local-time formatting, and outdoor workout advice.
 */
(function () {
  "use strict";

  const EF = (window.ExerFit = window.ExerFit || {});
  const BASE = (window.ExerFitConfig?.weatherBaseUrl || "https://api.openweathermap.org/data/2.5").replace(/\/$/, "");
  const CACHE_MINUTES = 10;
  const cacheKey = (lat, lon) => `exerfit_openweather_${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;

  function apiKey() {
    return EF.Store?.getData()?.settings?.apiKey?.trim() || window.ExerFitLocalConfig?.openWeatherApiKey || "";
  }
  function units() {
    return EF.Store?.getData()?.settings?.temperatureUnit === "F" ? "imperial" : "metric";
  }

  function readCache(lat, lon) {
    try {
      const value = JSON.parse(sessionStorage.getItem(cacheKey(lat, lon)) || "null");
      const sameUnits = value && value.unitSystem === units();
      const fresh = value && Date.now() - value.savedAt < CACHE_MINUTES * 60 * 1000;
      if (sameUnits && fresh) return { ...value.data, cached: true, cacheSavedAt: value.savedAt };
    } catch (error) {
      console.warn("OpenWeather cache could not be read:", error);
    }
    return null;
  }
  function writeCache(lat, lon, data) {
    try {
      sessionStorage.setItem(cacheKey(lat, lon), JSON.stringify({ savedAt: Date.now(), unitSystem: units(), data }));
    } catch (error) {
      console.warn("OpenWeather cache could not be saved:", error);
    }
  }

  function errorMessage(status, apiMessage = "", offline = false) {
    if (offline || !navigator.onLine) return "You appear to be offline. Check your connection and retry.";
    if (status === 401) return "OpenWeather rejected this API key. Check the key in Settings. Newly created keys may take a little time to activate.";
    if (status === 403) return "This OpenWeather service is not enabled for the API key. Check your OpenWeather account plan and API access.";
    if (status === 404) return "OpenWeather could not find weather data for this location.";
    if (status === 429) return "The OpenWeather request limit was reached. Try again in a little while.";
    if (status === 400) return "OpenWeather could not read the location coordinates.";
    if (status === 408) return "The weather request took too long. Please retry.";
    return apiMessage ? `OpenWeather: ${apiMessage}` : "OpenWeather is temporarily unavailable. Please retry.";
  }

  async function safeRequest(url, signal) {
    try {
      const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { ok: false, status: response.status, error: errorMessage(response.status, body.message || "") , body };
      return { ok: true, data: body };
    } catch (error) {
      const timeout = error.name === "AbortError";
      return { ok: false, status: timeout ? 408 : 0, error: errorMessage(timeout ? 408 : 0, "", !navigator.onLine), body: null };
    }
  }

  function buildUrl(endpoint, lat, lon, key) {
    const params = new URLSearchParams({
      lat: String(Number(lat)),
      lon: String(Number(lon)),
      appid: key,
      units: units(),
    });
    return `${BASE}/${endpoint}?${params.toString()}`;
  }

  async function fetchBundle(lat, lon, options = {}) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      const message = "Selected coordinates are not valid.";
      return { current: null, forecast: null, errors: { current: message, forecast: message }, source: "OpenWeather" };
    }

    if (!options.force) {
      const cached = readCache(latitude, longitude);
      if (cached) return cached;
    }

    const key = apiKey();
    if (!key) {
      const message = "Add your OpenWeather API key in Settings to load current conditions and forecasts.";
      return { current: null, forecast: null, errors: { current: message, forecast: message }, source: "OpenWeather" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const [currentResult, forecastResult] = await Promise.all([
        safeRequest(buildUrl("weather", latitude, longitude, key), controller.signal),
        safeRequest(buildUrl("forecast", latitude, longitude, key), controller.signal),
      ]);

      const current = currentResult.ok ? currentResult.data : null;
      const forecast = forecastResult.ok ? forecastResult.data : null;
      const timezoneOffset = current?.timezone ?? forecast?.city?.timezone ?? 0;
      const result = {
        current,
        forecast,
        timezoneOffset,
        errors: {
          current: currentResult.ok ? "" : currentResult.error,
          forecast: forecastResult.ok ? "" : forecastResult.error,
        },
        fetchedAt: Date.now(),
        source: "OpenWeather",
        cached: false,
      };
      if (current && forecast) writeCache(latitude, longitude, result);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchForecast(lat, lon, options = {}) {
    const result = await fetchBundle(lat, lon, options);
    return result.forecast
      ? { ok: true, data: result.forecast, cached: Boolean(result.cached) }
      : { ok: false, error: result.errors?.forecast || "Forecast unavailable", data: null };
  }

  function localDate(epoch, offset = 0) {
    return new Date((Number(epoch) + Number(offset || 0)) * 1000);
  }
  function formatLocal(epoch, offset = 0, options = {}) {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", ...options, timeZone: "UTC" }).format(localDate(epoch, offset));
  }
  function formatLocalDay(epoch, offset = 0) {
    return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(localDate(epoch, offset));
  }
  function temperatureCelsius(value) {
    const temp = Number(value);
    return EF.Store?.getData()?.settings?.temperatureUnit === "F" ? ((temp - 32) * 5) / 9 : temp;
  }
  function windMetersPerSecond(value) {
    const speed = Number(value);
    return EF.Store?.getData()?.settings?.temperatureUnit === "F" ? speed * 0.44704 : speed;
  }

  function bestActivitySlot(forecast) {
    const slots = forecast?.list || [];
    return slots.find((slot) => {
      const temp = temperatureCelsius(slot.main?.temp);
      const wind = windMetersPerSecond(slot.wind?.speed ?? 99);
      const pop = (slot.pop ?? 0) * 100;
      const condition = (slot.weather?.[0]?.main || "").toLowerCase();
      return temp >= 15 && temp <= 28 && pop < 30 && wind < 8 && !condition.includes("thunder");
    }) || null;
  }
  function adviceForActivity(category, weather, forecast) {
    const condition = (weather?.weather?.[0]?.main || "").toLowerCase();
    const temp = temperatureCelsius(weather?.main?.temp);
    const wind = windMetersPerSecond(weather?.wind?.speed || 0);
    if (["indoor", "bodyweight", "gym", "mind"].includes(category)) return "Indoor activity: choose a comfortable space, keep water nearby, and adjust the session to how you feel.";
    const nextRain = Math.max(0, ...(forecast?.list || []).slice(0, 4).map((slot) => (slot.pop || 0) * 100));
    if (condition.includes("thunder") || (weather?.rain?.["1h"] || 0) > 0 || condition.includes("rain") || nextRain >= 50) {
      return `Rain risk is elevated${nextRain ? ` (up to ${Math.round(nextRain)}% in the next hours)` : ""}. Consider delaying your run, choosing a covered route, or switching indoors.`;
    }
    if (wind > 8) return "Wind is elevated. Choose a sheltered route and allow extra time.";
    if (temp > 32) return "It is very warm. Consider a cooler time or an indoor activity.";
    if (temp < 10) return "It is cool outside. Dress in comfortable layers and choose a familiar route.";
    return "Conditions look generally suitable. Choose a comfortable pace and route.";
  }

  EF.Weather = {
    apiKey,
    fetchBundle,
    fetchForecast,
    localDate,
    formatLocal,
    formatLocalDay,
    bestActivitySlot,
    adviceForActivity,
    temperatureCelsius,
    windMetersPerSecond,
    cacheKey,
  };
})();
