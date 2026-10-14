"use client";

import type { PointerEvent, RefObject } from "react";
import { draftTiles, type LetterTile } from "@/lib/spelling";

export function LetterRow({ tiles }: { tiles: LetterTile[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" aria-hidden>
      {tiles.map((tile, index) =>
        tile.tone === "gap" ? (
          <span key={index} className="w-3" />
        ) : (
          <span
            key={index}
            className={`grid h-12 min-w-11 place-items-center rounded-[10px] border-[3px] border-ink text-2xl font-extrabold uppercase shadow-[3px_3px_0_#2a241b] transition-colors duration-200 ${
              tile.tone === "green"
                ? "bg-stamp text-ink"
                : tile.tone === "red"
                  ? "bg-coral text-paper"
                  : tile.tone === "empty"
                    ? "bg-paper text-ink"
                    : "bg-wood text-ink"
            }`}
          >
            {tile.ch}
          </span>
        ),
      )}
    </div>
  );
}

export function AnswerEntry({
  value,
  marks,
  inputRef,
  onChange,
  onSubmit,
  showLetters = true,
}: {
  value: string;
  marks: LetterTile[] | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
  showLetters?: boolean;
}) {
  const tiles = marks ?? draftTiles(value);
  const lettersVisible = showLetters && tiles.length > 0;
  function focusField(event: PointerEvent<HTMLElement>) {
    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
  }
  return (
    <form
      className="mt-3 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {lettersVisible ? (
        <div className="relative min-h-12" onPointerDown={focusField}>
          <LetterRow tiles={tiles} />
          <AnswerField inputRef={inputRef} value={value} onChange={onChange} className="absolute inset-0 z-10 cursor-text bg-transparent text-base text-transparent caret-transparent outline-none" />
        </div>
      ) : (
        <>
          <button type="button" className="chunky min-h-12 w-full bg-paper font-extrabold" onPointerDown={focusField}>
            Tap to type the answer
          </button>
          <AnswerField inputRef={inputRef} value={value} onChange={onChange} className="sr-only" />
        </>
      )}
      <button type="submit" className="chunky min-h-12 bg-pick font-extrabold">
        Go
      </button>
    </form>
  );
}

function AnswerField({
  inputRef,
  value,
  onChange,
  className,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  className: string;
}) {
  return (
    <>
      <label className="sr-only" htmlFor="country-answer">
        Country name
      </label>
      <input
        ref={inputRef}
        id="country-answer"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="done"
        className={className}
        aria-label="Country name"
      />
    </>
  );
}
