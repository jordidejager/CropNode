-- Weather alert log — tracks sent proactive alerts for cooldown/dedup
CREATE TABLE IF NOT EXISTS weather_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'frost', 'spray_window', 'extreme_rain'
  payload JSONB,            -- alert details for debugging
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- For fast cooldown lookups
  CONSTRAINT valid_alert_type CHECK (alert_type IN ('frost', 'spray_window', 'extreme_rain'))
);

-- Index for cooldown queries: "was this alert type sent recently for this user?"
CREATE INDEX IF NOT EXISTS idx_weather_alert_log_cooldown
  ON weather_alert_log (user_id, alert_type, sent_at DESC);

-- RLS: service-role only (cron context, no user session)
ALTER TABLE weather_alert_log ENABLE ROW LEVEL SECURITY;

-- Allow service-role full access (used by cron job)
CREATE POLICY IF NOT EXISTS "Service role full access" ON weather_alert_log
  FOR ALL USING (true) WITH CHECK (true);

-- Cleanup: auto-delete alerts older than 30 days
-- (run manually or via pg_cron if available)
