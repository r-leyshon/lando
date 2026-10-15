import { connection } from "next/server";
import { isMode, isPlayBoard } from "@/lib/boards";
import { findPlayerById, saveProgress } from "@/lib/db";
import { dexModes, knownCountry, revisionOf, tidyStamps, type Outcome } from "@/lib/profile";
import { readSession } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OUTCOMES: Outcome[] = ["correct", "miss", "near", "skip", "hint"];

function count(value: unknown, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) return null;
  return value;
}

export async function POST(request: Request) {
  await connection();
  const session = await readSession();
  if (!session) return Response.json({ error: "Sign in with Google." }, { status: 401 });
  const player = await findPlayerById(session.pid);
  if (!player?.player || player.player.googleSub !== session.sub) {
    return Response.json({ error: "Sign in with Google." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    iso?: unknown;
    outcome?: Outcome;
    mode?: unknown;
    board?: unknown;
    streak?: unknown;
    runId?: unknown;
    durationMs?: unknown;
    completed?: unknown;
    correct?: unknown;
    miss?: unknown;
    nearMiss?: unknown;
    struggle?: unknown;
    found?: unknown;
    stamps?: unknown;
    stampRevision?: unknown;
  } | null;

  const correct = count(body?.correct, 10000);
  const miss = count(body?.miss, 10000);
  const nearMiss = count(body?.nearMiss, 10000);
  const struggle = count(body?.struggle, 100000);
  const streak = count(body?.streak, 300);
  if (
    !body ||
    typeof body.iso !== "string" ||
    !knownCountry(body.iso) ||
    !body.outcome ||
    !OUTCOMES.includes(body.outcome) ||
    typeof body.mode !== "string" ||
    !isMode(body.mode) ||
    typeof body.board !== "string" ||
    !isPlayBoard(body.board) ||
    typeof body.runId !== "string" ||
    !UUID.test(body.runId) ||
    correct == null ||
    miss == null ||
    nearMiss == null ||
    struggle == null ||
    streak == null
  ) {
    return Response.json({ error: "That score could not be saved." }, { status: 400 });
  }

  const saved = await saveProgress({
    playerId: session.pid,
    iso: body.iso,
    correct,
    miss,
    nearMiss,
    struggle,
    found: dexModes(body.found),
    mode: body.mode,
    board: "world",
    streak,
    runId: body.runId,
    durationMs: Math.max(0, Math.floor(typeof body.durationMs === "number" ? body.durationMs : 0)),
    completed: Boolean(body.completed),
    stamps: body.stamps == null ? undefined : tidyStamps(body.stamps),
    stampRevision: body.stampRevision == null ? undefined : revisionOf(body.stampRevision),
  });

  return Response.json({ database: saved, stored: saved ? "cloud" : "local" });
}
