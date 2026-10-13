"use client";

import { useEffect, useState } from "react";
import { LANDO_FRAME_HEIGHT, LANDO_FRAME_WIDTH, LANDO_FRAMES, type LandoMood } from "@/lib/sprites";

export function Lando({ mood, className = "" }: { mood: LandoMood; className?: string }) {
  const frames = LANDO_FRAMES[mood];
  const [index, setIndex] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setIndex(0);
    if (reduce) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, mood === "celebrate" ? 120 : 150);
    return () => window.clearInterval(timer);
  }, [frames, mood, reduce]);

  return (
    <img
      src={frames[reduce ? 0 : index]}
      alt=""
      width={LANDO_FRAME_WIDTH}
      height={LANDO_FRAME_HEIGHT}
      className={`pointer-events-none w-auto object-contain [image-rendering:pixelated] ${className}`}
    />
  );
}

export function Speech({
  children,
  answer,
  note,
  onDismiss,
}: {
  children: string;
  answer?: string | null;
  note?: string | null;
  onDismiss?: () => void;
}) {
  const body = answer ? (
    <>
      <p className="text-sm font-bold">The answer</p>
      <p className="mt-1 rounded-xl bg-sand px-3 py-2 text-2xl leading-tight break-words">{answer}</p>
      {note ? <p className="mt-2 text-sm font-bold">{note}</p> : null}
      {onDismiss ? <p className="mt-2 text-sm font-bold">Tap to carry on.</p> : null}
    </>
  ) : (
    children
  );

  if (onDismiss) {
    return (
      <button
        type="button"
        aria-live="polite"
        onClick={onDismiss}
        className="chunky relative w-full bg-paper px-4 py-3 text-left text-lg leading-snug font-extrabold text-ink"
      >
        {body}
      </button>
    );
  }

  return (
    <div aria-live="polite" className="chunky relative bg-paper px-4 py-3 text-lg leading-snug font-extrabold text-ink">
      {body}
    </div>
  );
}
