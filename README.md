# Remetum

PWA de mensagens com tema preto elegante. Tagline: *Conversas com estilo.*

## Stack

- **web** — Next.js 15 + TypeScript + Tailwind CSS (PWA)
- **api** — Fastify + Socket.IO + Prisma + PostgreSQL
- **shared** — tipos TypeScript compartilhados

## Setup local

```bash
docker compose up -d
npm install
cp apps/api/.env.example apps/api/.env
npm run db:generate
npm run db:push
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Postgres: `localhost:5432` (user/pass `postgres`, db `ebano`)

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Sobe web + api (turbo) |
| `npm run build` | Build de produção |
| `npm run typecheck` | Typecheck em todos os packages |
| `npm run db:generate` | Gera Prisma Client |
| `npm run db:push` | Aplica schema no banco |

## Funcionalidades (MVP)

- Cadastro/login (JWT em cookies httpOnly)
- Recuperar senha, confirmar e-mail, sessões e exclusão de conta
- Apelido (`@handle`) e link de perfil `/u/alguem`
- Conversas 1:1 e grupos (convite por URL `/join/codigo`)
- Comunidade: qualquer cadastrado vê e fala com todos
- Mensagens em tempo real (Socket.IO) com fila offline no aparelho
- Upload de imagem/arquivo (local ou Cloudflare R2)
- Status de entrega/leitura, digitando…, presença online
- Chamadas de voz/vídeo 1:1 e em grupo (LiveKit), com evento na conversa
- Busca de conversas/usuários
- PWA (manifest + service worker + Web Push opcional)

## Deploy

Veja `RAILWAY.md`.

## Fases

1. Setup monorepo + Prisma ✅
2. Auth (JWT) ✅
3. Conversas + Socket.IO ✅
4. UI (tema preto elegante) ✅
5. Mídia, status, presença ✅
6. PWA + Railway ✅
