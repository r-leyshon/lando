"use client";

import { useMemo, useState } from "react";
import { markGuess, spellWords } from "@/lib/spelling";

function shuffleLetters(word: string, salt: number) {
  const letters = word.split("").map((letter, index) => ({ id: `${salt}-${index}-${letter}`, letter }));
  let seed = salt + word.length * 17;
  for (let index = letters.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const swap = seed % (index + 1);
    [letters[index], letters[swap]] = [letters[swap], letters[index]];
  }
  if (letters.map((tile) => tile.letter).join("").toLowerCase() === word.toLowerCase() && letters.length > 1) {
    letters.push(letters.shift()!);
  }
  return letters;
}

export function SpellFix({
  guess,
  highlightForm,
  answer,
  onSolved,
  onSkip,
}: {
  guess: string;
  highlightForm: string;
  answer: string;
  onSolved: () => void;
  onSkip: () => void;
}) {
  const words = useMemo(() => spellWords(answer), [answer]);
  const marked = useMemo(() => markGuess(guess.trim().toLowerCase(), highlightForm), [guess, highlightForm]);
  const [wordIndex, setWordIndex] = useState(0);
  const [built, setBuilt] = useState<string[]>([]);
  const [salt, setSalt] = useState(1);
  const word = words[wordIndex] ?? "";
  const tiles = useMemo(() => shuffleLetters(word, salt), [word, salt]);
  const remaining = tiles.filter((tile) => !built.includes(tile.id));

  function tap(id: string) {
    const next = [...built, id];
    const spelled = next.map((tileId) => tiles.find((tile) => tile.id === tileId)?.letter ?? "").join("");
    if (spelled.length < word.length) {
      setBuilt(next);
      return;
    }
    if (spelled.toLowerCase() === word.toLowerCase()) {
      if (wordIndex + 1 >= words.length) {
        onSolved();
        return;
      }
      setWordIndex((current) => current + 1);
      setBuilt([]);
      setSalt((current) => current + 1);
      return;
    }
    setBuilt([]);
    setSalt((current) => current + 1);
  }

  return (
    <div className="grid gap-3">
      <p className="text-center text-base font-extrabold text-ink">
        {marked.map((mark, index) => (
          <span key={`${mark.ch}-${index}`} className={mark.bad ? "text-coral" : undefined}>
            {mark.ch === " " ? "\u00a0" : mark.ch}
          </span>
        ))}
      </p>
      <p className="text-center text-sm font-bold text-ink/70">
        Word {wordIndex + 1} of {words.length}
      </p>
      <div className="flex flex-wrap justify-center gap-1" aria-label="Letters so far">
        {word.split("").map((letter, index) => {
          const tile = built[index] ? tiles.find((item) => item.id === built[index]) : null;
          return (
            <span
              key={`${word}-${index}`}
              className="grid h-11 min-w-8 place-items-center border-b-4 border-ink text-2xl font-extrabold uppercase"
            >
              {tile?.letter ?? ""}
              <span className="sr-only">{letter}</span>
            </span>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Letter tiles">
        {remaining.map((tile) => (
          <button key={tile.id} type="button" className="tile" onClick={() => tap(tile.id)}>
            {tile.letter.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="chunky min-h-11 flex-1 bg-white px-3 font-extrabold"
          onClick={() => setBuilt((current) => current.slice(0, -1))}
        >
          Undo
        </button>
        <button type="button" className="chunky min-h-11 flex-1 bg-sand px-3 font-extrabold" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  );
}
