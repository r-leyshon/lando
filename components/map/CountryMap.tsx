"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { geoArea, geoCentroid, geoOrthographic, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, Polygon } from "geojson";
import { BOARD_COLORS, BOARD_VIEWS, CONTINENT_ZOOM, type ContinentId } from "@/lib/boards";
import { countryByIso, type BoardId } from "@/lib/countries";
import { globeFeatures, globeSpinFeatures, type GlobeFeature, type PieceProps } from "@/lib/map-model";
import { readyFlag } from "@/components/map/flags";

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

const flagAnchors = new WeakMap<GlobeFeature, [number, number] | null>();

function polygonsOf(feature: GlobeFeature): Polygon[] {
  if (feature.geometry.type === "Polygon") return [feature.geometry];
  return feature.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }));
}

function flagAnchor(feature: GlobeFeature) {
  if (flagAnchors.has(feature)) return flagAnchors.get(feature) ?? null;
  let best: Feature<Polygon> | null = null;
  let bestArea = 0;
  for (const polygon of polygonsOf(feature)) {
    const shape: Feature<Polygon> = { type: "Feature", properties: {}, geometry: polygon };
    const area = geoArea(shape);
    if (area > bestArea) {
      best = shape;
      bestArea = area;
    }
  }
  if (!best) {
    flagAnchors.set(feature, null);
    return null;
  }
  const center = geoCentroid(best);
  const anchor =
    Number.isFinite(center[0]) && Number.isFinite(center[1]) ? ([center[0], center[1]] as [number, number]) : null;
  flagAnchors.set(feature, anchor);
  return anchor;
}

function spriteSize(zoom: number) {
  const width = Math.min(44, Math.max(20, 18 * Math.sqrt(zoom)));
  return { width, height: width * 0.75 };
}

function countryFocus(feature: GlobeFeature) {
  let best: Polygon | null = null;
  let bestArea = 0;
  for (const polygon of polygonsOf(feature)) {
    const shape: Feature<Polygon> = { type: "Feature", properties: {}, geometry: polygon };
    const area = geoArea(shape);
    if (area > bestArea) {
      best = polygon;
      bestArea = area;
    }
  }
  if (!best) return null;
  const center = geoCentroid({ type: "Feature", properties: {}, geometry: best });
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return null;
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;
  for (const ring of best.coordinates) {
    for (const pair of ring) {
      minLon = Math.min(minLon, pair[0]);
      maxLon = Math.max(maxLon, pair[0]);
      minLat = Math.min(minLat, pair[1]);
      maxLat = Math.max(maxLat, pair[1]);
    }
  }
  let width = maxLon - minLon;
  if (width > 180) width = 360 - width;
  const span = Math.max(width, maxLat - minLat, 0.8);
  return {
    center: [center[0], center[1]] as [number, number],
    zoom: Math.min(8, Math.max(4, 80 / span)),
  };
}

export function CountryMap({
  board,
  focus = null,
  focusCountry = null,
  stamped,
  selected,
  reveal,
  colorMode,
  capital = null,
  onPick,
}: {
  board: BoardId;
  focus?: ContinentId | null;
  focusCountry?: string | null;
  stamped: ReadonlySet<string>;
  selected: string | null;
  reveal: string | null;
  colorMode: "hub" | "play";
  capital?: [number, number] | null;
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
  const focusToken = useRef(0);
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
  const styleRef = useRef({ stamped, selected, reveal, colorMode, capital });
  styleRef.current = { stamped, selected, reveal, colorMode, capital };

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
      const hot =
        feature.properties.iso2 != null &&
        (feature.properties.iso2 === styleRef.current.selected || feature.properties.iso2 === styleRef.current.reveal);
      context.beginPath();
      path(feature);
      context.fillStyle = landColor(feature.properties);
      context.fill();
      context.lineWidth = hot ? 1.6 : 0.45;
      context.strokeStyle = "#2a241b";
      context.stroke();
    }
    context.save();
    context.beginPath();
    path({ type: "Sphere" });
    context.clip();
    drawFlagSprites(context, projection);
    drawCapitalDot(context, projection);
    context.restore();
  }

  function drawCapitalDot(context: CanvasRenderingContext2D, projection: GeoProjection) {
    const dot = styleRef.current.capital;
    if (!dot) return;
    const point = projection(dot);
    if (!point) return;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    context.beginPath();
    context.arc(point[0], point[1], 10 + pulse * 8, 0, Math.PI * 2);
    context.fillStyle = `rgba(225, 91, 76, ${0.28 + pulse * 0.25})`;
    context.fill();
    context.beginPath();
    context.arc(point[0], point[1], 5.5, 0, Math.PI * 2);
    context.fillStyle = "#e15b4c";
    context.strokeStyle = "#2a241b";
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  }

  function drawFlagSprites(context: CanvasRenderingContext2D, projection: GeoProjection) {
    const style = styleRef.current;
    if (style.colorMode === "hub" || style.stamped.size === 0) return;
    const mesh = gesturing.current ? spinRef.current : featuresRef.current;
    const { width, height } = spriteSize(zoomRef.current);
    for (const feature of mesh) {
      const iso = feature.properties.iso2;
      if (!iso || !style.stamped.has(iso)) continue;
      const image = readyFlag(iso, schedulePaint);
      const anchor = flagAnchor(feature);
      if (!image || !anchor) continue;
      const point = projection(anchor);
      if (!point) continue;
      const x = point[0] - width / 2;
      const y = point[1] - height / 2;
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, width, height);
      context.drawImage(image.source, x, y, width, height);
      context.lineWidth = 1.5;
      context.strokeStyle = "#2a241b";
      context.strokeRect(x, y, width, height);
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

  useEffect(() => {
    rotateRef.current = [-BOARD_VIEWS[board].center[0], -BOARD_VIEWS[board].center[1]];
    zoomRef.current = 1;
  }, [board]);

  useEffect(() => {
    const country = focusCountry ? features.find((item) => item.properties.iso2 === focusCountry) : null;
    const framed = country ? countryFocus(country) : null;
    const view = BOARD_VIEWS[focus ?? board];
    const zoomTo = framed ? framed.zoom : focus ? CONTINENT_ZOOM[focus] : 1;
    const targetLambda = framed ? -framed.center[0] : -view.center[0];
    const targetPhi = Math.max(-85, Math.min(85, framed ? -framed.center[1] : -view.center[1]));
    let fromLambda = rotateRef.current[0];
    let fromPhi = rotateRef.current[1];
    let fromZoom = zoomRef.current;
    let dLambda = targetLambda - fromLambda;
    while (dLambda > 180) dLambda -= 360;
    while (dLambda < -180) dLambda += 360;
    const dPhi = targetPhi - fromPhi;
    const dZoom = zoomTo - fromZoom;
    if (Math.abs(dLambda) < 0.5 && Math.abs(dPhi) < 0.5 && Math.abs(dZoom) < 0.02) return;
    const token = ++focusToken.current;
    const start = performance.now();
    gesturing.current = true;
    const step = (now: number) => {
      if (token !== focusToken.current) return;
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
    return () => {
      focusToken.current += 1;
      window.cancelAnimationFrame(focusAnim.current);
    };
  }, [board, features, focus, focusCountry]);

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
  const capitalKey = capital ? `${capital[0]},${capital[1]}` : "";
  useLayoutEffect(() => {
    paint();
  }, [board, colorMode, reveal, selected, stampKey, capitalKey]);

  useEffect(() => {
    if (!capital) return;
    let frame = 0;
    const loop = () => {
      paint();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [capitalKey]);

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
    if (!path) event.preventDefault();
    focusToken.current += 1;
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
    </div>
  );
}
