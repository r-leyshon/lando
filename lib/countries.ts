import world from "@/data/world.json";

export type BoardId =
  | "africa"
  | "europe"
  | "asia"
  | "north-america"
  | "south-america"
  | "oceania"
  | "world";

export type Country = {
  iso2: string;
  numeric: string | null;
  neName: string | null;
  name: string;
  aliases: string[];
  primary: BoardId;
  boards: BoardId[];
  bonus: boolean;
  area: number;
  small: boolean;
};

export type Place = {
  numeric: string | null;
  neName: string;
  note: string;
};

export const countries = world.countries as Country[];
export const places = world.places as Place[];

export const countryByIso = new Map(countries.map((country) => [country.iso2, country]));

export const quizCountries = countries.filter((country) => !country.bonus);

export function countryNames(iso: string) {
  return countryByIso.get(iso)?.name ?? "that country";
}
