-- better-auth admin plugin columns (role, ban state, impersonation marker).
-- All nullable/defaulted so plain ADD COLUMN is safe on existing rows.
ALTER TABLE user ADD COLUMN role text;--> statement-breakpoint
ALTER TABLE user ADD COLUMN banned integer DEFAULT false;--> statement-breakpoint
ALTER TABLE user ADD COLUMN ban_reason text;--> statement-breakpoint
ALTER TABLE user ADD COLUMN ban_expires integer;--> statement-breakpoint
ALTER TABLE session ADD COLUMN impersonated_by text;
