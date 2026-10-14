import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { countryStats, players, runs } from "@/lib/schema";
import { isMode, isPlayBoard } from "@/lib/boards";
import type { CountryStat, Profile } from "@/lib/profile";

let ready: Promise<ReturnType<typeof drizzle> | null> | null = null;

/** Neon adds channel_binding for direct Postgres clients. The HTTP driver cannot use it. */
function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return value;
  }
}

function sqlClient() {
  const url = databaseUrl();
  if (!url) return null;
  return neon(url);
}

async function connect() {
  const url = databaseUrl();
  if (!url) return null;
  const sql = neon(url);
  await sql`CREATE TABLE IF NOT EXISTS players (
    id uuid PRIMARY KEY,
    nickname text NOT NULL,
    recovery_code text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS country_stats (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    country_iso text NOT NULL,
    correct_count integer NOT NULL DEFAULT 0,
    miss_count integer NOT NULL DEFAULT 0,
    near_miss_count integer NOT NULL DEFAULT 0,
    struggle_score integer NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, country_iso)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS runs (
    id uuid PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    mode text NOT NULL,
    board text NOT NULL,
    best_streak integer NOT NULL DEFAULT 0,
    duration_ms integer,
    completed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS runs_leaderboard ON runs (mode, board, best_streak DESC)`;
  await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS google_sub text`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS players_google_sub_key ON players (google_sub)`;
  return drizzle(neon(url));
}

export function getDb() {
  if (!ready) {
    ready = connect().catch((error) => {
      console.error("Neon setup failed", error);
      ready = null;
      return null;
    });
  }
  return ready;
}

export async function findPlayerByCode(recoveryCode: string) {
  const db = await getDb();
  if (!db) return null;
  const [player] = await db.select().from(players).where(eq(players.recoveryCode, recoveryCode)).limit(1);
  if (!player) return null;
  return playerBundle(player.id);
}

export class DatabaseUnavailable extends Error {
  constructor() {
    super("Database unavailable");
  }
}

async function playerBundle(playerId: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player) return null;
    const stats = await db.select().from(countryStats).where(eq(countryStats.playerId, player.id));
    const bests = await db
      .select({
        mode: runs.mode,
        board: runs.board,
        bestStreak: max(runs.bestStreak),
      })
      .from(runs)
      .where(eq(runs.playerId, player.id))
      .groupBy(runs.mode, runs.board);
    return { player, stats, bests };
  } catch (error) {
    console.error("Neon query failed", error instanceof Error ? error.message : "unknown");
    throw new DatabaseUnavailable();
  }
}

export async function findPlayerById(id: string) {
  const db = await getDb();
  if (!db) return null;
  return playerBundle(id);
}

export async function findPlayerByGoogleSub(googleSub: string) {
  const db = await getDb();
  if (!db) return null;
  const [player] = await db.select().from(players).where(eq(players.googleSub, googleSub)).limit(1);
  if (!player) return null;
  return playerBundle(player.id);
}

export function toProfile(found: NonNullable<Awaited<ReturnType<typeof findPlayerByCode>>>): Profile {
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
    if (!row.mode || !row.board) continue;
    bestStreaks[`${row.mode}:${row.board}`] = row.bestStreak ?? 0;
  }
  return {
    id: found.player.id,
    nickname: found.player.nickname,
    recoveryCode: found.player.recoveryCode,
    muted: false,
    seenCode: true,
    stats,
    bestStreaks,
  };
}

export async function attachGoogle(id: string, googleSub: string, nickname: string) {
  if (!(await getDb())) return false;
  const sql = sqlClient();
  if (!sql) return false;
  const rows = await sql`UPDATE players
    SET google_sub = ${googleSub}, nickname = ${nickname}
    WHERE id = ${id}::uuid AND (google_sub IS NULL OR google_sub = ${googleSub})
    RETURNING id`;
  return rows.length > 0;
}

export async function renameLinkedPlayer(id: string, googleSub: string, nickname: string) {
  if (!(await getDb())) return false;
  const sql = sqlClient();
  if (!sql) return false;
  await sql`UPDATE players SET nickname = ${nickname} WHERE id = ${id}::uuid AND google_sub = ${googleSub}`;
  return true;
}

export async function createLinkedPlayer(input: { id: string; nickname: string; recoveryCode: string; googleSub: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(players).values(input);
  return true;
}

export async function saveSnapshot(
  playerId: string,
  stats: Record<string, CountryStat>,
  bestStreaks: Record<string, number>,
) {
  if (!(await getDb())) return false;
  const sql = sqlClient();
  if (!sql) return false;
  for (const [iso, stat] of Object.entries(stats)) {
    await sql`INSERT INTO country_stats (player_id, country_iso, correct_count, miss_count, near_miss_count, struggle_score)
      VALUES (${playerId}, ${iso}, ${stat.correct}, ${stat.miss}, ${stat.nearMiss}, ${stat.struggle})
      ON CONFLICT (player_id, country_iso) DO UPDATE SET
        correct_count = GREATEST(country_stats.correct_count, EXCLUDED.correct_count),
        miss_count = GREATEST(country_stats.miss_count, EXCLUDED.miss_count),
        near_miss_count = GREATEST(country_stats.near_miss_count, EXCLUDED.near_miss_count),
        struggle_score = CASE
          WHEN (EXCLUDED.correct_count + EXCLUDED.miss_count + EXCLUDED.near_miss_count)
            >= (country_stats.correct_count + country_stats.miss_count + country_stats.near_miss_count)
          THEN EXCLUDED.struggle_score
          ELSE country_stats.struggle_score
        END`;
  }
  for (const [key, streak] of Object.entries(bestStreaks)) {
    const [mode, board] = key.split(":");
    if (!mode || !board || !isMode(mode) || (board !== "tricky" && !isPlayBoard(board))) continue;
    const id = stableUuid(`lando-streak:${playerId}:${key}`);
    await sql`INSERT INTO runs (id, player_id, mode, board, best_streak, duration_ms, completed)
      VALUES (${id}, ${playerId}, ${mode}, ${board}, ${streak}, 0, false)
      ON CONFLICT (id) DO UPDATE SET best_streak = GREATEST(runs.best_streak, EXCLUDED.best_streak)`;
  }
  return true;
}

export async function saveProgress(input: {
  playerId: string;
  iso: string;
  correct: number;
  miss: number;
  nearMiss: number;
  struggle: number;
  mode: string;
  board: string;
  streak: number;
  runId: string;
  durationMs: number;
  completed: boolean;
}) {
  if (!(await getDb())) return false;
  const sql = sqlClient();
  if (!sql) return false;
  await sql`INSERT INTO country_stats (player_id, country_iso, correct_count, miss_count, near_miss_count, struggle_score)
    VALUES (${input.playerId}, ${input.iso}, ${input.correct}, ${input.miss}, ${input.nearMiss}, ${input.struggle})
    ON CONFLICT (player_id, country_iso) DO UPDATE SET
      correct_count = GREATEST(country_stats.correct_count, EXCLUDED.correct_count),
      miss_count = GREATEST(country_stats.miss_count, EXCLUDED.miss_count),
      near_miss_count = GREATEST(country_stats.near_miss_count, EXCLUDED.near_miss_count),
      struggle_score = CASE
        WHEN (EXCLUDED.correct_count + EXCLUDED.miss_count + EXCLUDED.near_miss_count)
          >= (country_stats.correct_count + country_stats.miss_count + country_stats.near_miss_count)
        THEN EXCLUDED.struggle_score
        ELSE country_stats.struggle_score
      END`;
  await sql`INSERT INTO runs (id, player_id, mode, board, best_streak, duration_ms, completed)
    VALUES (${input.runId}, ${input.playerId}, ${input.mode}, ${input.board}, ${input.streak}, ${input.durationMs}, ${input.completed})
    ON CONFLICT (id) DO UPDATE SET
      best_streak = GREATEST(runs.best_streak, EXCLUDED.best_streak),
      duration_ms = EXCLUDED.duration_ms,
      completed = runs.completed OR EXCLUDED.completed`;
  return true;
}

function stableUuid(seed: string) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function leaderboard(mode: string, board: string) {
  const db = await getDb();
  if (!db) return null;
  return db
    .select({
      playerId: players.id,
      nickname: players.nickname,
      bestStreak: max(runs.bestStreak),
    })
    .from(runs)
    .innerJoin(players, eq(players.id, runs.playerId))
    .where(and(eq(runs.mode, mode), eq(runs.board, board)))
    .groupBy(players.id, players.nickname)
    .orderBy(desc(max(runs.bestStreak)))
    .limit(20);
}
