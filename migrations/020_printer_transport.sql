-- Add per-printer transport preference.
-- 'auto'   — desktop: prefer direct MQTT; browser: use Pi bridge
-- 'direct' — always use direct LAN MQTT (desktop only)
-- 'pi'     — always route through the Pi bridge (default / legacy)
ALTER TABLE printers ADD COLUMN transport TEXT NOT NULL DEFAULT 'auto';
