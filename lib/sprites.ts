export type LandoMood = "idle" | "wave" | "think" | "celebrate" | "oops";

function frames(sheet: string, row: number, count: number) {
  return Array.from(
    { length: count },
    (_, index) => `/sprites/lando/${sheet}/r${row}_${String(index).padStart(2, "0")}.png`,
  );
}

export const LANDO_FRAMES: Record<LandoMood, string[]> = {
  idle: frames("idle_sheet", 0, 7),
  wave: frames("idle_sheet", 1, 6),
  think: frames("think_sheet", 1, 6),
  celebrate: frames("celebrate_sheet", 0, 7),
  oops: frames("oops_sheet", 1, 6),
};
