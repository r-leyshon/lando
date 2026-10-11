import { neon } from "@neondatabase/serverless";
import { and, desc, eq, max } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { countryStats, players, runs } from "@/lib/schema";
import type { Outcome } from "@/lib/profile";

let ready: Promise<ReturnType<typeof drizzle> | null> | null = null;

async function connect() {
  const url = process.env.DATABASE_URL;
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

export async function savePlayer(input: { id: string; nickname: string; recoveryCode: string }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(players).values(input).onConflictDoNothing();
  return true;
}

export async function findPlayerByCode(recoveryCode: string) {
  const db = await getDb();
  if (!db) return null;
  const [player] = await db.select().from(players).where(eq(players.recoveryCode, recoveryCode)).limit(1);
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
}

export async function saveProgress(input: {
  playerId: string;
  nickname: string;
  recoveryCode: string;
  iso: string;
  outcome: Outcome;
  mode: string;
  board: string;
  streak: number;
  runId: string;
  durationMs: number;
  completed: boolean;
}) {
  const db = await getDb();
  if (!db) return false;
  await savePlayer({ id: input.playerId, nickname: input.nickname, recoveryCode: input.recoveryCode });
  const correct = input.outcome === "correct" || input.outcome === "near" ? 1 : 0;
  const miss = input.outcome === "miss" ? 1 : 0;
  const near = input.outcome === "near" || input.outcome === "skip" ? 1 : 0;
  const delta = input.outcome === "miss" ? 3 : input.outcome === "correct" ? -2 : 1;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO country_stats (player_id, country_iso, correct_count, miss_count, near_miss_count, struggle_score)
    VALUES (${input.playerId}, ${input.iso}, ${correct}, ${miss}, ${near}, ${Math.max(0, delta)})
    ON CONFLICT (player_id, country_iso) DO UPDATE SET
      correct_count = country_stats.correct_count + ${correct},
      miss_count = country_stats.miss_count + ${miss},
      near_miss_count = country_stats.near_miss_count + ${near},
      struggle_score = GREATEST(0, country_stats.struggle_score + ${delta})`;
  await sql`INSERT INTO runs (id, player_id, mode, board, best_streak, duration_ms, completed)
    VALUES (${input.runId}, ${input.playerId}, ${input.mode}, ${input.board}, ${input.streak}, ${input.durationMs}, ${input.completed})
    ON CONFLICT (id) DO UPDATE SET
      best_streak = GREATEST(runs.best_streak, EXCLUDED.best_streak),
      duration_ms = EXCLUDED.duration_ms,
      completed = runs.completed OR EXCLUDED.completed`;
  return true;
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
