import { createRemoteJWKSet, jwtVerify } from "jose";
import { nameFromGoogle } from "@/lib/profile";

const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function googleClientId() {
  const value = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return value || null;
}

export async function verifyGoogleCredential(credential: string) {
  const audience = googleClientId();
  if (!audience || credential.length < 20 || credential.length > 8000) return null;
  try {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!/^[\w-]{6,255}$/.test(sub)) return null;
    return {
      sub,
      nickname: nameFromGoogle(
        typeof payload.given_name === "string" ? payload.given_name : undefined,
        typeof payload.name === "string" ? payload.name : undefined,
      ),
    };
  } catch {
    return null;
  }
}
