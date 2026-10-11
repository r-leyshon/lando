"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoEqualEarth } from "d3-geo";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { BOARD_COLORS, BOARD_VIEWS } from "@/lib/boards";
import { countryByIso, type BoardId } from "@/lib/countries";
import { boardPieces, type PieceProps } from "@/lib/map-model";

type Hit = { iso2: string } | { note: string };

const MAX_ZOOM = 3000;

function allowZoomGesture(event: Event) {
  const pointer = event as MouseEvent;
  return (!pointer.ctrlKey || event.type === "wheel") && !pointer.button;
}

export function CountryMap({
  board,
  stamped,
  selected,
  reveal,
  colorMode,
  onPick,
}: {
  board: BoardId;
  stamped: ReadonlySet<string>;
  selected: string | null;
  reveal: string | null;
  colorMode: "hub" | "play";
  onPick: (hit: Hit) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 420 });
  const view = BOARD_VIEWS[board];
  const [center, setCenter] = useState<[number, number]>(view.center);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        w: Math.max(280, Math.round(rect.width)),
        h: Math.max(220, Math.round(rect.height)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setCenter(view.center);
    setZoom(1);
  }, [board, view.center]);

  const projection = useMemo(() => {
    return geoEqualEarth()
      .translate([size.w / 2, size.h / 2])
      .center(view.center)
      .scale((view.scale * size.w) / 800);
  }, [size.h, size.w, view.center, view.scale]);

  const geography = useMemo(
    () => ({ type: "FeatureCollection" as const, features: boardPieces(board) }),
    [board],
  );

  function fill(props: PieceProps) {
    if (!props.interactive || !props.iso2) return "#e7d7b0";
    if (colorMode === "hub") return BOARD_COLORS[countryByIso.get(props.iso2)?.primary ?? "world"];
    if (props.iso2 === selected || props.iso2 === reveal) return "#f08a3c";
    if (stamped.has(props.iso2)) return "#6fbf73";
    return "#f4d48a";
  }

  function label(props: PieceProps) {
    if (!props.interactive) return props.note ?? "Territory";
    if (colorMode === "hub") return `${props.name ?? "Country"}, open its board`;
    if (props.iso2 && stamped.has(props.iso2)) return props.name ?? "Stamped country";
    return "Unknown country";
  }

  function activate(props: PieceProps) {
    if (props.interactive && props.iso2) onPick({ iso2: props.iso2 });
    else if (props.note) onPick({ note: props.note });
  }

  return (
    <div ref={frame} className="relative h-full w-full bg-[#8fd4ea]">
      <ComposableMap
        width={size.w}
        height={size.h}
        projection={projection as never}
        className="h-full w-full touch-none"
      >
        <ZoomableGroup
          center={center}
          zoom={zoom}
          minZoom={1}
          maxZoom={MAX_ZOOM}
          filterZoomEvent={allowZoomGesture}
          onMoveEnd={(position) => {
            if (position.coordinates) setCenter(position.coordinates);
            if (position.zoom) setZoom(position.zoom);
          }}
        >
          <Geographies geography={geography}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const props = geo.properties as PieceProps;
                const hot = props.iso2 != null && (props.iso2 === selected || props.iso2 === reveal);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    tabIndex={0}
                    role="button"
                    aria-label={label(props)}
                    aria-pressed={props.iso2 != null && props.iso2 === selected}
                    onClick={() => activate(props)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        activate(props);
                      }
                    }}
                    fill={fill(props)}
                    stroke="#2a241b"
                    strokeWidth={hot ? 2.4 : 0.7}
                    vectorEffect="non-scaling-stroke"
                    className={`land-shape outline-none ${props.iso2 === reveal ? "land-reveal" : ""}`}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
      <div className="absolute top-3 right-3 flex flex-col gap-2">
        <button
          type="button"
          className="chunky grid h-11 w-11 place-items-center bg-paper text-xl font-extrabold"
          aria-label="Zoom in"
          onClick={() => setZoom((current) => Math.min(MAX_ZOOM, +(current * 1.6).toFixed(2)))}
        >
          +
        </button>
        <button
          type="button"
          className="chunky grid h-11 w-11 place-items-center bg-paper text-xl font-extrabold"
          aria-label="Zoom out"
          onClick={() => setZoom((current) => Math.max(1, +(current / 1.6).toFixed(2)))}
        >
          −
        </button>
      </div>
    </div>
  );
}
