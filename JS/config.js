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
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
  },
  dark: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a> &mdash; Sources: Esri, HERE, Garmin, USGS, EPA, NPS',
  },
  satellite: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution:
      'Sources: <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>, DigitalGlobe, GeoEye, i-cubed, USDA FSA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community',
  },
  hybridLabels: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    attribution: "Labels &copy; Esri",
  },
};
