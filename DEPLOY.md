# Deployment guide

## Docker Compose (recommended)

The simplest way. One command, everything included.

### 1. Prepare the server

```bash
git clone https://github.com/yourname/webhook-catcher
cd webhook-catcher
cp .env.example .env
```

Edit `.env` with production values:

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=postgresql://webhook:webhook@postgres:5432/webhook_catcher

JWT_SECRET=<generate: openssl rand -hex 64>

ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=<strong password>
```

### 2. Start

```bash
docker compose up -d
```

On first boot the server will:
1. Run database migrations
2. Create the admin account (if no users exist)
3. Start listening on port 3000

Check logs:

```bash
docker compose logs -f server
```

### 3. Expose via reverse proxy

Put Nginx or Caddy in front. hooky needs:
- HTTP → HTTPS redirect
- WebSocket passthrough (`Upgrade` header)

**Caddy** (automatic HTTPS):

```
your-domain.com {
    reverse_proxy localhost:3000
}
```

**Nginx:**

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSL config here...

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Portainer

### Stack deployment

1. In Portainer, go to **Stacks** → **Add stack**
2. Paste the contents of `docker-compose.yml`
3. Add environment variables in the **Environment variables** section:
   - `JWT_SECRET` → `<your secret>`
   - `ADMIN_EMAIL` → `you@example.com`
   - `ADMIN_PASSWORD` → `<your password>`
4. Click **Deploy the stack**

The `DATABASE_URL` is already set in the compose file to point to the internal `postgres` service — no need to override it unless you use an external database.

### Using an external PostgreSQL

Remove the `postgres` service from the compose file and set:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

---

## Updates

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

Migrations run automatically on startup — no manual steps needed.

---

## Backup

The only stateful component is PostgreSQL. Back up the `pgdata` volume:

```bash
docker exec webhook-catcher-postgres-1 pg_dump -U webhook webhook_catcher > backup.sql
```

Restore:

```bash
cat backup.sql | docker exec -i webhook-catcher-postgres-1 psql -U webhook webhook_catcher
```

---

## Production checklist

- [ ] `JWT_SECRET` is a long random string (`openssl rand -hex 64`)
- [ ] `ADMIN_PASSWORD` is strong and changed from default
- [ ] `NODE_ENV=production`
- [ ] HTTPS enabled via reverse proxy
- [ ] WebSocket `Upgrade` header passed through
- [ ] PostgreSQL port `5432` not exposed publicly (remove `ports:` from compose)
- [ ] Firewall allows only 80/443

---

## Troubleshooting

**Server won't start — database connection refused**

The `postgres` service might not be healthy yet. The `depends_on` healthcheck should handle this, but if it fails:

```bash
docker compose restart server
```

**WebSocket connections drop immediately**

Check that your reverse proxy passes the `Upgrade` header. Without it, WebSocket handshakes fail silently.

**Admin account not created**

The seed only runs if the `users` table is empty. If you changed `ADMIN_EMAIL`/`ADMIN_PASSWORD` after first boot, create the user in the dashboard (Admin → Users → New user).

**CLI can't connect**

```bash
hooky status   # check auth and config
hooky login    # re-authenticate if token expired
```
