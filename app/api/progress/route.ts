import { isMode } from "@/lib/boards";
import { saveProgress } from "@/lib/db";
import { cleanNickname, knownCountry, normalizeCode, type Outcome } from "@/lib/profile";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OUTCOMES: Outcome[] = ["correct", "miss", "near", "skip"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    playerId?: string;
    nickname?: string;
    recoveryCode?: string;
    iso?: string;
    outcome?: Outcome;
    mode?: string;
    board?: string;
    streak?: number;
    runId?: string;
    durationMs?: number;
    completed?: boolean;
  } | null;

  const nickname = cleanNickname(body?.nickname ?? "");
  const recoveryCode = normalizeCode(body?.recoveryCode ?? "");
  if (
    !body?.playerId ||
    !UUID.test(body.playerId) ||
    !body.runId ||
    !UUID.test(body.runId) ||
    !nickname ||
    !/^[A-Z0-9]{6}$/.test(recoveryCode) ||
    !body.iso ||
    !knownCountry(body.iso) ||
    !body.outcome ||
    !OUTCOMES.includes(body.outcome) ||
    !body.mode ||
    !isMode(body.mode) ||
    !body.board ||
    typeof body.streak !== "number" ||
    body.streak < 0 ||
    body.streak > 300
  ) {
    return Response.json({ error: "That score could not be saved." }, { status: 400 });
  }

  const saved = await saveProgress({
    playerId: body.playerId,
    nickname,
    recoveryCode,
    iso: body.iso,
    outcome: body.outcome,
    mode: body.mode,
    board: "world",
    streak: Math.floor(body.streak),
    runId: body.runId,
    durationMs: Math.max(0, Math.floor(body.durationMs ?? 0)),
    completed: Boolean(body.completed),
  });

  return Response.json({ database: saved, stored: saved ? "cloud" : "local" });
}
