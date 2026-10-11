import { isMode } from "@/lib/boards";
import { leaderboard } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "";
  if (!isMode(mode)) {
    return Response.json({ error: "Unknown game." }, { status: 400 });
  }
  const rows = await leaderboard(mode, "world");
  if (!rows) return Response.json({ database: false, entries: [] });
  return Response.json({
    database: true,
    entries: rows.map((row) => ({
      playerId: row.playerId,
      nickname: row.nickname,
      bestStreak: row.bestStreak ?? 0,
    })),
  });
}
