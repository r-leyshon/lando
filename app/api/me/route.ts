import { connection } from "next/server";
import { findPlayerById, getDb, renameLinkedPlayer, saveSnapshot, toProfile } from "@/lib/db";
import { mergeProfiles, parseSnapshot, snapshotAhead } from "@/lib/profile";
import { readSession } from "@/lib/session";

export async function GET() {
  await connection();
  const session = await readSession();
  if (!session) return Response.json({ error: "Sign in with Google." }, { status: 401 });
  if (!(await getDb())) return Response.json({ error: "I could not open the score book." }, { status: 503 });
  const found = await findPlayerById(session.pid);
  if (!found?.player || found.player.googleSub !== session.sub) {
    return Response.json({ error: "Sign in with Google." }, { status: 401 });
  }
  return Response.json(toProfile(found));
}

export async function POST(request: Request) {
  await connection();
  const session = await readSession();
  if (!session) return Response.json({ error: "Sign in with Google." }, { status: 401 });
  const found = await findPlayerById(session.pid);
  if (!found?.player || found.player.googleSub !== session.sub) {
    return Response.json({ error: "Sign in with Google." }, { status: 401 });
  }
  const snapshot = parseSnapshot(await request.json().catch(() => null));
  const remote = toProfile(found);
  if (!snapshotAhead({ ...remote, stats: snapshot.stats, bestStreaks: snapshot.bestStreaks }, remote)) {
    return Response.json(remote);
  }
  const merged = mergeProfiles({ ...remote, stats: snapshot.stats, bestStreaks: snapshot.bestStreaks }, remote);
  await saveSnapshot(session.pid, merged.stats, merged.bestStreaks);
  await renameLinkedPlayer(session.pid, session.sub, remote.nickname);
  const fresh = await findPlayerById(session.pid);
  return Response.json(fresh ? toProfile(fresh) : merged);
}
