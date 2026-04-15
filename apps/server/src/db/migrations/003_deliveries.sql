-- Delivery reports: CLI forwarding results reported back from connected clients
CREATE TABLE IF NOT EXISTS deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  session_id       UUID REFERENCES ws_sessions(id) ON DELETE SET NULL,
  status_code      INTEGER,
  response_headers JSONB,
  response_body    TEXT,
  duration_ms      INTEGER,
  error_msg        TEXT,
  forwarded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_webhook_id ON deliveries(webhook_id);
