-- Pi bridge transport removed. The app now supports only two transports:
-- standalone (browser / desktop file-open) and direct MQTT (desktop, beta).
-- See docs/local-file-flow.md and docs/print-start-flow.md.
DROP TABLE IF EXISTS pi_settings;
