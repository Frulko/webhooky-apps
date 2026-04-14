# hooky

Receive webhooks from anywhere, inspect them in a dashboard, forward them to your localhost in real time.

```
External service → POST /hook/:token → hooky server → WebSocket → hooky CLI → localhost:8080
```

## What it does

When you're building an integration that receives webhooks (Stripe, GitHub, Shopify…), your local dev server isn't reachable from the internet. hooky bridges that gap:

- Your server receives the webhook and stores it
- The CLI client, running on your machine, gets it over WebSocket and forwards it to your local app
- The dashboard lets you inspect every request, replay it, and manage your endpoints

No port forwarding. No tunnel config. No account on a third-party service — you host it yourself.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        hooky server                         │
│                                                             │
│  POST /hook/:token ──► store in PostgreSQL                  │
│                    └──► broadcast via WebSocket bridge      │
│                                                             │
│  GET  /ws/:token   ◄──► CLI client connection               │
│  /api/*            ◄──► Dashboard (React SPA)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ▲                            ▲
         │                            │
   external services           your browser
   (Stripe, GitHub…)           (dashboard)
                                      │
                               WebSocket (WSS)
                                      │
                                      ▼
                            ┌─────────────────┐
                            │   hooky CLI     │
                            │  (your laptop)  │
                            └────────┬────────┘
                                     │ HTTP forward
                                     ▼
                            localhost:8080/webhook
```

### Monorepo structure

```
apps/
├── server/   Fastify API — webhook receiver, WebSocket bridge, REST API, serves SPA
├── web/      React dashboard — inspect webhooks, manage clients/endpoints, replay
└── cli/      Node.js CLI — connect, forward, replay (published as `webhooky` on npm)
```

### Key concepts

| Concept | Description |
|---|---|
| **Client** | A logical grouping (e.g. "my stripe integration"). Has an API key used by the CLI. |
| **Endpoint** | A webhook receiver URL under a client. Has a unique token: `/hook/:token`. |
| **Connection** | An active CLI session. One endpoint can have multiple connected clients. |
| **Replay** | Re-send any stored webhook to a live CLI connection or a custom URL. |

---

## Getting started (self-hosted)

### Prerequisites

- Docker + Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/yourname/webhook-catcher
cd webhook-catcher
cp .env.example .env
```

Edit `.env`:

```env
JWT_SECRET=a_long_random_string_change_this
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a_strong_password
```

### 2. Start

```bash
docker compose up -d
```

The server starts on port `3000`. On first boot it runs migrations and creates the admin account.

### 3. Open the dashboard

Go to `http://localhost:3000` (or your server's URL).

Log in with the admin credentials from your `.env`.

### 4. Create a client and endpoint

In the dashboard:
1. Go to **Clients** → **New client**
2. Inside the client → **New endpoint** → give it a name

Your webhook URL is now: `https://your-server.com/hook/<endpoint-token>`

---

## CLI

### Install

```bash
npm install -g webhooky
```

Or use without installing:

```bash
npx webhooky <command>
```

### Setup

```bash
hooky init
```

The wizard asks for your dashboard URL, email, and password, then lets you pick a client and endpoint. Config is saved to `~/.config/hooky/config.json` (macOS: `~/Library/Application Support/hooky/config.json`) with `chmod 600`.

### Connect

```bash
hooky connect
```

Starts forwarding webhooks to your local server. Flags override saved config:

```bash
hooky connect --forward http://localhost:9000/webhook
```

### All commands

```
hooky init              First-time setup (server, login, client, endpoint, forward URL)
hooky connect           Start forwarding webhooks to localhost
hooky replay --id <id>  Replay a stored webhook to your local server
hooky status            Show current config and auth status
hooky list              List all clients and endpoints
hooky switch            Pick a different client/endpoint without re-logging in
hooky login             Re-authenticate (keeps client/endpoint config)
hooky logout            Remove saved credentials
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `JWT_SECRET` | — | Secret for signing JWTs (required) |
| `JWT_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `ADMIN_EMAIL` | `admin@example.com` | Admin account created on first boot |
| `ADMIN_PASSWORD` | `changeme` | Admin password on first boot |
| `NODE_ENV` | `development` | Set to `production` in prod |

CLI config path override:

```bash
HOOKY_CONFIG=/path/to/config.json hooky connect
```

---

## HMAC verification

Endpoints optionally verify webhook signatures. Set a `hmac_secret` on the endpoint in the dashboard. hooky will reject any request where the signature in `x-hub-signature-256` doesn't match.

---

## Development

### Requirements

- Node.js 22+
- pnpm 9+
- PostgreSQL 16

### Start everything

```bash
pnpm install
# start postgres however you like (Docker, Homebrew…)
DATABASE_URL=postgresql://... pnpm --filter @hooky/server dev
pnpm --filter web dev
```

The Vite dev server proxies `/api`, `/hook`, and `/ws` to `:3000`.

### Stack

| Layer | Tech |
|---|---|
| Server | Fastify, postgres.js, @fastify/jwt, @fastify/websocket |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| CLI | Node.js ESM, Commander, Inquirer, ws |
| Database | PostgreSQL 16 |
| Infra | Docker, Docker Compose |

---

## License

MIT
