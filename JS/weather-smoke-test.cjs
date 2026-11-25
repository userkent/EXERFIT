const fs = require('fs');
const vm = require('vm');
const path = require('path');

const saved = new Map();
const settings = { apiKey: 'test-openweather-key', temperatureUnit: 'C' };
const store = { getData: () => ({ settings }) };
const currentPayload = {
  coord: { lon: 121, lat: 14.6 },
  weather: [{ id: 500, main: 'Rain', description: 'light rain', icon: '10d' }],
  main: { temp: 27.3, feels_like: 30, humidity: 80, pressure: 1008 },
  wind: { speed: 2.5, deg: 180 },
  clouds: { all: 90 },
  rain: { '1h': 0.2 },
  dt: 1795651200,
  sys: { sunrise: 1795629900, sunset: 1795672200 },
  timezone: 28800,
  name: 'Manila',
};
const forecastPayload = {
  city: { name: 'Manila', timezone: 28800 },
  list: [
    { dt: 1795651200, main: { temp: 27, feels_like: 30, humidity: 80 }, wind: { speed: 2 }, clouds: { all: 80 }, pop: 0.2, weather: [{ main: 'Clouds', description: 'scattered clouds' }] },
    { dt: 1795662000, main: { temp: 28, feels_like: 31, humidity: 82 }, wind: { speed: 2.5 }, clouds: { all: 90 }, pop: 0.75, rain: { '3h': 1.2 }, weather: [{ main: 'Rain', description: 'light rain' }] },
    { dt: 1795672800, main: { temp: 29, feels_like: 32, humidity: 85 }, wind: { speed: 3 }, clouds: { all: 95 }, pop: 0.65, weather: [{ main: 'Rain', description: 'moderate rain' }] },
  ],
};
const requestedUrls = [];
const context = {
  window: { ExerFit: { Store: store }, ExerFitConfig: { weatherBaseUrl: 'https://api.openweathermap.org/data/2.5' } },
  sessionStorage: {
    get length() { return saved.size; },
    key: (index) => Array.from(saved.keys())[index] || null,
    getItem: (key) => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  },
  navigator: { onLine: true },
  fetch: async (url) => {
    requestedUrls.push(String(url));
    const isCurrent = String(url).includes('/weather?');
    const payload = isCurrent ? currentPayload : forecastPayload;
    return { ok: true, status: 200, json: async () => payload };
  },
  URLSearchParams, Date, Intl, Math, Number, String, Boolean, Array, Object,
  AbortController, console, setTimeout, clearTimeout,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'JS', 'weather.js'), 'utf8'), context);

(async () => {
  const weather = context.window.ExerFit.Weather;
  const bundle = await weather.fetchBundle(14.6, 121, { force: true });
  if (!bundle.current || !bundle.forecast || !bundle.forecast.list.length) throw new Error('OpenWeather bundle did not return current conditions and a forecast');
  if (bundle.current.name !== 'Manila' || bundle.current.weather[0].main !== 'Rain') throw new Error('OpenWeather current response was not passed through correctly');
  if (bundle.timezoneOffset !== 28800) throw new Error('OpenWeather timezone offset was not retained');
  if (requestedUrls.length !== 2) throw new Error(`Expected two API requests, received ${requestedUrls.length}`);
  if (!requestedUrls.every((url) => url.includes('appid=test-openweather-key') && url.includes('units=metric'))) throw new Error('OpenWeather API key or metric units missing from request');
  const advice = weather.adviceForActivity('outdoor', bundle.current, bundle.forecast);
  if (!advice.toLowerCase().includes('rain risk')) throw new Error('Rain-aware outdoor advice was not generated');
  const second = await weather.fetchBundle(14.6, 121);
  if (!second.cached || requestedUrls.length !== 2) throw new Error('Ten-minute cache did not reuse the successful OpenWeather response');

  settings.temperatureUnit = 'F';
  const imperial = await weather.fetchBundle(14.61, 121.01, { force: true });
  if (!imperial.current || !requestedUrls.slice(2).every((url) => url.includes('units=imperial'))) throw new Error('Fahrenheit preference was not sent as imperial units');

  settings.apiKey = '';
  const noKey = await weather.fetchBundle(14.62, 121.02, { force: true });
  if (noKey.current || !noKey.errors.current.toLowerCase().includes('api key')) throw new Error('Missing-key guidance was not returned');

  console.log('OpenWeather current conditions: PASS');
  console.log('OpenWeather five-day / three-hour forecast: PASS (' + bundle.forecast.list.length + ' sample slots)');
  console.log('API key and unit query parameters: PASS');
  console.log('Rain-aware advice: PASS');
  console.log('Ten-minute response cache: PASS');
  console.log('Missing API-key guidance: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
