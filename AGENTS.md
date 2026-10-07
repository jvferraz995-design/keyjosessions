# AGENTS.md

## Arquitetura

- `public/` — frontend estático sem build: `index.html`, `styles.css`, `app.js` (JS puro, sem framework). Publicado como raiz do site (`netlify.toml`).
- `netlify/functions/movies.mts` — CRUD em `/api/movies` e `/api/movies/:id` (GET lista, POST cria, PATCH atualiza `watched`/`rating`/`genres`, DELETE remove).
- `netlify/functions/imdb.mts` — `POST /api/imdb { link }`. Primeiro lê o JSON-LD da página do IMDb; usa `claude-haiku-4-5` (via AI Gateway) só para traduzir título/gêneros e inferir o país. Se o IMDb bloquear a leitura, cai para `claude-sonnet-4-6` com a ferramenta `web_search`.
- `db/schema.ts` — tabela `movies` (Drizzle). Migrações em `netlify/database/migrations/` (geradas com `drizzle-kit generate`, nunca editar à mão nem aplicar manualmente).

## Convenções e decisões

- Interface e textos em português do Brasil, tom informal ("vocês dois").
- A lista de gêneros (`GENRES`) existe no frontend (`app.js`) e na function `imdb.mts`; mantenha as duas iguais.
- Atualizações são otimistas no frontend e revertidas se a API falhar. Cada operação é por filme (não se sobrescreve a lista inteira) para evitar conflitos entre os dois usuários.
- Remoção é adiada 5 s para permitir "Desfazer"; remoções pendentes são enviadas com `keepalive` no `pagehide`.
- Pôsteres de `m.media-amazon.com` passam pelo Netlify Image CDN (`/.netlify/images`), liberado em `[images] remote_images` no `netlify.toml`.
- `imdbId` (ex. `tt1234567`) é extraído do link e usado para bloquear duplicados (409 na API).
- Login com Netlify Identity (cadastro só por convite). Ver a lista é livre; `POST`/`PATCH`/`DELETE` em `/api/movies` e `/api/imdb` exigem `getUser()`. No frontend, `@netlify/identity` é importado de `esm.sh` (sem build); `requireAuth()` abre o modal de login só se não houver sessão.
- Visual: escuro, minimalista e sci-fi (Michroma + IBM Plex, acento ciano `#8ef0ff`, linhas finas e cantos em colchete).
