/* FILE PURPOSE: Validates and normalizes GeoJSON route geometry for Leaflet. */
/*
 * Routing services normally return GeoJSON coordinates as [longitude, latitude].
 * This helper also accepts Feature, FeatureCollection, GeometryCollection,
 * MultiLineString, and point objects used by saved ExerFit GPS tracks.
 */

function isCoordinatePair(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    !Array.isArray(value[0]) &&
    !Array.isArray(value[1]) &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1]))
  );
}

function isCoordinateObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lat = value.lat ?? value.latitude;
  const lon = value.lon ?? value.lng ?? value.longitude;
  return lat !== undefined && lon !== undefined;
}

function collectCoordinateSegments(input) {
  if (!input) return [];

  if (Array.isArray(input)) {
    if (input.length && (isCoordinatePair(input[0]) || isCoordinateObject(input[0]))) {
      return [input];
    }
    return input.flatMap((item) => collectCoordinateSegments(item));
  }

  if (typeof input !== "object") return [];

  switch (input.type) {
    case "Feature":
      return collectCoordinateSegments(input.geometry);
    case "FeatureCollection":
      return (input.features || []).flatMap(collectCoordinateSegments);
    case "GeometryCollection":
      return (input.geometries || []).flatMap(collectCoordinateSegments);
    case "LineString":
      return collectCoordinateSegments(input.coordinates);
    case "MultiLineString":
      return (input.coordinates || []).flatMap(collectCoordinateSegments);
    default:
      // Support common routing wrappers such as { geometry: ... } and
      // { coordinates: ... } without assuming a specific response envelope.
      if (input.geometry) return collectCoordinateSegments(input.geometry);
      if (input.coordinates) return collectCoordinateSegments(input.coordinates);
      return [];
  }
}

function toGeoJSONPosition(point) {
  let lon;
  let lat;

  if (Array.isArray(point)) {
    // GeoJSON order is longitude first, then latitude.
    lon = Number(point[0]);
    lat = Number(point[1]);
  } else if (isCoordinateObject(point)) {
    lat = Number(point.lat ?? point.latitude);
    lon = Number(point.lon ?? point.lng ?? point.longitude);
  }

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;

  return [lon, lat];
}

/**
 * Returns validated GeoJSON coordinate segments and a flat point list.
 * Separate MultiLineString segments stay separate for map rendering.
 */
export function normalizeRouteGeometry(input) {
  const segments = collectCoordinateSegments(input)
    .map((segment) => segment.map(toGeoJSONPosition).filter(Boolean))
    .filter((segment) => segment.length >= 2);

  return {
    segments,
    coordinates: segments.flat(),
    pointCount: segments.reduce((total, segment) => total + segment.length, 0),
  };
}

/** Convert route geometry to Leaflet's [latitude, longitude] format. */
export function toLeafletSegments(input) {
  return normalizeRouteGeometry(input).segments.map((segment) =>
    segment.map(([lon, lat]) => [lat, lon]),
  );
}
