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
 * Keep the page from sliding when the phone keyboard opens.
 * The keyboard draws on top. The map and Lando's tab stay where they are.
 */
export function usePinnedScreen(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyInset: body.style.inset,
      bodyWidth: body.style.width,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.inset = "0";
    body.style.width = "100%";
    const keyboard = virtualKeyboard();
    if (keyboard) keyboard.overlaysContent = true;

    const pin = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener("scroll", pin);
    viewport?.addEventListener("resize", pin);
    window.addEventListener("scroll", pin);
    return () => {
      viewport?.removeEventListener("scroll", pin);
      viewport?.removeEventListener("resize", pin);
      window.removeEventListener("scroll", pin);
      if (keyboard) keyboard.overlaysContent = false;
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.inset = previous.bodyInset;
      body.style.width = previous.bodyWidth;
    };
  }, [active]);
}

/** Pixels the phone keyboard covers. Zero on a desktop, where the viewport does not shrink. */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const read = () => {
      const next = viewport
        ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
        : 0;
      setInset((current) => (current === next ? current : next));
    };
    read();
    viewport?.addEventListener("resize", read);
    viewport?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    return () => {
      viewport?.removeEventListener("resize", read);
      viewport?.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [active]);
  return inset;
}

/** How tall Lando's panel may be: a short tab, or tall enough to leave some of the picture. */
export function sheetLimits(stageHeight: number) {
  const room = Math.max(0, stageHeight);
  const min = Math.min(156, Math.max(88, room));
  const peek = Math.max(136, Math.round(room * 0.28));
  const max = Math.max(min, room - peek);
  return { min, max: Math.min(max, room) };
}
