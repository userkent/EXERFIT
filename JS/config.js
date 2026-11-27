/* FILE PURPOSE: Stores service configuration used by the ExerFit prototype. */
/* =========================================================
   FILE: config.js
   PURPOSE: Central place for application names and service URLs.
   MODIFY HERE: Change tile or API endpoints in one place.
========================================================= */
export const APP_NAME = "ExerFit";
export const STORAGE_PREFIX = "exerfit";
export const DEFAULT_MAP_CENTER = [12.8797, 121.774]; // Philippines overview; use Locate Me for your live position.
export const DEFAULT_MAP_ZOOM = 6;
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const ROUTING_HOSTS = {
  walking: "https://routing.openstreetmap.de/routed-foot",
  cycling: "https://routing.openstreetmap.de/routed-bike",
  driving: "https://routing.openstreetmap.de/routed-car",
};
export const WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
export const TILE_PROVIDERS = {
  standard: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxNativeZoom: 19,
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
  },
  satellite: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 18,
    maxZoom: 20,
    attribution:
      'Sources: <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community',
  },
  // Transparent label layer for place names and geographic boundaries on satellite imagery.
  hybridLabels: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 19,
    maxZoom: 20,
    attribution: "Labels &copy; Esri, HERE, Garmin, USGS, EPA, NPS",
  },
  // Transparent road and transportation overlay for highways, roads, and transport labels.
  hybridTransportation: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 19,
    maxZoom: 20,
    attribution: "Transportation labels &copy; Esri, HERE, Garmin, USGS",
  },
};
