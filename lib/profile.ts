import { countries, countryByIso, quizCountries, type Country } from "@/lib/countries";
import { DEX_MODES, isDexMode, isMode, isPlayBoard, streakKey, type DexMode, type GameMode } from "@/lib/boards";

export type Outcome = "correct" | "miss" | "near" | "skip" | "hint";

export type CountryStat = {
  correct: number;
  miss: number;
  nearMiss: number;
  struggle: number;
  /** Games in which this country has been answered correctly. */
  found?: DexMode[];
};

/** Green countries on one game's map. The country dex stays in `found`. */
export type StampBook = Partial<Record<GameMode, string[]>>;

export type Profile = {
  id: string;
  nickname: string;
  recoveryCode: string;
  muted: boolean;
  seenCode: boolean;
  stats: Record<string, CountryStat>;
  bestStreaks: Record<string, number>;
  stamps: StampBook;
  stampRevision: number;
};

const STORAGE_KEY = "lando-profile-v1";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function cleanNickname(value: string) {
  const nickname = value.replace(/\s+/g, " ").trim();
  if (nickname.length < 2 || nickname.length > 16) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '’.-]{0,15}$/u.test(nickname)) return null;
  return nickname;
}

export function makeRecoveryCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function formatCode(code: string) {
  const clean = code.replace(/-/g, "").toUpperCase();
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

export function normalizeCode(code: string) {
  return code.replace(/-/g, "").toUpperCase();
}

export function createProfile(nickname: string): Profile {
  return {
    id: crypto.randomUUID(),
    nickname,
    recoveryCode: makeRecoveryCode(),
    muted: false,
    seenCode: false,
    stats: {},
    bestStreaks: {},
    stamps: {},
    stampRevision: 0,
  };
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Profile;
    if (!parsed?.id || !parsed.nickname || !parsed.recoveryCode) return null;
    const stats = tidyStats(parsed.stats);
    const seeded = parsed.stamps == null ? stampsFromFound(stats) : null;
    const hasSeed = seeded != null && Object.values(seeded).some((isos) => isos.length > 0);
    return {
      ...parsed,
      muted: Boolean(parsed.muted),
      seenCode: Boolean(parsed.seenCode),
      stats,
      bestStreaks: parsed.bestStreaks ?? {},
      stamps: seeded ?? tidyStamps(parsed.stamps),
      stampRevision: seeded ? (hasSeed ? 1 : 0) : revisionOf(parsed.stampRevision),
    };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function blankStat(): CountryStat {
  return { correct: 0, miss: 0, nearMiss: 0, struggle: 0, found: [] };
}

/** Keep only the dex games, in a stable order. */
export function dexModes(value: unknown): DexMode[] {
  if (!Array.isArray(value)) return [];
  const found: DexMode[] = [];
  for (const item of value) {
    if (typeof item === "string" && isDexMode(item) && !found.includes(item)) found.push(item);
  }
  return found;
}

function tidyStats(value: unknown): Record<string, CountryStat> {
  if (!value || typeof value !== "object") return {};
  const stats: Record<string, CountryStat> = {};
  for (const [iso, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<CountryStat>;
    if (typeof row.correct !== "number") continue;
    stats[iso] = {
      correct: row.correct,
      miss: typeof row.miss === "number" ? row.miss : 0,
      nearMiss: typeof row.nearMiss === "number" ? row.nearMiss : 0,
      struggle: typeof row.struggle === "number" ? row.struggle : 0,
      found: dexModes(row.found),
    };
  }
  return stats;
}

export function dexComplete(stat: CountryStat | undefined) {
  const found = dexModes(stat?.found);
  return DEX_MODES.every((mode) => found.includes(mode));
}

export function caughtCount(profile: Profile) {
  return quizCountries.filter((country) => dexComplete(profile.stats[country.iso2])).length;
}

export function applyOutcome(
  profile: Profile,
  input: { iso: string; outcome: Outcome; mode: GameMode; board: string; streak: number },
): Profile {
  const current = profile.stats[input.iso] ?? blankStat();
  const struggleDelta =
    input.outcome === "miss" ? 3 : input.outcome === "correct" ? -2 : 1;
  const struggle = Math.max(0, current.struggle + struggleDelta);
  const found = dexModes(current.found);
  const nextFound =
    input.outcome === "correct" && isDexMode(input.mode) && !found.includes(input.mode)
      ? [...found, input.mode]
      : found;
  const stats = {
    ...profile.stats,
    [input.iso]: {
      correct: current.correct + (input.outcome === "correct" || input.outcome === "near" ? 1 : 0),
      miss: current.miss + (input.outcome === "miss" ? 1 : 0),
      nearMiss: current.nearMiss + (input.outcome === "near" || input.outcome === "skip" ? 1 : 0),
      struggle,
      found: nextFound,
    },
  };
  const key = streakKey(input.mode, "world");
  const bestStreaks = {
    ...profile.bestStreaks,
    [key]: Math.max(profile.bestStreaks[key] ?? 0, input.streak),
  };
  const book = tidyStamps(profile.stamps);
  const already = book[input.mode] ?? [];
  const earned = input.outcome === "correct" && !already.includes(input.iso);
  const stamps = earned ? { ...book, [input.mode]: [...already, input.iso] } : book;
  const stampRevision = earned ? profile.stampRevision + 1 : profile.stampRevision;
  return { ...profile, stats, bestStreaks, stamps, stampRevision };
}

export function stampsFor(profile: Profile | null, mode: GameMode) {
  return profile?.stamps?.[mode] ?? [];
}

/** Blank one game's map. Other games, and the country dex, stay as they are. */
export function clearGameStamps(profile: Profile, mode: GameMode): Profile {
  return {
    ...profile,
    stamps: { ...tidyStamps(profile.stamps), [mode]: [] },
    stampRevision: profile.stampRevision + 1,
  };
}

export function revisionOf(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000_000) return 0;
  return value;
}

export function tidyStamps(value: unknown): StampBook {
  const stamps: StampBook = {};
  if (!value || typeof value !== "object") return stamps;
  for (const [mode, raw] of Object.entries(value)) {
    if (!isMode(mode) || !Array.isArray(raw)) continue;
    stamps[mode] = [...new Set(raw.filter((iso): iso is string => typeof iso === "string" && knownCountry(iso)))];
  }
  return stamps;
}

function stampsFromFound(stats: Record<string, CountryStat>): StampBook {
  const stamps: StampBook = {};
  for (const mode of DEX_MODES) {
    stamps[mode] = Object.entries(stats)
      .filter(([, stat]) => dexModes(stat.found).includes(mode))
      .map(([iso]) => iso);
  }
  return stamps;
}

export function passportCount(profile: Profile) {
  return quizCountries.filter((country) => (profile.stats[country.iso2]?.correct ?? 0) > 0).length;
}

export function topStruggle(profile: Profile, isos?: string[]): Country | null {
  let best: Country | null = null;
  let score = 0;
  for (const country of countries) {
    if (country.bonus) continue;
    if (isos && !isos.includes(country.iso2)) continue;
    const struggle = profile.stats[country.iso2]?.struggle ?? 0;
    if (struggle > score) {
      best = country;
      score = struggle;
    }
  }
  return best;
}

export function pickTricky(profile: Profile, avoid: string | null) {
  const pool = quizCountries.filter((country) => (profile.stats[country.iso2]?.struggle ?? 0) > 0);
  if (pool.length === 0) return null;
  const usable = pool.length > 1 && avoid ? pool.filter((country) => country.iso2 !== avoid) : pool;
  const total = usable.reduce((sum, country) => sum + (profile.stats[country.iso2]?.struggle ?? 0), 0);
  let roll = Math.random() * total;
  for (const country of usable) {
    roll -= profile.stats[country.iso2]?.struggle ?? 0;
    if (roll <= 0) return country;
  }
  return usable[usable.length - 1] ?? null;
}

export function bestStreak(profile: Profile, mode: GameMode) {
  let best = 0;
  for (const [key, value] of Object.entries(profile.bestStreaks)) {
    if (key === mode || key.startsWith(`${mode}:`)) best = Math.max(best, value);
  }
  return best;
}

export function countryStat(profile: Profile, iso: string) {
  return profile.stats[iso] ?? blankStat();
}

export function knownCountry(iso: string) {
  return countryByIso.has(iso);
}

/** The first name from a Google account, kept to letters so it can be stored safely. */
export function nameFromGoogle(givenName: string | undefined, fullName: string | undefined) {
  const first = (givenName || fullName || "").trim().split(/\s+/)[0] ?? "";
  const direct = cleanNickname(first);
  if (direct) return direct;
  const letters = first
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 16);
  return cleanNickname(letters) ?? "Player";
}

function count(value: unknown, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) return null;
  return value;
}

/** Stats a browser may send. Unknown countries and bad numbers are dropped. */
export function parseSnapshot(value: unknown) {
  const stats: Record<string, CountryStat> = {};
  const bestStreaks: Record<string, number> = {};
  if (!value || typeof value !== "object") return { stats, bestStreaks, stamps: {}, stampRevision: 0 };
  const body = value as { stats?: unknown; bestStreaks?: unknown; stamps?: unknown; stampRevision?: unknown };
  if (body.stats && typeof body.stats === "object") {
    for (const [iso, raw] of Object.entries(body.stats)) {
      if (!knownCountry(iso) || !raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const correct = count(row.correct, 10000);
      const miss = count(row.miss, 10000);
      const nearMiss = count(row.nearMiss, 10000);
      const struggle = count(row.struggle, 100000);
      if (correct == null || miss == null || nearMiss == null || struggle == null) continue;
      stats[iso] = { correct, miss, nearMiss, struggle, found: dexModes(row.found) };
    }
  }
  if (body.bestStreaks && typeof body.bestStreaks === "object") {
    for (const [key, raw] of Object.entries(body.bestStreaks)) {
      const streak = count(raw, 300);
      const [mode, board] = key.split(":");
      if (streak == null || !mode || !board || key.split(":").length !== 2) continue;
      if (!isMode(mode) || (board !== "tricky" && !isPlayBoard(board))) continue;
      bestStreaks[key] = streak;
    }
  }
  return { stats, bestStreaks, stamps: tidyStamps(body.stamps), stampRevision: revisionOf(body.stampRevision) };
}

function played(stat: CountryStat) {
  return stat.correct + stat.miss + stat.nearMiss;
}

/** Keep a stamp from either copy. Struggle follows whichever copy played that country more. */
export function mergeProfiles(local: Profile | null, remote: Profile): Profile {
  const stats: Record<string, CountryStat> = {};
  const isos = new Set([...Object.keys(local?.stats ?? {}), ...Object.keys(remote.stats)]);
  for (const iso of isos) {
    const here = local?.stats[iso];
    const there = remote.stats[iso];
    if (!here || !there) {
      const kept = here ?? there;
      if (kept) stats[iso] = { ...kept, found: dexModes(kept.found) };
      continue;
    }
    const found = dexModes([...dexModes(here.found), ...dexModes(there.found)]);
    stats[iso] = {
      correct: Math.max(here.correct, there.correct),
      miss: Math.max(here.miss, there.miss),
      nearMiss: Math.max(here.nearMiss, there.nearMiss),
      struggle: played(here) >= played(there) ? here.struggle : there.struggle,
      found,
    };
  }
  const bestStreaks: Record<string, number> = { ...remote.bestStreaks };
  for (const [key, value] of Object.entries(local?.bestStreaks ?? {})) {
    bestStreaks[key] = Math.max(bestStreaks[key] ?? 0, value);
  }
  const localRevision = local?.stampRevision ?? 0;
  const remoteRevision = remote.stampRevision ?? 0;
  const stamps = mergeStamps(local, remote, localRevision, remoteRevision);
  const grew = local != null && localRevision === remoteRevision && stampBookGrew(stamps, remote.stamps);
  return {
    id: remote.id,
    nickname: remote.nickname,
    recoveryCode: remote.recoveryCode,
    muted: local?.muted ?? false,
    seenCode: true,
    stats,
    bestStreaks,
    stamps,
    stampRevision: Math.max(localRevision, remoteRevision) + (grew ? 1 : 0),
  };
}

function stampBookGrew(next: StampBook, previous: StampBook | undefined) {
  for (const [mode, isos] of Object.entries(next)) {
    if (!isMode(mode)) continue;
    const other = new Set(previous?.[mode] ?? []);
    if ((isos ?? []).some((iso) => !other.has(iso))) return true;
  }
  return false;
}

function mergeStamps(local: Profile | null, remote: Profile, localRevision: number, remoteRevision: number): StampBook {
  if (local && localRevision > remoteRevision) return tidyStamps(local.stamps);
  if (!local || remoteRevision > localRevision) return tidyStamps(remote.stamps);
  const stamps: StampBook = {};
  const modes = new Set([...Object.keys(local.stamps ?? {}), ...Object.keys(remote.stamps ?? {})]);
  for (const mode of modes) {
    if (!isMode(mode)) continue;
    stamps[mode] = [...new Set([...(local.stamps?.[mode] ?? []), ...(remote.stamps?.[mode] ?? [])])];
  }
  return stamps;
}

export function snapshotAhead(local: Profile | null, remote: Profile) {
  if (!local) return false;
  for (const [iso, stat] of Object.entries(local.stats)) {
    const other = remote.stats[iso];
    if (!other) return true;
    if (stat.correct > other.correct || stat.miss > other.miss || stat.nearMiss > other.nearMiss) return true;
    if (played(stat) > played(other)) return true;
    if (dexModes(stat.found).some((mode) => !dexModes(other.found).includes(mode))) return true;
  }
  for (const [key, value] of Object.entries(local.bestStreaks)) {
    if (value > (remote.bestStreaks[key] ?? 0)) return true;
  }
  if (local.stampRevision > remote.stampRevision) return true;
  if (local.stampRevision === remote.stampRevision) {
    for (const [mode, isos] of Object.entries(local.stamps)) {
      if (!isMode(mode)) continue;
      const other = new Set(remote.stamps[mode] ?? []);
      if (isos.some((iso) => !other.has(iso))) return true;
    }
  }
  return false;
}
