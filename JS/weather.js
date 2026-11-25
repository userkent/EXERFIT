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
  function weatherDescription(code) {
    if (code === 0) return "Clear sky";
    if ([1,2,3].includes(code)) return "Partly cloudy";
    if ([45,48].includes(code)) return "Fog";
    if ([51,53,55,56,57].includes(code)) return "Drizzle";
    if ([61,63,65,66,67,80,81,82].includes(code)) return "Rain";
    if ([71,73,75,77,85,86].includes(code)) return "Snow";
    if ([95,96,99].includes(code)) return "Thunderstorm";
    return "Variable conditions";
  }
  function toEpoch(iso) { return Math.floor(new Date(iso).getTime() / 1000); }
  function normalizeOpenMeteo(raw) {
    const c = raw.current || {}, h = raw.hourly || {}, d = raw.daily || {};
    const current = {
      name: "Selected location", dt: toEpoch(c.time), timezone: raw.timezone, timezone_offset: raw.utc_offset_seconds || 0,
      main: { temp: c.temperature_2m, feels_like: c.apparent_temperature, humidity: c.relative_humidity_2m },
      wind: { speed: (c.wind_speed_10m || 0) / 3.6 }, clouds: { all: c.cloud_cover },
      rain: { "1h": (c.precipitation || 0) }, weather: [{ main: weatherDescription(c.weather_code), description: weatherDescription(c.weather_code).toLowerCase() }],
      sys: { sunrise: d.sunrise?.[0] ? toEpoch(d.sunrise[0]) : 0, sunset: d.sunset?.[0] ? toEpoch(d.sunset[0]) : 0 }
    };
    const list = [];
    for (let i = 0; i < (h.time || []).length; i += 3) {
      list.push({ dt: toEpoch(h.time[i]), main: { temp: h.temperature_2m?.[i], feels_like: h.apparent_temperature?.[i], humidity: h.relative_humidity_2m?.[i] },
        wind: { speed: (h.wind_speed_10m?.[i] || 0) / 3.6 }, clouds: { all: h.cloud_cover?.[i] }, pop: (h.precipitation_probability?.[i] || 0) / 100,
        rain: { "3h": h.precipitation?.[i] || 0 }, weather: [{ main: weatherDescription(h.weather_code?.[i]), description: weatherDescription(h.weather_code?.[i]).toLowerCase() }] });
    }
    const daily = (d.time || []).map((day, i) => ({ dt: toEpoch(day), temp: { min: d.temperature_2m_min?.[i], max: d.temperature_2m_max?.[i] },
      pop: (d.precipitation_probability_max?.[i] || 0) / 100, weather: [{ main: weatherDescription(d.weather_code?.[i]) }] }));
    return { current, forecast: { list, daily }, timezoneOffset: raw.utc_offset_seconds || 0 };
  }
  async function fetchOpenMeteo(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(lat)}&longitude=${Number(lon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,cloud_cover&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&forecast_days=5&timezone=auto`;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    try { const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(`Weather service returned ${response.status}`); return normalizeOpenMeteo(await response.json()); }
    finally { clearTimeout(timer); }
  }
  async function fetchBundle(lat, lon) {
    const latitude = Number(lat), longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180)
      return { current:null, forecast:null, errors:{ current:"Selected coordinates are not valid.", forecast:"Selected coordinates are not valid." } };
    try {
      const data = await fetchOpenMeteo(latitude, longitude);
      return { ...data, errors:{ current:"", forecast:"" }, fetchedAt:Date.now(), source:"Open-Meteo forecast" };
    } catch (error) {
      return { current:null, forecast:null, errors:{ current:"Weather is temporarily unavailable. Check your connection and refresh.", forecast:error.message || "Forecast unavailable." } };
    }
  }
  async function fetchForecast(lat, lon) {
    const result = await fetchBundle(lat, lon);
    return result.forecast ? { ok:true, data:result.forecast, cached:false } : { ok:false, error:result.errors?.forecast || "Forecast unavailable", data:null };
  }
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
  function adviceForActivity(category, weather, forecast) {
    const condition = (weather?.weather?.[0]?.main || "").toLowerCase();
    const temp = temperatureCelsius(weather?.main?.temp);
    const wind = windMetersPerSecond(weather?.wind?.speed || 0);
    if (["indoor", "bodyweight", "gym", "mind"].includes(category))
      return "Indoor activity: choose a comfortable space, keep water nearby, and adjust the session to how you feel.";
    const nextRain = Math.max(0, ...(forecast?.list || []).slice(0, 4).map((slot) => (slot.pop || 0) * 100));
    if (condition.includes("thunder") || (weather?.rain?.["1h"] || 0) > 0 || condition.includes("rain") || nextRain >= 50)
      return `Rain risk is elevated${nextRain ? ` (up to ${Math.round(nextRain)}% in the next hours)` : ""}. Consider delaying your run, choosing a covered route, or switching indoors.`;
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
