"""
Thin wrapper around a self-hosted OSRM server's /trip endpoint.

/trip solves the "best order to visit these stops" problem (a
travelling-salesman-style optimization) — exactly the "Optimize" button
in the mockups. This talks to OSRM over the internal Docker network
(OSRM_BASE_URL), never the host-mapped port.
"""
import httpx
from fastapi import HTTPException, status

from app.config import settings


class TripResult:
    def __init__(
        self,
        order: list[int],
        distance_km: float,
        duration_min: float,
        geometry: dict,
        leg_distances_km: list[float] | None = None,
    ):
        self.order = order              # original input indices, in optimized visit order
        self.distance_km = distance_km
        self.duration_min = duration_min
        self.geometry = geometry        # GeoJSON LineString
        # One entry per leg of the optimized trip, in visit order — e.g. for
        # start -> stop -> start (roundtrip, one stop) this is
        # [onward_km, return_km]. Used to split the single total distance
        # into "Up"/"Down" instead of just one combined number.
        self.leg_distances_km = leg_distances_km or []


def optimize_trip(coordinates: list[tuple[float, float]], roundtrip: bool = True) -> TripResult:
    """
    coordinates: list of (latitude, longitude), index 0 is the fixed start point
    (e.g. the office). Returns the optimized visit order as a list of
    indices into the input `coordinates` list.
    """
    if len(coordinates) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Need at least a start point and one stop to plan a route",
        )

    # OSRM wants "lon,lat" pairs, semicolon-separated — the opposite order from our tuples.
    coord_str = ";".join(f"{lon},{lat}" for lat, lon in coordinates)
    url = f"{settings.OSRM_BASE_URL}/trip/v1/driving/{coord_str}"
    params = {
        "roundtrip": "true" if roundtrip else "false",
        "source": "first",
        "geometries": "geojson",
        "overview": "full",
    }
    if not roundtrip:
        params["destination"] = "last"

    try:
        response = httpx.get(url, params=params, timeout=15.0)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OSRM trip request failed: {exc.response.status_code} {exc.response.text}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach OSRM: {exc}. Is the osrm container running with processed map data?",
        )

    data = response.json()
    if data.get("code") != "Ok":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"OSRM could not compute a trip: {data.get('message', data.get('code'))}",
        )

    # `waypoints` is in INPUT order; each entry's waypoint_index says where
    # it falls in the optimized sequence. Sorting input indices by that
    # value gives us the optimized order of the original indices.
    waypoints = data["waypoints"]
    order = sorted(range(len(waypoints)), key=lambda i: waypoints[i]["waypoint_index"])

    trip = data["trips"][0]
    leg_distances_km = [leg["distance"] / 1000 for leg in trip.get("legs", [])]
    return TripResult(
        order=order,
        distance_km=trip["distance"] / 1000,
        duration_min=trip["duration"] / 60,
        geometry=trip["geometry"],
        leg_distances_km=leg_distances_km,
    )


def route_through_waypoints(coordinates: list[tuple[float, float]]) -> list[dict]:
    """
    coordinates: ordered (lat, lon) points — routed through IN THAT EXACT
    ORDER (unlike /trip, this never reorders). Used to draw an agent's
    actual travelled path snapped to real roads, instead of a straight
    line between raw GPS samples.

    Returns one entry per leg (len(coordinates) - 1):
    {"geometry": GeoJSON LineString | None, "distance_m": float | None}.
    A leg's geometry is None only if OSRM couldn't find any road path for
    that specific pair (e.g. an implausible jump) or OSRM is unreachable —
    this degrades gracefully rather than raising, since the caller treats
    this as a visualization nicety, not something that should break the
    whole page if it fails.
    """
    if len(coordinates) < 2:
        return []

    empty = [{"geometry": None, "distance_m": None} for _ in range(len(coordinates) - 1)]

    coord_str = ";".join(f"{lon},{lat}" for lat, lon in coordinates)
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{coord_str}"
    params = {"geometries": "geojson", "overview": "false", "steps": "true"}

    try:
        response = httpx.get(url, params=params, timeout=20.0)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return empty

    if data.get("code") != "Ok" or not data.get("routes"):
        return empty

    results = []
    for leg in data["routes"][0]["legs"]:
        coords: list[list[float]] = []
        for step in leg.get("steps", []):
            step_coords = step.get("geometry", {}).get("coordinates", [])
            if coords and step_coords and coords[-1] == step_coords[0]:
                coords.extend(step_coords[1:])  # drop the duplicated joint point
            else:
                coords.extend(step_coords)
        geometry = {"type": "LineString", "coordinates": coords} if len(coords) >= 2 else None
        results.append({"geometry": geometry, "distance_m": leg.get("distance")})
    return results
