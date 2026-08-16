import { PrismaClient } from "@prisma/client";

function datasourceUrl() {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw) return raw;
  if (/connect_timeout=/i.test(raw)) return raw;
  return `${raw}${raw.includes("?") ? "&" : "?"}connect_timeout=5`;
}

export const prisma = new PrismaClient({
  datasources: {
    db: { url: datasourceUrl() },
  },
});
