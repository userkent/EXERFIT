/* FILE PURPOSE: Handles weather lookup, weather cards, and weather API settings. */
/* =========================================================
   FILE: weather.js
   PURPOSE: Retrieves current weather and a short forecast from
   OpenWeatherMap using the key saved by the signed-in user.
   API keys in browser storage are visible to the browser owner;
   use a backend proxy and server-side secret for production.
========================================================= */
import { WEATHER_URL } from './config.js';
import { getWeatherKey, saveWeatherKey } from './storage.js';
import { showToast, escapeHTML, refreshIcons } from './ui.js';

let lastPosition = null;
let cache = null;
let cacheTime = 0;

const iconFor = main => ({ Clear: 'sun', Clouds: 'cloud', Rain: 'cloud-rain', Drizzle: 'cloud-drizzle', Thunderstorm: 'cloud-lightning', Snow: 'snowflake', Mist: 'cloud-fog', Fog: 'cloud-fog', Haze: 'cloud-fog' }[main] || 'cloud-sun');

export function setWeatherPosition(lat, lon) {
  lastPosition = { lat, lon };
  if (getWeatherKey()) fetchWeather(lat, lon).catch(error => showToast(error.message, 'warning'));
}
export async function fetchWeather(lat, lon, force = false) {
  const key = getWeatherKey();
  if (!key) { renderNoWeatherKey(); return null; }
  const samePlace = cache && Math.abs(cache.lat - lat) < .02 && Math.abs(cache.lon - lon) < .02;
  if (!force && samePlace && Date.now() - cacheTime < 10 * 60 * 1000) return cache;
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), appid: key, units: 'metric' });
  const [currentResponse, forecastResponse] = await Promise.all([
    fetch(`${WEATHER_URL}?${params}`),
    fetch(`https://api.openweathermap.org/data/2.5/forecast?${params}`)
  ]);
  if (!currentResponse.ok) {
    if (currentResponse.status === 401) throw new Error('OpenWeatherMap rejected this API key. Check that it is active and copied correctly.');
    throw new Error(`Weather request failed (${currentResponse.status}).`);
  }
  const current = await currentResponse.json();
  const forecast = forecastResponse.ok ? await forecastResponse.json() : null;
  const nextForecast = forecast?.list?.[0] || null;
  cache = { lat, lon, current, nextForecast, forecastAvailable: Boolean(forecast) };
  cacheTime = Date.now();
  renderWeather(cache);
  return cache;
}
function renderNoWeatherKey() {
  const header = document.getElementById('header-weather');
  if (header) header.innerHTML = '<span class="weather-loading-dot"></span><span>Set weather API key</span>';
  document.getElementById('map-weather-card')?.classList.add('is-hidden');
}
function renderWeather(data) {
  const current = data.current;
  const description = current.weather?.[0]?.description || 'Current conditions';
  const temp = Math.round(current.main?.temp ?? 0);
  const header = document.getElementById('header-weather');
  if (header) header.innerHTML = `<i data-lucide="${iconFor(current.weather?.[0]?.main)}"></i><span>${temp}°C · ${escapeHTML(description)}</span>`;
  const card = document.getElementById('map-weather-card');
  card?.classList.remove('is-hidden');
  const icon = document.getElementById('weather-icon');
  if (icon) { icon.innerHTML = `<i data-lucide="${iconFor(current.weather?.[0]?.main)}"></i>`; refreshIcons(icon); }
  const tempNode = document.getElementById('weather-temp'); if (tempNode) tempNode.textContent = `${temp}°`;
  const conditionNode = document.getElementById('weather-condition'); if (conditionNode) conditionNode.textContent = description;
  refreshIcons(header || document);
}

export function mountWeatherSettings(container) {
  const key = getWeatherKey();
  container.innerHTML = `
    <p class="panel-intro">Connect your own OpenWeatherMap key to see current conditions and the next forecast period. The app does not use fabricated weather data.</p>
    <section class="panel-section"><div class="panel-section-title"><span>Weather service</span><small>${key ? 'Key saved in this browser' : 'Not connected'}</small></div>
      <div class="form-field"><label for="weather-api-key">OpenWeatherMap API key</label><div class="form-inline"><input class="modal-form-input" style="flex:1" id="weather-api-key" type="password" autocomplete="off" placeholder="Paste your API key" value="${escapeHTML(key)}"><button class="icon-button" id="weather-key-toggle" type="button" aria-label="Show API key"><i data-lucide="eye"></i></button></div></div>
      <div class="activity-controls"><button class="button button-primary" id="weather-key-save" type="button"><i data-lucide="save"></i> Save key</button><button class="button button-secondary" id="weather-key-remove" type="button"><i data-lucide="trash-2"></i> Remove</button></div>
      <p class="settings-note" id="weather-settings-message">${key ? 'A key is saved. Use Refresh weather to test it with your current location.' : 'Create a key in your OpenWeatherMap account, then paste it above.'}</p>
      <a class="text-link" href="https://home.openweathermap.org/api_keys" target="_blank" rel="noreferrer">Get an API key <i data-lucide="external-link"></i></a>
    </section>
    <section class="panel-section"><div class="panel-section-title"><span>Conditions</span><small>Current GPS position</small></div><button class="button button-secondary" id="weather-refresh" type="button" style="width:100%"><i data-lucide="refresh-cw"></i> Refresh weather</button><div id="weather-details" class="settings-note">${cache ? 'Weather data is available.' : 'Weather details will appear here after a successful request.'}</div></section>
    <p class="map-attribution-note"><i data-lucide="shield-alert"></i> The API key is stored in localStorage and is not secure against inspection. Do not reuse a sensitive credential. Production apps should call weather services through a backend proxy.</p>`;
  container.dataset.panel = 'settings';
  refreshIcons(container);
  container.querySelector('#weather-key-toggle').addEventListener('click', event => {
    const input = container.querySelector('#weather-api-key'); const visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
    event.currentTarget.innerHTML = `<i data-lucide="${visible ? 'eye-off' : 'eye'}"></i>`; refreshIcons(event.currentTarget);
  });
  container.querySelector('#weather-key-save').addEventListener('click', async () => {
    const value = container.querySelector('#weather-api-key').value.trim();
    if (!value) { showToast('Paste your OpenWeatherMap API key first.', 'warning'); return; }
    saveWeatherKey(value);
    const message = container.querySelector('#weather-settings-message'); message.textContent = 'Key saved. Testing the connection…';
    if (lastPosition) {
      try { await fetchWeather(lastPosition.lat, lastPosition.lon, true); message.textContent = 'Weather connection successful.'; showToast('Weather API connected.', 'success'); }
      catch (error) { message.textContent = error.message; showToast(error.message, 'error', 5000); }
    } else { message.textContent = 'Key saved. Use Locate Me on the map, then refresh weather.'; showToast('Weather key saved in this browser.', 'success'); }
  });
  container.querySelector('#weather-key-remove').addEventListener('click', () => {
    saveWeatherKey(''); cache = null; renderNoWeatherKey(); mountWeatherSettings(container); showToast('Weather API key removed.', 'info');
  });
  container.querySelector('#weather-refresh').addEventListener('click', async () => {
    const message = container.querySelector('#weather-settings-message');
    if (!lastPosition) { showToast('Use Locate Me to get your current location first.', 'warning'); return; }
    try { await fetchWeather(lastPosition.lat, lastPosition.lon, true); message.textContent = 'Weather updated successfully.'; renderWeatherDetails(container); }
    catch (error) { message.textContent = error.message; showToast(error.message, 'error', 5000); }
  });
  renderWeatherDetails(container);
}
function renderWeatherDetails(container) {
  const target = container.querySelector('#weather-details');
  if (!target || !cache) return;
  const current = cache.current;
  const warnings = [];
  if (['Rain','Thunderstorm','Drizzle'].includes(current.weather?.[0]?.main)) warnings.push('Rain is currently reported. Consider a sheltered or indoor session.');
  if ((current.wind?.speed || 0) >= 10) warnings.push('Strong wind is currently reported. Check local conditions before heading out.');
  if (cache.nextForecast && ['Rain','Thunderstorm','Drizzle'].includes(cache.nextForecast.weather?.[0]?.main)) warnings.push('Rain appears in the next forecast period.');
  target.innerHTML = `<div class="metric-grid" style="margin-top:12px"><div class="metric-card"><small>Temperature</small><strong>${Math.round(current.main.temp)}°C</strong></div><div class="metric-card"><small>Wind</small><strong>${Number(current.wind?.speed || 0).toFixed(1)} m/s</strong></div><div class="metric-card"><small>Humidity</small><strong>${current.main.humidity}%</strong></div><div class="metric-card"><small>Feels like</small><strong>${Math.round(current.main.feels_like)}°C</strong></div></div><p>${escapeHTML(current.weather?.[0]?.description || '')}</p>${cache.nextForecast ? `<p>Next forecast: ${new Date(cache.nextForecast.dt * 1000).toLocaleString()} · ${Math.round(cache.nextForecast.main.temp)}°C · ${escapeHTML(cache.nextForecast.weather?.[0]?.description || '')}</p>` : '<p>Forecast data is currently unavailable for this key.</p>'}${warnings.length ? `<div class="route-guidance warning"><i data-lucide="alert-triangle"></i><div><strong>Weather awareness</strong><small>${warnings.map(escapeHTML).join('<br>')}</small></div></div>` : '<p class="settings-note">No rain or strong-wind warning was detected in the returned current conditions and next forecast period.</p>'}`;
  refreshIcons(target);
}
