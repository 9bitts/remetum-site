import { PrismaClient, type User } from "@prisma/client";

export const prisma = new PrismaClient();

export function prismaErrorCode(err: unknown) {
  return (err as { code?: string }).code;
}

export function isPrismaConnectionError(err: unknown) {
  const code = prismaErrorCode(err);
  return (
    code === "P1000" ||
    code === "P1001" ||
    code === "P1017" ||
    code === "P2024"
  );
}

export function isPrismaSchemaError(err: unknown) {
  const code = prismaErrorCode(err);
  const message = (err as { message?: string }).message ?? "";
  return (
    code === "P2021" ||
    code === "P2022" ||
    code === "P2010" ||
    /does not exist|column .* does not exist/i.test(message)
  );
}

const LOGIN_SCHEMA_SQL = [
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "handle" TEXT`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3)`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "hide_last_seen" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "send_read_receipts" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_handle_key" ON "users" ("handle")`,
  `CREATE TABLE IF NOT EXISTS "refresh_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "family_id" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "user_agent" TEXT`,
  `ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "ip" TEXT`,
  `ALTER TABLE "refresh_sessions" ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "refresh_sessions_token_hash_key" ON "refresh_sessions" ("token_hash")`,
  `CREATE INDEX IF NOT EXISTS "refresh_sessions_user_id_idx" ON "refresh_sessions" ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "refresh_sessions_family_id_idx" ON "refresh_sessions" ("family_id")`,
];

export async function ensureLoginSchema() {
  await prisma.$connect();
  for (const sql of LOGIN_SCHEMA_SQL) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      console.error("[schema]", sql.replace(/\s+/g, " ").slice(0, 96), err);
    }
  }
}

export async function findUserByEmail(email: string): Promise<User | null> {
  try {
    return await prisma.user.findUnique({ where: { email } });
  } catch (err) {
    if (!isPrismaSchemaError(err)) throw err;
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        email: string;
        password_hash: string;
        avatar_url: string | null;
        bio: string | null;
        status: User["status"];
        last_seen_at: Date | null;
        created_at: Date;
      }>
    >`
      SELECT id, name, email, password_hash, avatar_url, bio, status, last_seen_at, created_at
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      handle: null,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      status: row.status,
      lastSeenAt: row.last_seen_at,
      emailVerifiedAt: null,
      hideLastSeen: false,
      sendReadReceipts: true,
      createdAt: row.created_at,
    };
  }
}
