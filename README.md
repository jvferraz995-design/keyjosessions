# Keyjo Sessions

O catálogo e o sorteio oficial de filmes do casal. Um app de uma página para montar a lista de filmes que vocês querem ver, sortear o filme da noite (com filtro de gênero), marcar o que já foi assistido e dar a nota de vocês.

## Funcionalidades

- **Lista compartilhada de verdade** — salva no Netlify Database (Postgres); quem abrir o site vê a mesma lista, que atualiza sozinha a cada 30 s e quando a aba volta ao foco.
- **Preenchimento automático pelo IMDb** — é só colar o link: título em português, pôster, ano, país, nota do IMDb e até 3 gêneros.
- **Aviso de duplicado** — o mesmo título do IMDb não entra duas vezes.
- **Sorteio estilo roleta** — não repete o último sorteado; dá pra marcar "vamos ver esse" direto do bilhete.
- **Lista com busca, ordenação** (recentes, A–Z, nota IMDb, nossa nota, ano) e contadores por aba.
- **Login só para quem mexe na lista** — qualquer um vê a lista, mas adicionar, marcar, dar nota e remover pedem login (uma vez por navegador). As contas são criadas por convite no painel da Netlify (Identity → Invite users).
- **Remover com "Desfazer"** e painel de estatísticas (na lista / pra ver / assistidos / nossa média).

## Tecnologias

- HTML, CSS e JavaScript puro (`public/`)
- Netlify Functions (TypeScript) para a API (`netlify/functions/`)
- Netlify Database + Drizzle ORM (`db/`)
- Netlify AI Gateway (Claude) para completar e traduzir os dados do IMDb
- Netlify Image CDN para servir os pôsteres otimizados

## Rodando localmente

```bash
npm install
netlify dev
```

Se mudar `db/schema.ts`, gere a migração com `npx drizzle-kit generate --name <descricao>`. As migrações são aplicadas automaticamente no deploy.
