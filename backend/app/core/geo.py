"""
Great-circle distance between two lat/long points, in meters.
Good enough for geofence checks over the small distances involved here
(tens to a few hundred meters) — no need for anything more precise.
"""
import math


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000  # Earth's radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _to_local_xy_m(lat: float, lon: float, ref_lat: float, ref_lon: float) -> tuple[float, float]:
    """
    Equirectangular approximation: projects lat/lon to flat x/y meters
    relative to a reference point. Accurate to within a meter or two over
    the few-kilometer spans a single day's route covers — no need for a
    real geodesic/shapely dependency for this.
    """
    x = (lon - ref_lon) * 111320 * math.cos(math.radians(ref_lat))
    y = (lat - ref_lat) * 110540
    return x, y


def _point_to_segment_distance_m(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    """Standard 2D point-to-line-segment distance, in the same units as the inputs (meters here)."""
    abx, aby = bx - ax, by - ay
    seg_len_sq = abx * abx + aby * aby
    if seg_len_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / seg_len_sq))
    closest_x, closest_y = ax + t * abx, ay + t * aby
    return math.hypot(px - closest_x, py - closest_y)


def distance_to_route_m(lat: float, lon: float, route_coordinates: list[list[float]]) -> float:
    """
    Shortest distance from (lat, lon) to the planned route polyline.
    route_coordinates is OSRM/GeoJSON-style [[lon, lat], [lon, lat], ...].
    Used for deviation detection — approximate by design, see the earlier
    accuracy discussion (a few hundred metres of tolerance is fine here).
    """
    if not route_coordinates:
        return float("inf")
    if len(route_coordinates) == 1:
        lon0, lat0 = route_coordinates[0]
        return haversine_distance_m(lat, lon, lat0, lon0)

    px, py = _to_local_xy_m(lat, lon, ref_lat=lat, ref_lon=lon)  # i.e. (0, 0) — point is its own origin
    best = float("inf")
    for (lon_a, lat_a), (lon_b, lat_b) in zip(route_coordinates, route_coordinates[1:]):
        ax, ay = _to_local_xy_m(lat_a, lon_a, ref_lat=lat, ref_lon=lon)
        bx, by = _to_local_xy_m(lat_b, lon_b, ref_lat=lat, ref_lon=lon)
        d = _point_to_segment_distance_m(px, py, ax, ay, bx, by)
        if d < best:
            best = d
    return best
