import { savePlayer } from "@/lib/db";
import { cleanNickname, normalizeCode } from "@/lib/profile";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    nickname?: string;
    recoveryCode?: string;
  } | null;
  const nickname = cleanNickname(body?.nickname ?? "");
  const recoveryCode = normalizeCode(body?.recoveryCode ?? "");
  if (!body?.id || !UUID.test(body.id) || !nickname || !/^[A-Z0-9]{6}$/.test(recoveryCode)) {
    return Response.json({ error: "Tell Lando a name and a valid code." }, { status: 400 });
  }
  const saved = await savePlayer({ id: body.id, nickname, recoveryCode });
  return Response.json({ id: body.id, nickname, recoveryCode, database: saved });
}
