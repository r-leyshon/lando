import { quizCountries, type BoardId } from "@/lib/countries";

export type { BoardId };

export const CONTINENTS = [
  "africa",
  "europe",
  "asia",
  "north-america",
  "south-america",
  "oceania",
] as const satisfies readonly BoardId[];

export type ContinentId = (typeof CONTINENTS)[number];

export const PLAY_BOARDS = [...CONTINENTS, "world"] as const satisfies readonly BoardId[];

export const MODES = ["name", "where", "silhouette", "flag", "capital", "practice"] as const;
export type GameMode = (typeof MODES)[number];

/** The games that fill a country in the dex. Practice does not count. */
export const DEX_MODES = ["name", "where", "silhouette", "flag", "capital"] as const;
export type DexMode = (typeof DEX_MODES)[number];

export const DEX_LABELS: Record<DexMode, string> = {
  name: "Name",
  where: "Where",
  silhouette: "Shape",
  flag: "Flag",
  capital: "Capital",
};

export const BOARD_LABELS: Record<BoardId | "tricky", string> = {
  africa: "Africa",
  europe: "Europe",
  asia: "Asia",
  "north-america": "North America",
  "south-america": "South America",
  oceania: "Oceania",
  world: "Whole world",
  tricky: "Tricky ones",
};

export const BOARD_COLORS: Record<BoardId, string> = {
  africa: "#e6c15a",
  europe: "#8fbf7a",
  asia: "#f0a07a",
  "north-america": "#7eb6e6",
  "south-america": "#e09ac4",
  oceania: "#7dceb0",
  world: "#f4d48a",
};

export const MODE_LABELS: Record<GameMode, string> = {
  name: "Name the country",
  where: "Where is…",
  silhouette: "Name the shape",
  flag: "Guess the flag",
  capital: "Name the capital",
  practice: "Tricky ones",
};

type Box = { west: number; east: number; south: number; north: number };

export const BOARD_BOXES: Record<ContinentId, Box[]> = {
  africa: [{ west: -26, east: 64, south: -36, north: 38 }],
  europe: [{ west: -28, east: 45, south: 34, north: 72 }],
  asia: [
    { west: 33, east: 180, south: -12, north: 78 },
    { west: -180, east: -168, south: 50, north: 72 },
  ],
  "north-america": [{ west: -170, east: -52, south: 6, north: 84 }],
  "south-america": [{ west: -82, east: -34, south: -56, north: 13 }],
  oceania: [
    { west: 110, east: 180, south: -50, north: 6 },
    { west: -180, east: -170, south: -50, north: 6 },
  ],
};

export const CONTINENT_ZOOM: Record<ContinentId, number> = {
  africa: 1.65,
  europe: 2.15,
  asia: 1.35,
  "north-america": 1.5,
  "south-america": 1.8,
  oceania: 1.9,
};

export function continentRoster(id: ContinentId) {
  return quizCountries.filter((country) => country.primary === id);
}

export const BOARD_VIEWS: Record<BoardId, { center: [number, number]; scale: number }> = {
  world: { center: [12, 8], scale: 155 },
  africa: { center: [18, 2], scale: 400 },
  europe: { center: [14, 54], scale: 680 },
  asia: { center: [90, 30], scale: 340 },
  "north-america": { center: [-100, 48], scale: 340 },
  "south-america": { center: [-61, -18], scale: 400 },
  oceania: { center: [155, -22], scale: 460 },
};

export function isContinent(value: string): value is ContinentId {
  return (CONTINENTS as readonly string[]).includes(value);
}

export function isPlayBoard(value: string): value is BoardId {
  return (PLAY_BOARDS as readonly string[]).includes(value);
}

export function isMode(value: string): value is GameMode {
  return (MODES as readonly string[]).includes(value);
}

export function isDexMode(value: string): value is DexMode {
  return (DEX_MODES as readonly string[]).includes(value);
}

export function streakKey(mode: GameMode, board: string) {
  return `${mode}:${board}`;
}
