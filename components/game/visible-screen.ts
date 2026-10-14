import { useEffect, useState } from "react";

/** Slide the answer into the bottom sheet without scrolling the page. */
export function revealAnswer(input: HTMLInputElement | null, sheet: HTMLElement | null) {
  if (!input || !sheet || document.activeElement !== input) return;
  const form = input.closest("form") ?? input;
  const sheetBox = sheet.getBoundingClientRect();
  const formBox = form.getBoundingClientRect();
  const gap = 8;
  if (formBox.bottom > sheetBox.bottom - gap) {
    sheet.scrollTop += formBox.bottom - sheetBox.bottom + gap;
  } else if (formBox.top < sheetBox.top + gap) {
    sheet.scrollTop -= sheetBox.top - formBox.top + gap;
  }
}

type VirtualKeyboard = {
  overlaysContent: boolean;
  boundingRect: DOMRect;
  addEventListener(type: "geometrychange", listener: () => void): void;
  removeEventListener(type: "geometrychange", listener: () => void): void;
};

function virtualKeyboard() {
  return (navigator as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;
}

/**
 * How much of the bottom of the screen the keyboard is covering.
 * The game stays full size; the keyboard draws on top.
 */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const keyboard = virtualKeyboard();
    if (keyboard) keyboard.overlaysContent = true;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const viewport = window.visualViewport;
        const fromViewport = viewport ? window.innerHeight - viewport.height - viewport.offsetTop : 0;
        const rect = keyboard?.boundingRect;
        const fromKeyboard = rect && rect.height > 0 ? window.innerHeight - rect.top : 0;
        const next = Math.max(0, fromViewport, fromKeyboard);
        const rounded = next > 72 ? Math.round(next) : 0;
        setInset((current) => (current === rounded ? current : rounded));
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      });
    };

    measure();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    keyboard?.addEventListener("geometrychange", measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", measure);
      viewport?.removeEventListener("scroll", measure);
      keyboard?.removeEventListener("geometrychange", measure);
      window.removeEventListener("resize", measure);
      if (keyboard) keyboard.overlaysContent = false;
      html.style.overflow = previousOverflow;
    };
  }, [active]);

  return inset;
}

/** How tall Lando's panel may be: a short tab, or tall enough to leave some of the picture. */
export function sheetLimits(stageHeight: number, keyboardInset: number) {
  const room = Math.max(0, stageHeight - keyboardInset);
  const min = Math.min(156, Math.max(88, room));
  const peek = Math.max(136, Math.round(room * 0.28));
  const max = Math.max(min, room - peek);
  return { min, max: Math.min(max, room) };
}
