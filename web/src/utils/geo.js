// Mirrors backend/app/core/geo.py so the map coloring matches what the
// backend actually flagged as a deviation — same formulas, just in JS.

const EARTH_RADIUS_M = 6371000;

export function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toLocalXY(lat, lon, refLat, refLon) {
  const x = (lon - refLon) * 111320 * Math.cos((refLat * Math.PI) / 180);
  const y = (lat - refLat) * 110540;
  return [x, y];
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const segLenSq = abx * abx + aby * aby;
  if (segLenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / segLenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

// routeCoordinates: [[lon, lat], ...] — GeoJSON order, as OSRM/Mapbox return it.
export function distanceToRouteM(lat, lon, routeCoordinates) {
  if (!routeCoordinates || routeCoordinates.length === 0) return Infinity;
  if (routeCoordinates.length === 1) {
    const [lon0, lat0] = routeCoordinates[0];
    return haversineDistanceM(lat, lon, lat0, lon0);
  }
  let best = Infinity;
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const [lonA, latA] = routeCoordinates[i];
    const [lonB, latB] = routeCoordinates[i + 1];
    const [ax, ay] = toLocalXY(latA, lonA, lat, lon);
    const [bx, by] = toLocalXY(latB, lonB, lat, lon);
    const d = pointToSegmentDistance(0, 0, ax, ay, bx, by);
    if (d < best) best = d;
  }
  return best;
}

// points: [{latitude, longitude}, ...] in chronological order.
export function pathDistanceKm(points) {
  let totalM = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalM += haversineDistanceM(points[i].latitude, points[i].longitude, points[i + 1].latitude, points[i + 1].longitude);
  }
  return totalM / 1000;
}
