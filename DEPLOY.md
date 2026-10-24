# Deploying FieldForce Manager to the shared VPS

Design: ONE domain serves both the web dashboard and the API
(`https://<domain>/` and `https://<domain>/api/...`), so no CORS setup and
one certificate. The mobile app later points at the same URL.
Postgres is FieldForce's own container (isolated from the other products'
databases) but is visible in the VPS's existing pgAdmin — step 6.

> Deploy from YOUR local `D:\Kuntal\fieldforce-manager`, not a zip: your
> `backend/alembic/versions/` (migrations generated inside your container)
> only exists there, and the server needs them.

## 0. Test the migration chain from scratch (locally, 1 min)
The server DB starts empty, so every migration must run in order on a
blank database — your local DB never proved that.
```powershell
docker compose exec postgres psql -U fieldforce -c "CREATE DATABASE fieldforce_fresh;"
docker compose exec -e DATABASE_URL=postgresql+psycopg2://fieldforce:fieldforce_db@postgres:5432/fieldforce_fresh backend alembic upgrade head
docker compose exec postgres psql -U fieldforce -c "DROP DATABASE fieldforce_fresh;"
```
Fails? Fix it here, not on the server.

## 1. Domain
Hostinger DNS zone for vorpet.com -> add ONE record: type `A`, name
`fieldforce`, points to `187.127.150.252`. Touch no other record.
Verify with `nslookup fieldforce.vorpet.com` before running certbot
(a failed Let's Encrypt validation can lock that name out for a while).

## 2. Push to a PRIVATE GitHub repo
```powershell
cd D:\Kuntal\fieldforce-manager
git init; git add -A; git status   # confirm NO .env, osrm-data, uploads listed
git commit -m "FieldForce Manager"
git remote add origin <your-private-repo-url>; git push -u origin main
```

## 3. On the server — look first, change nothing
```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
ss -tlnp | grep -E ':(80|443|8011|8012)\b'
ls /etc/nginx/sites-enabled/
free -h; df -h /
```
8011/8012 must be unused. OSRM wants ~2 GB+ RAM free — check `du -sh osrm-data` locally and compare.

## 4. Get the code + secrets onto the server
```bash
cd /opt && git clone <repo-url> fieldforce-manager && cd fieldforce-manager
cp .env.prod.example .env && nano .env      # fill every value
openssl rand -hex 16   # -> POSTGRES_PASSWORD     openssl rand -hex 32   # -> SECRET_KEY
```
OSRM data (from your PC; not in git):
```powershell
scp -r D:\Kuntal\fieldforce-manager\osrm-data root@187.127.150.252:/opt/fieldforce-manager/
```

## 5. Start + initialise
```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_menu.py
docker compose exec -e ORG_NAME="Your Org" -e ADMIN_NAME="Your Name" -e ADMIN_EMAIL="you@example.com" -e ADMIN_PASSWORD='long-strong-password' backend python scripts/seed_admin_env.py
history -c    # the password is in your shell history otherwise
curl -s http://127.0.0.1:8011/health          # {"status":"ok",...}
```
There is no change-password endpoint yet — choose this password carefully.

## 6. Show the DB in the existing pgAdmin (:5050)
```bash
docker ps --format '{{.Names}}' | grep -i pgadmin     # note the name
docker network connect fieldforce_net <that-container-name>
```
pgAdmin → Register → Server: host `fieldforce_postgres`, port `5432`, db
`fieldforce_db`, user `fieldforce`, password = POSTGRES_PASSWORD.
Postgres has no public port; this private network is the only path in.
If that pgAdmin container is ever recreated, re-run the `network connect`.

## 7. Nginx + HTTPS
```bash
cp deploy/nginx-fieldforce.conf /etc/nginx/sites-available/fieldforce
ln -s /etc/nginx/sites-available/fieldforce /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d fieldforce.vorpet.com
```
`nginx -t` must say "ok" BEFORE reload — the other products share this Nginx.
Then open `https://<domain>` and log in.

## 8. Nightly backup
```bash
mkdir -p /opt/backups && crontab -e
# add:
0 2 * * * docker exec fieldforce_postgres pg_dump -U fieldforce fieldforce_db | gzip > /opt/backups/fieldforce_$(date +\%F).sql.gz
```
Also back up `backend/uploads/` (photos live there, not in the DB).

## Updating later
```bash
cd /opt/fieldforce-manager && git pull && docker compose up -d --build && docker compose exec backend alembic upgrade head
```

## Later
- Mobile app: set `API_BASE_URL` to `https://<domain>`; the `usesCleartextTraffic` workaround is then unnecessary.
- Mapbox public token is baked into the web bundle: restrict it to this domain in the Mapbox dashboard — but use a SEPARATE unrestricted-by-URL token for the mobile app (native requests carry no Referer, so URL-restricted tokens fail there).
