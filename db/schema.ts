import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const movies = pgTable("movies", {
  id: text().primaryKey(),
  title: text().notNull(),
  link: text().notNull().default(""),
  imdbId: text("imdb_id").notNull().default(""),
  genres: text().array().notNull().default([]),
  watched: boolean().notNull().default(false),
  rating: integer().notNull().default(0),
  poster: text().notNull().default(""),
  imdbRating: text("imdb_rating").notNull().default(""),
  year: text().notNull().default(""),
  country: text().notNull().default(""),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  watchedAt: timestamp("watched_at", { withTimezone: true }),
});

export type Movie = typeof movies.$inferSelect;
