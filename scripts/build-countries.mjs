import { writeFileSync } from "node:fs";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-50m.json" with { type: "json" };
import worldCountries from "world-countries";

const EXTRA_ALIASES = {
  TR: ["Turkey"],
  CZ: ["Czech Republic"],
  GB: ["Britain"],
  US: ["America"],
  NL: ["Holland"],
  KR: ["Korea"],
  KP: ["North Korea"],
  CD: ["DRC", "DR Congo", "Democratic Republic of the Congo", "Democratic Republic of Congo"],
  CG: ["Congo", "Republic of the Congo"],
  MK: ["Macedonia"],
  SZ: ["Swaziland"],
  TL: ["East Timor"],
  MM: ["Burma"],
  CV: ["Cabo Verde"],
  AE: ["UAE", "Emirates"],
  VN: ["Viet Nam"],
  LA: ["Laos"],
  BO: ["Bolivia"],
  IR: ["Iran"],
  SY: ["Syria"],
  TZ: ["Tanzania"],
  MD: ["Moldova"],
  VA: ["Vatican", "The Vatican"],
  RU: ["Russia"],
  FM: ["Micronesia"],
};

const DISPLAY_NAMES = {
  TR: "Turkey",
};

const EXTRA_BOARDS = {
  RU: ["asia"],
  TR: ["europe"],
};

const PLACE_NOTES = {
  Greenland: "Greenland is part of Denmark.",
  "Hong Kong": "Hong Kong is part of China.",
  Macao: "Macao is part of China.",
  "Puerto Rico": "Puerto Rico is part of the United States.",
  "W. Sahara": "Western Sahara is not one of the countries in this game.",
  Kosovo: "Kosovo is one of the countries you can name.",
  Somaliland: "Somaliland is not one of the countries in this game.",
  "N. Cyprus": "This place is not one of the countries in this game.",
  "Indian Ocean Ter.": "This place is not one of the countries in this game.",
  "Siachen Glacier": "This place is not one of the countries in this game.",
};

function primaryBoard(country) {
  if (country.cca2 === "AQ") return "world";
  if (country.region === "Africa") return "africa";
  if (country.region === "Europe") return "europe";
  if (country.region === "Asia") return "asia";
  if (country.region === "Oceania") return "oceania";
  if (country.region === "Americas") {
    return country.subregion === "South America" ? "south-america" : "north-america";
  }
  return "world";
}

function latinAlias(value) {
  if (!value || /[^\u0000-\u024F\s'’.\-]/u.test(value)) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 48) return null;
  return cleaned;
}

const geometries = feature(atlas, atlas.objects.countries).features;
const byNumeric = new Map();
for (const geometry of geometries) {
  if (geometry.id == null) continue;
  const key = String(Number(geometry.id));
  const list = byNumeric.get(key) ?? [];
  list.push(geometry);
  byNumeric.set(key, list);
}
const byNeName = new Map(geometries.map((geometry) => [geometry.properties?.name, geometry]));

const playable = [];
for (const country of worldCountries) {
  const include =
    country.unMember ||
    country.cca2 === "TW" ||
    country.cca2 === "VA" ||
    country.cca2 === "PS" ||
    country.cca2 === "AQ";
  if (!include) continue;
  const numeric = country.ccn3 ? String(Number(country.ccn3)) : null;
  const neName =
    (numeric && byNumeric.get(numeric)?.[0]?.properties?.name) ||
    (country.cca2 === "XK" ? "Kosovo" : null);
  const hasShape = (numeric && byNumeric.has(numeric)) || (neName && byNeName.has(neName));
  if (!hasShape) {
    console.log("skip, no shape", country.cca2, country.name.common);
    continue;
  }
  const primary = primaryBoard(country);
  const boards = [...new Set([primary, ...(EXTRA_BOARDS[country.cca2] ?? [])])];
  playable.push({
    iso2: country.cca2,
    numeric,
    neName,
    name: DISPLAY_NAMES[country.cca2] ?? country.name.common,
    aliases: [country.name.common, ...(country.altSpellings ?? []), ...(EXTRA_ALIASES[country.cca2] ?? [])],
    primary,
    boards,
    bonus: country.cca2 === "AQ",
    area: country.area ?? 0,
    small: (country.area ?? 0) > 0 && country.area < 6000,
  });
}

if (!playable.some((country) => country.iso2 === "XK") && byNeName.has("Kosovo")) {
  playable.push({
    iso2: "XK",
    numeric: null,
    neName: "Kosovo",
    name: "Kosovo",
    aliases: ["Kosovo", "Republic of Kosovo"],
    primary: "europe",
    boards: ["europe"],
    bonus: false,
    area: 10887,
    small: false,
  });
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const owners = new Map();
for (const country of playable) {
  const forms = new Set([normalize(country.name)]);
  for (const alias of country.aliases) {
    const cleaned = latinAlias(alias);
    if (!cleaned) continue;
    const form = normalize(cleaned);
    if (form.length < 2) continue;
    forms.add(form);
  }
  const keepShort = new Set(["uk", "us", "usa", "uae", "drc"]);
  country.aliases = [...forms].filter((form) => {
    if (form === normalize(country.name)) return false;
    if (form.length <= 2 && !keepShort.has(form)) return false;
    return true;
  });
  for (const form of [normalize(country.name), ...country.aliases]) {
    const list = owners.get(form) ?? [];
    list.push(country.iso2);
    owners.set(form, list);
  }
}

for (const [form, isos] of owners) {
  if (new Set(isos).size < 2) continue;
  for (const country of playable) {
    if (normalize(country.name) === form) continue;
    country.aliases = country.aliases.filter((alias) => alias !== form);
  }
  console.log("dropped shared alias", form, [...new Set(isos)].join(","));
}

const claimed = new Set(playable.map((country) => country.numeric).filter(Boolean));
const places = [];
for (const geometry of geometries) {
  const neName = geometry.properties?.name ?? "Unknown place";
  const numeric = geometry.id == null ? null : String(Number(geometry.id));
  if (numeric && claimed.has(numeric)) continue;
  if (playable.some((country) => country.neName === neName && country.numeric == null)) continue;
  places.push({
    numeric,
    neName,
    note: PLACE_NOTES[neName] ?? "This place is not one of the countries in this game.",
  });
}

const payload = {
  countries: playable.sort((a, b) => a.name.localeCompare(b.name)),
  places,
};

writeFileSync("data/world.json", JSON.stringify(payload));
const small = playable.filter((country) => country.small).map((country) => country.name);
console.log("countries", playable.length, "places", places.length);
console.log("small", small.join(", "));
