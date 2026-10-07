import type { Config, Context } from "@netlify/functions";
import { getUser } from "@netlify/identity";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { movies } from "../../db/schema.js";

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function extractImdbId(link: string) {
  return link.match(/tt\d{5,10}/)?.[0] ?? "";
}

export default async (req: Request, context: Context) => {
  const id = context.params.id;

  if (!id && req.method === "GET") {
    const rows = await db.select().from(movies).orderBy(desc(movies.addedAt));
    return Response.json(rows);
  }

  // Ver a lista é livre; qualquer alteração exige login.
  if (["POST", "PATCH", "DELETE"].includes(req.method) && !(await getUser())) {
    return Response.json({ error: "Faça login para alterar a lista" }, { status: 401 });
  }

  if (!id && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const title = str(body.title, 200);
    if (!title) return Response.json({ error: "Título obrigatório" }, { status: 400 });

    const link = str(body.link);
    const imdbId = extractImdbId(link);
    if (imdbId) {
      const [dup] = await db.select().from(movies).where(eq(movies.imdbId, imdbId)).limit(1);
      if (dup) return Response.json({ error: "Esse filme já está na lista", movie: dup }, { status: 409 });
    }

    const [row] = await db
      .insert(movies)
      .values({
        id: "m_" + crypto.randomUUID(),
        title,
        link,
        imdbId,
        genres: Array.isArray(body.genres) ? body.genres.map((g: unknown) => str(g, 40)).filter(Boolean).slice(0, 10) : [],
        poster: str(body.poster),
        imdbRating: str(body.imdbRating, 10),
        year: str(body.year, 10),
        country: str(body.country, 60),
      })
      .returning();
    return Response.json(row, { status: 201 });
  }

  if (id && req.method === "PATCH") {
    const body = await req.json().catch(() => ({}));
    const patch: Partial<typeof movies.$inferInsert> = {};
    if (typeof body.watched === "boolean") {
      patch.watched = body.watched;
      patch.watchedAt = body.watched ? new Date() : null;
      if (!body.watched) patch.rating = 0;
    }
    if (Number.isInteger(body.rating) && body.rating >= 0 && body.rating <= 5) patch.rating = body.rating;
    if (Array.isArray(body.genres)) patch.genres = body.genres.map((g: unknown) => str(g, 40)).filter(Boolean).slice(0, 10);
    if (!Object.keys(patch).length) return Response.json({ error: "Nada para atualizar" }, { status: 400 });

    const [row] = await db.update(movies).set(patch).where(eq(movies.id, id)).returning();
    if (!row) return Response.json({ error: "Filme não encontrado" }, { status: 404 });
    return Response.json(row);
  }

  if (id && req.method === "DELETE") {
    await db.delete(movies).where(eq(movies.id, id));
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: ["/api/movies", "/api/movies/:id"],
};
