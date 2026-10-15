"use client";

import Link from "next/link";
import { useState } from "react";
import { Lando, Speech } from "@/components/lando/Lando";
import { usePlayer } from "@/components/player/PlayerProvider";
import {
  BOARD_COLORS,
  BOARD_LABELS,
  CONTINENTS,
  DEX_LABELS,
  DEX_MODES,
  continentRoster,
  type DexMode,
} from "@/lib/boards";
import { quizCountries } from "@/lib/countries";
import { caughtCount, dexComplete, dexModes, type CountryStat } from "@/lib/profile";

export function DexScreen() {
  const { ready, gate, profile } = usePlayer();
  const [showHidden, setShowHidden] = useState(false);

  if (!ready || gate === "checking") return <div className="h-dvh bg-sea" />;

  if (!profile || (gate !== "in" && gate !== "offline")) {
    return (
      <main className="grid min-h-dvh place-items-center bg-sea px-4">
        <div className="chunky max-w-md bg-paper p-5 text-center">
          <p className="font-extrabold">Sign in to open your country dex.</p>
          <Link href="/" className="chunky mt-4 grid min-h-12 place-items-center bg-pick font-extrabold">
            Home
          </Link>
        </div>
      </main>
    );
  }

  const caught = caughtCount(profile);
  const total = quizCountries.length;
  const line =
    caught === total
        ? `You caught every country, ${profile.nickname}!`
        : caught === 0
          ? "Catch a country by getting it right in every game, including the capital."
          : `You've caught ${caught} of ${total}, ${profile.nickname}. Keep going!`;

  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-sea px-4 pb-12">
      <header className="safe-top flex items-center gap-3 pt-4">
        <Link href="/" className="chunky grid h-11 w-11 place-items-center bg-paper text-xl" aria-label="Home">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-pixel text-sm">Country dex</h1>
          <p className="font-extrabold">
            Caught {caught} of {total}
          </p>
        </div>
      </header>

      <div className="mt-4 flex items-end gap-2">
        <Lando mood={caught === total ? "celebrate" : "wave"} className="h-24 shrink-0" />
        <Speech>{line}</Speech>
      </div>

      <button
        type="button"
        className="chunky mt-4 min-h-12 w-full bg-paper font-extrabold"
        aria-pressed={showHidden}
        onClick={() => setShowHidden((current) => !current)}
      >
        {showHidden ? "Hide the ones you have not found" : "Show the ones you have not found"}
      </button>

      <div className="mt-4 grid gap-6">
        {CONTINENTS.map((id) => {
          const roster = [...continentRoster(id)].sort((a, b) => a.name.localeCompare(b.name));
          const started = roster.filter((country) => dexModes(profile.stats[country.iso2]?.found).length > 0);
          const hidden = roster.length - started.length;
          const done = roster.filter((country) => dexComplete(profile.stats[country.iso2])).length;
          return (
            <section key={id} aria-label={BOARD_LABELS[id]}>
              <div className="chunky px-3 py-2" style={{ background: BOARD_COLORS[id] }}>
                <h2 className="text-lg font-extrabold">{BOARD_LABELS[id]}</h2>
                <p className="text-sm font-bold">
                  {done} of {roster.length} caught
                </p>
              </div>
              <ul className="mt-2 grid gap-2">
                {started.map((country) => (
                  <CountryCard key={country.iso2} name={country.name} iso={country.iso2} stat={profile.stats[country.iso2]} />
                ))}
              </ul>
              {showHidden && hidden > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${hidden} countries still hiding in ${BOARD_LABELS[id]}`}>
                  {roster
                    .filter((country) => dexModes(profile.stats[country.iso2]?.found).length === 0)
                    .map((country) => (
                      <li
                        key={country.iso2}
                        aria-hidden
                        className="grid h-10 w-10 place-items-center rounded-[10px] border-2 border-dashed border-ink/40 font-extrabold text-ink/40"
                      >
                        ?
                      </li>
                    ))}
                </ul>
              ) : null}
              {!showHidden && hidden > 0 ? <p className="mt-2 font-bold text-ink/70">{hidden} still hiding</p> : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}

function CountryCard({ name, iso, stat }: { name: string; iso: string; stat: CountryStat | undefined }) {
  const found = dexModes(stat?.found);
  const caught = dexComplete(stat);
  const showFlag = found.includes("flag");
  return (
    <li className={`chunky flex gap-3 px-3 py-3 ${caught ? "bg-stamp" : "bg-paper"}`}>
      <div className="grid h-14 w-16 shrink-0 place-items-center overflow-hidden rounded-[10px] border-[3px] border-ink bg-paper">
        {showFlag ? (
          <img src={`/flags/${iso.toLowerCase()}.svg`} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xl font-extrabold text-ink/30" aria-hidden>
            ?
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">
          <span className="block truncate">{name}</span>
          {caught ? <span className="text-sm">Caught</span> : null}
        </p>
        <ul className="mt-2 flex flex-wrap gap-1" aria-label={stampLabel(name, found, caught)}>
          {DEX_MODES.map((mode) => {
            const got = found.includes(mode);
            return (
              <li
                key={mode}
                className={`rounded-full border-2 border-ink px-2 py-0.5 text-xs font-extrabold ${got ? "bg-sand" : "bg-paper text-ink/40"}`}
              >
                {DEX_LABELS[mode]}
              </li>
            );
          })}
        </ul>
      </div>
    </li>
  );
}

function stampLabel(name: string, found: DexMode[], caught: boolean) {
  if (caught) return `${name}, caught in every game`;
  if (found.length === 0) return `${name}, not found yet`;
  const got = found.map((mode) => DEX_LABELS[mode]).join(", ");
  return `${name}, ${found.length} of ${DEX_MODES.length}. ${got}.`;
}
