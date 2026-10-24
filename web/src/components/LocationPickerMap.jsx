import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// A small map with one draggable pin — lets the manager fix the exact
// spot when text search only gets "close enough" (common for building
// nicknames Mapbox's own data doesn't have, like "Mani Casadona").
export default function LocationPickerMap({ lat, lng, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapboxgl.accessToken || !containerRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [lng, lat],
      zoom: 15,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    markerRef.current = new mapboxgl.Marker({ color: "#1b5e20", draggable: true })
      .setLngLat([lng, lat])
      .addTo(mapRef.current);

    markerRef.current.on("dragend", () => {
      const pos = markerRef.current.getLngLat();
      onChange(pos.lat, pos.lng);
    });

    // Clicking anywhere on the map also moves the pin — not just dragging it.
    mapRef.current.on("click", (e) => {
      markerRef.current.setLngLat(e.lngLat);
      onChange(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // map created once; position updates below move the existing marker instead of rebuilding

  // If the resolved point changes from OUTSIDE (e.g. a new address was
  // picked), recenter the map and marker without recreating the whole map.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLngLat([lng, lat]);
    mapRef.current.setCenter([lng, lat]);
  }, [lat, lng]);

  return <div ref={containerRef} style={{ height: "380px", borderRadius: "8px", overflow: "hidden" }} />;
}
