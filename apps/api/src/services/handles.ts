import { isValidHandle, suggestHandle } from "@ebano/shared";
import { prisma } from "../prisma.js";

export async function allocateHandle(name: string, excludeUserId?: string) {
  const base = suggestHandle(name);
  for (let i = 0; i < 80; i += 1) {
    const suffix = i === 0 ? "" : String(i + 1);
    const maxBase = 24 - suffix.length;
    const candidate = `${base.slice(0, maxBase)}${suffix}`;
    const taken = await prisma.user.findFirst({
      where: {
        handle: candidate,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `u${Date.now().toString(36)}`;
}

export async function ensureUserHandle<T extends { id: string; name: string; handle: string | null }>(
  user: T,
): Promise<T & { handle: string }> {
  if (user.handle) return user as T & { handle: string };
  try {
    const handle = await allocateHandle(user.name, user.id);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { handle },
    });
    return { ...user, handle: updated.handle! };
  } catch (err) {
    console.error("[handles] ensureUserHandle failed", err);
    return { ...user, handle: user.handle ?? `u${user.id.slice(-8)}` };
  }
}

export function assertHandle(raw: string) {
  const handle = raw.trim().toLowerCase();
  if (!isValidHandle(handle)) {
    throw Object.assign(
      new Error("Apelido inválido. Use 3–24 caracteres: a-z, 0-9 e _"),
      { statusCode: 400 },
    );
  }
  return handle;
}
