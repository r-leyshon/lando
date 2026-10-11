import { countries, countryByIso, quizCountries, type Country } from "@/lib/countries";
import { streakKey, type GameMode } from "@/lib/boards";

export type Outcome = "correct" | "miss" | "near" | "skip";

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
