import { SignJWT, jwtVerify } from 'jose';

const TOKEN_TTL_SECONDS = 60 * 60 * 8; // 8 hours, per spec

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is not set');
  return new TextEncoder().encode(s);
}

export function checkPassword(input: unknown): boolean {
  const expected = process.env.WIKI_PASSWORD;
  if (!expected) throw new Error('WIKI_PASSWORD env var is not set');
  if (typeof input !== 'string' || input.length === 0) return false;
  return timingSafeEqual(input, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(): Promise<string> {
  return await new SignJWT({ role: 'editor' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyToken(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === 'editor';
  } catch {
    return false;
  }
}
