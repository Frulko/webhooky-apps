# webhooky · `hooky`

> Receive webhooks in the cloud, forward them to localhost.

`hooky` is the CLI companion for a self-hosted [webhooky server](https://github.com/Frulko/webhooky-apps). It opens a persistent WebSocket tunnel between your server and your local machine, forwarding every incoming webhook in real time — no port-forwarding, no ngrok account.

```
  hooky v0.2.1
  ─────────────────────────────────────────────
  $ hooky init          # first-time setup
  $ hooky connect       # start forwarding
  $ hooky replay -i 42  # re-send a past webhook
```

---

## Requirements

- **Node.js 18+**
- A running [webhooky server](https://github.com/Frulko/webhooky-apps) (self-hosted)

---

## Installation

```bash
npm install -g webhooky
```

Verify:

```bash
hooky --version
```

---

## Quick start

### 1. Run the setup wizard

```bash
hooky init
```

The wizard will ask for:

| Prompt | Notes |
|---|---|
| Dashboard URL | The URL of your webhooky server |
| Email / Password | Your account credentials — password is never stored |
| Client | Pick from existing clients, or create one in the dashboard first |
| Endpoint | Pick from endpoints on that client |
| Forward URL | Your local server, e.g. `http://localhost:3000/webhooks` |

Everything is saved to a local config file (see [Config file](#config-file)).

### 2. Start forwarding

```bash
hooky connect
```

That's it. Incoming webhooks are forwarded to your local URL in real time.  
Press `Ctrl+C` to disconnect.

---

## Commands

### `hooky init`

Interactive first-time setup. Authenticates, lets you pick a client and endpoint, sets the local forward URL, and writes the config file.

```bash
hooky init
```

Re-run it any time to reconfigure from scratch.

---

### `hooky connect`

Open a WebSocket connection to the server and forward webhooks locally.

```bash
hooky connect [options]
```

| Option | Description |
|---|---|
| `-t, --token <token>` | Endpoint token (overrides config) |
| `-k, --key <apiKey>` | Client API key (overrides config) |
| `-f, --forward <url>` | Local URL to forward to (overrides config) |
| `-s, --server <url>` | Server URL (overrides config) |

**Without flags**, `hooky connect` uses the saved config. If multiple clients or endpoints are available, it prompts interactively.

**Reconnect**: the CLI reconnects automatically with exponential back-off (1s → 2s → … → 30s) if the connection drops.

**Output example:**

```
  hooky
  ─────────────────────────────────────
  Endpoint:      my-endpoint
  Forwarding to: http://localhost:3000/webhooks
  Server:        https://hooks.example.com
  ─────────────────────────────────────

  ✓ Connected
  14:23:01 POST → http://localhost:3000/webhooks
           → 200 OK
  14:23:45 POST → http://localhost:3000/webhooks
           → 200 OK
```

---

### `hooky replay`

Re-send a stored webhook to your local server.

```bash
hooky replay --id <webhookId> [options]
```

| Option | Required | Description |
|---|---|---|
| `-i, --id <webhookId>` | Yes | ID of the webhook to replay |
| `-f, --forward <url>` | No | Local URL (overrides config) |
| `-s, --server <url>` | No | Server URL (overrides config) |

The webhook ID is visible in the dashboard and in the CLI output when a webhook arrives.

---

### `hooky switch`

Switch the active client/endpoint without re-authenticating.

```bash
hooky switch
```

Useful when you have multiple projects and want to point `hooky connect` at a different endpoint.

---

### `hooky list`

Browse all clients and endpoints on the server.

```bash
hooky list
```

---

### `hooky status`

Show the current config (secrets redacted) and check whether the session is still valid.

```bash
hooky status
```

Example output:

```
  hooky — status
  ─────────────────────────────────────
  Config file   /Users/you/Library/Application Support/hooky/config.json
  Server        https://hooks.example.com
  Email         you@example.com
  Role          user
  Token         expires in 43m
  Client        my-app  wc_abc123ef…
  Endpoint      production  token: a1b2c3…
  Forward       http://localhost:3000/webhooks
  ─────────────────────────────────────
  ✓ Authenticated as you@example.com
```

---

### `hooky login`

Re-authenticate without changing the rest of the config (client, endpoint, forward URL are preserved).

```bash
hooky login
```

---

### `hooky logout`

Delete the config file and clear all saved credentials.

```bash
hooky logout
```

---

## Config file

The config is stored as a JSON file with `chmod 0600` permissions. Location by platform:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/hooky/config.json` |
| Linux | `~/.config/hooky/config.json` (or `$XDG_CONFIG_HOME/hooky/config.json`) |
| Windows | `%APPDATA%\hooky\Config\config.json` |

Override the path via environment variable:

```bash
HOOKY_CONFIG=/tmp/test.json hooky init
```

**Secrets stored:** JWT access token, refresh token, client API key.  
**Never stored:** your password.

---

## Security

- Connections are authenticated via a short-lived **one-time connect token** (30s TTL) issued by the server before each WebSocket connection. The API key is never sent in the URL.
- The JWT is automatically refreshed before expiry; if the refresh fails the CLI prompts you to run `hooky login`.
- The config file is written atomically (temp file + rename) with `mode 0600`. The CLI warns if it detects world-readable permissions.

---

## Environment variables

| Variable | Description |
|---|---|
| `HOOKY_CONFIG` | Override config file path |

---

## License

MIT
