import { countries, countryByIso, quizCountries, type Country } from "@/lib/countries";
import { isMode, isPlayBoard, streakKey, type GameMode } from "@/lib/boards";

export type Outcome = "correct" | "miss" | "near" | "skip" | "hint";

export type CountryStat = {
  correct: number;
  miss: number;
  nearMiss: number;
  struggle: number;
};

export type Profile = {
  id: string;
  nickname: string;
  recoveryCode: string;
  muted: boolean;
  seenCode: boolean;
  stats: Record<string, CountryStat>;
  bestStreaks: Record<string, number>;
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
  };
}

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Profile;
    if (!parsed?.id || !parsed.nickname || !parsed.recoveryCode) return null;
    return {
      ...parsed,
      muted: Boolean(parsed.muted),
      seenCode: Boolean(parsed.seenCode),
      stats: parsed.stats ?? {},
      bestStreaks: parsed.bestStreaks ?? {},
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
  return { correct: 0, miss: 0, nearMiss: 0, struggle: 0 };
}

export function applyOutcome(
  profile: Profile,
  input: { iso: string; outcome: Outcome; mode: GameMode; board: string; streak: number },
): Profile {
  const current = profile.stats[input.iso] ?? blankStat();
  const struggleDelta =
    input.outcome === "miss" ? 3 : input.outcome === "correct" ? -2 : 1;
  const struggle = Math.max(0, current.struggle + struggleDelta);
  const stats = {
    ...profile.stats,
    [input.iso]: {
      correct: current.correct + (input.outcome === "correct" || input.outcome === "near" ? 1 : 0),
      miss: current.miss + (input.outcome === "miss" ? 1 : 0),
      nearMiss: current.nearMiss + (input.outcome === "near" || input.outcome === "skip" ? 1 : 0),
      struggle,
    },
  };
  const key = streakKey(input.mode, "world");
  const bestStreaks = {
    ...profile.bestStreaks,
    [key]: Math.max(profile.bestStreaks[key] ?? 0, input.streak),
  };
  return { ...profile, stats, bestStreaks };
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
  if (!value || typeof value !== "object") return { stats, bestStreaks };
  const body = value as { stats?: unknown; bestStreaks?: unknown };
  if (body.stats && typeof body.stats === "object") {
    for (const [iso, raw] of Object.entries(body.stats)) {
      if (!knownCountry(iso) || !raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const correct = count(row.correct, 10000);
      const miss = count(row.miss, 10000);
      const nearMiss = count(row.nearMiss, 10000);
      const struggle = count(row.struggle, 100000);
      if (correct == null || miss == null || nearMiss == null || struggle == null) continue;
      stats[iso] = { correct, miss, nearMiss, struggle };
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
  return { stats, bestStreaks };
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
      if (kept) stats[iso] = kept;
      continue;
    }
    stats[iso] = {
      correct: Math.max(here.correct, there.correct),
      miss: Math.max(here.miss, there.miss),
      nearMiss: Math.max(here.nearMiss, there.nearMiss),
      struggle: played(here) >= played(there) ? here.struggle : there.struggle,
    };
  }
  const bestStreaks: Record<string, number> = { ...remote.bestStreaks };
  for (const [key, value] of Object.entries(local?.bestStreaks ?? {})) {
    bestStreaks[key] = Math.max(bestStreaks[key] ?? 0, value);
  }
  return {
    id: remote.id,
    nickname: remote.nickname,
    recoveryCode: remote.recoveryCode,
    muted: local?.muted ?? false,
    seenCode: true,
    stats,
    bestStreaks,
  };
}

export function snapshotAhead(local: Profile | null, remote: Profile) {
  if (!local) return false;
  for (const [iso, stat] of Object.entries(local.stats)) {
    const other = remote.stats[iso];
    if (!other) return true;
    if (stat.correct > other.correct || stat.miss > other.miss || stat.nearMiss > other.nearMiss) return true;
    if (played(stat) > played(other)) return true;
  }
  for (const [key, value] of Object.entries(local.bestStreaks)) {
    if (value > (remote.bestStreaks[key] ?? 0)) return true;
  }
  return false;
}
