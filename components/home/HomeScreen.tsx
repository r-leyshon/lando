"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleSignIn } from "@/components/home/GoogleSignIn";
import { Lando, Speech } from "@/components/lando/Lando";
import { usePlayer } from "@/components/player/PlayerProvider";
import { MODE_LABELS, type GameMode } from "@/lib/boards";
import { quizCountries } from "@/lib/countries";
import { bestStreak, caughtCount, stampsFor } from "@/lib/profile";

const GAMES: { mode: GameMode; detail: string }[] = [
  { mode: "name", detail: "Tap a country, then tell me its name." },
  { mode: "where", detail: "I say a country. You tap it on the map." },
  { mode: "silhouette", detail: "Look at the shape, then tell me the country's name." },
  { mode: "flag", detail: "I show a flag. You type the country's name." },
  { mode: "capital", detail: "I show a country and a flashing dot. You type the city." },
  { mode: "practice", detail: "Have another go at the countries you found hard." },
];

export function HomeScreen() {
  const { ready, gate, profile, setProfile, refresh, signIn } = usePlayer();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!ready || gate === "checking") return <div className="h-dvh bg-sea" />;

  const playing = profile && (gate === "in" || gate === "offline");
  if (!playing) {
    const line =
      gate === "offline"
        ? "I could not reach the score book. Try again in a moment."
        : "Welcome to Lando, sign in with Google.";
    return (
      <main className="grid min-h-dvh place-items-center bg-sea px-4 py-8">
        <div className="chunky w-full max-w-md bg-paper p-5">
          <p className="font-pixel text-center text-2xl text-ink">Lando</p>
          <div className="mt-4 flex items-end gap-3">
            <Lando mood="wave" className="h-32 shrink-0" />
            <Speech>{line}</Speech>
          </div>
          {error ? <p className="mt-3 font-bold text-coral">{error}</p> : null}
          {busy ? <p className="mt-4 text-center font-extrabold">Signing in…</p> : null}
          {gate === "offline" ? (
            <button
              type="button"
              className="chunky mt-4 min-h-12 w-full bg-pick font-extrabold"
              onClick={() => {
                setError(null);
                void refresh();
              }}
            >
              Try again
            </button>
          ) : (
            <GoogleSignIn
              onCredential={(credential) => {
                setBusy(true);
                setError(null);
                void signIn(credential).then((message) => {
                  setError(message);
                  setBusy(false);
                });
              }}
            />
          )}
        </div>
      </main>
    );
  }

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
          <Lando mood="wave" className="h-24 shrink-0" />
          <Speech>{`What shall we play, ${profile.nickname}?`}</Speech>
        </div>
        <Link href="/dex" className="chunky mt-3 block bg-sand px-4 py-3">
          <span className="block text-lg font-extrabold">Country dex</span>
          <span className="block font-bold">Caught {caughtCount(profile)} of {quizCountries.length}</span>
        </Link>
      </div>

      <section className="grid flex-1 gap-3 px-4 py-4">
        {GAMES.map((game) => (
          <Link key={game.mode} href={`/play/${game.mode}`} className="chunky block bg-paper px-4 py-4">
            <span className="block text-xl font-extrabold">{MODE_LABELS[game.mode]}</span>
            <span className="mt-1 block font-bold text-ink/80">{game.detail}</span>
            <span className="mt-2 block text-sm font-extrabold text-leaf">
              Stamps {stampsFor(profile, game.mode).length} of {quizCountries.length}
              {" · "}
              Best streak {bestStreak(profile, game.mode)}
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
