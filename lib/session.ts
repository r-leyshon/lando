import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "lando_session";
const MAX_AGE = 60 * 60 * 24 * 400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) return null;
  return value;
}

function sign(body: string, key: string) {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export async function readSession() {
  const key = secret();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!key || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, key);
  const actualBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as { pid?: unknown; sub?: unknown; exp?: unknown };
    if (typeof parsed.pid !== "string" || typeof parsed.sub !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Date.now() || !UUID.test(parsed.pid) || !/^[\w-]{6,255}$/.test(parsed.sub)) return null;
    return { pid: parsed.pid, sub: parsed.sub };
  } catch {
    return null;
  }
}

export async function writeSession(pid: string, sub: string) {
  const key = secret();
  if (!key) return false;
  const body = Buffer.from(JSON.stringify({ pid, sub, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, `${body}.${sign(body, key)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}
