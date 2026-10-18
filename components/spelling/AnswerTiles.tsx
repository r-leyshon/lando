"use client";

import type { PointerEvent, RefObject } from "react";
import { draftTiles, type LetterTile } from "@/lib/spelling";

export function LetterRow({ tiles, compact = false }: { tiles: LetterTile[]; compact?: boolean }) {
  const box = compact ? "h-8 min-w-8 rounded-lg border-2 text-lg shadow-[2px_2px_0_#2a241b]" : "h-12 min-w-11 rounded-[10px] border-[3px] text-2xl shadow-[3px_3px_0_#2a241b]";
  return (
    <div className={`flex flex-wrap items-center justify-center ${compact ? "gap-1" : "gap-2"}`} aria-hidden>
      {tiles.map((tile, index) =>
        tile.tone === "gap" ? (
          <span key={index} className={compact ? "w-2" : "w-3"} />
        ) : (
          <span
            key={index}
            className={`grid place-items-center border-ink font-extrabold uppercase transition-colors duration-200 ${box} ${
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
        </div>
      ) : (
        <button type="button" className="chunky min-h-12 w-full bg-paper font-extrabold" onPointerDown={focusField}>
          Tap to type the answer
        </button>
      )}
      <button type="submit" className="chunky min-h-12 bg-pick font-extrabold">
        Go
      </button>
    </form>
  );
}

export function AnswerField({
  inputRef,
  value,
  onChange,
  className,
  onFocus,
  onBlur,
  onEnter,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  className: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: () => void;
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
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !onEnter) return;
          event.preventDefault();
          onEnter();
        }}
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
