import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import styles from "./TrackingPage.module.css";
import {
  listUsers,
  listCustomers,
  listLivePositions,
  listDeviationAlerts,
  resolveDeviationAlert,
  getAgentRouteForDate,
  listRoutes,
  getPingHistory,
} from "../api/client";
import { haversineDistanceM } from "../utils/geo";
import { reverseGeocodeLabel } from "../utils/mapboxGeocode";
import RouteTimeline from "../components/RouteTimeline";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const POLL_INTERVAL_MS = 10000;
const KOLKATA = [88.3639, 22.5726];
const COLOR_ALERT = "#b3482f";
const COLOR_NORMAL = "#2e7d32";
// Deliberately a different HUE (blue) from the actual-route green, not just
// a darker shade — the previous #1b5e20 was close enough to actual route's
// #2e7d32 that, combined with the actual-path layer being added (and so
// drawn) after this one, the planned line was effectively invisible
// underneath it.
const COLOR_PLANNED = "#1565c0";
const COLOR_PENDING_STOP = "#F97316"; // a stop not yet visited — orange, "still to go"
// Actual-route line specifically (not the live position markers/alerts
// list, which keep using COLOR_NORMAL/COLOR_ALERT above) — on-route
// segments in magenta, any segment flagged as a deviation in red.
const COLOR_ACTUAL_ROUTE = "#C026D3";
const COLOR_ACTUAL_DEVIATION = "#DC2626";
const SAME_POINT_EPSILON = 0.0005; // ~50m — close enough to call a roundtrip's start/end "the same place"

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function makeDotElement(color, label) {
  const el = document.createElement("div");
  Object.assign(el.style, {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: color,
    border: "2px solid white",
    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "600",
    fontFamily: "var(--font-body)",
  });
  el.textContent = label;
  return el;
}

// Creates a marker with an immediate placeholder popup, then swaps in the
// real place name once reverse-geocoding resolves — avoids blocking marker
// placement on a network call.
function addLabeledMarker(map, lngLat, color, label, loadingText, nameResolver) {
  const popup = new mapboxgl.Popup({ offset: 16 }).setText(loadingText);
  const marker = new mapboxgl.Marker({ element: makeDotElement(color, label) }).setLngLat(lngLat).setPopup(popup).addTo(map);
  nameResolver.then((name) => {
    if (name) popup.setText(name);
  });
  return marker;
}

export default function TrackingPage({ token, user }) {
  const isAgent = user?.role === "agent";

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({}); // agent_id -> { marker, color }
  const endpointMarkersRef = useRef([]); // start + numbered-stop + actual S/E pins for the selected agent's route

  const [mapLoaded, setMapLoaded] = useState(false);
  const [agentNames, setAgentNames] = useState({});
  const [customers, setCustomers] = useState({}); // id -> {name, latitude, longitude}
  const [positions, setPositions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  const [selectedDate, setSelectedDate] = useState(todayStr());
  // An agent only ever inspects themselves — no "All" concept for them.
  const [selectedAgentId, setSelectedAgentId] = useState(isAgent ? user.user_id : null);
  // An agent/date can now have more than one independent task (DailyRoute).
  // routesForSelection holds every task for the chosen agent+date;
  // selectedRouteId picks which one's map/timeline/summary is shown.
  const [routesForSelection, setRoutesForSelection] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedPings, setSelectedPings] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedRoute = routesForSelection.find((r) => r.id === selectedRouteId) || null;

  const [tasksForDate, setTasksForDate] = useState({}); // agent_id -> DailyRoute | null

  // Deviation notifications: a desktop Notification + a beep the moment a
  // NEW unresolved deviation shows up, for as long as this tab stays
  // open — not a server-side push, so it does nothing once the browser
  // or tab is closed, or before the admin ever opens this page. A real
  // "notify even when nobody's looking" (email/SMS/mobile push) would
  // need an SMTP relay or a push service wired into the backend, neither
  // of which exists yet — this is the part that's achievable from the
  // frontend alone.
  const seenAlertIdsRef = useRef(null); // null until the first poll completes
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setNotifPermission);
  }

  function playDeviationBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
      osc.onended = () => ctx.close();
    } catch {
      // best-effort only — never let a failed beep break the page
    }
  }

  // The polling effect below only runs once per `token` (its deps are
  // [token]), so its closure would otherwise see agentNames as it was at
  // that first render — always {}. A ref sidesteps that without widening
  // the effect's deps (which would restart the poll loop on every name
  // list refresh).
  const agentNamesRef = useRef({});
  useEffect(() => {
    agentNamesRef.current = agentNames;
  }, [agentNames]);

  function notifyNewDeviations(newAlerts, namesById) {
    playDeviationBeep();
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const body =
      newAlerts.length === 1
        ? `${namesById[newAlerts[0].agent_id] || "An agent"} is ${Math.round(
            newAlerts[0].distance_from_route_m
          )}m off their planned route.`
        : `${newAlerts.length} agents have drifted off their planned routes.`;
    new Notification("Route deviation detected", { body });
  }

  useEffect(() => {
    if (!isAgent) {
      listUsers(token, "agent")
        .then((users) => {
          const map = {};
          users.forEach((u) => {
            map[u.id] = u.name;
          });
          setAgentNames(map);
        })
        .catch(() => {});
    }
    listCustomers(token)
      .then((list) => {
        const map = {};
        list.forEach((c) => {
          map[c.id] = { name: c.name, latitude: c.latitude, longitude: c.longitude };
        });
        setCustomers(map);
      })
      .catch(() => {});
  }, [token, isAgent]);

  useEffect(() => {
    if (!mapboxgl.accessToken) {
      setError("Mapbox token is missing — set VITE_MAPBOX_TOKEN in web/.env.");
      return;
    }
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: KOLKATA,
      zoom: 10.5,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current.on("load", () => setMapLoaded(true));

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [posData, alertData] = await Promise.all([
          listLivePositions(token),
          listDeviationAlerts(token, false),
        ]);
        if (!cancelled) {
          setPositions(posData);
          setAlerts(alertData);
          setError(null);

          if (!isAgent) {
            if (seenAlertIdsRef.current === null) {
              // First poll since this page opened — these alerts already
              // existed, don't notify for them, just start tracking what's
              // "known" from here on.
              seenAlertIdsRef.current = new Set(alertData.map((a) => a.id));
            } else {
              const newOnes = alertData.filter((a) => !seenAlertIdsRef.current.has(a.id));
              if (newOnes.length > 0) {
                newOnes.forEach((a) => seenAlertIdsRef.current.add(a.id));
                notifyNewDeviations(newOnes, agentNamesRef.current);
              }
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  // For every on-duty agent, fetch their route for the SELECTED date — only
  // needed for the admin/manager status list, not for an agent's own view.
  useEffect(() => {
    if (isAgent || positions.length === 0) {
      setTasksForDate({});
      return;
    }
    let cancelled = false;
    Promise.all(
      positions.map((p) =>
        getAgentRouteForDate(token, p.agent_id, selectedDate)
          .then((route) => [p.agent_id, route])
          .catch(() => [p.agent_id, null])
      )
    ).then((entries) => {
      if (cancelled) return;
      const map = {};
      entries.forEach(([agentId, route]) => {
        map[agentId] = route;
      });
      setTasksForDate(map);
    });
    return () => {
      cancelled = true;
    };
  }, [token, isAgent, positions, selectedDate]);

  // Live position markers. "All" (selectedAgentId null, admin/manager
  // only) shows everyone; a specific selection shows just that one person
  // — an agent's own view is always exactly one marker, themselves.
  useEffect(() => {
    if (!mapRef.current) return;
    const todayAlertedAgentIds = new Set(
      alerts.filter((a) => new Date(a.detected_at).toISOString().slice(0, 10) === todayStr()).map((a) => a.agent_id)
    );
    const visiblePositions = selectedAgentId ? positions.filter((p) => p.agent_id === selectedAgentId) : positions;
    const seen = new Set();

    visiblePositions.forEach((p) => {
      seen.add(p.agent_id);
      const color = todayAlertedAgentIds.has(p.agent_id) ? COLOR_ALERT : COLOR_NORMAL;
      const existing = markersRef.current[p.agent_id];

      if (existing && existing.color === color) {
        existing.marker.setLngLat([p.longitude, p.latitude]);
      } else {
        existing?.marker.remove();
        const marker = new mapboxgl.Marker({ color })
          .setLngLat([p.longitude, p.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 20 }).setText(isAgent ? "You" : agentNames[p.agent_id] || "No data available"))
          .addTo(mapRef.current);
        markersRef.current[p.agent_id] = { marker, color };
      }
    });

    Object.keys(markersRef.current).forEach((id) => {
      if (!seen.has(Number(id))) {
        markersRef.current[id].marker.remove();
        delete markersRef.current[id];
      }
    });

    // Without this, the map stays at its fixed default center/zoom — if
    // everyone's actual position happens to fall outside that view, the
    // map looks empty even though the data is there. Only fit to live
    // positions when there's no route selected (route-fitting below takes
    // over once one is), so we're not fighting over the viewport.
    if (!selectedAgentId && visiblePositions.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      visiblePositions.forEach((p) => bounds.extend([p.longitude, p.latitude]));
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 500 });
    }
  }, [positions, alerts, agentNames, selectedAgentId, isAgent]);

  // Fetch every task (DailyRoute) for the selected agent/date, plus the
  // day's ping history (GPS pings aren't split per-task, so the actual
  // travelled path shown is for the whole day regardless of which task
  // is selected below).
  useEffect(() => {
    if (!selectedAgentId) {
      setRoutesForSelection([]);
      setSelectedRouteId(null);
      setSelectedPings([]);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([listRoutes(token, selectedAgentId, selectedDate), getPingHistory(token, selectedAgentId, selectedDate)])
      .then(([routes, pings]) => {
        if (cancelled) return;
        setRoutesForSelection(routes);
        // Prefer an in-progress task, else the highest-priority one, else
        // the first — a reasonable default so the map isn't blank when
        // there happen to be several tasks for the day.
        const priorityRank = { high: 0, medium: 1, low: 2 };
        const inProgress = routes.find((r) => r.status === "in_progress");
        const best =
          inProgress ||
          [...routes].sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1))[0] ||
          null;
        setSelectedRouteId(best ? best.id : null);
        setSelectedPings(pings);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedAgentId, selectedDate]);

  // Draw the planned route, the actual travelled path, the start pin, and
  // one NUMBERED pin per stop (colored by whether it's been visited yet).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const plannedGeoJSON = {
      type: "FeatureCollection",
      features:
        selectedRoute?.route_geometry
          ? [{ type: "Feature", geometry: selectedRoute.route_geometry, properties: {} }]
          : [],
    };

    const actualFeatures = [];
    for (let i = 1; i < selectedPings.length; i++) {
      const prev = selectedPings[i - 1];
      const curr = selectedPings[i];
      const deviating = prev.deviating || curr.deviating;
      const geometry = curr.leg_geometry || {
        type: "LineString",
        coordinates: [
          [prev.longitude, prev.latitude],
          [curr.longitude, curr.latitude],
        ],
      };
      actualFeatures.push({
        type: "Feature",
        properties: { color: deviating ? COLOR_ACTUAL_DEVIATION : COLOR_ACTUAL_ROUTE },
        geometry,
      });
    }
    const actualGeoJSON = { type: "FeatureCollection", features: actualFeatures };

    if (map.getSource("planned-route")) {
      map.getSource("planned-route").setData(plannedGeoJSON);
    } else {
      map.addSource("planned-route", { type: "geojson", data: plannedGeoJSON });
      map.addLayer({
        id: "planned-route-line",
        type: "line",
        source: "planned-route",
        layout: { "line-join": "round", "line-cap": "round" },
        // Dashed, on top of its own distinct blue — stays visible even
        // where the actual path runs directly over the planned one.
        paint: { "line-color": COLOR_PLANNED, "line-width": 4, "line-dasharray": [2, 1.5] },
      });
    }

    if (map.getSource("actual-path")) {
      map.getSource("actual-path").setData(actualGeoJSON);
    } else {
      map.addSource("actual-path", { type: "geojson", data: actualGeoJSON });
      map.addLayer({
        id: "actual-path-line",
        type: "line",
        source: "actual-path",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 3 },
      });
    }

    endpointMarkersRef.current.forEach((m) => m.remove());
    endpointMarkersRef.current = [];

    const routeCoords = selectedRoute?.route_geometry?.coordinates;
    if (routeCoords && routeCoords.length > 0) {
      // Frame the whole planned route — this is what actually fixes "the
      // map shows nothing": without it, the view stays wherever it was
      // and a route elsewhere in the city can sit entirely off-screen.
      const bounds = new mapboxgl.LngLatBounds();
      routeCoords.forEach(([lon, lat]) => bounds.extend([lon, lat]));
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 500 });

      const [startLon, startLat] = routeCoords[0];
      const [endLon, endLat] = routeCoords[routeCoords.length - 1];
      const isLoop =
        Math.abs(startLon - endLon) < SAME_POINT_EPSILON && Math.abs(startLat - endLat) < SAME_POINT_EPSILON;

      const startName = selectedRoute?.start_location_name;
      endpointMarkersRef.current.push(
        addLabeledMarker(
          map,
          [startLon, startLat],
          COLOR_PLANNED,
          isLoop ? "O" : "S",
          "Loading location…",
          startName
            ? Promise.resolve(isLoop ? `${startName} — start & end` : startName)
            : reverseGeocodeLabel(startLon, startLat).then((label) =>
                isLoop ? (label ? `${label} — planned start & end` : "Planned start & end") : label || "Planned start"
              )
        )
      );
    }

    // One numbered pin per planned stop, in visit order — colored by
    // whether that stop is done (visited) or still left to touch.
    const visitStatusByCustomer = {};
    (selectedRoute?.visits || []).forEach((v) => {
      visitStatusByCustomer[v.customer_id] = v.status;
    });

    (selectedRoute?.waypoint_order || []).forEach((customerId, idx) => {
      const c = customers[customerId];
      if (!c || c.latitude == null || c.longitude == null) return;
      const status = visitStatusByCustomer[customerId];
      const done = status === "checked_in" || status === "completed";
      const color = done ? COLOR_NORMAL : COLOR_PENDING_STOP;
      const statusLabel = done ? "Visited" : "Not yet visited";
      endpointMarkersRef.current.push(
        addLabeledMarker(
          map,
          [c.longitude, c.latitude],
          color,
          String(idx + 1),
          `${c.name} — ${statusLabel}`,
          Promise.resolve(`${c.name} — ${statusLabel}`)
        )
      );
    });

    if (selectedPings.length > 0) {
      const first = selectedPings[0];
      const firstTime = new Date(first.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      endpointMarkersRef.current.push(
        addLabeledMarker(
          map,
          [first.longitude, first.latitude],
          COLOR_ALERT,
          "S",
          "Loading location…",
          reverseGeocodeLabel(first.longitude, first.latitude).then((label) =>
            label ? `Actual start: ${label} · ${firstTime}` : `Actual start · ${firstTime}`
          )
        )
      );

      if (selectedPings.length > 1) {
        const last = selectedPings[selectedPings.length - 1];
        const lastTime = new Date(last.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        endpointMarkersRef.current.push(
          addLabeledMarker(
            map,
            [last.longitude, last.latitude],
            COLOR_ALERT,
            "E",
            "Loading location…",
            reverseGeocodeLabel(last.longitude, last.latitude).then((label) =>
              label ? `Actual end (so far): ${label} · ${lastTime}` : `Actual end (so far) · ${lastTime}`
            )
          )
        );
      }
    }
  }, [mapLoaded, selectedRoute, selectedPings, customers]);

  async function handleResolve(alertId) {
    setResolvingId(alertId);
    try {
      await resolveDeviationAlert(token, alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      setError(err.message);
    } finally {
      setResolvingId(null);
    }
  }

  const actualKm =
    selectedPings.slice(1).reduce((total, curr, i) => {
      const prev = selectedPings[i];
      const legM = curr.leg_distance_m ?? haversineDistanceM(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
      return total + legM;
    }, 0) / 1000;
  const plannedKm = selectedRoute?.planned_distance_km ?? null;
  const plannedUpKm = selectedRoute?.planned_onward_distance_km ?? null;
  const plannedDownKm = selectedRoute?.planned_return_distance_km ?? null;
  const hasUpDownSplit = plannedUpKm !== null;
  const diffKm = plannedKm !== null ? actualKm - plannedKm : null;

  const alertsForDate = alerts.filter((a) => new Date(a.detected_at).toISOString().slice(0, 10) === selectedDate);
  const displayedAlerts = selectedAgentId ? alertsForDate.filter((a) => a.agent_id === selectedAgentId) : alertsForDate;

  function taskSummary(agentId) {
    const route = tasksForDate[agentId];
    if (route === undefined) return "Loading…";
    if (route === null) return "No task assigned";
    const lastCustomerId = route.waypoint_order?.[route.waypoint_order.length - 1];
    const destination = lastCustomerId ? customers[lastCustomerId]?.name : null;
    return destination ? `→ ${destination}` : `${route.planned_distance_km ?? "?"} km route`;
  }

  const visitedCount = (selectedRoute?.visits || []).filter((v) => v.status === "checked_in" || v.status === "completed").length;
  const totalStops = selectedRoute?.waypoint_order?.length ?? 0;

  const routeCoordsForFlow = selectedRoute?.route_geometry?.coordinates;
  const isRoundTrip =
    !!routeCoordsForFlow &&
    routeCoordsForFlow.length > 0 &&
    (() => {
      const [startLon, startLat] = routeCoordsForFlow[0];
      const [endLon, endLat] = routeCoordsForFlow[routeCoordsForFlow.length - 1];
      return Math.abs(startLon - endLon) < SAME_POINT_EPSILON && Math.abs(startLat - endLat) < SAME_POINT_EPSILON;
    })();
  // Combines waypoint_order (the sequence) with visits (the real status +
  // check-in time per customer) — two different arrays, same route.
  const visitByCustomerId = {};
  (selectedRoute?.visits || []).forEach((v) => {
    visitByCustomerId[v.customer_id] = v;
  });
  const timelineStops = (selectedRoute?.waypoint_order || []).map((id) => ({
    name: customers[id]?.name || "Stop",
    status: visitByCustomerId[id]?.status || "pending",
    check_in_time: visitByCustomerId[id]?.check_in_time || null,
  }));

  // Cheap local distance check (no geocoding, no extra API calls) — "near
  // which planned stop is this agent's last known position," so "On duty
  // now" can show something like a manager actually wants to see at a
  // glance, using data already fetched for the task-summary list.
  function nearestStopLabel(agentId) {
    const route = tasksForDate[agentId];
    const pos = positions.find((p) => p.agent_id === agentId);
    if (!route?.waypoint_order?.length || !pos) return null;
    let best = null;
    let bestDist = Infinity;
    route.waypoint_order.forEach((cid, idx) => {
      const c = customers[cid];
      if (!c || c.latitude == null) return;
      const d = haversineDistanceM(pos.latitude, pos.longitude, c.latitude, c.longitude);
      if (d < bestDist) {
        bestDist = d;
        best = { name: c.name, index: idx + 1 };
      }
    });
    return best;
  }

  const onDutyAgentIds = new Set(positions.map((p) => p.agent_id));
  const notActiveAgents = Object.entries(agentNames).filter(([id]) => !onDutyAgentIds.has(Number(id)));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Live Tracking</h1>
        <p className={styles.sub}>
          {isAgent ? "Your location and today's plan." : "Where your team is right now, and any unresolved deviations."}
        </p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.layout}>
        <div className={styles.mapWrap}>
          <div ref={mapContainerRef} className={styles.map} />
          <div className={styles.legend}>
            <div className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: COLOR_PLANNED }} /> Planned Route
            </div>
            <div className={styles.legendRow}>
              <span className={styles.legendLine} style={{ background: COLOR_ACTUAL_ROUTE }} /> Actual Route
            </div>
            <div className={styles.legendRow}>
              <span className={styles.legendLine} style={{ background: COLOR_ACTUAL_DEVIATION }} /> Off-route segment
            </div>
            <div className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: COLOR_PENDING_STOP }} /> Stop / Completed
            </div>
          </div>
        </div>

        <div className={styles.sidebar}>
          <div className={styles.controlsRow}>
            <div className={styles.controlField}>
              <label className={styles.controlLabel} htmlFor="tracking-date">
                📅 Date
              </label>
              <input
                id="tracking-date"
                type="date"
                className={styles.dateInput}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            {!isAgent && (
              <div className={styles.controlField}>
                <label className={styles.controlLabel} htmlFor="tracking-employee">
                  👤 Employee
                </label>
                <select
                  id="tracking-employee"
                  className={styles.dateInput}
                  value={selectedAgentId || ""}
                  onChange={(e) => setSelectedAgentId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">All</option>
                  {Object.entries(agentNames).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!isAgent && notifPermission !== "unsupported" && notifPermission !== "granted" && (
            <button type="button" className={styles.resolveButton} style={{ marginBottom: 10 }} onClick={requestNotifPermission}>
              🔔 {notifPermission === "denied" ? "Notifications blocked — allow them in your browser's site settings" : "Enable alerts for new deviations"}
            </button>
          )}

          <div className={`${styles.alertsCard} ${displayedAlerts.length > 0 ? styles.alertsCardActive : ""}`}>
            <div className={styles.alertsCardHeading}>
              {displayedAlerts.length > 0 ? "⚠️" : ""} Deviation alerts
              {selectedAgentId && !isAgent ? ` — ${agentNames[selectedAgentId] || "selected agent"}` : ""}
            </div>
            {displayedAlerts.length === 0 ? (
              <p className={styles.state}>No unresolved deviations for this date.</p>
            ) : (
              <ul className={styles.alertList}>
                {displayedAlerts.map((a) => (
                  <li key={a.id} className={styles.alertItem}>
                    <div className={styles.alertAgent}>{isAgent ? "You" : agentNames[a.agent_id] || "No data available"}</div>
                    <div className={styles.alertDetail}>
                      {Math.round(a.distance_from_route_m)}m off route ·{" "}
                      {new Date(a.detected_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    {!isAgent && (
                      <button
                        className={styles.resolveButton}
                        onClick={() => handleResolve(a.id)}
                        disabled={resolvingId === a.id}
                      >
                        {resolvingId === a.id ? "Resolving…" : "Mark resolved"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isAgent && (
            <div>
              <h2 className={styles.sidebarHeading}>On duty now</h2>
              {positions.length === 0 ? (
                <p className={styles.state}>No agents reporting a location yet.</p>
              ) : (
                <ul className={styles.agentList}>
                  {positions.map((p) => {
                    const near = nearestStopLabel(p.agent_id);
                    return (
                      <li key={p.agent_id} className={styles.agentItem}>
                        <span
                          className={styles.agentDot}
                          style={{
                            background: alertsForDate.some((a) => a.agent_id === p.agent_id) ? COLOR_ALERT : COLOR_NORMAL,
                          }}
                        />
                        <div className={styles.agentItemMain}>
                          <span className={styles.agentItemName}>{agentNames[p.agent_id] || "No data available"}</span>
                          {near && (
                            <span className={styles.agentItemSub}>
                              📍 Near: {near.name} (Stop {near.index})
                            </span>
                          )}
                        </div>
                        <span className={styles.timeBadge}>
                          {new Date(p.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {notActiveAgents.length > 0 && (
                <>
                  <h3 className={styles.notActiveHeading}>Not active today</h3>
                  <ul className={styles.notActiveList}>
                    {notActiveAgents.map(([id, name]) => (
                      <li key={id} className={styles.notActiveItem}>
                        <span className={styles.notActiveDot} />
                        {name}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {selectedAgentId && (
            <div className={styles.routeDetail}>
              {!isAgent && (
                <h2 className={styles.sidebarHeading}>Route for {agentNames[selectedAgentId] || "No data available"}</h2>
              )}

              {!detailLoading && routesForSelection.length > 1 && (
                <div className={styles.controlField} style={{ marginBottom: 10 }}>
                  <label className={styles.controlLabel} htmlFor="tracking-task">
                    🗒️ Task ({routesForSelection.length} on this date)
                  </label>
                  <select
                    id="tracking-task"
                    className={styles.dateInput}
                    value={selectedRouteId || ""}
                    onChange={(e) => setSelectedRouteId(Number(e.target.value))}
                  >
                    {routesForSelection.map((r) => {
                      const lastCustomerId = r.waypoint_order?.[r.waypoint_order.length - 1];
                      const destination = lastCustomerId ? customers[lastCustomerId]?.name : null;
                      const label = destination ? `→ ${destination}` : `${r.planned_distance_km ?? "?"} km route`;
                      return (
                        <option key={r.id} value={r.id}>
                          [{r.priority}] {label} · {r.status}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {detailLoading && <p className={styles.state}>Loading route…</p>}
              {!detailLoading && !selectedRoute && <p className={styles.state}>No planned route for this date.</p>}

              {!detailLoading && selectedRoute && totalStops > 0 && (
                <RouteTimeline startLabel={selectedRoute.start_location_name} stops={timelineStops} roundtrip={isRoundTrip} />
              )}

              {!detailLoading && selectedRoute && (
                <div className={styles.summaryCard}>
                  <div className={styles.summaryHeading}>📊 Travel Summary</div>
                  <div className={styles.summaryGrid}>
                    <div>
                      <div className={styles.summaryLabel}>Planned Distance</div>
                      <div className={styles.summaryValue}>{plannedKm?.toFixed(1)} km</div>
                    </div>
                    <div>
                      <div className={styles.summaryLabel}>Actual Distance</div>
                      <div className={styles.summaryValue}>{actualKm.toFixed(1)} km</div>
                    </div>
                    {totalStops > 0 && (
                      <div>
                        <div className={styles.summaryLabel}>Stops</div>
                        <div className={styles.summaryValue}>
                          {visitedCount} / {totalStops}
                        </div>
                      </div>
                    )}
                  </div>

                  {hasUpDownSplit && (
                    <div className={styles.summaryGrid} style={{ marginTop: 10 }}>
                      <div>
                        <div className={styles.summaryLabel}>Up (to stop)</div>
                        <div className={styles.summaryValue}>{plannedUpKm.toFixed(1)} km</div>
                      </div>
                      <div>
                        <div className={styles.summaryLabel}>Down (return)</div>
                        <div className={styles.summaryValue}>
                          {plannedDownKm !== null ? `${plannedDownKm.toFixed(1)} km` : "—"}
                        </div>
                      </div>
                      <div>
                        <div className={styles.summaryLabel}>Total Planned</div>
                        <div className={styles.summaryValue}>
                          {(plannedUpKm + (plannedDownKm ?? 0)).toFixed(1)} km
                        </div>
                      </div>
                    </div>
                  )}
                  {!hasUpDownSplit && (
                    <p className={styles.diffCaveat}>
                      This route was planned before the Up/Down split existed — re-save the
                      task to get a breakdown.
                    </p>
                  )}
                  {diffKm !== null && (
                    <p className={styles.diffNote}>
                      {diffKm > 0.3
                        ? `${diffKm.toFixed(1)} km more than planned so far.`
                        : diffKm < -0.3
                        ? `${Math.abs(diffKm).toFixed(1)} km less than planned so far.`
                        : "On track with the planned distance."}
                    </p>
                  )}
                  <p className={styles.diffCaveat}>
                    This compares total distance only — it won't match if the agent
                    travelled the wrong distance by coincidence. The map's red
                    sections are what actually show where they went off route.
                  </p>
                  {selectedPings.length === 0 && <p className={styles.state}>No GPS pings recorded for this date yet.</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
