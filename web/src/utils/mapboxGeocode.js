// Reverse geocoding for map popup labels only — never stored, just shown
// transiently in a tooltip. That's why this calls Mapbox directly from the
// browser using the public token, rather than going through our backend's
// Permanent Geocoding endpoint (which exists for customer addresses we
// store indefinitely — a different use case with different Mapbox terms).
import { haversineDistanceM } from "./geo";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Biases every forward-geocode call toward India, near Kolkata — without
// this, a short query like "Mani Casadona" can match an unrelated place
// name anywhere in the world (we saw it resolve to Central African
// Republic / Mali / Benin instead of New Town, Kolkata). `country`
// restricts results to India entirely; `proximity` ranks closer matches
// higher within that. Fine as a hardcoded default since every customer,
// route, and the OSRM map data itself is already West Bengal-scoped.
const KOLKATA_LNG = 88.3639;
const KOLKATA_LAT = 22.5726;
const REGION_BIAS = `country=in&proximity=${KOLKATA_LNG},${KOLKATA_LAT}`;

// Live suggestions as the user types — the Uber/Google-style autocomplete
// dropdown. Returns up to 5 candidates, each with a label to display and
// the lat/lng to use if picked (so clicking a suggestion needs no further
// geocoding call).
// Mapbox's own relevance ranking can still prefer an exact place-name
// match far away (e.g. a village literally called "Mani" in Bihar) over a
// fuzzy match on a real building nearby ("Mani Casadona" in Kolkata) —
// `proximity` alone doesn't override that. So we fetch more candidates
// than we need and re-sort them ourselves by straight-line distance from
// Kolkata, which is what "nearest sensible match" actually means for a
// product where every customer and route is West Bengal-scoped.
function sortByDistanceFromKolkata(features) {
  return features
    .map((f) => {
      const [lng, lat] = f.geometry.coordinates;
      return {
        label: f.properties?.full_address || f.properties?.name || "",
        lat,
        lng,
        distanceM: haversineDistanceM(KOLKATA_LAT, KOLKATA_LNG, lat, lng),
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM);
}

export async function suggestAddresses(queryText) {
  if (!MAPBOX_TOKEN || queryText.trim().length < 3) return [];
  try {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(queryText)}&limit=10&${REGION_BIAS}&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return sortByDistanceFromKolkata(data.features || []).slice(0, 5);
  } catch {
    return [];
  }
}

// Forward geocoding for the "Create Task" form's start-location field —
// also Temporary (not permanent): the address text itself is never stored,
// only the resulting lat/lng, as part of the route we create immediately.
export async function forwardGeocode(addressText) {
  if (!MAPBOX_TOKEN || !addressText.trim()) return null;
  try {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(addressText)}&limit=10&${REGION_BIAS}&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const ranked = sortByDistanceFromKolkata(data.features || []);
    if (ranked.length === 0) return null;
    const top = ranked[0];
    return { lat: top.lat, lng: top.lng, label: top.label || addressText };
  } catch {
    return null;
  }
}

export async function reverseGeocodeLabel(lng, lat) {
  if (!MAPBOX_TOKEN) return null;
  try {
    const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const props = data.features?.[0]?.properties;
    return props?.name_preferred || props?.name || props?.full_address || null;
  } catch {
    return null;
  }
}
