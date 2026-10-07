CREATE TABLE "movies" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"imdb_id" text DEFAULT '' NOT NULL,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"poster" text DEFAULT '' NOT NULL,
	"imdb_rating" text DEFAULT '' NOT NULL,
	"year" text DEFAULT '' NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"watched_at" timestamp with time zone
);
