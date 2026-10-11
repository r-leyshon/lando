export type LandoMood = "idle" | "wave" | "think" | "celebrate" | "oops";

export const LANDO_FRAME_WIDTH = 295;
export const LANDO_FRAME_HEIGHT = 276;

export const LANDO_ANIMATIONS: Record<
  LandoMood,
  { sheet: string; row: number; frames: number; label: string }
> = {
  idle: { sheet: "idle_sheet", row: 0, frames: 7, label: "Idle" },
  wave: { sheet: "idle_sheet", row: 1, frames: 6, label: "Wave" },
  think: { sheet: "think_sheet", row: 1, frames: 6, label: "Think" },
  celebrate: { sheet: "celebrate_sheet", row: 0, frames: 7, label: "Celebrate" },
  oops: { sheet: "oops_sheet", row: 1, frames: 6, label: "Oops" },
};

function frames(sheet: string, row: number, count: number) {
  return Array.from(
    { length: count },
    (_, index) => `/sprites/lando/${sheet}/r${row}_${String(index).padStart(2, "0")}.png`,
  );
}

export const LANDO_FRAMES: Record<LandoMood, string[]> = {
  idle: frames(LANDO_ANIMATIONS.idle.sheet, LANDO_ANIMATIONS.idle.row, LANDO_ANIMATIONS.idle.frames),
  wave: frames(LANDO_ANIMATIONS.wave.sheet, LANDO_ANIMATIONS.wave.row, LANDO_ANIMATIONS.wave.frames),
  think: frames(LANDO_ANIMATIONS.think.sheet, LANDO_ANIMATIONS.think.row, LANDO_ANIMATIONS.think.frames),
  celebrate: frames(
    LANDO_ANIMATIONS.celebrate.sheet,
    LANDO_ANIMATIONS.celebrate.row,
    LANDO_ANIMATIONS.celebrate.frames,
  ),
  oops: frames(LANDO_ANIMATIONS.oops.sheet, LANDO_ANIMATIONS.oops.row, LANDO_ANIMATIONS.oops.frames),
};
