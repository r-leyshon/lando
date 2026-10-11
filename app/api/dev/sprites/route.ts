import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";

const ROOT = path.join(process.cwd(), "public", "sprites", "lando");
const SHEETS = ["idle_sheet", "think_sheet", "celebrate_sheet", "oops_sheet"] as const;
const SPRITES_FILE = path.join(process.cwd(), "lib", "sprites.ts");
const MANIFEST_FILE = path.join(ROOT, "manifest.json");

type SheetName = (typeof SHEETS)[number];

function unavailable() {
  if (process.env.NODE_ENV === "development") return null;
  return Response.json({ error: "The sprite desk only runs on your computer." }, { status: 404 });
}

function isSheet(value: unknown): value is SheetName {
  return typeof value === "string" && (SHEETS as readonly string[]).includes(value);
}

function frameFile(row: number, index: number) {
  if (!Number.isInteger(row) || row < 0 || row > 9) return null;
  if (!Number.isInteger(index) || index < 0 || index > 98) return null;
  return `r${row}_${String(index).padStart(2, "0")}.png`;
}

function pngFromBase64(value: unknown) {
  if (typeof value !== "string" || value.length > 2_000_000) return null;
  const buffer = Buffer.from(value, "base64");
  if (buffer.length < 24 || buffer.length > 1_500_000) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return null;
  return buffer;
}

async function listSheets() {
  const sheets: Record<string, Record<string, number[]>> = {};
  for (const sheet of SHEETS) {
    const files = await readdir(path.join(ROOT, sheet));
    const rows: Record<string, number[]> = {};
    for (const file of files) {
      const match = /^r(\d)_(\d{2})\.png$/.exec(file);
      if (!match) continue;
      const row = match[1];
      rows[row] ??= [];
      rows[row].push(Number(match[2]));
    }
    for (const indices of Object.values(rows)) indices.sort((left, right) => left - right);
    sheets[sheet] = rows;
  }
  return sheets;
}

async function readAnimations() {
  const source = await readFile(SPRITES_FILE, "utf8");
  const manifest = JSON.parse(await readFile(MANIFEST_FILE, "utf8")) as {
    animations?: Record<string, { fps?: number }>;
  };
  const animations: {
    id: string;
    label: string;
    sheet: string;
    row: number;
    frames: number;
    fps: number;
  }[] = [];
  const pattern =
    /(\w+): \{ sheet: "([^"]+)", row: (\d+), frames: (\d+), label: "([^"]+)"\s*\}/g;
  for (const match of source.matchAll(pattern)) {
    const id = match[1];
    animations.push({
      id,
      sheet: match[2],
      row: Number(match[3]),
      frames: Number(match[4]),
      label: match[5],
      fps: manifest.animations?.[id]?.fps ?? 7,
    });
  }
  return animations;
}

async function inventory() {
  const animations = await readAnimations();
  const all = await listSheets();
  const sheets: Record<string, Record<string, number[]>> = {};
  for (const animation of animations) {
    const present = new Set(all[animation.sheet]?.[String(animation.row)] ?? []);
    sheets[animation.sheet] ??= {};
    sheets[animation.sheet][String(animation.row)] = Array.from({ length: animation.frames }, (_, index) => index).filter(
      (index) => present.has(index),
    );
  }
  return { sheets, animations };
}

async function indicesInRow(sheet: SheetName, row: number) {
  const sheets = await listSheets();
  return sheets[sheet]?.[String(row)] ?? [];
}

async function setAnimationLength(sheet: string, row: number, count: number) {
  const source = await readFile(SPRITES_FILE, "utf8");
  const codePattern = new RegExp(`(\\w+: \\{ sheet: "${sheet}", row: ${row}, frames: )\\d+`);
  if (!codePattern.test(source)) return;
  await writeFile(SPRITES_FILE, source.replace(codePattern, `$1${count}`));
  const manifest = await readFile(MANIFEST_FILE, "utf8");
  const manifestPattern = new RegExp(`("sheet": "${sheet}", "row": ${row}, "frames": )\\d+`);
  if (manifestPattern.test(manifest)) {
    await writeFile(MANIFEST_FILE, manifest.replace(manifestPattern, `$1${count}`));
  }
}

export async function GET() {
  await connection();
  const blocked = unavailable();
  if (blocked) return blocked;
  return Response.json(await inventory());
}

export async function PUT(request: Request) {
  await connection();
  const blocked = unavailable();
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as {
    sheet?: unknown;
    row?: unknown;
    index?: unknown;
    pngBase64?: unknown;
  } | null;
  if (!body || !isSheet(body.sheet) || typeof body.row !== "number" || typeof body.index !== "number") {
    return Response.json({ error: "Tell the desk which frame to save." }, { status: 400 });
  }
  const file = frameFile(body.row, body.index);
  const png = pngFromBase64(body.pngBase64);
  if (!file || !png) return Response.json({ error: "Those pixels are not a picture the desk can save." }, { status: 400 });
  const existing = await indicesInRow(body.sheet, body.row);
  if (!existing.includes(body.index)) {
    return Response.json({ error: "That frame is not on the sheet." }, { status: 404 });
  }
  await writeFile(path.join(ROOT, body.sheet, file), png);
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  await connection();
  const blocked = unavailable();
  if (blocked) return blocked;
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    sheet?: unknown;
    row?: unknown;
    index?: unknown;
    pngBase64?: unknown;
  } | null;
  if (!body || !isSheet(body.sheet) || typeof body.row !== "number" || typeof body.index !== "number") {
    return Response.json({ error: "Tell the desk which frame you mean." }, { status: 400 });
  }
  const { sheet, row, index } = body;
  if (body.action === "insert") return insertFrame(sheet, row, index, body.pngBase64);
  if (body.action === "remove") return removeFrame(sheet, row, index);
  return Response.json({ error: "The desk does not know that action." }, { status: 400 });
}

async function insertFrame(sheet: SheetName, row: number, index: number, pngBase64: unknown) {
  const file = frameFile(row, index);
  const png = pngFromBase64(pngBase64);
  if (!file || !png) return Response.json({ error: "The new frame needs a picture." }, { status: 400 });
  const existing = await indicesInRow(sheet, row);
  const last = existing.at(-1) ?? -1;
  if (existing.length > 0 && !existing.every((value, place) => value === place)) {
    return Response.json({ error: "This row has a gap, so a new frame would land in the wrong place." }, { status: 400 });
  }
  if (index < 0 || index > last + 1) {
    return Response.json({ error: "That is not a spot where a frame can go." }, { status: 400 });
  }
  const shifting = existing.filter((value) => value >= index).sort((left, right) => right - left);
  for (const current of shifting) {
    const from = frameFile(row, current);
    const to = frameFile(row, current + 1);
    if (!from || !to) return Response.json({ error: "That row is full." }, { status: 400 });
    await rename(path.join(ROOT, sheet, from), path.join(ROOT, sheet, to));
  }
  await writeFile(path.join(ROOT, sheet, file), png);
  await setAnimationLength(sheet, row, existing.length + 1);
  return Response.json(await inventory());
}

async function removeFrame(sheet: SheetName, row: number, index: number) {
  const existing = await indicesInRow(sheet, row);
  if (!existing.includes(index)) return Response.json({ error: "That frame is already gone." }, { status: 404 });
  if (existing.length < 2) return Response.json({ error: "Leave at least one frame in the row." }, { status: 400 });
  if (!existing.every((value, place) => value === place)) {
    return Response.json({ error: "This row has a gap, so removing a frame would shuffle the wrong pictures." }, { status: 400 });
  }
  const target = frameFile(row, index);
  if (!target) return Response.json({ error: "That frame is not on the sheet." }, { status: 400 });
  await unlink(path.join(ROOT, sheet, target));
  const shifting = existing.filter((value) => value > index).sort((left, right) => left - right);
  for (const current of shifting) {
    const from = frameFile(row, current);
    const to = frameFile(row, current - 1);
    if (!from || !to) return Response.json({ error: "Could not shuffle the later frames." }, { status: 500 });
    await rename(path.join(ROOT, sheet, from), path.join(ROOT, sheet, to));
  }
  await setAnimationLength(sheet, row, existing.length - 1);
  return Response.json(await inventory());
}
