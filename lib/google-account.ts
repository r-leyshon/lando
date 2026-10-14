import {
  attachGoogle,
  createLinkedPlayer,
  findPlayerByCode,
  findPlayerByGoogleSub,
  findPlayerById,
  getDb,
  renameLinkedPlayer,
  saveSnapshot,
  toProfile,
} from "@/lib/db";
import { makeRecoveryCode, mergeProfiles, parseSnapshot, type Profile } from "@/lib/profile";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Bundle = NonNullable<Awaited<ReturnType<typeof findPlayerById>>>;

export async function openGoogleAccount(input: { googleSub: string; nickname: string; local: unknown }) {
  if (!(await getDb())) return { error: "I could not open the score book." as const };

  const claim = localClaim(input.local);
  const localProfile = claim?.profile ?? null;
  const existing = await findPlayerByGoogleSub(input.googleSub);
  if (existing?.player) {
    return { profile: await storeMerged(existing, localProfile, input.googleSub, input.nickname) };
  }

  const claimed = await claimExisting(claim, input.googleSub, input.nickname);
  if (claimed?.player) {
    return { profile: await storeMerged(claimed, localProfile, input.googleSub, input.nickname) };
  }

  const created = await createFresh(claim, input.googleSub, input.nickname);
  if (!created) return { error: "I could not open the score book." as const };
  return { profile: created };
}

async function storeMerged(found: Bundle, local: Profile | null, googleSub: string, nickname: string) {
  await renameLinkedPlayer(found.player.id, googleSub, nickname);
  const remote = toProfile(found);
  remote.nickname = nickname;
  const combined = mergeProfiles(local, remote);
  await saveSnapshot(found.player.id, combined.stats, combined.bestStreaks);
  const fresh = await findPlayerById(found.player.id);
  const profile = fresh ? toProfile(fresh) : combined;
  profile.nickname = nickname;
  return mergeProfiles(local, profile);
}

function localClaim(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as { id?: unknown; recoveryCode?: unknown };
  const snapshot = parseSnapshot(value);
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  const compact = typeof body.recoveryCode === "string" ? body.recoveryCode.replace(/-/g, "").toUpperCase() : "";
  const code = /^[A-Z0-9]{6}$/.test(compact) ? compact : null;
  if (!id && !code && Object.keys(snapshot.stats).length === 0 && Object.keys(snapshot.bestStreaks).length === 0) {
    return null;
  }
  const profile: Profile = {
    id: id ?? crypto.randomUUID(),
    nickname: "Player",
    recoveryCode: code ?? makeRecoveryCode(),
    muted: false,
    seenCode: true,
    stats: snapshot.stats,
    bestStreaks: snapshot.bestStreaks,
  };
  return { id, code, profile };
}

async function claimExisting(claim: ReturnType<typeof localClaim>, googleSub: string, nickname: string) {
  if (!claim) return null;
  const byCode = claim.code ? await findPlayerByCode(claim.code) : null;
  const byId = !byCode && claim.id ? await findPlayerById(claim.id) : null;
  const found = byCode ?? byId;
  if (!found?.player) return null;
  if (found.player.googleSub && found.player.googleSub !== googleSub) return null;
  const attached = await attachGoogle(found.player.id, googleSub, nickname);
  if (!attached) return findPlayerByGoogleSub(googleSub);
  return found;
}

async function createFresh(claim: ReturnType<typeof localClaim>, googleSub: string, nickname: string) {
  const idTaken = claim?.id ? await findPlayerById(claim.id) : null;
  const codeTaken = claim?.code ? await findPlayerByCode(claim.code) : null;
  const id = claim?.id && !idTaken ? claim.id : crypto.randomUUID();
  const recoveryCode = claim?.code && !codeTaken ? claim.code : makeRecoveryCode();
  try {
    const saved = await createLinkedPlayer({ id, nickname, recoveryCode, googleSub });
    if (!saved) return null;
  } catch {
    const again = await findPlayerByGoogleSub(googleSub);
    if (!again?.player) return null;
    return storeMerged(again, claim?.profile ?? null, googleSub, nickname);
  }
  await saveSnapshot(id, claim?.profile.stats ?? {}, claim?.profile.bestStreaks ?? {});
  const fresh = await findPlayerById(id);
  if (!fresh) return null;
  const profile = toProfile(fresh);
  profile.nickname = nickname;
  return mergeProfiles(claim?.profile ?? null, profile);
}
