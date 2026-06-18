-- First-class object categories with one level of nesting (category → subcategory),
-- plus objects.category_id so items can be assigned (and dragged) into them.
-- The legacy free-text objects.category column is left in place, unused.
CREATE TABLE categories (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	name text NOT NULL,
	parent_id integer,
	sort_order integer DEFAULT 0 NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX idx_categories_parent ON categories (parent_id);--> statement-breakpoint
ALTER TABLE objects ADD category_id integer REFERENCES categories(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX idx_objects_category_id ON objects (category_id);
