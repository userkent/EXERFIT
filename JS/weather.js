/*
- PURPOSE:
- OpenWeather current conditions and five-day/three-hour forecast requests,
- ten-minute session cache, local-time formatting, and weather recommendations.
 */
(function () {
  "use strict";

  // Setup & API Configuration: sets up the main app object, OpenWeather web address, and 10-minute memory timer
  const EF = (window.ExerFit = window.ExerFit || {});
  const BASE =
    window.ExerFitConfig?.weatherBaseUrl ||
    "https://api.openweathermap.org/data/2.5";
  const CACHE_MINUTES = 10;
  const cacheKey = (lat, lon) =>
    `exerfit_weather_${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;

  // API Key & Unit Readers: grabs your saved OpenWeather key and checks whether you prefer Celsius (metric) or Fahrenheit (imperial)
  function apiKey() {
    return (
      EF.Store?.getData()?.settings?.apiKey?.trim() ||
      window.ExerFitLocalConfig?.openWeatherApiKey ||
      ""
    );
  }
  function units() {
    return EF.Store?.getData()?.settings?.temperatureUnit === "F"
      ? "imperial"
      : "metric";
  }

  // Temporary Weather Memory (Cache): saves weather results for 10 minutes so the app doesn't waste API calls on the same spot
  function readCache(lat, lon, includeExpired = false) {
    try {
      const value = JSON.parse(
        sessionStorage.getItem(cacheKey(lat, lon)) || "null",
      );
      // Make sure the saved weather matches your current Celsius/Fahrenheit setting before reusing it
      const sameUnits = value && value.unitSystem === units();
      const fresh =
        value && Date.now() - value.savedAt < CACHE_MINUTES * 60 * 1000;
      if (sameUnits && (fresh || includeExpired))
        return { ...value.data, cacheSavedAt: value.savedAt };
    } catch (error) {
      console.warn("Weather cache could not be read:", error);
    }
    return null;
  }
  function writeCache(lat, lon, data) {
    try {
      sessionStorage.setItem(
        cacheKey(lat, lon),
        JSON.stringify({ savedAt: Date.now(), unitSystem: units(), data }),
      );
    } catch (error) {
      console.warn("Weather cache could not be saved:", error);
    }
  }

  // Friendly Error Translator: turns technical server error codes (like 401 or 429) into plain-English help messages
  function errorMessage(status, offline = false) {
    if (offline || !navigator.onLine)
      return "You appear to be offline. Check your connection and retry.";
    if (status === 401)
      return "The API key is invalid or still activating. Check the key in Settings.";
    if (status === 404) return "Weather data was not found for this location.";
    if (status === 429)
      return "The weather request limit was reached. Try again in a little while.";
    if (status === 408)
      return "The weather request took too long. Please retry.";
    return "Weather is temporarily unavailable. Please retry.";
  }

  // Safe Web Request Helper: calls the OpenWeather website and catches network drops or timeouts without crashing the page
  async function safeRequest(url, key, signal) {
    try {
      const response = await fetch(url, {
        signal,
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok)
        return {
          ok: false,
          status: response.status,
          error: errorMessage(response.status),
          body,
        };
      return { ok: true, data: body };
    } catch (error) {
      const timeout = error.name === "AbortError";
      return {
        ok: false,
        status: timeout ? 408 : 0,
        error: errorMessage(0, !navigator.onLine),
        body: null,
      };
    }
  }

  // Main Weather Fetcher: downloads both "Current Weather" and "5-Day Forecast" at once, falling back to saved data if offline
  async function fetchBundle(lat, lon, customKey) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    const key = (customKey || apiKey()).trim();
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return {
        current: null,
        forecast: null,
        errors: {
          current: "Selected coordinates are not valid.",
          forecast: "Selected coordinates are not valid.",
        },
      };
    }
    if (!key) {
      const cached = readCache(latitude, longitude, true);
      if (cached)
        return {
          ...cached,
          savedData: true,
          savedDataCurrent: true,
          savedDataForecast: true,
          errors: {
            current:
              "No API key is saved. Showing the most recent cached weather.",
            forecast:
              "No API key is saved. Showing the most recent cached forecast.",
          },
        };
      return {
        current: null,
        forecast: null,
        errors: {
          current:
            "Add an OpenWeather API key in Settings to load live weather.",
          forecast:
            "Add an OpenWeather API key in Settings to load the forecast.",
        },
      };
    }

    // Request current weather and forecast together with an 8-second timeout limit
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const params = `lat=${latitude}&lon=${longitude}&units=${units()}&appid=${encodeURIComponent(key)}`;
    const [currentResult, forecastResult] = await Promise.all([
      safeRequest(`${BASE}/weather?${params}`, key, controller.signal),
      safeRequest(`${BASE}/forecast?${params}`, key, controller.signal),
    ]);
    clearTimeout(timer);

    const result = {
      current: currentResult.ok ? currentResult.data : null,
      forecast: forecastResult.ok ? forecastResult.data : null,
      errors: {
        current: currentResult.ok ? "" : currentResult.error,
        forecast: forecastResult.ok ? "" : forecastResult.error,
      },
    };

    // Save fresh results to cache, or fill in any missing piece with older cached data
    if (result.current || result.forecast) {
      const previous = readCache(latitude, longitude, true) || {};
      const savedDataCurrent = !result.current && Boolean(previous.current);
      const savedDataForecast = !result.forecast && Boolean(previous.forecast);
      const merged = {
        ...previous,
        ...result,
        cachedAt: Date.now(),
        savedDataCurrent,
        savedDataForecast,
        savedData: savedDataCurrent || savedDataForecast,
      };
      if (savedDataCurrent) merged.current = previous.current;
      if (savedDataForecast) merged.forecast = previous.forecast;
      writeCache(latitude, longitude, merged);
      return merged;
    }
    const cached = readCache(latitude, longitude, true);
    return cached
      ? {
          ...cached,
          savedData: true,
          savedDataCurrent: Boolean(cached.current),
          savedDataForecast: Boolean(cached.forecast),
          errors: result.errors,
        }
      : result;
  }

  // Forecast-Only Fetcher: checks the weather forecast for a single checkpoint along a planned route
  async function fetchForecast(lat, lon) {
    const latitude = Number(lat);
    const longitude = Number(lon);
    const key = apiKey();
    const cached = readCache(latitude, longitude);
    if (cached?.forecast)
      return { ok: true, data: cached.forecast, cached: true };
    const stale = readCache(latitude, longitude, true);
    if (!key)
      return stale?.forecast
        ? { ok: true, data: stale.forecast, cached: true, savedData: true }
        : { ok: false, error: "Weather key not set", data: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const result = await safeRequest(
      `${BASE}/forecast?lat=${latitude}&lon=${longitude}&units=${units()}&appid=${encodeURIComponent(key)}`,
      key,
      controller.signal,
    );
    clearTimeout(timer);
    if (result.ok) {
      const previous = readCache(latitude, longitude, true) || {};
      writeCache(latitude, longitude, {
        ...previous,
        forecast: result.data,
        cachedAt: Date.now(),
      });
      return { ok: true, data: result.data, cached: false };
    }
    if (stale?.forecast)
      return {
        ok: true,
        data: stale.forecast,
        cached: true,
        savedData: true,
        warning: result.error,
      };
    return { ok: false, error: result.error, data: null };
  }

  // Local Time & Unit Converters: adjusts timestamps to the chosen city's local timezone and converts °F/mph to °C/m/s for safety checks
  function localDate(epoch, offset = 0) {
    return new Date((Number(epoch) + Number(offset || 0)) * 1000);
  }
  function formatLocal(epoch, offset = 0, options = {}) {
    const date = localDate(epoch, offset);
    return new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
  function formatLocalDay(epoch, offset = 0) {
    const date = localDate(epoch, offset);
    return new Intl.DateTimeFormat("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  function temperatureCelsius(value) {
    const temp = Number(value);
    return EF.Store?.getData()?.settings?.temperatureUnit === "F"
      ? ((temp - 32) * 5) / 9
      : temp;
  }
  function windMetersPerSecond(value) {
    const speed = Number(value);
    return EF.Store?.getData()?.settings?.temperatureUnit === "F"
      ? speed * 0.44704
      : speed;
  }

  // Smart Workout Weather Advisor: finds the best upcoming time slot (15–28°C, low rain/wind) and gives safety tips for your workout
  function bestActivitySlot(forecast) {
    const slots = forecast?.list || [];
    return (
      slots.find((slot) => {
        const temp = temperatureCelsius(slot.main?.temp);
        const wind = windMetersPerSecond(slot.wind?.speed ?? 99);
        const pop = (slot.pop ?? 0) * 100;
        const condition = (slot.weather?.[0]?.main || "").toLowerCase();
        return (
          temp >= 15 &&
          temp <= 28 &&
          pop < 30 &&
          wind < 8 &&
          !condition.includes("thunder")
        );
      }) || null
    );
  }
  function adviceForActivity(category, weather) {
    const condition = (weather?.weather?.[0]?.main || "").toLowerCase();
    const temp = temperatureCelsius(weather?.main?.temp);
    const wind = windMetersPerSecond(weather?.wind?.speed || 0);
    if (["indoor", "bodyweight", "gym", "mind"].includes(category))
      return "Indoor activity: choose a comfortable space, keep water nearby, and adjust the session to how you feel.";
    if (
      condition.includes("thunder") ||
      (weather?.rain?.["1h"] || 0) > 0 ||
      condition.includes("rain")
    )
      return "Rain is possible. Consider a covered route or an indoor session.";
    if (wind > 8)
      return "Wind is elevated. Choose a sheltered route and allow extra time.";
    if (temp > 32)
      return "It is very warm. Consider a cooler time or an indoor activity.";
    if (temp < 10)
      return "It is cool outside. Dress in comfortable layers and choose a familiar route.";
    return "Conditions look generally suitable. Choose a comfortable pace and route.";
  }

  // Share Tools: makes all weather fetching, time formatting, and advice helpers available to Home, Tracker, and Settings
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
