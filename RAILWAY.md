# Remetum no Railway

Monorepo com 2 serviços a partir da raiz do repo (`9bitts/remetum-site`).

## 1) Postgres

No projeto Railway: **Add → Database → PostgreSQL**.  
Isso cria `DATABASE_URL` automaticamente (adicione a variável ao serviço `@ebano/api`).

## 2) Serviço API (`@ebano/api`)

- Root Directory: *(vazio / raiz do repo)*
- Build: `npm run build --workspace=@ebano/api`
- Start: `npm run start --workspace=@ebano/api`
- Release / Deploy command (opcional, mas recomendado):  
  `npm run db:push --workspace=@ebano/api`

Variáveis:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<aleatório-longo>
JWT_REFRESH_SECRET=<outro-aleatório-longo>
CORS_ORIGIN=https://<domínio-do-web>
PUBLIC_API_URL=https://<domínio-da-api>
PORT=4000
```

## 3) Serviço Web (`@ebano/web`)

- Root Directory: *(vazio / raiz do repo)*
- Build: `npm run build --workspace=@ebano/web`
- Start: `npm run start --workspace=@ebano/web`

Variáveis:

```
NEXT_PUBLIC_API_URL=https://<domínio-da-api>
```

## 4) Domínios

- Gere domínio público nos dois serviços (Settings → Networking / Domains).
- Ajuste `CORS_ORIGIN`, `PUBLIC_API_URL` e `NEXT_PUBLIC_API_URL` para esses URLs.
- Redeploy o **web** depois de setar `NEXT_PUBLIC_API_URL` (é bakeado no build).

## Observação

Os packages internos ainda se chamam `@ebano/*` (nome técnico do monorepo).  
A marca no produto é **Remetum**.
