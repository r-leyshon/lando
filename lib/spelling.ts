import type { Country } from "@/lib/countries";

export type LetterTile = { ch: string; tone: "yellow" | "green" | "red" | "gap" | "empty" };

function namePieces(value: string) {
  const stripped = value.normalize("NFD").replace(/\p{M}/gu, "").replace(/['’]/g, "");
  const pieces: { ch: string; key: string }[] = [];
  for (const ch of stripped) {
    if (/[a-z0-9]/i.test(ch)) pieces.push({ ch: ch.toUpperCase(), key: ch.toLowerCase() });
    else if (/\s/.test(ch) && pieces.at(-1)?.key !== " ") pieces.push({ ch: " ", key: " " });
  }
  while (pieces[0]?.key === " ") pieces.shift();
  while (pieces.at(-1)?.key === " ") pieces.pop();
  return pieces;
}

export function draftTiles(value: string): LetterTile[] {
  return namePieces(value).map((piece) => ({
    ch: piece.ch,
    tone: piece.key === " " ? "gap" : "yellow",
  }));
}

export function openHint(name: string, used: number, revealed: number[], random = Math.random) {
  const pieces = namePieces(name);
  const letterIndexes = pieces.flatMap((piece, index) => (piece.key === " " ? [] : [index]));
  const next = [...revealed];
  let added = 0;
  if (used > 0) {
    const want = used === 1 ? 1 : 2;
    const pool = letterIndexes.filter((index) => !next.includes(index));
    while (added < want && pool.length > 0) {
      const pick = Math.min(pool.length - 1, Math.floor(random() * pool.length));
      const [index] = pool.splice(pick, 1);
      next.push(index);
      added += 1;
    }
  }
  const shown = new Set(next);
  const tiles: LetterTile[] = pieces.map((piece, index) => {
    if (piece.key === " ") return { ch: " ", tone: "gap" };
    if (shown.has(index)) return { ch: piece.ch, tone: "green" };
    return { ch: "", tone: "empty" };
  });
  return { revealed: next, tiles, letters: letterIndexes.length, added, line: hintLine(used, letterIndexes.length, added) };
}

function hintLine(used: number, letters: number, added: number) {
  if (used <= 0) return `This name has ${letters} ${letters === 1 ? "letter" : "letters"}.`;
  if (used === 1) return "Here is one letter in the right place.";
  if (added <= 1) return "Here is one more letter.";
  return "Here are two more letters.";
}

export function letterTiles(guess: string, target: string, allGreen = false): LetterTile[] {
  const typed = namePieces(guess);
  const answer = namePieces(target);
  return typed.map((piece, index) => {
    if (piece.key === " ") return { ch: " ", tone: "gap" };
    if (allGreen || piece.key === answer[index]?.key) return { ch: piece.ch, tone: "green" };
    return { ch: piece.ch, tone: "red" };
  });
}

function greenCount(guess: string, target: string) {
  const typed = namePieces(guess);
  const answer = namePieces(target);
  let greens = 0;
  for (let index = 0; index < typed.length; index += 1) {
    if (typed[index].key !== " " && typed[index].key === answer[index]?.key) greens += 1;
  }
  return greens;
}

function letterCount(value: string) {
  return namePieces(value).filter((piece) => piece.key !== " ").length;
}

/** The accepted spelling this guess is closest to, so tiles line up with Britain or United Kingdom. */
export function spellingTarget(guess: string, country: Country) {
  const forms = [country.name, ...country.aliases];
  const typedLetters = letterCount(guess);
  let best = country.name;
  let bestGreens = -1;
  let bestGap = Infinity;
  for (const form of forms) {
    const greens = greenCount(guess, form);
    const gap = Math.abs(letterCount(form) - typedLetters);
    if (greens > bestGreens || (greens === bestGreens && gap < bestGap)) {
      best = form;
      bestGreens = greens;
      bestGap = gap;
    }
  }
  return best;
}

export type Judgement =
  | { kind: "correct" }
  | { kind: "hint"; message: string }
  | { kind: "mixup"; message: string; costsTry?: boolean }
  | { kind: "near"; form: string; display: string }
  | { kind: "wrong" };

const KINGDOM_PARTS: Record<string, string> = {
  england: "England is part of the United Kingdom.",
  scotland: "Scotland is part of the United Kingdom.",
  wales: "Wales is part of the United Kingdom.",
  "northern ireland": "Northern Ireland is part of the United Kingdom.",
};

export function normalizeName(value: string) {
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

export function damerauLevenshtein(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

function acceptedForms(country: Country) {
  return [normalizeName(country.name), ...country.aliases.map((alias) => normalizeName(alias))];
}

/** "The" at the start of a long name, and "of the" / "of", are the same answer. */
function articleForms(value: string) {
  const forms = new Set<string>();
  const add = (form: string) => {
    forms.add(form);
    forms.add(form.replaceAll(" of the ", " of "));
  };
  add(value);
  const rest = value.startsWith("the ") ? value.slice(4) : "";
  if (rest.includes(" ")) add(rest);
  return forms;
}

function namesMatch(guess: string, country: Country) {
  const wanted = new Set(acceptedForms(country).flatMap((form) => [...articleForms(form)]));
  for (const form of articleForms(guess)) {
    if (wanted.has(form)) return true;
  }
  return false;
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function nearTargets(country: Country) {
  const official = normalizeName(country.name);
  const targets = [{ form: official, display: country.name }];
  for (const alias of country.aliases) {
    const form = normalizeName(alias);
    if (form === official || form.length < 5 || form.length < official.length - 3) continue;
    targets.push({ form, display: titleCase(form) });
  }
  return targets;
}

export function judgeGuess(raw: string, country: Country, all: Country[]): Judgement {
  const guess = normalizeName(raw);
  if (!guess) return { kind: "wrong" };

  if (namesMatch(guess, country)) return { kind: "correct" };

  if (country.iso2 === "GB" && KINGDOM_PARTS[guess]) {
    return { kind: "mixup", message: KINGDOM_PARTS[guess] };
  }

  const other = all.find((candidate) => candidate.iso2 !== country.iso2 && namesMatch(guess, candidate));
  if (other) {
    return {
      kind: "mixup",
      message: `That's ${other.name}. This country is ${country.name}.`,
    };
  }

  const official = normalizeName(country.name);
  if (guess.length >= 4 && official.startsWith(`${guess} `)) {
    const prefixed = all.filter((candidate) => normalizeName(candidate.name).startsWith(`${guess} `));
    if (prefixed.length > 1) {
      return { kind: "hint", message: "A few countries start like that. Type the whole name." };
    }
    return { kind: "near", form: official, display: country.name };
  }

  let best: { distance: number; form: string; display: string } | null = null;
  for (const target of nearTargets(country)) {
    const distance = damerauLevenshtein(guess, target.form);
    if (!best || distance < best.distance) best = { distance, ...target };
  }
  if (!best) return { kind: "wrong" };

  const limit = best.form.length <= 7 ? 1 : 2;
  const lengthOk = Math.abs(guess.length - best.form.length) <= 1;
  if (!lengthOk || best.distance === 0 || best.distance > limit) return { kind: "wrong" };

  for (const candidate of all) {
    if (candidate.iso2 === country.iso2) continue;
    for (const form of acceptedForms(candidate)) {
      if (damerauLevenshtein(guess, form) <= best.distance) return { kind: "wrong" };
    }
  }

  return { kind: "near", form: best.form, display: best.display };
}

type NamedPlace = { name: string; aliases: string[] };

function placeForms(place: NamedPlace) {
  return [normalizeName(place.name), ...place.aliases.map((alias) => normalizeName(alias))].filter(Boolean);
}

function placeMatch(guess: string, place: NamedPlace) {
  const wanted = new Set(placeForms(place).flatMap((form) => [...articleForms(form)]));
  for (const form of articleForms(guess)) {
    if (wanted.has(form)) return true;
  }
  return false;
}

/** Judge a capital. Typing the country name is a free nudge. Another city's capital costs a try. */
export function judgePlace(
  raw: string,
  place: NamedPlace,
  countryName: string,
  others: { place: NamedPlace; country: string }[],
): Judgement {
  const guess = normalizeName(raw);
  if (!guess) return { kind: "wrong" };
  if (placeMatch(guess, place)) return { kind: "correct" };
  if (placeMatch(guess, { name: countryName, aliases: [] }) && normalizeName(countryName) !== normalizeName(place.name)) {
    return { kind: "mixup", message: "That's the country. Type the city." };
  }
  const other = others.find((item) => placeMatch(guess, item.place));
  if (other) return { kind: "mixup", message: `That's the capital of ${other.country}.`, costsTry: true };

  const targets = [place.name, ...place.aliases].map((name) => ({ form: normalizeName(name), display: name }));
  let best: { distance: number; form: string; display: string } | null = null;
  for (const target of targets) {
    if (!target.form) continue;
    const distance = damerauLevenshtein(guess, target.form);
    if (!best || distance < best.distance) best = { distance, ...target };
  }
  if (!best) return { kind: "wrong" };
  const limit = best.form.length <= 7 ? 1 : 2;
  const lengthOk = Math.abs(guess.length - best.form.length) <= 1;
  if (!lengthOk || best.distance === 0 || best.distance > limit) return { kind: "wrong" };
  for (const item of others) {
    for (const form of placeForms(item.place)) {
      if (damerauLevenshtein(guess, form) <= best.distance) return { kind: "wrong" };
    }
  }
  return { kind: "near", form: best.form, display: place.name };
}
