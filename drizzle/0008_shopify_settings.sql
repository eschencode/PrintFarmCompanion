-- Shopify API settings (store domain + access token)
CREATE TABLE shopify_settings (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	store_domain text NOT NULL,
	access_token text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL
);
