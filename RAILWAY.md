# API (apps/api)
# RootDir: apps/api
# Start: npm run start
# Build: cd ../.. && npm install && npm run build -w @ebano/shared && npm run db:generate -w @ebano/api && npm run build -w @ebano/api

# WEB (apps/web)
# RootDir: apps/web
# Start: npm run start
# Build: cd ../.. && npm install && npm run build -w @ebano/shared && npm run build -w @ebano/web
# Env: NEXT_PUBLIC_API_URL=https://<api-domain>

# Shared env vars for API:
# DATABASE_URL=
# JWT_SECRET=
# JWT_REFRESH_SECRET=
# CORS_ORIGIN=https://<web-domain>
# PUBLIC_API_URL=https://<api-domain>
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY=
# R2_SECRET_KEY=
# R2_BUCKET=
# R2_PUBLIC_BASE_URL=
# VAPID_PUBLIC_KEY=
# VAPID_PRIVATE_KEY=
# VAPID_SUBJECT=mailto:hello@ebano.app
