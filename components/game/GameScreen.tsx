"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CountryMap } from "@/components/map/CountryMap";
import { Silhouette } from "@/components/map/Silhouette";
import { Lando, Speech } from "@/components/lando/Lando";
import { AnswerEntry, LetterRow } from "@/components/spelling/AnswerTiles";
import { usePlayer } from "@/components/player/PlayerProvider";
import {
  BOARD_COLORS,
  BOARD_LABELS,
  CONTINENTS,
  continentRoster,
  isContinent,
  MODE_LABELS,
  type ContinentId,
  type GameMode,
} from "@/lib/boards";
import { countryByIso, quizCountries, type BoardId, type Country } from "@/lib/countries";
import { applyOutcome, pickTricky, type Outcome, type Profile } from "@/lib/profile";
import { sfx } from "@/lib/sound";
import { judgeGuess, letterTiles, spellingTarget, type LetterTile } from "@/lib/spelling";
import { countries } from "@/lib/countries";
import type { LandoMood } from "@/lib/sprites";

type Phase =
  | { kind: "continent" }
  | { kind: "choose"; tiles?: LetterTile[] }
  | { kind: "type"; iso: string }
  | { kind: "ask"; iso: string }
  | { kind: "feedback"; tone: "good" | "bad"; iso: string; reveal: string | null; tiles?: LetterTile[] }
  | { kind: "victory" }
  | { kind: "empty" };

type PracticeKind = "name" | "where" | "silhouette";

type RunState = {
  runId: string;
  startedAt: number;
  streak: number;
  best: number;
  stamped: string[];
  continent: ContinentId | null;
  phase: Phase;
  line: string;
  mood: LandoMood;
  practiceKind: PracticeKind | null;
};

const WORLD = "world";

function runKey(mode: GameMode) {
  return `lando-run-v2:${mode}`;
}

function pickIso(isos: string[], stamped: string[], avoid: string | null) {
  const open = isos.filter((iso) => !stamped.includes(iso));
  if (open.length === 0) return null;
  const pool = open.filter((iso) => iso !== avoid);
  const choice = pool.length > 0 ? pool : open;
  return choice[Math.floor(Math.random() * choice.length)] ?? null;
}

const STREAK_RESET = "Your streak starts again. The green countries stay.";

function successLine(name: string, streak: number) {
  if (streak === 1) return `${name}! That's the first one.`;
  if (streak % 5 === 0) return `${streak} in a row! ${name} gets a stamp.`;
  return `${name}! That's ${streak} in a row.`;
}

function loadSaved(mode: GameMode) {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(runKey(mode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pick<RunState, "runId" | "startedAt" | "streak" | "best" | "stamped"> & {
      continent?: ContinentId | null;
    };
  } catch {
    return null;
  }
}

function freshRun(): Pick<RunState, "runId" | "startedAt" | "streak" | "best" | "stamped"> {
  return { runId: crypto.randomUUID(), startedAt: Date.now(), streak: 0, best: 0, stamped: [] };
}

function promptFor(
  mode: GameMode,
  practiceKind: PracticeKind | null,
  country: Country,
): { phase: Phase; line: string; mood: LandoMood } {
  if (mode === "silhouette" || practiceKind === "silhouette") {
    return {
      phase: { kind: "type", iso: country.iso2 },
      line: "What country is this shape?",
      mood: "think",
    };
  }
  if (mode === "where" || practiceKind === "where") {
    return {
      phase: { kind: "ask", iso: country.iso2 },
      line: `Where is ${country.name}?`,
      mood: "wave",
    };
  }
  return {
    phase: { kind: "type", iso: country.iso2 },
    line: "What is this country called?",
    mood: "think",
  };
}

function continentLeft(stamped: string[], continent: ContinentId) {
  return continentRoster(continent).filter((country) => !stamped.includes(country.iso2));
}

function askForContinent(current: RunState, line: string, mood: LandoMood): RunState {
  return { ...current, phase: { kind: "continent" }, line, mood, practiceKind: null };
}

function beginContinent(current: RunState, mode: GameMode, id: ContinentId): RunState {
  const next = { ...current, continent: id };
  const label = BOARD_LABELS[id];
  if (continentLeft(current.stamped, id).length === 0) {
    return askForContinent(next, `You've named every country in ${label}. Pick another part.`, "wave");
  }
  if (mode === "name") {
    return {
      ...next,
      phase: { kind: "choose" },
      mood: "wave",
      practiceKind: null,
      line: `${label} it is. Tap a country, then type its name.`,
    };
  }
  return nextQuestion(next, mode, null);
}

function createRun(mode: GameMode, profile: Profile | null): RunState {
  const saved = loadSaved(mode);
  const base = saved ?? freshRun();
  const continent = saved?.continent && isContinent(saved.continent) ? saved.continent : null;
  const shell: RunState = {
    ...base,
    continent,
    phase: { kind: "continent" },
    line: "Which part of the world shall we start with?",
    mood: "wave",
    practiceKind: null,
  };
  const finished = mode !== "practice" && quizCountries.every((country) => base.stamped.includes(country.iso2));

  if (finished && saved) {
    return {
      ...shell,
      phase: { kind: "victory" },
      line: "You named every country on the map!",
      mood: "celebrate",
    };
  }

  if (mode === "practice") {
    const country = profile ? pickTricky(profile, null) : null;
    if (!country) {
      return {
        ...shell,
        continent: null,
        phase: { kind: "empty" },
        line: "Play another game first. I'll remember the countries you miss.",
        mood: "think",
      };
    }
    const prompt = promptFor(mode, "where", country);
    return { ...shell, continent: null, ...prompt, practiceKind: "where" };
  }

  if (!continent) return shell;
  if (continentLeft(base.stamped, continent).length === 0) {
    return askForContinent(
      shell,
      `That's every country in ${BOARD_LABELS[continent]}. Which part shall we do next?`,
      "celebrate",
    );
  }
  if (mode === "name") {
    return {
      ...shell,
      phase: { kind: "choose" },
      line: "Tap a country, then type its name.",
    };
  }
  if (mode === "where" || mode === "silhouette") return nextQuestion(shell, mode, null);

  return {
    ...shell,
    phase: { kind: "empty" },
    line: "That game is not ready yet.",
    mood: "oops",
  };
}

export function GameScreen({ mode }: { mode: GameMode }) {
  const router = useRouter();
  const { ready, profile, setProfile, syncProgress } = usePlayer();
  const [run, setRun] = useState<RunState | null>(null);
  const [draft, setDraft] = useState("");
  const [marks, setMarks] = useState<LetterTile[] | null>(null);
  const tries = useRef(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ready) return;
    if (!profile) {
      router.replace("/");
      return;
    }
    setRun(createRun(mode, profile));
    // Score updates must not restart the expedition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode, router]);

  useEffect(() => {
    if (!run) return;
    window.sessionStorage.setItem(
      runKey(mode),
      JSON.stringify({
        runId: run.runId,
        startedAt: run.startedAt,
        streak: run.streak,
        best: run.best,
        stamped: run.stamped,
        continent: run.continent,
      }),
    );
  }, [mode, run]);

  const answerKey =
    run && (run.phase.kind === "type" || run.phase.kind === "feedback") ? `${run.phase.kind}:${run.phase.iso}` : run?.phase.kind ?? "";

  useEffect(() => {
    tries.current = 0;
    setDraft("");
    setMarks(null);
  }, [answerKey]);

  useEffect(() => {
    if (run?.phase.kind === "type") inputRef.current?.focus();
  }, [run?.phase]);

  useEffect(() => {
    if (!run || run.phase.kind !== "feedback" || run.phase.tone !== "good") return;
    const timer = window.setTimeout(() => {
      setRun((current) => (current ? afterFeedback(current, mode, profileRef.current) : current));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [run, mode]);

  const mapBoard: BoardId = WORLD;

  if (!ready || !profile || !run) {
    return <div className="h-dvh bg-sea" />;
  }

  const label = MODE_LABELS[mode];
  const worldTotal = quizCountries.length;
  const worldDone = quizCountries.filter((country) => run.stamped.includes(country.iso2)).length;
  const here = run.continent ? continentRoster(run.continent) : [];
  const hereDone = here.filter((country) => run.stamped.includes(country.iso2)).length;
  const stamped = new Set(run.stamped);
  const selected =
    run.phase.kind === "type" || (run.phase.kind === "feedback" && run.phase.tone === "good")
      ? run.phase.iso
      : null;
  const reveal = run.phase.kind === "feedback" ? run.phase.reveal : null;
  const showSilhouette =
    mode === "silhouette" || (mode === "practice" && run.practiceKind === "silhouette");
  const showMap = run.phase.kind === "continent" || (!showSilhouette && run.phase.kind !== "empty");
  const activeIso =
    run.phase.kind === "type" || run.phase.kind === "ask" || run.phase.kind === "feedback"
      ? run.phase.iso
      : null;

  function record(iso: string, outcome: Outcome, streak: number, completed = false) {
    const current = profileRef.current;
    if (!current || !run) return;
    const next = applyOutcome(current, { iso, outcome, mode, board: WORLD, streak });
    syncProgress(next, {
      iso,
      outcome,
      mode,
      board: WORLD,
      streak,
      runId: run.runId,
      startedAt: run.startedAt,
      completed,
    });
  }

  function onCorrect(iso: string, outcome: Outcome, tiles?: LetterTile[]) {
    const country = countryByIso.get(iso);
    if (!country || !run) return;
    const streak = run.streak + 1;
    const completed =
      mode !== "practice" && quizCountries.every((country) => country.iso2 === iso || run.stamped.includes(country.iso2));
    record(iso, outcome, streak, completed);
    if (streak % 5 === 0) sfx.fanfare();
    else sfx.correct();
    setRun((current) =>
      current
        ? {
            ...current,
            streak,
            best: Math.max(current.best, streak),
            stamped: current.stamped.includes(iso) ? current.stamped : [...current.stamped, iso],
            phase: { kind: "feedback", tone: "good", iso, reveal: null, tiles },
            line: successLine(country.name, streak),
            mood: "celebrate",
          }
        : current,
    );
  }

  function onMiss(iso: string, line: string, outcome: Outcome = "miss", tiles?: LetterTile[]) {
    if (!run) return;
    record(iso, outcome, 0, false);
    sfx.miss();
    setRun((current) =>
      current
        ? {
            ...current,
            streak: 0,
            phase: { kind: "feedback", tone: "bad", iso, reveal: iso, tiles },
            line,
            mood: "oops",
          }
        : current,
    );
  }

  function submitGuess(raw: string) {
    if (!run || run.phase.kind !== "type") return;
    const iso = run.phase.iso;
    const country = countryByIso.get(iso);
    if (!country || !raw.trim()) return;
    const result = judgeGuess(raw, country, countries);
    if (result.kind === "correct") {
      const tiles = letterTiles(raw, country.name, true);
      tries.current = 0;
      setMarks(tiles);
      onCorrect(iso, "correct", tiles);
      setDraft("");
      setMarks(null);
      return;
    }
    if (result.kind === "hint") {
      setMarks(letterTiles(raw, spellingTarget(raw, country)));
      setRun((current) => (current ? { ...current, line: result.message, mood: "think" } : current));
      return;
    }
    const tiles = letterTiles(raw, spellingTarget(raw, country));
    const attempt = tries.current + 1;
    tries.current = attempt;
    setMarks(tiles);
    record(iso, "miss", 0, false);
    sfx.miss();
    if (attempt >= 3) {
      tries.current = 0;
      setDraft("");
      setRun((current) => {
        if (!current) return current;
        const line = `The name is ${country.name}. ${mode === "name" ? "Tap another country." : STREAK_RESET}`;
        if (mode === "name") {
          return { ...current, streak: 0, phase: { kind: "choose", tiles }, line, mood: "oops" };
        }
        return {
          ...current,
          streak: 0,
          phase: { kind: "feedback", tone: "bad", iso, reveal: iso, tiles },
          line,
          mood: "oops",
        };
      });
      return;
    }
    const left = 3 - attempt;
    const triesLine = left === 1 ? "1 try left." : `${left} tries left.`;
    setRun((current) => {
      if (!current) return current;
      const broke = current.streak > 0 ? ` ${STREAK_RESET}` : "";
      return {
        ...current,
        streak: 0,
        line: `Not quite. Green letters are in the right place. ${triesLine}${broke}`,
        mood: "oops",
      };
    });
  }

  function onPick(hit: { iso2: string } | { note: string }) {
    if (!run) return;
    if ("note" in hit) {
      setRun((current) => (current ? { ...current, line: hit.note, mood: "think" } : current));
      return;
    }
    if (run.phase.kind === "feedback" || run.phase.kind === "victory") return;
    sfx.tap();
    tries.current = 0;
    setDraft("");
    setMarks(null);
    if (run.phase.kind === "continent") {
      const country = countryByIso.get(hit.iso2);
      if (country && isContinent(country.primary)) {
        const id = country.primary;
        setRun((current) => (current ? beginContinent(current, mode, id) : current));
      }
      return;
    }
    const picked = countryByIso.get(hit.iso2);
    const playing = run.continent;
    if (playing && picked && isContinent(picked.primary) && picked.primary !== playing && run.phase.kind !== "ask") {
      setRun((current) =>
        current
          ? {
              ...current,
              line: `${picked.name} is in ${BOARD_LABELS[picked.primary]}. We're doing ${BOARD_LABELS[playing]}.`,
              mood: "think",
            }
          : current,
      );
      return;
    }
    if (run.phase.kind === "ask") {
      if (hit.iso2 === run.phase.iso) onCorrect(hit.iso2, "correct");
      else {
        const tapped = countryByIso.get(hit.iso2);
        const wanted = countryByIso.get(run.phase.iso);
        const wantedName = wanted?.name ?? "another country";
        const line = tapped
          ? `That's ${tapped.name}. Lando asked for ${wantedName}. ${STREAK_RESET}`
          : `Not that one. Lando asked for ${wantedName}. ${STREAK_RESET}`;
        onMiss(run.phase.iso, line);
      }
      return;
    }
    if (run.stamped.includes(hit.iso2)) {
      const name = countryByIso.get(hit.iso2)?.name ?? "That country";
      setRun((current) =>
        current ? { ...current, line: `You already named ${name}. Try another country.`, mood: "wave" } : current,
      );
      return;
    }
    setRun((current) =>
      current
        ? {
            ...current,
            phase: { kind: "type", iso: hit.iso2 },
            line: "What is this country called?",
            mood: "think",
          }
        : current,
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-sea text-ink">
      <header className="safe-top flex items-center gap-2 px-3 pt-3 pb-2">
        <Link href="/" className="chunky grid h-11 w-11 place-items-center bg-paper text-xl" aria-label="Back">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{label}</p>
          {mode === "practice" || !run.continent ? (
            <p className="text-xs font-bold text-ink/70">
              {mode === "practice" ? "Just for practice" : "Pick a part of the world"}
            </p>
          ) : (
            <button
              type="button"
              className="mt-1 grid w-full gap-1 text-left"
              aria-label={`Change part of the world. ${BOARD_LABELS[run.continent]} ${hereDone} of ${here.length}. Whole world ${worldDone} of ${worldTotal}.`}
              onClick={() => {
                if (run.phase.kind === "continent" || run.phase.kind === "victory") return;
                sfx.tap();
                setRun((current) =>
                  current
                    ? askForContinent(current, "Which part of the world shall we do next?", "wave")
                    : current,
                );
              }}
            >
              <Meter
                label={BOARD_LABELS[run.continent]}
                done={hereDone}
                total={here.length}
                fill={BOARD_COLORS[run.continent]}
              />
              <Meter label="Whole world" done={worldDone} total={worldTotal} fill="#f4d48a" />
            </button>
          )}
        </div>
        <div className="chunky flex h-11 items-center gap-1 bg-paper px-3 font-extrabold" aria-live="polite">
          <span className="text-coral" aria-hidden>
            *
          </span>
          <span>{run.streak}</span>
          <span className="sr-only">country streak</span>
        </div>
        <button
          type="button"
          className="chunky min-h-11 px-3 font-extrabold bg-paper"
          aria-label={profile.muted ? "Turn sound on" : "Turn sound off"}
          aria-pressed={profile.muted}
          onClick={() => setProfile({ ...profile, muted: !profile.muted })}
        >
          {profile.muted ? "Quiet" : "Sound"}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {showMap ? (
          <CountryMap
            board={mapBoard}
            focus={run.phase.kind === "continent" ? null : run.continent}
            stamped={stamped}
            selected={selected}
            reveal={reveal}
            colorMode="play"
            onPick={onPick}
          />
        ) : null}
        {showSilhouette && activeIso ? <Silhouette iso={activeIso} /> : null}
        {run.phase.kind === "empty" ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <Lando mood={run.mood} className="h-40" />
          </div>
        ) : null}
      </div>

      <section className="sheet safe-bottom max-h-[58dvh] overflow-y-auto px-3 pt-3 pb-4">
        <div className="flex items-end gap-2">
          <Lando mood={run.mood} className="h-24 w-20 shrink-0" />
          <Speech>{run.line}</Speech>
        </div>

        {run.phase.kind === "continent" ? (
          <div className="mt-3 grid gap-2">
            <div className="chunky bg-paper px-3 py-2">
              <Meter label="Whole world" done={worldDone} total={worldTotal} fill="#f4d48a" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CONTINENTS.map((id) => {
                const roster = continentRoster(id);
                const named = roster.filter((country) => run.stamped.includes(country.iso2)).length;
                const complete = named === roster.length && roster.length > 0;
                return (
                  <button
                    key={id}
                    type="button"
                    className="chunky min-h-16 px-3 py-2 text-left"
                    style={{ background: BOARD_COLORS[id] }}
                    onClick={() => {
                      sfx.tap();
                      setRun((current) => (current ? beginContinent(current, mode, id) : current));
                    }}
                  >
                    <span className="block text-base font-extrabold">{BOARD_LABELS[id]}</span>
                    <span className="block text-sm font-bold">{complete ? "All named" : `${named} of ${roster.length}`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {run.phase.kind === "feedback" && run.phase.tiles && run.phase.tiles.length > 0 ? (
          <div className="mt-3">
            <LetterRow tiles={run.phase.tiles} />
          </div>
        ) : null}

        {run.phase.kind === "choose" && run.phase.tiles && run.phase.tiles.length > 0 ? (
          <div className="mt-3">
            <LetterRow tiles={run.phase.tiles} />
          </div>
        ) : null}

        {run.phase.kind === "type" ? (
          <AnswerEntry
            value={draft}
            marks={marks}
            inputRef={inputRef}
            onChange={(value) => {
              setDraft(value);
              setMarks(null);
            }}
            onSubmit={() => submitGuess(draft)}
          />
        ) : null}

        {run.phase.kind === "feedback" && run.phase.tone === "bad" ? (
          <button
            type="button"
            className="chunky mt-3 min-h-12 w-full bg-pick font-extrabold"
            onClick={() => setRun((current) => (current ? afterFeedback(current, mode, profileRef.current) : current))}
          >
            Next
          </button>
        ) : null}

        {run.phase.kind === "victory" ? (
          <div className="mt-3 grid gap-2">
            <p className="text-center font-extrabold">Your best streak this game: {run.best}</p>
            <button type="button" className="chunky min-h-12 bg-pick font-extrabold" onClick={() => resetRun()}>
              Play again
            </button>
            <Link href={`/leaderboard?mode=${mode}`} className="chunky grid min-h-12 place-items-center bg-paper font-extrabold">
              Scores
            </Link>
          </div>
        ) : null}

        {run.phase.kind === "empty" ? (
          <Link href="/" className="chunky mt-3 grid min-h-12 place-items-center bg-pick font-extrabold">
            Back to the menu
          </Link>
        ) : null}

        {run.phase.kind !== "victory" && run.phase.kind !== "empty" ? (
          <div className="mt-3 flex items-center justify-between gap-2 text-sm font-bold">
            <Link href={`/leaderboard?mode=${mode}`} className="underline">
              Scores
            </Link>
            {confirmReset ? (
              <span className="flex gap-2">
                <button type="button" className="underline" onClick={() => resetRun()}>
                  Yes, start again
                </button>
                <button type="button" className="underline" onClick={() => setConfirmReset(false)}>
                  Keep going
                </button>
              </span>
            ) : (
              <button type="button" className="underline" onClick={() => setConfirmReset(true)}>
                Start again
              </button>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );

  function resetRun() {
    window.sessionStorage.removeItem(runKey(mode));
    setConfirmReset(false);
    setRun(createRun(mode, profileRef.current));
  }
}

function nextQuestion(current: RunState, mode: GameMode, profile: Profile | null): RunState {
  if (mode === "practice") {
    const country = profile ? pickTricky(profile, phaseIso(current)) : null;
    if (!country) {
      return {
        ...current,
        phase: { kind: "empty" },
        practiceKind: null,
        mood: "celebrate",
        line: "Those hard ones are getting easier. Pick another game when you like.",
      };
    }
    const prompt = promptFor(mode, "where", country);
    return { ...current, ...prompt, practiceKind: "where" };
  }
  if (!current.continent) {
    return askForContinent(current, "Which part of the world shall we start with?", "wave");
  }
  const iso = pickIso(
    continentRoster(current.continent).map((country) => country.iso2),
    current.stamped,
    phaseIso(current),
  );
  const country = iso ? countryByIso.get(iso) : null;
  if (!country) {
    return askForContinent(
      current,
      `That's every country in ${BOARD_LABELS[current.continent]}. Which part shall we do next?`,
      "celebrate",
    );
  }
  const prompt = promptFor(mode, null, country);
  return { ...current, ...prompt, practiceKind: null };
}

function phaseIso(current: RunState) {
  const phase = current.phase;
  if (phase.kind === "type" || phase.kind === "ask" || phase.kind === "feedback") {
    return phase.iso;
  }
  return null;
}

function Meter({ label, done, total, fill }: { label: string; done: number; total: number; fill: string }) {
  const width = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  return (
    <span className="block min-w-0">
      <span className="flex items-baseline justify-between gap-2 text-[11px] leading-tight font-extrabold">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums">
          {done} of {total}
        </span>
      </span>
      <span className="relative mt-0.5 block h-2.5 overflow-hidden rounded-full border-2 border-ink" style={{ background: fill }}>
        <span className="absolute inset-y-0 right-0 bg-paper/70" style={{ width: `${100 - width}%` }} />
      </span>
    </span>
  );
}

function afterFeedback(current: RunState, mode: GameMode, profile: Profile | null): RunState {
  const finished =
    mode !== "practice" && quizCountries.every((country) => current.stamped.includes(country.iso2));
  if (current.phase.kind === "feedback" && current.phase.tone === "good" && finished) {
    return {
      ...current,
      phase: { kind: "victory" },
      mood: "celebrate",
      line: `You named every country on the map! Your best streak is ${current.best}.`,
    };
  }
  if (current.continent && continentLeft(current.stamped, current.continent).length === 0) {
    return askForContinent(
      current,
      `That's every country in ${BOARD_LABELS[current.continent]}. Which part shall we do next?`,
      "celebrate",
    );
  }
  if (mode === "name") {
    return {
      ...current,
      phase: { kind: "choose" },
      mood: "idle",
      practiceKind: null,
      line: current.phase.kind === "feedback" && current.phase.tone === "good" ? "Tap another country." : "Tap a country when you are ready.",
    };
  }
  return nextQuestion(current, mode, profile);
}
