-- Phase 2 auth tables (better-auth core schema) + workspaces tenant container.
-- better-auth resolves these tables/columns by name; do not rename. IDs on the
-- auth tables are text (better-auth generates them). workspaces.id is integer to
-- match the domain-table FK style Phase 3 uses (workspace_id integer references
-- workspaces.id).
CREATE TABLE user (
	id text PRIMARY KEY NOT NULL,
	name text NOT NULL,
	email text NOT NULL,
	email_verified integer DEFAULT false NOT NULL,
	image text,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX uniq_user_email ON user (email);--> statement-breakpoint
CREATE TABLE session (
	id text PRIMARY KEY NOT NULL,
	expires_at integer NOT NULL,
	token text NOT NULL,
	ip_address text,
	user_agent text,
	user_id text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX uniq_session_token ON session (token);--> statement-breakpoint
CREATE INDEX idx_session_user ON session (user_id);--> statement-breakpoint
CREATE TABLE account (
	id text PRIMARY KEY NOT NULL,
	account_id text NOT NULL,
	provider_id text NOT NULL,
	user_id text NOT NULL,
	access_token text,
	refresh_token text,
	id_token text,
	access_token_expires_at integer,
	refresh_token_expires_at integer,
	scope text,
	password text,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX idx_account_user ON account (user_id);--> statement-breakpoint
CREATE TABLE verification (
	id text PRIMARY KEY NOT NULL,
	identifier text NOT NULL,
	value text NOT NULL,
	expires_at integer NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);--> statement-breakpoint
CREATE INDEX idx_verification_identifier ON verification (identifier);--> statement-breakpoint
CREATE TABLE workspaces (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	name text NOT NULL,
	slug text NOT NULL,
	owner_user_id text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (owner_user_id) REFERENCES user(id) ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX uniq_workspaces_slug ON workspaces (slug);--> statement-breakpoint
CREATE INDEX idx_workspaces_owner ON workspaces (owner_user_id);
