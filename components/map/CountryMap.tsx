"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { geoCentroid, geoOrthographic, geoPath } from "d3-geo";
import { BOARD_COLORS, BOARD_VIEWS, CONTINENT_ZOOM, type ContinentId } from "@/lib/boards";
import { countryByIso, type BoardId } from "@/lib/countries";
import { globeFeatures, globeSpinFeatures, type PieceProps } from "@/lib/map-model";

type Hit = { iso2: string } | { note: string };
type Point = { x: number; y: number };

const MIN_ZOOM = 1;
const MAX_ZOOM = 3000;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function featureKey(props: PieceProps) {
  return props.iso2 ?? `place:${props.note ?? props.name ?? "land"}`;
}

function globeRadius(size: { w: number; h: number }, zoom: number) {
  return Math.min(size.w, size.h) * 0.46 * zoom;
}

export function CountryMap({
  board,
  focus = null,
  stamped,
  selected,
  reveal,
  colorMode,
  onPick,
}: {
  board: BoardId;
  focus?: ContinentId | null;
  stamped: ReadonlySet<string>;
  selected: string | null;
  reveal: string | null;
  colorMode: "hub" | "play";
  onPick: (hit: Hit) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<SVGGElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const moved = useRef(false);
  const press = useRef<PieceProps | null>(null);
  const origin = useRef<Point | null>(null);
  const gesturing = useRef(false);
  const raf = useRef(0);
  const zoomAnim = useRef(0);
  const focusAnim = useRef(0);
  const wheelTimer = useRef(0);
  const sizeRef = useRef({ w: 360, h: 420 });
  const rotateRef = useRef<[number, number]>([-BOARD_VIEWS[board].center[0], -BOARD_VIEWS[board].center[1]]);
  const zoomRef = useRef(1);
  const dprRef = useRef(1);
  const features = useMemo(() => globeFeatures(board), [board]);
  const spin = useMemo(() => globeSpinFeatures(board), [board]);
  const centers = useMemo(() => features.map((item) => geoCentroid(item) as [number, number]), [features]);
  const spinByKey = useMemo(() => {
    const map = new Map<string, (typeof spin)[number]>();
    for (const item of spin) map.set(featureKey(item.properties), item);
    return map;
  }, [spin]);
  const featuresRef = useRef(features);
  const spinRef = useRef(spin);
  const centersRef = useRef(centers);
  const spinByKeyRef = useRef(spinByKey);
  featuresRef.current = features;
  spinRef.current = spin;
  centersRef.current = centers;
  spinByKeyRef.current = spinByKey;
  const styleRef = useRef({ stamped, selected, reveal, colorMode });
  styleRef.current = { stamped, selected, reveal, colorMode };

  function landColor(props: PieceProps) {
    const style = styleRef.current;
    if (!props.interactive || !props.iso2) return "#e7d7b0";
    if (style.colorMode === "hub") return BOARD_COLORS[countryByIso.get(props.iso2)?.primary ?? "world"];
    if (props.iso2 === style.selected || props.iso2 === style.reveal) return "#f08a3c";
    if (style.stamped.has(props.iso2)) return "#6fbf73";
    return "#f4d48a";
  }

  function projectionNow() {
    const { w, h } = sizeRef.current;
    return geoOrthographic()
      .translate([w / 2, h / 2])
      .rotate(rotateRef.current)
      .scale(globeRadius(sizeRef.current, zoomRef.current))
      .clipAngle(90)
      .precision(gesturing.current ? 1.4 : 0.4);
  }

  function paint() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { w, h } = sizeRef.current;
    const dpr = dprRef.current;
    const projection = projectionNow();
    const path = geoPath(projection, context);
    const mesh = gesturing.current ? spinRef.current : featuresRef.current;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, w, h);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    path({ type: "Sphere" });
    context.fillStyle = "#6eb4d4";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "#2a241b";
    context.stroke();
    for (const feature of mesh) {
      context.beginPath();
      path(feature);
      context.fillStyle = landColor(feature.properties);
      context.fill();
      const hot = feature.properties.iso2 != null && (feature.properties.iso2 === styleRef.current.selected || feature.properties.iso2 === styleRef.current.reveal);
      context.lineWidth = hot ? 1.6 : 0.45;
      context.strokeStyle = "#2a241b";
      context.stroke();
    }
  }

  function syncHits() {
    const nodes = hitsRef.current?.querySelectorAll("path");
    if (!nodes) return;
    const projection = projectionNow();
    const path = geoPath(projection);
    const { w, h } = sizeRef.current;
    const accurate = zoomRef.current >= 4;
    const margin = Math.min(w, h);
    featuresRef.current.forEach((feature, index) => {
      const node = nodes[index];
      if (!node) return;
      if (accurate) {
        const center = centersRef.current[index];
        const point = center && Number.isFinite(center[0]) ? projection(center) : null;
        if (!point || point[0] < -margin || point[1] < -margin || point[0] > w + margin || point[1] > h + margin) {
          node.setAttribute("d", "");
          node.style.display = "none";
          return;
        }
      }
      const standIn = accurate ? undefined : spinByKeyRef.current.get(featureKey(feature.properties));
      const outline = path(standIn ?? feature) ?? "";
      node.setAttribute("d", outline);
      node.style.display = outline ? "" : "none";
    });
  }

  function schedulePaint() {
    if (raf.current) return;
    raf.current = window.requestAnimationFrame(() => {
      raf.current = 0;
      paint();
    });
  }

  function settle() {
    gesturing.current = false;
    window.cancelAnimationFrame(raf.current);
    raf.current = window.requestAnimationFrame(() => {
      raf.current = 0;
      paint();
      syncHits();
    });
  }

  function animateZoom(target: number) {
    window.cancelAnimationFrame(zoomAnim.current);
    window.cancelAnimationFrame(focusAnim.current);
    const from = zoomRef.current;
    const start = performance.now();
    gesturing.current = true;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 220);
      const eased = 1 - (1 - t) ** 3;
      zoomRef.current = clampZoom(from + (target - from) * eased);
      paint();
      if (t < 1) zoomAnim.current = window.requestAnimationFrame(step);
      else settle();
    };
    zoomAnim.current = window.requestAnimationFrame(step);
  }

  useEffect(() => {
    rotateRef.current = [-BOARD_VIEWS[board].center[0], -BOARD_VIEWS[board].center[1]];
    zoomRef.current = 1;
  }, [board]);

  useEffect(() => {
    const view = BOARD_VIEWS[focus ?? board];
    const zoomTo = focus ? CONTINENT_ZOOM[focus] : 1;
    const targetLambda = -view.center[0];
    const targetPhi = Math.max(-85, Math.min(85, -view.center[1]));
    const fromLambda = rotateRef.current[0];
    const fromPhi = rotateRef.current[1];
    const fromZoom = zoomRef.current;
    let dLambda = targetLambda - fromLambda;
    while (dLambda > 180) dLambda -= 360;
    while (dLambda < -180) dLambda += 360;
    const dPhi = targetPhi - fromPhi;
    const dZoom = zoomTo - fromZoom;
    if (Math.abs(dLambda) < 0.5 && Math.abs(dPhi) < 0.5 && Math.abs(dZoom) < 0.02) return;
    const start = performance.now();
    gesturing.current = true;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 680);
      const eased = 1 - (1 - t) ** 3;
      rotateRef.current = [fromLambda + dLambda * eased, Math.max(-85, Math.min(85, fromPhi + dPhi * eased))];
      zoomRef.current = clampZoom(fromZoom + dZoom * eased);
      paint();
      if (t < 1) focusAnim.current = window.requestAnimationFrame(step);
      else settle();
    };
    window.cancelAnimationFrame(focusAnim.current);
    focusAnim.current = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(focusAnim.current);
  }, [board, focus]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      sizeRef.current = {
        w: Math.max(280, Math.round(rect.width)),
        h: Math.max(220, Math.round(rect.height)),
      };
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      canvas.width = Math.round(sizeRef.current.w * dpr);
      canvas.height = Math.round(sizeRef.current.h * dpr);
      paint();
      syncHits();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [board]);

  const stampKey = [...stamped].join(",");
  useLayoutEffect(() => {
    paint();
  }, [board, colorMode, reveal, selected, stampKey]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      window.cancelAnimationFrame(zoomAnim.current);
      window.cancelAnimationFrame(focusAnim.current);
      gesturing.current = true;
      zoomRef.current = clampZoom(zoomRef.current * Math.exp(-event.deltaY * 0.0015));
      schedulePaint();
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(settle, 140);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [board]);

  function label(props: PieceProps) {
    if (!props.interactive) return props.note ?? "This place is not one of the countries in this game.";
    if (colorMode === "hub") return props.name ?? "Country";
    if (props.iso2 && stamped.has(props.iso2)) return props.name ?? "A country you already named";
    return "Unknown country";
  }

  function activate(props: PieceProps) {
    if (moved.current) return;
    if (props.interactive && props.iso2) onPick({ iso2: props.iso2 });
    else if (props.note) onPick({ note: props.note });
  }

  function turn(dx: number, dy: number) {
    const degrees = 180 / (Math.PI * Math.max(globeRadius(sizeRef.current, zoomRef.current), 1));
    const [lambda, phi] = rotateRef.current;
    rotateRef.current = [lambda + dx * degrees, Math.max(-85, Math.min(85, phi - dy * degrees))];
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest("button")) return;
    const path = (event.target as Element).closest("path");
    const index = path ? Number(path.getAttribute("data-index")) : NaN;
    press.current = Number.isInteger(index) ? (featuresRef.current[index]?.properties ?? null) : null;
    event.preventDefault();
    window.cancelAnimationFrame(zoomAnim.current);
    window.cancelAnimationFrame(focusAnim.current);
    window.cancelAnimationFrame(raf.current);
    raf.current = 0;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    frame.current?.setPointerCapture(event.pointerId);
    gesturing.current = true;
    if (pointers.current.size === 1) {
      moved.current = false;
      pinch.current = null;
      origin.current = { x: event.clientX, y: event.clientY };
    }
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y),
        zoom: zoomRef.current,
      };
      moved.current = true;
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const points = [...pointers.current.values()];
    if (points.length >= 2 && pinch.current && pinch.current.distance > 0) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      zoomRef.current = clampZoom(pinch.current.zoom * (distance / pinch.current.distance));
      moved.current = true;
      schedulePaint();
      return;
    }
    if (!moved.current) {
      const start = origin.current ?? previous;
      if (Math.hypot(next.x - start.x, next.y - start.y) <= 3) return;
      moved.current = true;
    }
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    if (dx !== 0 || dy !== 0) {
      turn(dx, dy);
      schedulePaint();
    }
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    if (pointers.current.size > 0) return;
    const hit = press.current;
    press.current = null;
    origin.current = null;
    const wasDrag = moved.current;
    moved.current = false;
    settle();
    if (!wasDrag && hit) activate(hit);
  }

  return (
    <div
      ref={frame}
      className="relative h-full w-full cursor-grab touch-none select-none bg-[#8fd4ea] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden={false}>
        <g ref={hitsRef}>
          {features.map((feature, index) => {
            const props = feature.properties;
            return (
              <path
                key={String(feature.id ?? index)}
                data-index={index}
                className="pointer-events-auto fill-transparent stroke-transparent outline-none focus-visible:stroke-ink"
                style={{ strokeWidth: 2 }}
                tabIndex={props.interactive || props.note ? 0 : -1}
                role="button"
                aria-label={label(props)}
                aria-pressed={props.iso2 != null && props.iso2 === selected}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    activate(props);
                  }
                }}
              />
            );
          })}
        </g>
      </svg>
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <button
          type="button"
          className="chunky grid h-11 w-11 place-items-center bg-paper text-xl font-extrabold"
          aria-label="Zoom in"
          onClick={() => animateZoom(clampZoom(+(zoomRef.current * 1.6).toFixed(2)))}
        >
          +
        </button>
        <button
          type="button"
          className="chunky grid h-11 w-11 place-items-center bg-paper text-xl font-extrabold"
          aria-label="Zoom out"
          onClick={() => animateZoom(clampZoom(+(zoomRef.current / 1.6).toFixed(2)))}
        >
          −
        </button>
      </div>
    </div>
  );
}
