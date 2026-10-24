# FieldForce Manager — backend foundation

## What's here
- `backend/app/models/` — all 9 core tables (organizations, users, customers,
  daily_routes, visits, gps_pings, deviation_alerts, expenses, attendance_sessions)
- `backend/app/database.py`, `config.py` — DB connection + env-based settings
- `backend/app/core/security.py` — password hashing + JWT helpers (ready for an auth router)
- `backend/app/main.py` — FastAPI app with a `/health` endpoint
- `backend/alembic/` — migration setup, wired to the models above
- `docker-compose.yml` — postgres + backend, same pattern as your other projects

## Multi-tenancy
Every table carries `organization_id`. This is the tenant-isolation boundary —
every query in every router must filter by the logged-in user's organization_id,
or one client will see another client's data. Worth baking this into a shared
dependency (e.g. `get_current_org()`) before writing the first real router.

## Local setup (Windows / PowerShell 5.1)
```powershell
cd D:\Kuntal\fieldforce-manager\backend
copy .env.example .env
# edit .env — set a real SECRET_KEY
```

Then from the project root:
```powershell
docker compose up --build
```

First migration (run once, inside the backend container or locally against
the same DATABASE_URL):
```powershell
docker compose exec backend alembic revision --autogenerate -m "initial schema"
docker compose exec backend alembic upgrade head
```

Check it's alive: http://localhost:8010/health

## Important — schema changes later
`Base.metadata.create_all()` is NOT used here on purpose — it never alters
existing tables (a known gotcha from your other projects). Every schema
change from now on goes through `alembic revision --autogenerate` +
`alembic upgrade head`, never manual ALTER TABLE, never create_all().

## Auth — done
- `POST /api/auth/login` — verifies email/password, issues a JWT with
  `org_id` and `role` embedded (so no DB hit is needed to check tenant/role
  on every later request)
- `GET /api/auth/me` — quick way to sanity-check a token
- `app/core/deps.py` — `get_current_user` (decodes the JWT) and
  `require_role("admin", "manager")` (blocks roles that shouldn't hit a
  given endpoint) — every future router should depend on one of these

### Create a user to log in with
No users exist until you seed one:
```powershell
docker compose exec backend python scripts/seed_admin.py
```
Edit the `ORG_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` constants at the top
of `scripts/seed_admin.py` before running it for a real client.

Then:
```powershell
curl -X POST http://localhost:8010/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"admin@demo-client.test\",\"password\":\"change-me-after-first-login\"}"
```

## Customers CRUD + geocoding — done
- `POST /api/customers` — admin/manager only; geocodes the address via
  Mapbox **Permanent Geocoding API** (`permanent=true`) before saving,
  because `latitude`/`longitude` are stored indefinitely in our DB —
  Mapbox's terms require Permanent storage for that, not the cheaper
  Temporary tier. **No free tier on Permanent Geocoding** — every call
  costs $5/1,000 requests from the first one, but this only runs once
  per customer (at creation, or when an address is edited), not per visit.
- `GET /api/customers`, `GET /api/customers/{id}` — any role (agents need
  to see customers to plan visits)
- `PATCH /api/customers/{id}` — admin/manager only; re-geocodes if the
  address field changes
- `DELETE /api/customers/{id}` — admin/manager only
- `app/core/geocoding.py` — the Mapbox call itself, isolated here so the
  router stays about business logic, not HTTP client details
- Every endpoint filters by `current_user.organization_id` — the actual
  tenant-isolation enforcement this schema was designed around

### Required: add your Mapbox secret token
Add to `.env`:
```
MAPBOX_SECRET_TOKEN=sk.your-secret-token-here
```
Then rebuild: `docker compose up --build`

## Suggested next steps
1. Visit check-in endpoint (geofence distance check, per the earlier discussion)

## Daily routes + OSRM — done
- `POST /api/routes` — admin/manager only. Give it `agent_id`, `route_date`,
  a `start_latitude`/`start_longitude` (the office, or wherever the day
  starts), and a list of `customer_ids`. It calls OSRM's `/trip` endpoint
  to find the best visit order, stores the result on `daily_routes`, and
  creates one `visits` row per customer in that optimized order.
- `GET /api/routes/{id}`, `GET /api/routes?agent_id=&route_date=`
- `app/core/osrm.py` — the OSRM HTTP call, isolated from the router same
  as the Mapbox geocoding call
- One route per agent per day is enforced (409 if one already exists —
  there's no update/re-optimize endpoint yet, only create)

### Required: one-time OSRM map data setup (run on your machine)
OSRM needs pre-processed map data before `fieldforce_osrm` can start. Do
this once (or again later for fresher map data):

```powershell
cd D:\Kuntal\fieldforce-manager
mkdir osrm-data
curl -o osrm-data\eastern-zone-latest.osm.pbf https://download.geofabrik.de/asia/india/eastern-zone-latest.osm.pbf
```
This is Geofabrik's "Eastern Zone" extract (Bihar, Jharkhand, Odisha, West
Bengal) — about 227 MB. It covers West Bengal plus some neighboring states,
which is fine; OSRM just won't route outside this area.

Process it with the same `osrm-backend` image (each step can take a few
minutes):
```powershell
docker run -t -v "D:\Kuntal\fieldforce-manager\osrm-data:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/eastern-zone-latest.osm.pbf
docker run -t -v "D:\Kuntal\fieldforce-manager\osrm-data:/data" osrm/osrm-backend osrm-partition /data/eastern-zone-latest.osrm
docker run -t -v "D:\Kuntal\fieldforce-manager\osrm-data:/data" osrm/osrm-backend osrm-customize /data/eastern-zone-latest.osrm
```

Then start the OSRM service:
```powershell
docker compose up -d osrm
```
Test it directly (bypassing the backend) with a known-good coordinate pair:
```powershell
Invoke-RestMethod "http://localhost:5004/route/v1/driving/88.3639,22.5726;88.4,22.6"
```
A JSON response with a `routes` array confirms OSRM is serving correctly.

Port choices in `docker-compose.yml` (5442 Postgres, 8011 API, 5051 pgAdmin,
5004 OSRM) are placeholders — adjust them to whatever's actually free.

## Visit check-in / check-out — done
- `POST /api/visits/{id}/check-in` — **agents only**, and only for their
  own assigned visit (organization_id *and* agent_id both checked — a
  manager's token is correctly blocked here, since the geofence check is
  about where *that specific agent* physically is).
  Takes `multipart/form-data`: `latitude`, `longitude`, and an optional
  `photo` (jpg/png). Computes the real distance (Haversine) to the
  customer's stored coordinates — if it's beyond `geofence_radius_m`,
  the check-in is rejected (422) with the actual distance in the error,
  so the agent knows how much closer to get. On success, stores
  `check_in_distance_m` (not just pass/fail) for later manager review of
  borderline cases, and the photo as a second, independent trust layer
  per the earlier discussion (GPS alone is spoofable; a real-time photo
  much less so).
- `POST /api/visits/{id}/check-out` — agent only, own visit, must already
  be checked in; accepts optional `visit_notes`.
- `GET /api/visits/{id}`, `GET /api/visits?daily_route_id=&agent_id=` —
  agents see only their own visits; admin/manager see the whole org's.
- `app/core/geo.py` — the Haversine formula, isolated and unit-testable
  on its own (verified against known Kolkata-Howrah distance during dev).
- Photos are saved to `backend/uploads/visit_photos/` (persisted via a
  Docker volume — see `docker-compose.yml`) and served back at
  `/uploads/visit_photos/<filename>`.

### What's deliberately NOT here yet
- No endpoint to override a rejected (out-of-radius) check-in — if that's
  needed (e.g. a manager manually approving a borderline case), it's a
  separate future endpoint, not a flag on this one.
- No live GPS ingestion (`gps_pings`) or deviation-alert logic yet — that's
  the next layer, separate from check-in itself.

## Suggested next steps
1. GPS ping ingestion endpoint (`POST /api/gps-pings`, high-frequency,
   called every 30-60s from the agent app while on duty)
2. Deviation alert logic (compare live position to the planned route geometry)
3. Attendance sessions (on-duty/off-duty, tied to login/logout)

## GPS tracking + deviation alerts — done
- `POST /api/gps-pings` — agent only. Call this every 30-60s while on duty,
  independent of check-in/check-out (this is what lets a deviation show up
  even if the agent skips check-in entirely — the earlier "cinema instead
  of the customer" scenario). Inserts into `gps_pings`, then — if the
  agent has a route planned for today — checks the distance from this
  point to the planned route's geometry (`app/core/geo.py`'s
  `distance_to_route_m`, a point-to-polyline distance using a flat-earth
  approximation, accurate enough over a day's route span — verified
  against known test cases during dev).
  If that distance exceeds `DEVIATION_THRESHOLD_M` (500m default), a
  `DeviationAlert` row is created — but only if the cooldown
  (`DEVIATION_ALERT_COOLDOWN_MIN`, 10 min default) has elapsed since the
  last unresolved one for that agent+route, so a sustained deviation
  doesn't spam a new alert every single ping.
- `GET /api/gps-pings/live` — admin/manager only. Latest known position
  per agent (one row each), for the live-tracking map.
- `GET /api/deviation-alerts?agent_id=&resolved=`,
  `POST /api/deviation-alerts/{id}/resolve` — admin/manager only.

### Known simplification
"Today" for route-matching uses the ping's UTC date, not IST — fine for
now, but worth revisiting before go-live so a deviation check near
midnight IST doesn't match the wrong day's route.

## Suggested next steps
1. Attendance sessions (on-duty/off-duty, tied to login/logout) — this is
   what should actually start/stop the expectation of regular GPS pings
2. Expenses endpoints (submit, list, approve/reject)
3. Reports/analytics endpoints (route adherence %, visit completion rate)
4. Start the web dashboard (React) or mobile app (React Native)
