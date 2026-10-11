"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Lando, Speech } from "@/components/lando/Lando";
import { usePlayer } from "@/components/player/PlayerProvider";
import { MODES, MODE_LABELS, type GameMode } from "@/lib/boards";
import { bestStreak } from "@/lib/profile";

type Entry = { playerId: string; nickname: string; bestStreak: number };

export function LeaderboardScreen() {
  const params = useSearchParams();
  const { profile } = usePlayer();
  const initialMode = (MODES as readonly string[]).includes(params.get("mode") ?? "")
    ? (params.get("mode") as GameMode)
    : "name";
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [database, setDatabase] = useState<boolean | null>(null);

  useEffect(() => {
    let cancel = false;
    void fetch(`/api/leaderboard?mode=${mode}`)
      .then((response) => response.json())
      .then((payload: { database: boolean; entries: Entry[] }) => {
        if (cancel) return;
        setDatabase(payload.database);
        setEntries(payload.entries ?? []);
      })
      .catch(() => {
        if (!cancel) setDatabase(false);
      });
    return () => {
      cancel = true;
    };
  }, [mode]);

  const localBest = profile ? bestStreak(profile, mode) : 0;

  return (
    <main className="mx-auto min-h-dvh max-w-xl bg-sea px-4 pb-10">
      <header className="safe-top flex items-center gap-3 pt-4">
        <Link href="/" className="chunky grid h-11 w-11 place-items-center bg-paper text-xl" aria-label="Home">
          ←
        </Link>
        <h1 className="font-pixel text-sm">Scores</h1>
      </header>
      <div className="mt-4 flex items-end gap-2">
        <Lando mood="wave" className="h-24 w-20" />
        <Speech>
          {database
            ? `Longest streaks in ${MODE_LABELS[mode]}.`
            : `Streaks for ${MODE_LABELS[mode]} saved on this phone. Cloud scores appear when a database is connected.`}
        </Speech>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 font-extrabold">
          Game
          <select className="field" value={mode} onChange={(event) => setMode(event.target.value as GameMode)}>
            {MODES.map((id) => (
              <option key={id} value={id}>
                {MODE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ol className="mt-4 grid gap-2">
        {database && entries.length === 0 ? (
          <li className="chunky bg-paper px-4 py-3 font-extrabold">Be the first name on this scoreboard.</li>
        ) : null}
        {database
          ? entries.map((entry, index) => (
              <li key={entry.playerId} className="chunky flex items-center justify-between bg-paper px-4 py-3 font-extrabold">
                <span>
                  {index + 1}. {entry.nickname}
                </span>
                <span>{entry.bestStreak}</span>
              </li>
            ))
          : null}
        {!database && profile ? (
          <li className="chunky flex items-center justify-between bg-paper px-4 py-3 font-extrabold">
            <span>1. {profile.nickname}</span>
            <span>{localBest}</span>
          </li>
        ) : null}
      </ol>
    </main>
  );
}
