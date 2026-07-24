-- Per-workspace Pi bridge config (tunnel URL + encrypted shared secret).
-- Replaces the global PI_TUNNEL_URL / PI_SECRET env vars — completes the
-- multi-tenant switch so each workspace addresses its own Pi. pi_secret is
-- AES-256-GCM ciphertext (src/lib/server/crypto.ts). No env fallback.
CREATE TABLE pi_settings (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	tunnel_url text NOT NULL,
	pi_secret text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX uniq_pi_settings_workspace ON pi_settings (workspace_id);
