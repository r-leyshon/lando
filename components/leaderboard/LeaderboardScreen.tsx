"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Lando, Speech } from "@/components/lando/Lando";
import { usePlayer } from "@/components/player/PlayerProvider";
import { MODES, MODE_LABELS, type GameMode } from "@/lib/boards";
import { bestStreak } from "@/lib/profile";

type Entry = { playerId: string; nickname: string; bestStreak: number };

function GameMenu({ mode, onChange }: { mode: GameMode; onChange: (mode: GameMode) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <p id={`${menuId}-label`} className="font-extrabold">
        Game
      </p>
      <button
        type="button"
        className="chunky mt-1 flex min-h-12 w-full items-center justify-between bg-paper px-4 text-left font-extrabold"
        aria-label={`Game: ${MODE_LABELS[mode]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{MODE_LABELS[mode]}</span>
        <span aria-hidden className={`text-sm ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {open ? (
        <ul id={menuId} role="listbox" aria-labelledby={`${menuId}-label`} className="chunky absolute z-10 mt-2 w-full overflow-hidden bg-paper">
          {MODES.map((id) => {
            const selected = id === mode;
            return (
              <li key={id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex min-h-12 w-full items-center justify-between px-4 text-left font-extrabold ${selected ? "bg-sand" : "bg-paper hover:bg-wood"}`}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                >
                  <span>{MODE_LABELS[id]}</span>
                  {selected ? <span aria-hidden>✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

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
        <Lando mood="wave" className="h-24 shrink-0" />
        <Speech>
          {database
            ? `Here are the longest streaks for ${MODE_LABELS[mode]}.`
            : `This is your best streak for ${MODE_LABELS[mode]} on this phone.`}
        </Speech>
      </div>
      <div className="mt-4">
        <GameMenu mode={mode} onChange={setMode} />
      </div>
      <ol className="mt-4 grid gap-2">
        {database && entries.length === 0 ? (
          <li className="chunky bg-paper px-4 py-3 font-extrabold">Nobody is on this list yet. You could be first!</li>
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
