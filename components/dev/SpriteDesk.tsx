"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LANDO_FRAME_HEIGHT, LANDO_FRAME_WIDTH } from "@/lib/sprites";

const SHEETS = ["idle_sheet", "think_sheet", "celebrate_sheet", "oops_sheet"] as const;
const BRAND = ["#080018", "#2a241b", "#79c3de", "#fff6e4", "#f4d48a", "#f08a3c", "#6fbf73", "#e15b4c", "#ffffff"];

type Tool = "paint" | "erase" | "pick";
type Place = { sheet: string; row: number; frame: number };
type Animation = { id: string; label: string; sheet: string; row: number; frames: number; fps: number };
type Inventory = { sheets: Record<string, Record<string, number[]>>; animations: Animation[] };
type Snapshot = { width: number; height: number; data: Uint8ClampedArray };

function startingPlace(sheet?: string, row?: string, frame?: string): Place {
  const safeSheet = (SHEETS as readonly string[]).includes(sheet ?? "") ? sheet! : "idle_sheet";
  const safeRow = Number(row);
  const safeFrame = Number(frame);
  return {
    sheet: safeSheet,
    row: Number.isInteger(safeRow) && safeRow >= 0 && safeRow <= 9 ? safeRow : 0,
    frame: Number.isInteger(safeFrame) && safeFrame >= 0 && safeFrame <= 98 ? safeFrame : 0,
  };
}

function frameSrc(sheet: string, row: number, index: number, revision: number) {
  const file = `r${row}_${String(index).padStart(2, "0")}.png`;
  return `/sprites/lando/${sheet}/${file}?v=${revision}`;
}

function hexToRgb(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return [0, 0, 0] as const;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function commonColours(pixels: ImageData) {
  const counts = new Map<string, number>();
  const data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 200) continue;
    const colour = rgbToHex(data[index], data[index + 1], data[index + 2]);
    counts.set(colour, (counts.get(colour) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 16)
    .map(([colour]) => colour);
}

function plotLine(
  from: { x: number; y: number },
  to: { x: number; y: number },
  draw: (x: number, y: number) => void,
) {
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  for (;;) {
    draw(x, y);
    if (x === to.x && y === to.y) break;
    const doubled = 2 * error;
    if (doubled > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubled < dx) {
      error += dx;
      y += stepY;
    }
  }
}

async function canvasToBase64(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not read those pixels.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read those pixels."));
    reader.readAsDataURL(blob);
  });
  const encoded = dataUrl.split(",")[1];
  if (!encoded) throw new Error("Could not read those pixels.");
  return encoded;
}

export function SpriteDesk({ sheet, row, frame }: { sheet?: string; row?: string; frame?: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pixelsRef = useRef<ImageData | null>(null);
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const strokeRef = useRef<{ x: number; y: number } | null>(null);
  const toolRef = useRef<Tool>("paint");
  const colourRef = useRef("#e15b4c");
  const placeRef = useRef<Place>(startingPlace(sheet, row, frame));
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const undoActionRef = useRef<() => void>(() => {});
  const redoActionRef = useRef<() => void>(() => {});

  const [place, setPlace] = useState<Place>(() => startingPlace(sheet, row, frame));
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [tool, setTool] = useState<Tool>("paint");
  const [colour, setColour] = useState("#e15b4c");
  const [hex, setHex] = useState("#e15b4c");
  const [swatches, setSwatches] = useState<string[]>(BRAND);
  const [zoom, setZoom] = useState(4);
  const [grid, setGrid] = useState(true);
  const [onion, setOnion] = useState(false);
  const [seeThrough, setSeeThrough] = useState(0.72);
  const [compare, setCompare] = useState<"previous" | number>("previous");
  const [underlaySize, setUnderlaySize] = useState<{ width: number; height: number } | null>(null);
  const [size, setSize] = useState({ width: LANDO_FRAME_WIDTH, height: LANDO_FRAME_HEIGHT });
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<Place | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Open a frame and paint on the pixels.");
  const [revision, setRevision] = useState(() => Date.now());
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const readoutRef = useRef<HTMLSpanElement>(null);
  const dirtyRef = useRef(dirty);
  const indicesRef = useRef<number[]>([]);

  placeRef.current = place;
  dirtyRef.current = dirty;
  toolRef.current = tool;
  colourRef.current = colour;

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dev/sprites");
    const payload = (await response.json().catch(() => null)) as (Inventory & { error?: string }) | null;
    if (!response.ok || !payload?.sheets) {
      throw new Error(payload?.error ?? "Could not open the sprite files.");
    }
    setInventory(payload);
    return payload;
  }, []);

  useEffect(() => {
    let cancel = false;
    refresh().catch((error: unknown) => {
      if (!cancel) setStatus(error instanceof Error ? error.message : "Could not open the sprite files.");
    });
    return () => {
      cancel = true;
    };
  }, [refresh]);

  const indices = inventory?.sheets[place.sheet]?.[String(place.row)] ?? [];
  indicesRef.current = indices;
  const animation = inventory?.animations.find((item) => item.sheet === place.sheet && item.row === place.row) ?? null;
  const underlayIndex = !onion
    ? null
    : compare === "previous"
      ? indices[indices.indexOf(place.frame) - 1]
      : compare === place.frame
        ? null
        : compare;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancel = false;
    const image = new Image();
    image.onload = () => {
      if (cancel) return;
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      pixelsRef.current = pixels;
      undoRef.current = [];
      redoRef.current = [];
      setHistory({ undo: 0, redo: 0 });
      setSize({ width: pixels.width, height: pixels.height });
      setSwatches([...new Set([...commonColours(pixels), ...BRAND])]);
      setDirty(false);
      setPending(null);
    };
    image.onerror = () => {
      if (!cancel) setStatus("That frame would not open.");
    };
    image.src = frameSrc(place.sheet, place.row, place.frame, revision);
    return () => {
      cancel = true;
    };
  }, [place.sheet, place.row, place.frame, revision]);

  function rememberHistory() {
    setHistory({ undo: undoRef.current.length, redo: redoRef.current.length });
  }

  function snapshot(): Snapshot | null {
    const pixels = pixelsRef.current;
    if (!pixels) return null;
    return { width: pixels.width, height: pixels.height, data: new Uint8ClampedArray(pixels.data) };
  }

  function applySnapshot(shot: Snapshot) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = shot.width;
    canvas.height = shot.height;
    const pixels = new ImageData(new Uint8ClampedArray(shot.data), shot.width, shot.height);
    pixelsRef.current = pixels;
    canvas.getContext("2d")?.putImageData(pixels, 0, 0);
    setSize({ width: shot.width, height: shot.height });
    setDirty(true);
  }

  function undo() {
    const shot = undoRef.current.pop();
    const current = snapshot();
    if (!shot || !current) return;
    redoRef.current.push(current);
    applySnapshot(shot);
    rememberHistory();
  }

  function redo() {
    const shot = redoRef.current.pop();
    const current = snapshot();
    if (!shot || !current) return;
    undoRef.current.push(current);
    applySnapshot(shot);
    rememberHistory();
  }

  undoActionRef.current = undo;
  redoActionRef.current = redo;

  function move(next: Place) {
    setPlaying(false);
    setPlace(next);
    const params = new URLSearchParams({ sheet: next.sheet, row: String(next.row), frame: String(next.frame) });
    router.replace(`/dev/sprites?${params.toString()}`, { scroll: false });
  }

  function choose(next: Place) {
    if (next.sheet === place.sheet && next.row === place.row && next.frame === place.frame) return;
    if (dirty) {
      setPending(next);
      setStatus("Save these pixels, or throw them away, before moving.");
      return;
    }
    move(next);
  }

  function locate(event: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * event.currentTarget.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * event.currentTarget.height);
    if (x < 0 || y < 0 || x >= event.currentTarget.width || y >= event.currentTarget.height) return null;
    return { x, y };
  }

  function paintPixel(x: number, y: number) {
    const pixels = pixelsRef.current;
    if (!pixels || x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return;
    const offset = (y * pixels.width + x) * 4;
    if (toolRef.current === "erase") {
      pixels.data.fill(0, offset, offset + 4);
      return;
    }
    const [red, green, blue] = hexToRgb(colourRef.current);
    pixels.data[offset] = red;
    pixels.data[offset + 1] = green;
    pixels.data[offset + 2] = blue;
    pixels.data[offset + 3] = 255;
  }

  function flush() {
    const canvas = canvasRef.current;
    const pixels = pixelsRef.current;
    if (!canvas || !pixels) return;
    canvas.getContext("2d")?.putImageData(pixels, 0, 0);
  }

  function pickColour(point: { x: number; y: number }) {
    const pixels = pixelsRef.current;
    if (!pixels) return;
    const offset = (point.y * pixels.width + point.x) * 4;
    if (pixels.data[offset + 3] < 200) {
      setTool("erase");
      setStatus("That pixel is empty, so the rubber is selected.");
      return;
    }
    const next = rgbToHex(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]);
    setColour(next);
    setHex(next);
    setTool("paint");
  }

  function showReadout(point: { x: number; y: number } | null) {
    if (!readoutRef.current) return;
    readoutRef.current.textContent = point ? `${point.x}, ${point.y}` : "—, —";
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button === 2) return;
    setPlaying(false);
    const point = locate(event);
    showReadout(point);
    if (!point) return;
    if (toolRef.current === "pick" || event.altKey) {
      pickColour(point);
      return;
    }
    const shot = snapshot();
    if (shot) {
      undoRef.current.push(shot);
      if (undoRef.current.length > 40) undoRef.current.shift();
      redoRef.current = [];
      rememberHistory();
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    strokeRef.current = point;
    paintPixel(point.x, point.y);
    flush();
    setDirty(true);
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = locate(event);
    showReadout(point);
    const previous = strokeRef.current;
    if (!previous || !point || toolRef.current === "pick") return;
    plotLine(previous, point, paintPixel);
    strokeRef.current = point;
    flush();
  }

  function pointerUp() {
    strokeRef.current = null;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/dev/sprites", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sheet: place.sheet,
          row: place.row,
          index: place.frame,
          pngBase64: await canvasToBase64(canvas),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not save those pixels.");
      setDirty(false);
      setRevision(Date.now());
      setStatus("Saved into the sprite file.");
      if (pending) {
        const next = pending;
        setPending(null);
        move(next);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save those pixels.");
    } finally {
      setBusy(false);
    }
  }

  saveRef.current = save;

  async function insert(kind: "copy" | "blank") {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    if (dirty) {
      setStatus("Save this frame before inserting another.");
      return;
    }
    setBusy(true);
    setPlaying(false);
    try {
      const source = document.createElement("canvas");
      source.width = canvas.width;
      source.height = canvas.height;
      if (kind === "copy") source.getContext("2d")?.drawImage(canvas, 0, 0);
      const response = await fetch("/api/dev/sprites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "insert",
          sheet: place.sheet,
          row: place.row,
          index: place.frame + 1,
          pngBase64: await canvasToBase64(source),
        }),
      });
      const payload = (await response.json().catch(() => null)) as (Inventory & { error?: string }) | null;
      if (!response.ok || !payload?.sheets) throw new Error(payload?.error ?? "Could not insert that frame.");
      setInventory(payload);
      setRevision(Date.now());
      move({ ...place, frame: place.frame + 1 });
      setStatus(kind === "copy" ? "Inserted a copy of this frame." : "Inserted a blank frame.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not insert that frame.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (dirty) {
      setStatus("Save or throw away these pixels before removing the frame.");
      return;
    }
    if (!window.confirm("Remove this frame? The frames after it will shuffle down.")) return;
    setBusy(true);
    setPlaying(false);
    try {
      const response = await fetch("/api/dev/sprites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", sheet: place.sheet, row: place.row, index: place.frame }),
      });
      const payload = (await response.json().catch(() => null)) as (Inventory & { error?: string }) | null;
      if (!response.ok || !payload?.sheets) throw new Error(payload?.error ?? "Could not remove that frame.");
      setInventory(payload);
      setRevision(Date.now());
      const nextIndices = payload.sheets[place.sheet]?.[String(place.row)] ?? [];
      const nextFrame = nextIndices[Math.min(place.frame, nextIndices.length - 1)] ?? 0;
      move({ ...place, frame: nextFrame });
      setStatus("Removed that frame.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove that frame.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!playing || !animation) return;
    const delay = Math.max(80, Math.round(1000 / animation.fps));
    const timer = window.setInterval(() => {
      setPlace((current) => ({ ...current, frame: (current.frame + 1) % animation.frames }));
    }, delay);
    return () => window.clearInterval(timer);
  }, [playing, animation]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === "s") {
          event.preventDefault();
          void saveRef.current();
        } else if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) redoActionRef.current();
          else undoActionRef.current();
        }
        return;
      }
      if (event.key.toLowerCase() === "b") setTool("paint");
      if (event.key.toLowerCase() === "e") setTool("erase");
      if (event.key.toLowerCase() === "i") setTool("pick");
      if (event.key === "[") setZoom((current) => Math.max(2, current - 1));
      if (event.key === "]") setZoom((current) => Math.min(10, current + 1));
      const current = placeRef.current;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const list = indicesRef.current;
      const position = list.indexOf(current.frame);
      const nextPosition = event.key === "ArrowLeft" ? position - 1 : position + 1;
      if (position < 0 || nextPosition < 0 || nextPosition >= list.length) return;
      const next = { ...current, frame: list[nextPosition] };
      if (dirtyRef.current) {
        setPending(next);
        setStatus("Save these pixels, or throw them away, before moving.");
        return;
      }
      setPlaying(false);
      setPlace(next);
      const params = new URLSearchParams({
        sheet: next.sheet,
        row: String(next.row),
        frame: String(next.frame),
      });
      router.replace(`/dev/sprites?${params.toString()}`, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  function applyHex(value: string) {
    const next = value.startsWith("#") ? value : `#${value}`;
    if (/^#[0-9a-fA-F]{6}$/.test(next)) {
      setColour(next.toLowerCase());
      setHex(next.toLowerCase());
      setTool("paint");
    } else {
      setHex(colour);
    }
  }

  const displayWidth = size.width * zoom;
  const displayHeight = size.height * zoom;
  const stageWidth = Math.max(displayWidth, (underlaySize?.width ?? 0) * zoom);
  const stageHeight = Math.max(displayHeight, (underlaySize?.height ?? 0) * zoom);
  const oddSize = size.width !== LANDO_FRAME_WIDTH || size.height !== LANDO_FRAME_HEIGHT;

  return (
    <main className="min-h-dvh bg-sea text-ink">
      <div className="mx-auto grid max-w-[1500px] gap-4 px-4 py-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="grid content-start gap-3">
          <div>
            <Link href="/" className="font-extrabold underline">
              Back to Lando
            </Link>
            <h1 className="mt-2 font-pixel text-sm">Sprite desk</h1>
            <p className="mt-2 text-sm font-bold">This page only changes sprites on your computer.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inventory?.animations.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`min-h-11 rounded-xl border-[3px] border-ink px-3 font-extrabold ${
                  item.sheet === place.sheet && item.row === place.row ? "bg-pick" : "bg-paper"
                }`}
                onClick={() => choose({ sheet: item.sheet, row: item.row, frame: 0 })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <section>
            <h2 className="text-sm font-extrabold">{animation ? animation.label : "Frames"}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {indices.map((index) => (
                <button
                  key={index}
                  type="button"
                  className={`overflow-hidden rounded-lg border-[3px] ${place.frame === index ? "border-pick" : "border-ink"}`}
                  style={{
                    background: "repeating-conic-gradient(#d5d0c4 0% 25%, #b7b2a6 0% 50%)",
                    backgroundSize: "8px 8px",
                  }}
                  onClick={() => choose({ sheet: place.sheet, row: place.row, frame: index })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={frameSrc(place.sheet, place.row, index, revision)}
                    alt={`${animation?.label ?? "Frame"} ${index + 1}`}
                    className="h-16 w-auto [image-rendering:pixelated]"
                  />
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="grid content-start gap-3">
          <div className="chunky bg-paper p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ToolButton active={tool === "paint"} onClick={() => setTool("paint")}>
                Paint
              </ToolButton>
              <ToolButton active={tool === "erase"} onClick={() => setTool("erase")}>
                Rub out
              </ToolButton>
              <ToolButton active={tool === "pick"} onClick={() => setTool("pick")}>
                Pick colour
              </ToolButton>
              <label className="grid gap-1 text-sm font-extrabold">
                Colour
                <span className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colour}
                    aria-label="Choose a colour"
                    className="h-11 w-14 cursor-pointer border-[3px] border-ink bg-white"
                    onChange={(event) => {
                      setColour(event.target.value);
                      setHex(event.target.value);
                      setTool("paint");
                    }}
                  />
                  <input
                    value={hex}
                    aria-label="Colour hex"
                    className="field h-11 w-28 font-mono"
                    onChange={(event) => setHex(event.target.value)}
                    onBlur={() => applyHex(hex)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") applyHex(hex);
                    }}
                  />
                </span>
              </label>
              <span
                className="inline-block h-11 w-11 border-[3px] border-ink"
                style={{
                  background:
                    tool === "erase"
                      ? "repeating-conic-gradient(#d5d0c4 0% 25%, #b7b2a6 0% 50%) 0 0 / 12px 12px"
                      : colour,
                }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {swatches.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  className={`h-8 w-8 border-[3px] ${colour === swatch && tool === "paint" ? "border-pick" : "border-ink"}`}
                  style={{ background: swatch }}
                  onClick={() => {
                    setColour(swatch);
                    setHex(swatch);
                    setTool("paint");
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex min-h-11 items-center gap-2 font-extrabold">
                <input
                  type="checkbox"
                  checked={onion}
                  onChange={(event) => setOnion(event.target.checked)}
                />
                Lay over another frame
              </label>
              <label className="flex items-center gap-2 font-extrabold">
                Underneath
                <select
                  className="field h-11 w-auto"
                  value={compare === "previous" ? "previous" : String(compare)}
                  disabled={!onion}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCompare(value === "previous" ? "previous" : Number(value));
                    setOnion(true);
                  }}
                >
                  <option value="previous">The frame before</option>
                  {indices
                    .filter((index) => index !== place.frame)
                    .map((index) => (
                      <option key={index} value={index}>
                        Frame {index + 1}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex items-center gap-2 font-extrabold">
                See-through
                <input
                  type="range"
                  min={0.25}
                  max={1}
                  step={0.01}
                  value={onion ? seeThrough : 1}
                  disabled={!onion}
                  onChange={(event) => setSeeThrough(Number(event.target.value))}
                />
              </label>
              <label className="flex min-h-11 items-center gap-2 font-extrabold">
                <input type="checkbox" checked={grid} onChange={(event) => setGrid(event.target.checked)} />
                Grid
              </label>
              <span className="font-extrabold">
                Zoom {zoom}×
                <button type="button" className="ml-2 underline" onClick={() => setZoom((current) => Math.max(2, current - 1))}>
                  Smaller
                </button>
                <button type="button" className="ml-2 underline" onClick={() => setZoom((current) => Math.min(10, current + 1))}>
                  Bigger
                </button>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="chunky min-h-11 bg-stamp px-3 font-extrabold" disabled={!dirty || busy} onClick={() => void save()}>
                Save pixels
              </button>
              <button type="button" className="chunky min-h-11 bg-paper px-3 font-extrabold" disabled={history.undo === 0} onClick={undo}>
                Undo
              </button>
              <button type="button" className="chunky min-h-11 bg-paper px-3 font-extrabold" disabled={history.redo === 0} onClick={redo}>
                Redo
              </button>
              <button
                type="button"
                className="chunky min-h-11 bg-paper px-3 font-extrabold"
                disabled={!animation || dirty}
                onClick={() => setPlaying((current) => !current)}
              >
                {playing ? "Stop" : "Play"}
              </button>
              <button type="button" className="chunky min-h-11 bg-sand px-3 font-extrabold" disabled={busy || dirty} onClick={() => void insert("copy")}>
                Insert a copy
              </button>
              <button type="button" className="chunky min-h-11 bg-sand px-3 font-extrabold" disabled={busy || dirty} onClick={() => void insert("blank")}>
                Insert a blank
              </button>
              <button type="button" className="chunky min-h-11 bg-coral px-3 font-extrabold" disabled={busy || dirty || indices.length < 2} onClick={() => void remove()}>
                Remove frame
              </button>
            </div>
            <p className="mt-3 font-extrabold">
              {animation ? animation.label : "Not used in the game"} · frame {place.frame + 1}
              {animation ? ` of ${animation.frames}` : ""} · r{place.row}_{String(place.frame).padStart(2, "0")}.png ·{" "}
              <span ref={readoutRef}>—, —</span>
            </p>
            <p className="mt-1 font-bold">
              {size.width} × {size.height} pixels.
              {oddSize ? ` The game's shared stage is ${LANDO_FRAME_WIDTH} × ${LANDO_FRAME_HEIGHT}.` : ""}
            </p>
            <p className={`font-bold ${/could not|would not|before|needs|not a|not on|already gone|gap/i.test(status) ? "text-coral" : ""}`}>
              {status}
            </p>
            <p className="mt-1 text-sm font-bold">
              Drag to draw. Right-click or Alt-click picks a colour. Arrows move frames. [ and ] zoom. Command-Z undoes. Command-S saves.
            </p>
          </div>

          {pending ? (
            <div className="chunky bg-sand p-3 font-extrabold">
              This frame has unsaved pixels.
              <span className="ml-3 inline-flex flex-wrap gap-2">
                <button type="button" className="chunky min-h-11 bg-stamp px-3" onClick={() => void save()}>
                  Save and move
                </button>
                <button
                  type="button"
                  className="chunky min-h-11 bg-paper px-3"
                  onClick={() => {
                    const next = pending;
                    setPending(null);
                    setDirty(false);
                    setRevision(Date.now());
                    move(next);
                  }}
                >
                  Throw away
                </button>
                <button type="button" className="chunky min-h-11 bg-paper px-3" onClick={() => setPending(null)}>
                  Keep editing
                </button>
              </span>
            </div>
          ) : null}

          <div className="overflow-auto rounded-[14px] border-[3px] border-ink bg-paper p-3">
            <div
              className="relative"
              style={{
                width: stageWidth,
                height: stageHeight,
                background: "repeating-conic-gradient(#d5d0c4 0% 25%, #b7b2a6 0% 50%)",
                backgroundSize: `${zoom * 2}px ${zoom * 2}px`,
              }}
            >
              {onion && underlayIndex != null ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frameSrc(place.sheet, place.row, underlayIndex, revision)}
                  alt=""
                  className="pointer-events-none absolute top-0 left-0 [image-rendering:pixelated]"
                  style={{
                    width: (underlaySize?.width ?? size.width) * zoom,
                    height: (underlaySize?.height ?? size.height) * zoom,
                  }}
                  onLoad={(event) => {
                    setUnderlaySize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                />
              ) : null}
              <canvas
                ref={canvasRef}
                aria-label="Pixel canvas"
                className="absolute top-0 left-0 touch-none [image-rendering:pixelated]"
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  opacity: onion ? seeThrough : 1,
                  cursor: tool === "pick" ? "crosshair" : "cell",
                }}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const point = locate(event);
                  if (point) pickColour(point);
                }}
              />
              {grid ? (
                <div
                  className="pointer-events-none absolute top-0 left-0"
                  style={{
                    width: displayWidth,
                    height: displayHeight,
                    backgroundImage:
                      "linear-gradient(to right, rgba(42,36,27,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(42,36,27,0.22) 1px, transparent 1px)",
                    backgroundSize: `${zoom}px ${zoom}px`,
                  }}
                />
              ) : null}
            </div>
            {onion && underlaySize && (underlaySize.width !== size.width || underlaySize.height !== size.height) ? (
              <p className="mt-2 font-extrabold text-coral">
                The frame underneath is {underlaySize.width} × {underlaySize.height}, so the pixels do not share a grid.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function ToolButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`min-h-11 rounded-xl border-[3px] border-ink px-3 font-extrabold ${active ? "bg-pick" : "bg-paper"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
