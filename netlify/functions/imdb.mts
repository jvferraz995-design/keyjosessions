import type { Config } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@netlify/identity";

const GENRES = ["Ação","Aventura","Comédia","Drama","Terror","Ficção científica","Fantasia","Romance","Suspense","Animação","Documentário","Crime","Guerra","Musical","Família","Mistério"];

type Info = { title: string; poster: string; imdbRating: string; year: string; genres: string[]; country: string };

const anthropic = new Anthropic();

// Tenta ler os metadados estruturados (JSON-LD) da própria página do IMDb.
async function scrapeImdb(imdbId: string) {
  const res = await fetch(`https://www.imdb.com/title/${imdbId}/`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  if (!ld) return null;
  const data = JSON.parse(ld);
  return {
    title: String(data.name || ""),
    alternateName: String(data.alternateName || ""),
    poster: String(data.image || ""),
    imdbRating: data.aggregateRating?.ratingValue ? String(data.aggregateRating.ratingValue) : "",
    year: String(data.datePublished || "").slice(0, 4),
    genres: [].concat(data.genre || []).map(String),
  };
}

function parseJson(text: string) {
  const match = text.replace(/```json|```/gi, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Resposta sem JSON");
  return JSON.parse(match[0]);
}

function textOf(msg: Anthropic.Message) {
  return msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");
}

const RULES = `Responda APENAS com JSON válido no formato:
{"title":"","poster":"","imdbRating":"","year":"","genres":[],"country":""}
- "title": título oficial em português do Brasil se existir, senão o original.
- "poster": URL direta da imagem do pôster (vazio se não tiver certeza).
- "imdbRating": nota no IMDb, ex "8.1".
- "year": ano de lançamento.
- "genres": de 1 a 3 gêneros, escolhidos SOMENTE desta lista: ${GENRES.join(", ")}.
- "country": país de origem principal, em português (ex: "Estados Unidos", "Coreia do Sul").`;

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!(await getUser())) return Response.json({ error: "Faça login para buscar filmes" }, { status: 401 });
  const { link } = await req.json().catch(() => ({}));
  const imdbId = typeof link === "string" ? link.match(/tt\d{5,10}/)?.[0] : undefined;
  if (!imdbId) return Response.json({ error: "Link do IMDb inválido" }, { status: 400 });

  let scraped: Awaited<ReturnType<typeof scrapeImdb>> = null;
  try {
    scraped = await scrapeImdb(imdbId);
  } catch {
    scraped = null;
  }

  try {
    let raw: Record<string, unknown>;
    if (scraped) {
      // Temos os dados oficiais; a IA só traduz título/gêneros e completa o país.
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Dados do IMDb (${imdbId}): ${JSON.stringify(scraped)}\nMantenha poster, imdbRating e year exatamente como vieram.\n${RULES}`,
        }],
      });
      raw = { ...parseJson(textOf(msg)), poster: scraped.poster, imdbRating: scraped.imdbRating, year: scraped.year };
    } else {
      // IMDb bloqueou a leitura direta: pesquisa na web.
      const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
        messages: [{ role: "user", content: `Pesquise o título do IMDb https://www.imdb.com/title/${imdbId}/\n${RULES}` }],
      });
      raw = parseJson(textOf(msg));
    }

    const info: Info = {
      title: String(raw.title || scraped?.title || ""),
      poster: String(raw.poster || ""),
      imdbRating: String(raw.imdbRating || ""),
      year: String(raw.year || ""),
      genres: (Array.isArray(raw.genres) ? raw.genres : []).map(String).filter((g) => GENRES.includes(g)).slice(0, 3),
      country: String(raw.country || ""),
    };
    return Response.json(info);
  } catch (err) {
    console.error("imdb lookup failed", err);
    if (scraped) {
      return Response.json({ title: scraped.title, poster: scraped.poster, imdbRating: scraped.imdbRating, year: scraped.year, genres: [], country: "" });
    }
    return Response.json({ error: "Não consegui buscar as informações agora" }, { status: 502 });
  }
};

export const config: Config = {
  path: "/api/imdb",
};
