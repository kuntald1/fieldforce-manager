"""
Thin wrapper around Mapbox's Permanent Geocoding API.

We use `permanent=true` because customers.latitude/longitude are stored
indefinitely in our own database — Mapbox's terms require the Permanent
tier for that, not the (cheaper, but store-nothing) Temporary tier.
"""
import httpx
from fastapi import HTTPException, status

from app.config import settings

GEOCODE_URL = "https://api.mapbox.com/search/geocode/v6/forward"


class GeocodeResult:
    def __init__(self, latitude: float, longitude: float, formatted_address: str):
        self.latitude = latitude
        self.longitude = longitude
        self.formatted_address = formatted_address


def geocode_address(address: str) -> GeocodeResult:
    """
    Calls Mapbox forward geocoding for a single address and returns the
    top match. Raises HTTPException(422) if nothing matches, or 502 if
    Mapbox itself errors — both are the caller's problem to report to
    the person who typed the address.
    """
    if not settings.MAPBOX_SECRET_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MAPBOX_SECRET_TOKEN is not configured on the server",
        )

    params = {
        "q": address,
        "permanent": "true",
        "limit": 1,
        "access_token": settings.MAPBOX_SECRET_TOKEN,
    }

    try:
        response = httpx.get(GEOCODE_URL, params=params, timeout=10.0)
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Mapbox geocoding failed: {exc.response.status_code} {exc.response.text}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach Mapbox geocoding: {exc}",
        )

    data = response.json()
    features = data.get("features", [])
    if not features:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not geocode address: '{address}'. Check spelling or add more detail (city, state).",
        )

    top = features[0]
    longitude, latitude = top["geometry"]["coordinates"]  # GeoJSON order is [lng, lat]
    formatted_address = top.get("properties", {}).get("full_address", address)

    return GeocodeResult(latitude=latitude, longitude=longitude, formatted_address=formatted_address)
