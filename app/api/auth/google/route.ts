import { connection } from "next/server";
import { openGoogleAccount } from "@/lib/google-account";
import { googleClientId, verifyGoogleCredential } from "@/lib/google-identity";
import { writeSession } from "@/lib/session";

export async function POST(request: Request) {
  await connection();
  if (!googleClientId()) {
    return Response.json({ error: "Google sign-in is not switched on yet." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { credential?: unknown; local?: unknown } | null;
  if (!body || typeof body.credential !== "string") {
    return Response.json({ error: "I could not sign in with Google." }, { status: 400 });
  }
  const google = await verifyGoogleCredential(body.credential);
  if (!google) return Response.json({ error: "I could not sign in with Google." }, { status: 401 });

  const opened = await openGoogleAccount({ googleSub: google.sub, nickname: google.nickname, local: body.local });
  if ("error" in opened) return Response.json({ error: opened.error }, { status: 503 });

  const sealed = await writeSession(opened.profile.id, google.sub);
  if (!sealed) return Response.json({ error: "I could not start a sign-in yet." }, { status: 503 });
  return Response.json(opened.profile);
}
