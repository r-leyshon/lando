"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CountryMap } from "@/components/map/CountryMap";
import { Silhouette } from "@/components/map/Silhouette";
import { Lando, Speech } from "@/components/lando/Lando";
import { SpellFix } from "@/components/spelling/SpellFix";
import { usePlayer } from "@/components/player/PlayerProvider";
import { MODE_LABELS, type GameMode } from "@/lib/boards";
import { countryByIso, type BoardId, type Country } from "@/lib/countries";
import { requiredIsos } from "@/lib/map-model";
import { applyOutcome, pickTricky, topStruggle, type Outcome, type Profile } from "@/lib/profile";
import { sfx } from "@/lib/sound";
import { judgeGuess } from "@/lib/spelling";
import { countries } from "@/lib/countries";
import type { LandoMood } from "@/lib/sprites";

type Phase =
  | { kind: "choose" }
  | { kind: "type"; iso: string }
  | { kind: "ask"; iso: string }
  | { kind: "spell"; iso: string; guess: string; form: string; display: string }
  | { kind: "feedback"; tone: "good" | "bad"; iso: string; reveal: string | null }
  | { kind: "victory" }
  | { kind: "empty" };

type PracticeKind = "name" | "where" | "silhouette";

type RunState = {
  runId: string;
  startedAt: number;
  streak: number;
  best: number;
  stamped: string[];
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

function successLine(name: string, streak: number) {
  if (streak === 1) return `${name}! The streak starts now.`;
  if (streak % 5 === 0) return `${streak} in a row! You stamped ${name}.`;
  return `${name}! That's ${streak} in a row.`;
}

function loadSaved(mode: GameMode) {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(runKey(mode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pick<RunState, "runId" | "startedAt" | "streak" | "best" | "stamped">;
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
      line:
        practiceKind === "silhouette"
          ? "You found this shape tricky. What country is it?"
          : "Who is this outline?",
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
    line: "What's this one called?",
    mood: "think",
  };
}

function createRun(mode: GameMode, profile: Profile | null): RunState {
  const saved = loadSaved(mode);
  const base = saved ?? freshRun();
  const required = requiredIsos(WORLD);
  const finished = mode !== "practice" && required.every((iso) => base.stamped.includes(iso)) && required.length > 0;

  if (finished && saved) {
    return {
      ...base,
      phase: { kind: "victory" },
      line: "You stamped every country on the world map.",
      mood: "celebrate",
      practiceKind: null,
    };
  }

  if (mode === "practice") {
    const country = profile ? pickTricky(profile, null) : null;
    if (!country) {
      return {
        ...base,
        phase: { kind: "empty" },
        line: "Play a few countries first. I'll remember the ones that wobble.",
        mood: "think",
        practiceKind: null,
      };
    }
    const prompt = promptFor(mode, "where", country);
    return { ...base, ...prompt, practiceKind: "where" };
  }

  if (mode === "name") {
    const tricky = profile ? topStruggle(profile, requiredIsos(WORLD)) : null;
    return {
      ...base,
      phase: { kind: "choose" },
      mood: "wave",
      practiceKind: null,
      line: tricky
        ? `${tricky.name} was a tricky one last time. Tap a country, then type its name.`
        : "Tap a country, then type its English name.",
    };
  }

  if (mode === "where" || mode === "silhouette") {
    const iso = pickIso(requiredIsos(WORLD), base.stamped, null);
    const country = iso ? countryByIso.get(iso) : null;
    if (!country) {
      return {
        ...base,
        phase: { kind: "victory" },
        line: "You stamped every country on the world map.",
        mood: "celebrate",
        practiceKind: null,
      };
    }
    const prompt = promptFor(mode, null, country);
    return { ...base, ...prompt, practiceKind: null };
  }

  return {
    ...base,
    phase: { kind: "empty" },
    line: "That game is not ready yet.",
    mood: "oops",
    practiceKind: null,
  };
}

export function GameScreen({ mode }: { mode: GameMode }) {
  const router = useRouter();
  const { ready, profile, setProfile, syncProgress } = usePlayer();
  const [run, setRun] = useState<RunState | null>(null);
  const [draft, setDraft] = useState("");
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
      }),
    );
  }, [mode, run]);

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
  const required = mode === "practice" ? [] : requiredIsos(WORLD);
  const done = required.filter((iso) => run.stamped.includes(iso)).length;
  const stamped = new Set(run.stamped);
  const selected =
    run.phase.kind === "type" || (run.phase.kind === "feedback" && run.phase.tone === "good")
      ? run.phase.iso
      : null;
  const reveal = run.phase.kind === "feedback" ? run.phase.reveal : null;
  const showSilhouette =
    mode === "silhouette" || (mode === "practice" && run.practiceKind === "silhouette");
  const showMap = !showSilhouette && run.phase.kind !== "empty";
  const activeIso =
    run.phase.kind === "type" || run.phase.kind === "ask" || run.phase.kind === "spell" || run.phase.kind === "feedback"
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

  function onCorrect(iso: string, outcome: Outcome) {
    const country = countryByIso.get(iso);
    if (!country || !run) return;
    const streak = run.streak + 1;
    const completed =
      mode !== "practice" && requiredIsos(WORLD).every((id) => id === iso || run.stamped.includes(id));
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
            phase: { kind: "feedback", tone: "good", iso, reveal: null },
            line: successLine(country.name, streak),
            mood: "celebrate",
          }
        : current,
    );
  }

  function onMiss(iso: string, line: string, outcome: Outcome = "miss") {
    if (!run) return;
    record(iso, outcome, 0, false);
    sfx.miss();
    setRun((current) =>
      current
        ? {
            ...current,
            streak: 0,
            phase: { kind: "feedback", tone: "bad", iso, reveal: iso },
            line,
            mood: "oops",
          }
        : current,
    );
  }

  function submitGuess(raw: string) {
    if (!run || (run.phase.kind !== "type" && run.phase.kind !== "spell")) return;
    const iso = run.phase.iso;
    const country = countryByIso.get(iso);
    if (!country) return;
    const result = judgeGuess(raw, country, countries);
    if (result.kind === "correct") {
      onCorrect(iso, "correct");
      return;
    }
    if (result.kind === "hint") {
      setRun((current) => (current ? { ...current, line: result.message, mood: "think" } : current));
      return;
    }
    if (result.kind === "near") {
      sfx.near();
      setRun((current) =>
        current
          ? {
              ...current,
              phase: { kind: "spell", iso, guess: raw, form: result.form, display: result.display },
              line: "Nearly! The red letters need a fix. Tap the tiles in order.",
              mood: "think",
            }
          : current,
      );
      return;
    }
    if (result.kind === "mixup") {
      onMiss(iso, `${result.message} Streak back to zero. Your stamps stay.`);
      return;
    }
    onMiss(iso, `The name is ${country.name}. Streak back to zero. Your stamps stay.`);
  }

  function onPick(hit: { iso2: string } | { note: string }) {
    if (!run) return;
    if ("note" in hit) {
      setRun((current) => (current ? { ...current, line: hit.note, mood: "think" } : current));
      return;
    }
    if (run.phase.kind === "feedback" || run.phase.kind === "spell" || run.phase.kind === "victory") return;
    sfx.tap();
    if (run.phase.kind === "ask") {
      if (hit.iso2 === run.phase.iso) onCorrect(hit.iso2, "correct");
      else {
        const tapped = countryByIso.get(hit.iso2);
        const wanted = countryByIso.get(run.phase.iso);
        const line = tapped
          ? `That's ${tapped.name}. This one is ${wanted?.name ?? "the highlighted country"}. Streak back to zero.`
          : `Not that one. This is ${wanted?.name ?? "the highlighted country"}. Streak back to zero.`;
        onMiss(run.phase.iso, line);
      }
      return;
    }
    if (run.stamped.includes(hit.iso2)) {
      const name = countryByIso.get(hit.iso2)?.name ?? "That country";
      setRun((current) =>
        current ? { ...current, line: `${name} is already stamped. Try another.`, mood: "wave" } : current,
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
          <p className="text-xs font-bold text-ink/70">
            {mode === "practice" ? "Your own streak" : `${done}/${required.length} on the world map`}
          </p>
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

      <section className="sheet safe-bottom px-3 pt-3 pb-4">
        <div className="flex items-end gap-2">
          <Lando mood={run.mood} className="h-24 w-20 shrink-0" />
          <Speech>{run.line}</Speech>
        </div>

        {run.phase.kind === "type" ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitGuess(draft);
            }}
          >
            <label className="sr-only" htmlFor="country-answer">
              Country name
            </label>
            <input
              ref={inputRef}
              id="country-answer"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="done"
              className="field min-w-0 flex-1"
              placeholder="Type the name"
            />
            <button type="submit" className="chunky min-h-12 bg-pick px-4 font-extrabold">
              Go
            </button>
          </form>
        ) : null}

        {run.phase.kind === "spell" ? (
          <div className="mt-3">
            <SpellFix
              guess={run.phase.guess}
              highlightForm={run.phase.form}
              answer={run.phase.display}
              onSolved={() => onCorrect(run.phase.kind === "spell" ? run.phase.iso : "", "near")}
              onSkip={() => {
                if (run.phase.kind !== "spell") return;
                const name = countryByIso.get(run.phase.iso)?.name ?? "that country";
                onMiss(run.phase.iso, `We'll keep ${name} in the notebook. Streak back to zero.`, "skip");
              }}
            />
          </div>
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
            <p className="text-center font-extrabold">Best streak this expedition: {run.best}</p>
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
                  Yes, start fresh
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
        line: "Those tricky ones are looking better. Pick another game if you want a new challenge.",
      };
    }
    const prompt = promptFor(mode, "where", country);
    return { ...current, ...prompt, practiceKind: "where" };
  }
  const iso = pickIso(requiredIsos(WORLD), current.stamped, phaseIso(current));
  const country = iso ? countryByIso.get(iso) : null;
  if (!country) {
    return {
      ...current,
      phase: { kind: "victory" },
      mood: "celebrate",
      line: "You stamped every country on the world map.",
    };
  }
  const prompt = promptFor(mode, null, country);
  return { ...current, ...prompt, practiceKind: null };
}

function phaseIso(current: RunState) {
  const phase = current.phase;
  if (phase.kind === "type" || phase.kind === "ask" || phase.kind === "spell" || phase.kind === "feedback") {
    return phase.iso;
  }
  return null;
}

function afterFeedback(current: RunState, mode: GameMode, profile: Profile | null): RunState {
  const required = requiredIsos(WORLD);
  const finished = mode !== "practice" && required.length > 0 && required.every((iso) => current.stamped.includes(iso));
  if (current.phase.kind === "feedback" && current.phase.tone === "good" && finished) {
    return {
      ...current,
      phase: { kind: "victory" },
      mood: "celebrate",
      line: `You stamped every country on the world map. Best streak: ${current.best}.`,
    };
  }
  if (mode === "name") {
    return {
      ...current,
      phase: { kind: "choose" },
      mood: "idle",
      practiceKind: null,
      line: current.phase.kind === "feedback" && current.phase.tone === "good" ? "Tap another country." : "Tap a country when you're ready.",
    };
  }
  return nextQuestion(current, mode, profile);
}
