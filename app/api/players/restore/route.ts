import { findPlayerByCode, getDb } from "@/lib/db";
import { normalizeCode, type CountryStat } from "@/lib/profile";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { recoveryCode?: string } | null;
  const recoveryCode = normalizeCode(body?.recoveryCode ?? "");
  if (!/^[A-Z0-9]{6}$/.test(recoveryCode)) {
    return Response.json({ error: "That code does not look right." }, { status: 400 });
  }
  const db = await getDb();
  if (!db) return Response.json({ database: false, error: "No score database." }, { status: 404 });
  const found = await findPlayerByCode(recoveryCode);
  if (!found) return Response.json({ error: "Lando could not find that code." }, { status: 404 });

  const stats: Record<string, CountryStat> = {};
  for (const row of found.stats) {
    stats[row.countryIso] = {
      correct: row.correctCount,
      miss: row.missCount,
      nearMiss: row.nearMissCount,
      struggle: row.struggleScore,
    };
  }
  const bestStreaks: Record<string, number> = {};
  for (const row of found.bests) {
    bestStreaks[`${row.mode}:${row.board}`] = row.bestStreak ?? 0;
  }

  return Response.json({
    id: found.player.id,
    nickname: found.player.nickname,
    recoveryCode: found.player.recoveryCode,
    muted: false,
    seenCode: true,
    stats,
    bestStreaks,
  });
}
