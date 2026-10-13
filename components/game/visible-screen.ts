import { useEffect, useRef, type RefObject } from "react";

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

/**
 * Size a fixed game screen to the visible area above the phone keyboard.
 * Android otherwise scrolls the focused field up and pushes the flag off screen.
 */
export function useVisibleScreen(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onFit?: () => void,
) {
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  useEffect(() => {
    const el = ref.current;
    const viewport = window.visualViewport;
    if (!active || !el || !viewport) return;

    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.height = `${viewport.height}px`;
        el.style.transform = viewport.offsetTop ? `translateY(${viewport.offsetTop}px)` : "";
        el.dataset.tight = viewport.height < 640 ? "true" : "false";
        onFitRef.current?.();
      });
    };

    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      el.style.height = "";
      el.style.transform = "";
      delete el.dataset.tight;
      html.style.overflow = previousOverflow;
    };
  }, [active, ref]);
}
