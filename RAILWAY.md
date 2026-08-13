# Remetum no Railway

Monorepo com 2 serviços a partir da raiz do repo (`9bitts/remetum-site`).

## 1) Postgres

No projeto Railway: **Add → Database → PostgreSQL**.  
Isso cria `DATABASE_URL` automaticamente (adicione a variável ao serviço `@ebano/api`).

## 2) Serviço API (`@ebano/api`)

- Root Directory: *(vazio / raiz do repo)*
- Build: `npm run build --workspace=@ebano/api`
- Start: `npm run start --workspace=@ebano/api`
- Start já roda `prisma db push` antes de subir o servidor (cria/atualiza tabelas).  
- Se o login der 500, confira nos logs do API se o `db push` passou e se `DATABASE_URL` aponta para o Postgres do projeto.

Variáveis:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<aleatório-longo>
JWT_REFRESH_SECRET=<outro-aleatório-longo>
CORS_ORIGIN=https://remetum.com,https://www.remetum.com
PUBLIC_API_URL=https://api.remetum.com
PORT=4000
LIVEKIT_URL=wss://<seu-projeto>.livekit.cloud
LIVEKIT_API_KEY=<key>
LIVEKIT_API_SECRET=<secret>
```

`LIVEKIT_*` é opcional: sem isso o chat funciona; chamadas voz/vídeo ficam desabilitadas.
Domínio customizado da API: `api.remetum.com` (não use o apex no serviço da API).

## 3) Serviço Web (`@ebano/web`)

- Root Directory: *(vazio / raiz do repo)*
- Build: `npm run build --workspace=@ebano/web`
- Start: `npm run start --workspace=@ebano/web`

Variáveis:

```
NEXT_PUBLIC_API_URL=https://api.remetum.com
```

Domínios do web: `remetum.com` e `www.remetum.com`.

Na API, cookies usam `Domain=.remetum.com` automaticamente (ou `COOKIE_DOMAIN`).  
Depois de mudar cookie domain, **faça login de novo**.

Se `api.remetum.com` estiver no Cloudflare, use **DNS only** (nuvem cinza) no registro `api` — proxy laranja quebra WebSocket/cookies com frequência.

## 4) DNS / Cloudflare

| Host | Aponta para |
|------|-------------|
| `remetum.com` / `www` | serviço **web** no Railway |
| `api.remetum.com` | serviço **api** no Railway |

Depois de setar `NEXT_PUBLIC_API_URL`, faça **redeploy do web** (a variável entra no build).

Se a API estiver atrás do proxy Cloudflare, desative o proxy (DNS only / cinza) no registro `api` se cookies/WebSocket falharem, ou configure WebSockets + SSL Full.

## Observação

Os packages internos ainda se chamam `@ebano/*`. A marca no produto é **Remetum**.
