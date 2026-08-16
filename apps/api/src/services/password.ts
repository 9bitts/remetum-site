const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

async function argon2() {
  return import("@node-rs/argon2");
}

export async function hashPassword(password: string): Promise<string> {
  const { hash } = await argon2();
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    const { verify } = await argon2();
    return await verify(passwordHash, password);
  } catch (err) {
    console.error("[auth] password verify failed", err);
    return false;
  }
}
