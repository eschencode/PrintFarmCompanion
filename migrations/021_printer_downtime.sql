CREATE TABLE IF NOT EXISTS printer_downtime (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id  INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  started_at  INTEGER NOT NULL,   -- unix ms, when BROKEN was set
  ended_at    INTEGER,            -- unix ms, NULL = still broken right now
  note        TEXT                -- optional free-text reason (e.g. "clogged nozzle")
);

CREATE INDEX IF NOT EXISTS idx_printer_downtime_printer
  ON printer_downtime(printer_id);
