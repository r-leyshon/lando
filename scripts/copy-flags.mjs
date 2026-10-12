import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/flag-icons/flags/4x3");
const target = join(root, "public/flags");
const world = JSON.parse(readFileSync(join(root, "data/world.json"), "utf8"));
const wanted = [...new Set(world.countries.map((country) => country.iso2.toLowerCase()))].sort();
const available = new Set(readdirSync(source).map((name) => name.replace(/\.svg$/, "")));

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const missing = [];
for (const iso of wanted) {
  if (!available.has(iso)) {
    missing.push(iso);
    continue;
  }
  const svg = readFileSync(join(source, `${iso}.svg`), "utf8").replace(/<svg\b([^>]*)>/, (match, attrs) => {
    if (/\swidth=/.test(attrs)) return match;
    return `<svg width="640" height="480"${attrs}>`;
  });
  writeFileSync(join(target, `${iso}.svg`), svg);
}

console.log("flags", wanted.length - missing.length);
if (missing.length > 0) console.log("missing", missing.join(", "));
