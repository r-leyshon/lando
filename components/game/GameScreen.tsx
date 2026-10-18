"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CountryMap } from "@/components/map/CountryMap";
import { FlagPrompt } from "@/components/game/FlagPrompt";
import { revealAnswer, sheetLimits, useKeyboardInset, usePinnedScreen } from "@/components/game/visible-screen";
import { Silhouette } from "@/components/map/Silhouette";
import { Lando, Speech } from "@/components/lando/Lando";
import { AnswerEntry, AnswerField, LetterRow } from "@/components/spelling/AnswerTiles";
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
import { applyOutcome, clearGameStamps, pickTricky, stampsFor, type Outcome, type Profile } from "@/lib/profile";
import { sfx } from "@/lib/sound";
import { draftTiles, judgeGuess, judgePlace, letterTiles, openHint, spellingTarget, type LetterTile } from "@/lib/spelling";
import { capitalOf, everyCapital } from "@/lib/capitals";
import { countries } from "@/lib/countries";
import type { LandoMood } from "@/lib/sprites";

type Phase =
  | { kind: "continent" }
  | { kind: "choose"; tiles?: LetterTile[] }
  | { kind: "type"; iso: string }
  | { kind: "ask"; iso: string }
  | { kind: "feedback"; tone: "good" | "bad"; iso: string; reveal: string | null; tiles?: LetterTile[] }
  | { kind: "answer"; iso: string; name: string; note: string }
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
  return `lando-run-v3:${mode}`;
}

function pickIso(isos: string[], stamped: string[], avoid: string | null) {
  const open = isos.filter((iso) => !stamped.includes(iso));
  if (open.length === 0) return null;
  const pool = open.filter((iso) => iso !== avoid);
  const choice = pool.length > 0 ? pool : open;
  return choice[Math.floor(Math.random() * choice.length)] ?? null;
}

const STREAK_RESET = "Your streak starts again. The green countries stay.";

function nick(profile: Profile | null | undefined) {
  const name = profile?.nickname.trim();
  return name || null;
}

function successLine(country: string, streak: number, player: string | null, city?: string) {
  if (city) {
    if (streak % 5 === 0) return `${streak} capitals in a row! ${city} is the capital of ${country}.`;
    if (streak === 1) return `${city}! That's the capital of ${country}.`;
    return `${city}! That's ${streak} in a row.`;
  }
  if (streak === 1) {
    return player ? `${country}! That's your first one, ${player}.` : `${country}! That's the first one.`;
  }
  if (streak % 5 === 0) {
    return player ? `${streak} in a row, ${player}! ${country} gets a stamp.` : `${streak} in a row! ${country} gets a stamp.`;
  }
  return `${country}! That's ${streak} in a row.`;
}

function startLine(player: string | null) {
  return player ? `Which part of the world shall we start with, ${player}?` : "Which part of the world shall we start with?";
}

function nextPartLine(player: string | null) {
  return player ? `Which part of the world shall we do next, ${player}?` : "Which part of the world shall we do next?";
}

function continentClear(label: string, player: string | null) {
  return player
    ? `That's every country in ${label}, ${player}. Which part shall we do next?`
    : `That's every country in ${label}. Which part shall we do next?`;
}

function loadSaved(mode: GameMode) {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(runKey(mode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pick<RunState, "runId" | "startedAt" | "streak" | "best" | "stamped"> & {
      continent?: ContinentId | null;
      replay?: boolean;
    };
  } catch {
    return null;
  }
}

function stampsFromBook(profile: Profile | null, mode: GameMode) {
  return stampsFor(profile, mode);
}

function freshRun(): Pick<RunState, "runId" | "startedAt" | "streak" | "best" | "stamped"> {
  return { runId: crypto.randomUUID(), startedAt: Date.now(), streak: 0, best: 0, stamped: [] };
}

function promptFor(
  mode: GameMode,
  practiceKind: PracticeKind | null,
  country: Country,
): { phase: Phase; line: string; mood: LandoMood } {
  if (mode === "flag") {
    return {
      phase: { kind: "type", iso: country.iso2 },
      line: "Whose flag is this?",
      mood: "think",
    };
  }
  if (mode === "capital") {
    return {
      phase: { kind: "type", iso: country.iso2 },
      line: `What is the capital of ${country.name}?`,
      mood: "think",
    };
  }
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

function beginContinent(current: RunState, mode: GameMode, id: ContinentId, player: string | null): RunState {
  const next = { ...current, continent: id };
  const label = BOARD_LABELS[id];
  if (continentLeft(current.stamped, id).length === 0) {
    return askForContinent(
      next,
      player ? `You've named every country in ${label}, ${player}. Pick another part.` : `You've named every country in ${label}. Pick another part.`,
      "wave",
    );
  }
  if (mode === "name") {
    return {
      ...next,
      phase: { kind: "choose" },
      mood: "wave",
      practiceKind: null,
      line: player ? `${label} it is, ${player}. Tap a country, then tell me its name.` : `${label} it is. Tap a country, then tell me its name.`,
    };
  }
  return nextQuestion(next, mode, null);
}

function createRun(mode: GameMode, profile: Profile | null, fresh = false): RunState {
  const saved = fresh ? null : loadSaved(mode);
  const carried = fresh || saved?.replay ? [] : stampsFromBook(profile, mode);
  const stamped = [...new Set([...(saved?.stamped ?? []), ...carried])];
  const base = saved ? { ...saved, stamped } : { ...freshRun(), stamped };
  const continent = saved?.continent && isContinent(saved.continent) ? saved.continent : null;
  const player = nick(profile);
  const shell: RunState = {
    ...base,
    continent,
    phase: { kind: "continent" },
    line: startLine(player),
    mood: "wave",
    practiceKind: null,
  };
  const finished = mode !== "practice" && quizCountries.every((country) => base.stamped.includes(country.iso2));

  if (finished && saved) {
    return {
      ...shell,
      phase: { kind: "victory" },
      line: player
        ? mode === "capital"
          ? `You named every capital, ${player}!`
          : `You named every country on the map, ${player}!`
        : mode === "capital"
          ? "You named every capital!"
          : "You named every country on the map!",
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
        line: player
          ? `Play another game first, ${player}. I'll remember the countries you found hard.`
          : "Play another game first. I'll remember the countries you found hard.",
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
      continentClear(BOARD_LABELS[continent], player),
      "celebrate",
    );
  }
  if (mode === "name") {
    return {
      ...shell,
      phase: { kind: "choose" },
      line: player ? `Tap a country, then tell me its name, ${player}.` : "Tap a country, then tell me its name.",
    };
  }
  if (mode === "where" || mode === "silhouette" || mode === "flag" || mode === "capital") return nextQuestion(shell, mode, null);

  return {
    ...shell,
    phase: { kind: "empty" },
    line: "That game is not ready yet.",
    mood: "oops",
  };
}

export function GameScreen({ mode }: { mode: GameMode }) {
  const router = useRouter();
  const { ready, gate, profile, setProfile, syncProgress } = usePlayer();
  const [run, setRun] = useState<RunState | null>(null);
  const [draft, setDraft] = useState("");
  const [marks, setMarks] = useState<LetterTile[] | null>(null);
  const [hint, setHint] = useState<{ used: number; revealed: number[]; tiles: LetterTile[] }>({
    used: 0,
    revealed: [],
    tiles: [],
  });
  const tries = useRef(0);
  const answerAt = useRef(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const sheetBodyRef = useRef<HTMLDivElement>(null);
  const draggedSheet = useRef(false);
  const replay = useRef(false);
  const sheetPlace = useRef<string | null>(null);
  const sheetDrag = useRef<{ id: number; startY: number; startH: number } | null>(null);
  const [draggingSheet, setDraggingSheet] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [fieldFocused, setFieldFocused] = useState(false);
  const armTyping = useRef(false);
  const keyboardInset = useKeyboardInset(Boolean(run));
  usePinnedScreen(Boolean(run));

  useEffect(() => {
    if (!ready || gate === "checking") return;
    if (gate === "out" || !profile) {
      router.replace("/");
      return;
    }
    replay.current = loadSaved(mode)?.replay ?? false;
    setRun(createRun(mode, profile));
    // Score updates must not restart the expedition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, gate, mode, router]);

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
        replay: replay.current,
      }),
    );
  }, [mode, run]);

  const answerKey =
    run && (run.phase.kind === "type" || run.phase.kind === "feedback") ? `${run.phase.kind}:${run.phase.iso}` : run?.phase.kind ?? "";

  useEffect(() => {
    tries.current = 0;
    setDraft("");
    setMarks(null);
    setHint({ used: 0, revealed: [], tiles: [] });
  }, [answerKey]);

  useEffect(() => {
    if (run?.phase.kind === "type") return;
    inputRef.current?.blur();
  }, [run?.phase]);

  const typingWithKeyboard = run?.phase.kind === "type" && fieldFocused && keyboardInset > 80;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const body = sheetBodyRef.current;
    if (!run || !stage || !body || typingWithKeyboard) return;
    const { min, max } = sheetLimits(stage.clientHeight);
    const place =
      run.phase.kind === "continent" || run.phase.kind === "victory" || run.phase.kind === "empty" ? "menu" : "play";
    const placeKey = `${mode}:${place}`;
    if (sheetPlace.current !== placeKey) {
      sheetPlace.current = placeKey;
      draggedSheet.current = false;
    }
    if (draggedSheet.current) {
      setSheetHeight((current) => {
        if (current == null) return current;
        const next = Math.min(max, Math.max(min, current));
        return next === current ? current : next;
      });
      return;
    }
    const wanted = Math.min(max, Math.max(min, body.offsetHeight + 44));
    setSheetHeight((current) => (current === wanted ? current : wanted));
  }, [run, mode, hint.tiles.length, hint.used, confirmReset, typingWithKeyboard]);

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
    run.phase.kind === "type" ||
    run.phase.kind === "answer" ||
    (run.phase.kind === "feedback" && run.phase.tone === "good")
      ? run.phase.iso
      : null;
  const reveal =
    run.phase.kind === "answer" ? run.phase.iso : run.phase.kind === "feedback" ? run.phase.reveal : null;
  const showSilhouette =
    mode === "silhouette" || (mode === "practice" && run.practiceKind === "silhouette");
  const showFlag = mode === "flag";
  const showMap = run.phase.kind === "continent" || (!showSilhouette && !showFlag && run.phase.kind !== "empty");
  const focusCountry =
    run.phase.kind === "answer" ||
    (mode === "name" && run.phase.kind === "type") ||
    (mode === "capital" && (run.phase.kind === "type" || run.phase.kind === "feedback"))
      ? run.phase.iso
      : null;
  const activeIso =
    run.phase.kind === "type" || run.phase.kind === "ask" || run.phase.kind === "feedback" || run.phase.kind === "answer"
      ? run.phase.iso
      : null;
  const markedCapital = mode === "capital" && activeIso ? capitalOf(activeIso) : null;
  const capitalDot = markedCapital ? ([markedCapital.lon, markedCapital.lat] as [number, number]) : null;

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
            line: successLine(
              country.name,
              streak,
              nick(profileRef.current),
              mode === "capital" ? capitalOf(iso)?.name : undefined,
            ),
            mood: "celebrate",
          }
        : current,
    );
  }

  function showAnswer(iso: string, note: string, outcome?: Outcome) {
    const country = countryByIso.get(iso);
    if (!country || !run) return;
    if (outcome) {
      record(iso, outcome, 0, false);
      sfx.miss();
    }
    inputRef.current?.blur();
    tries.current = 0;
    answerAt.current = performance.now();
    setDraft("");
    setMarks(null);
    setRun((current) =>
      current
        ? {
            ...current,
            streak: 0,
            phase: { kind: "answer", iso, name: mode === "capital" ? capitalOf(iso)?.name ?? country.name : country.name, note },
            line: "The answer",
            mood: "oops",
          }
        : current,
    );
  }

  function openTyping() {
    const field = inputRef.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    revealAnswer(field, sheetRef.current);
  }

  function dropTyping() {
    if (!armTyping.current) return;
    armTyping.current = false;
    inputRef.current?.blur();
  }

  function dismissAnswer() {
    if (performance.now() - answerAt.current < 500 || !run || run.phase.kind !== "answer") return;
    sfx.tap();
    const next =
      mode === "name"
        ? {
            ...run,
            phase: { kind: "choose" as const },
            mood: "idle" as const,
            practiceKind: null,
            line: "Tap another country.",
          }
        : nextQuestion(run, mode, profileRef.current);
    setRun(next);
    if (next.phase.kind === "type") openTyping();
  }

  function giveUp() {
    if (!run || (run.phase.kind !== "type" && run.phase.kind !== "ask")) return;
    const note = run.streak > 0 ? "Your streak starts again." : "";
    showAnswer(run.phase.iso, note, "skip");
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element) || !run) return;
    const field = inputRef.current;
    if (!field) return;
    const keyboardOpen = fieldFocused && keyboardInset > 80 && run.phase.kind === "type";
    if (document.activeElement === field && keyboardOpen) {
      if (target.closest("[data-typing-bar], [data-typed-word], form, [data-sheet-handle], [data-keep-keyboard]")) return;
      field.blur();
      const inSheet = sheetRef.current?.contains(target) ?? false;
      if (!inSheet && !target.closest("button, a")) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const startsQuestion =
      Boolean(target.closest("path")) &&
      (run.phase.kind === "choose" ||
        (run.phase.kind === "continent" && mode !== "name" && mode !== "where" && mode !== "practice"));
    if (!startsQuestion) return;
    armTyping.current = true;
    openTyping();
    const finish = () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      dropTyping();
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function askHint() {
    if (!run || run.phase.kind !== "type" || hint.used >= 3) return;
    const country = countryByIso.get(run.phase.iso);
    if (!country) return;
    const secret = mode === "capital" ? capitalOf(run.phase.iso)?.name ?? country.name : country.name;
    const next = openHint(secret, hint.used, hint.revealed);
    setHint({ used: hint.used + 1, revealed: next.revealed, tiles: next.tiles });
    record(run.phase.iso, "hint", run.streak, false);
    sfx.tap();
    setRun((current) => (current ? { ...current, line: next.line, mood: "think" } : current));
  }

  function submitGuess(raw: string) {
    if (!run || run.phase.kind !== "type") return;
    const iso = run.phase.iso;
    const country = countryByIso.get(iso);
    if (!country || !raw.trim()) return;
    if (mode === "capital" && !capitalOf(iso)) return;
    const place = mode === "capital" ? capitalOf(iso) : null;
    const result = place
      ? judgePlace(
          raw,
          place,
          country.name,
          everyCapital().flatMap((item) => {
            if (!item || item.iso === iso) return [];
            const other = countryByIso.get(item.iso);
            return other ? [{ place: item, country: other.name }] : [];
          }),
        )
      : judgeGuess(raw, country, countries);
    const answerName = place?.name ?? country.name;
    if (result.kind === "correct") {
      const tiles = letterTiles(raw, answerName, true);
      tries.current = 0;
      setMarks(tiles);
      onCorrect(iso, "correct", tiles);
      setDraft("");
      setMarks(null);
      return;
    }
    if (result.kind === "hint") {
      setMarks(letterTiles(raw, answerName));
      setRun((current) => (current ? { ...current, line: result.message, mood: "think" } : current));
      return;
    }
    if (result.kind === "mixup" && mode === "capital" && !result.costsTry) {
      setRun((current) => (current ? { ...current, line: result.message, mood: "think" } : current));
      return;
    }
    const tiles = letterTiles(raw, result.kind === "near" ? result.display : place ? place.name : spellingTarget(raw, country));
    const attempt = tries.current + 1;
    tries.current = attempt;
    setMarks(tiles);
    record(iso, "miss", 0, false);
    sfx.miss();
    if (attempt >= 3) {
      showAnswer(iso, run.streak > 0 ? "Your streak starts again." : "");
      return;
    }
    const left = 3 - attempt;
    const triesLine = left === 1 ? "1 try left." : `${left} tries left.`;
    setRun((current) => {
      if (!current) return current;
      const broke = current.streak > 0 ? ` ${STREAK_RESET}` : "";
      const noteLine =
        result.kind === "mixup"
          ? `${result.message} ${triesLine}`
          : `Not quite. Green letters are in the right place. ${triesLine}${broke}`;
      return {
        ...current,
        streak: 0,
        line: noteLine,
        mood: "oops",
      };
    });
  }

  function onPick(hit: { iso2: string } | { note: string }) {
    if (!run) return;
    if ("note" in hit) {
      dropTyping();
      setRun((current) => (current ? { ...current, line: hit.note, mood: "think" } : current));
      return;
    }
    if (run.phase.kind === "feedback" || run.phase.kind === "victory" || run.phase.kind === "answer") {
      dropTyping();
      return;
    }
    sfx.tap();
    tries.current = 0;
    setDraft("");
    setMarks(null);
    if (run.phase.kind === "continent") {
      const country = countryByIso.get(hit.iso2);
      if (country && isContinent(country.primary)) {
        const next = beginContinent(run, mode, country.primary, nick(profileRef.current));
        setRun(next);
        if (next.phase.kind === "type") {
          armTyping.current = false;
          openTyping();
        } else dropTyping();
      } else dropTyping();
      return;
    }
    const picked = countryByIso.get(hit.iso2);
    const playing = run.continent;
    if (playing && picked && isContinent(picked.primary) && picked.primary !== playing && run.phase.kind !== "ask") {
      dropTyping();
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
      dropTyping();
      if (hit.iso2 === run.phase.iso) onCorrect(hit.iso2, "correct");
      else {
        const tapped = countryByIso.get(hit.iso2);
        const note = tapped ? `You tapped ${tapped.name}.` : "Not that one.";
        const streakNote = run.streak > 0 ? " Your streak starts again." : "";
        showAnswer(run.phase.iso, `${note}${streakNote}`, "miss");
      }
      return;
    }
    if (run.stamped.includes(hit.iso2)) {
      dropTyping();
      const name = countryByIso.get(hit.iso2)?.name ?? "That country";
      setRun((current) =>
        current ? { ...current, line: `You already named ${name}. Try another country.`, mood: "wave" } : current,
      );
      return;
    }
    armTyping.current = false;
    openTyping();
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

  function sheetRange() {
    const stage = stageRef.current;
    if (!stage) return { min: 156, max: 420 };
    return sheetLimits(stage.clientHeight);
  }

  function onSheetDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    event.preventDefault();
    draggedSheet.current = true;
    sheetDrag.current = { id: event.pointerId, startY: event.clientY, startH: sheet.offsetHeight };
    setDraggingSheet(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onSheetMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = sheetDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    const { min, max } = sheetRange();
    const next = drag.startH + (drag.startY - event.clientY);
    setSheetHeight(Math.min(max, Math.max(min, next)));
  }

  function onSheetUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = sheetDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    sheetDrag.current = null;
    setDraggingSheet(false);
    const { min, max } = sheetRange();
    const delta = drag.startY - event.clientY;
    if (delta > 28) setSheetHeight(max);
    else if (delta < -28) setSheetHeight(min);
    else setSheetHeight(drag.startH);
  }

  function onSheetKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    draggedSheet.current = true;
    const { min, max } = sheetRange();
    const current = sheetRef.current?.offsetHeight ?? min;
    const next = event.key === "ArrowUp" ? current + 80 : current - 80;
    setSheetHeight(Math.min(max, Math.max(min, next)));
  }

  const typedTiles = marks ?? draftTiles(draft);
  const { min: sheetMin, max: sheetMax } = sheetRange();
  const sheetPercent =
    sheetHeight == null || sheetMax === sheetMin
      ? 50
      : Math.round(((sheetHeight - sheetMin) / (sheetMax - sheetMin)) * 100);

  return (
    <main
      className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden overscroll-none bg-sea text-ink"
      onPointerDownCapture={onStagePointerDown}
    >
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
                    ? askForContinent(current, nextPartLine(nick(profileRef.current)), "wave")
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

      <AnswerField
        inputRef={inputRef}
        value={draft}
        onChange={(value) => {
          setDraft(value);
          setMarks(null);
        }}
        onFocus={() => setFieldFocused(true)}
        onBlur={() => setFieldFocused(false)}
        onEnter={() => submitGuess(draft)}
        className="sr-only"
      />
      <div ref={stageRef} className="relative min-h-0 flex-1">
        <div
          className="absolute inset-x-0 top-0 flex flex-col"
          style={{ bottom: typingWithKeyboard ? keyboardInset : (sheetHeight ?? sheetMin) }}
        >
        <div className="relative h-full min-h-0 flex-1">
          {showMap ? (
            <CountryMap
              board={mapBoard}
              focus={run.phase.kind === "continent" ? null : run.continent}
              focusCountry={focusCountry}
              capital={capitalDot}
              stamped={stamped}
              selected={selected}
              reveal={reveal}
              colorMode="play"
              onPick={onPick}
            />
          ) : null}
          {showSilhouette && activeIso ? <Silhouette iso={activeIso} /> : null}
          {showFlag && activeIso ? <FlagPrompt iso={activeIso} /> : null}
          {run.phase.kind === "empty" ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <Lando mood={run.mood} className="h-40" />
            </div>
          ) : null}
          {run.phase.kind === "type" && typedTiles.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-3 top-2 z-20 flex justify-center">
              <div
                data-typed-word
                className="pointer-events-auto max-w-full rounded-[14px] border-[3px] border-ink bg-paper px-3 py-2 shadow-[3px_3px_0_#2a241b]"
                onPointerDown={(event) => {
                  event.preventDefault();
                  openTyping();
                }}
              >
                <LetterRow tiles={typedTiles} />
              </div>
            </div>
          ) : null}
        </div>
        {typingWithKeyboard ? (
          <div data-typing-bar className="z-20 shrink-0 border-t-[3px] border-ink bg-paper px-3 py-2">
            <div className="flex items-end gap-2">
              <Lando mood={run.mood} className="h-16 shrink-0" />
              <Speech>{run.line}</Speech>
            </div>
            {hint.tiles.length > 0 ? (
              <div className="mt-2">
                <LetterRow tiles={hint.tiles} compact />
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                className="chunky min-h-11 bg-pick text-sm font-extrabold"
                onClick={() => submitGuess(draft)}
              >
                Go
              </button>
              <button
                type="button"
                data-keep-keyboard
                className="chunky min-h-11 bg-sand text-sm font-extrabold disabled:opacity-50"
                disabled={hint.used >= 3}
                onMouseDown={(event) => event.preventDefault()}
                onClick={askHint}
              >
                Hint
              </button>
              <button type="button" className="chunky min-h-11 bg-paper text-sm font-extrabold" onClick={giveUp}>
                Don't know
              </button>
            </div>
          </div>
        ) : null}
        </div>

        <section
          ref={sheetRef}
          className={`sheet absolute inset-x-0 z-10 overflow-y-auto overscroll-contain ${typingWithKeyboard ? "hidden" : ""}`}
          style={{
            bottom: 0,
            height: sheetHeight ?? undefined,
            maxHeight: sheetMax,
            transition: draggingSheet ? "none" : "height 180ms ease",
          }}
        >
        <div
          role="slider"
          aria-label="Move Lando up or down"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.max(0, Math.min(100, sheetPercent))}
          tabIndex={0}
          data-sheet-handle
          className="sticky top-0 z-10 flex h-11 cursor-grab touch-none items-center justify-center bg-paper active:cursor-grabbing"
          onPointerDown={onSheetDown}
          onPointerMove={onSheetMove}
          onPointerUp={onSheetUp}
          onPointerCancel={onSheetUp}
          onKeyDown={onSheetKey}
        >
          <span className="h-1.5 w-14 rounded-full bg-ink/35" />
        </div>
        <div ref={sheetBodyRef} className="safe-bottom px-3 pt-1 pb-4">
        <div className="flex items-end gap-2">
          <Lando mood={run.mood} className="h-24 shrink-0" />
          <Speech
            answer={run.phase.kind === "answer" ? run.phase.name : null}
            note={run.phase.kind === "answer" ? run.phase.note : null}
            onDismiss={run.phase.kind === "answer" ? dismissAnswer : undefined}
          >
            {run.line}
          </Speech>
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
                      const next = beginContinent(run, mode, id, nick(profileRef.current));
                      setRun(next);
                      if (next.phase.kind === "type") openTyping();
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
          <>
            {hint.tiles.length > 0 ? (
              <div className="mt-3" aria-label={run.line}>
                <LetterRow tiles={hint.tiles} />
              </div>
            ) : null}
            <AnswerEntry
              value={draft}
              marks={marks}
              inputRef={inputRef}
              showLetters={false}
              onChange={(value) => {
                setDraft(value);
                setMarks(null);
              }}
              onSubmit={() => submitGuess(draft)}
            />
            <button
              type="button"
              data-keep-keyboard
              className="chunky mt-2 min-h-12 w-full bg-sand font-extrabold disabled:opacity-50"
              disabled={hint.used >= 3}
              onMouseDown={(event) => event.preventDefault()}
              onClick={askHint}
            >
              {hint.used === 0 ? "Ask for a hint" : hint.used === 1 ? "Another hint" : hint.used === 2 ? "Last hint" : "That's all the hints"}
            </button>
            <button type="button" className="chunky mt-2 min-h-12 w-full bg-paper font-extrabold" onClick={giveUp}>
              I don't know
            </button>
          </>
        ) : null}

        {run.phase.kind === "ask" ? (
          <button type="button" className="chunky mt-3 min-h-12 w-full bg-paper font-extrabold" onClick={giveUp}>
            I don't know
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
            <span className="flex gap-3">
              <Link href="/dex" className="underline">
                Country dex
              </Link>
              <Link href={`/leaderboard?mode=${mode}`} className="underline">
                Scores
              </Link>
            </span>
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
        </div>
      </section>
      </div>
    </main>
  );

  function resetRun() {
    replay.current = true;
    const current = profileRef.current;
    if (current) {
      const next = clearGameStamps(current, mode);
      profileRef.current = next;
      setProfile(next);
    }
    window.sessionStorage.removeItem(runKey(mode));
    setConfirmReset(false);
    setRun(createRun(mode, profileRef.current, true));
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
        line: nick(profile)
          ? `Those hard ones are getting easier, ${nick(profile)}. Pick another game when you like.`
          : "Those hard ones are getting easier. Pick another game when you like.",
      };
    }
    const prompt = promptFor(mode, "where", country);
    return { ...current, ...prompt, practiceKind: "where" };
  }
  if (!current.continent) {
    return askForContinent(current, startLine(nick(profile)), "wave");
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
      continentClear(BOARD_LABELS[current.continent], nick(profile)),
      "celebrate",
    );
  }
  const prompt = promptFor(mode, null, country);
  return { ...current, ...prompt, practiceKind: null };
}

function phaseIso(current: RunState) {
  const phase = current.phase;
  if (phase.kind === "type" || phase.kind === "ask" || phase.kind === "feedback" || phase.kind === "answer") {
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
      line: nick(profile)
        ? mode === "capital"
          ? `You named every capital, ${nick(profile)}! Your best streak is ${current.best}.`
          : `You named every country on the map, ${nick(profile)}! Your best streak is ${current.best}.`
        : mode === "capital"
          ? `You named every capital! Your best streak is ${current.best}.`
          : `You named every country on the map! Your best streak is ${current.best}.`,
    };
  }
  if (current.continent && continentLeft(current.stamped, current.continent).length === 0) {
    return askForContinent(
      current,
      continentClear(BOARD_LABELS[current.continent], nick(profile)),
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
