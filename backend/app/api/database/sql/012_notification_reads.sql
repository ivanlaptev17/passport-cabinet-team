CREATE TABLE IF NOT EXISTS notification_reads (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id BIGINT NOT NULL,
  read_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
