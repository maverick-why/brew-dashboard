-- sponsor_records: stores tap sponsorship claims
CREATE TABLE IF NOT EXISTS sponsor_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tap_no         INTEGER NOT NULL,
  sponsor_name   TEXT NOT NULL,
  open_id        TEXT NOT NULL,
  customer_uid   TEXT NOT NULL,
  review_result  TEXT NOT NULL CHECK (review_result IN ('pass', 'edge', 'fail')),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'live', 'rejected')),
  reject_reason  TEXT,
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    TEXT,
  expire_at      TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active (live or pending) sponsor per tap at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_sponsor_records_active_tap
  ON sponsor_records (tap_no)
  WHERE status IN ('live', 'pending');

-- Speed up lookup by phone (open_id = 'h5:{phone}')
CREATE INDEX IF NOT EXISTS idx_sponsor_records_open_id
  ON sponsor_records (open_id);

-- Speed up tap-list query (fetch all active sponsors)
CREATE INDEX IF NOT EXISTS idx_sponsor_records_status
  ON sponsor_records (status);


-- pospal_compensation_log: manual reconciliation log for failed refunds
CREATE TABLE IF NOT EXISTS pospal_compensation_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  open_id    TEXT NOT NULL,
  tap_no     INTEGER,
  action     TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
