"use client";

import Link from "next/link";
import { useState } from "react";
import { Lando, Speech } from "@/components/lando/Lando";
import { formatCode, rememberPlayer, usePlayer } from "@/components/player/PlayerProvider";
import { MODE_LABELS, type GameMode } from "@/lib/boards";
import { quizCountries } from "@/lib/countries";
import { bestStreak, cleanNickname, passportCount } from "@/lib/profile";

const GAMES: { mode: GameMode; detail: string }[] = [
  { mode: "name", detail: "Tap a country, then type its name." },
  { mode: "where", detail: "Lando says a country. You tap it on the map." },
  { mode: "silhouette", detail: "Look at the shape, then type the country's name." },
  { mode: "practice", detail: "Try again at the countries you missed." },
];

export function HomeScreen() {
  const { ready, profile, setProfile, restore } = usePlayer();
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <div className="h-dvh bg-sea" />;

  if (!profile) {
    return (
      <main className="grid min-h-dvh place-items-center bg-sea px-4 py-8">
        <form
          className="chunky w-full max-w-md bg-paper p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (showCode) return;
            const cleaned = cleanNickname(nickname);
            if (!cleaned) {
              setError("Use 2 to 16 letters in your name.");
              return;
            }
            setProfile(rememberPlayer(cleaned));
          }}
        >
          <p className="font-pixel text-center text-2xl text-ink">Lando</p>
          <div className="mt-4 flex items-end gap-3">
            <Lando mood="wave" className="h-32 w-28" />
            <Speech>
              {showCode ? "Type the code you wrote down." : "I'm Lando. What should I call you?"}
            </Speech>
          </div>
          {showCode ? (
            <label className="mt-4 grid gap-2 font-extrabold">
              Lando code
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                autoComplete="off"
                className="field tracking-[0.3em] uppercase"
                placeholder="ABC-123"
              />
            </label>
          ) : (
            <label className="mt-4 grid gap-2 font-extrabold">
              Your name
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="nickname"
                className="field"
                maxLength={16}
                placeholder="Alex"
              />
            </label>
          )}
          {error ? <p className="mt-2 font-bold text-coral">{error}</p> : null}
          {showCode ? (
            <button
              type="button"
              className="chunky mt-4 min-h-12 w-full bg-pick font-extrabold"
              onClick={() => {
                void restore(code).then((message) => setError(message));
              }}
            >
              Load my code
            </button>
          ) : (
            <button type="submit" className="chunky mt-4 min-h-12 w-full bg-pick font-extrabold">
              Let&apos;s go
            </button>
          )}
          <button
            type="button"
            className="mt-3 min-h-11 w-full font-extrabold underline"
            onClick={() => {
              setShowCode((current) => !current);
              setError(null);
            }}
          >
            {showCode ? "I need a new name" : "I already have a Lando code"}
          </button>
        </form>
      </main>
    );
  }

  const stamps = passportCount(profile);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col bg-sea">
      <header className="safe-top flex items-center justify-between gap-3 px-4 pt-4">
        <div>
          <p className="font-pixel text-xl">Lando</p>
          <p className="font-extrabold">Hi {profile.nickname}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="chunky min-h-11 bg-paper px-3 font-extrabold"
            aria-label={profile.muted ? "Turn sound on" : "Turn sound off"}
            onClick={() => setProfile({ ...profile, muted: !profile.muted })}
          >
            {profile.muted ? "Quiet" : "Sound"}
          </button>
          <Link href="/leaderboard" className="chunky grid min-h-11 place-items-center bg-paper px-3 font-extrabold">
            Scores
          </Link>
        </div>
      </header>

      <div className="px-4 pt-3">
        <div className="flex items-end gap-2">
          <Lando mood="wave" className="h-24 w-20" />
          <Speech>Pick the game you would like to play.</Speech>
        </div>
        <p className="mt-3 font-extrabold">
          Stamps {stamps} of {quizCountries.length}
        </p>
      </div>

      <section className="grid flex-1 gap-3 px-4 py-4">
        {GAMES.map((game) => (
          <Link key={game.mode} href={`/play/${game.mode}`} className="chunky block bg-paper px-4 py-4">
            <span className="block text-xl font-extrabold">{MODE_LABELS[game.mode]}</span>
            <span className="mt-1 block font-bold text-ink/80">{game.detail}</span>
            <span className="mt-2 block text-sm font-extrabold text-leaf">
              Best streak {bestStreak(profile, game.mode)}
            </span>
          </Link>
        ))}
      </section>

      {!profile.seenCode ? (
        <div className="fixed inset-0 z-20 grid place-items-center bg-ink/40 p-4">
          <div className="chunky w-full max-w-sm bg-paper p-5">
            <h2 className="font-pixel text-sm">Your Lando code</h2>
            <p className="mt-3 text-lg font-extrabold">
              Write this code down. You can use it to get your stamps back on another phone or computer.
            </p>
            <p className="mt-3 text-center text-3xl font-extrabold tracking-[0.25em]">{formatCode(profile.recoveryCode)}</p>
            <button
              type="button"
              className="chunky mt-4 min-h-12 w-full bg-pick font-extrabold"
              onClick={() => setProfile({ ...profile, seenCode: true })}
            >
              I&apos;ve written it down
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
