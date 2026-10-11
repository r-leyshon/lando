import { feature } from "topojson-client";
import { geoArea, geoCentroid } from "d3-geo";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "world-atlas/countries-50m.json";
import atlasCoarse from "world-atlas/countries-110m.json";
import { BOARD_BOXES, CONTINENTS, type ContinentId } from "@/lib/boards";
import { countries, countryByIso, places, type BoardId, type Country } from "@/lib/countries";

export type PieceProps = {
  iso2: string | null;
  name: string | null;
  note: string | null;
  interactive: boolean;
  small: boolean;
};

export type LandFeature = Feature<Polygon, PieceProps>;
export type GlobeFeature = Feature<Polygon | MultiPolygon, PieceProps>;

type Atlas = Topology<{ countries: GeometryCollection }>;

const topology = atlas as unknown as Atlas;
const source = feature(topology, topology.objects.countries);
const coarseTopology = atlasCoarse as unknown as Atlas;
const coarse = feature(coarseTopology, coarseTopology.objects.countries);

function asPolygons(geometry: Feature["geometry"]): Polygon[] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry];
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((coordinates) => ({ type: "Polygon" as const, coordinates }));
  }
  return [];
}

function hits(lon: number, lat: number) {
  const found: ContinentId[] = [];
  for (const board of CONTINENTS) {
    const inside = BOARD_BOXES[board].some(
      (box) => lon >= box.west && lon <= box.east && lat >= box.south && lat <= box.north,
    );
    if (inside) found.push(board);
  }
  return found;
}

function polygonFeature(
  polygon: Polygon,
  id: string,
  props: PieceProps,
): LandFeature {
  return { type: "Feature", id, properties: props, geometry: polygon };
}

function shapesFor(country: Country) {
  return source.features.filter((shape) => {
    if (country.numeric && shape.id != null && String(Number(shape.id)) === country.numeric) return true;
    const name = (shape.properties as { name?: string } | null)?.name;
    return country.numeric == null && name === country.neName;
  });
}

const claimed = new Set<number>();

function build() {
  const byBoard: Record<BoardId, LandFeature[]> = {
    africa: [],
    europe: [],
    asia: [],
    "north-america": [],
    "south-america": [],
    oceania: [],
    world: [],
  };

  countries.forEach((country, countryIndex) => {
    shapesFor(country).forEach((shape) => {
      claimed.add(source.features.indexOf(shape));
      asPolygons(shape.geometry).forEach((polygon, index) => {
        const centroid = geoCentroid({ type: "Feature", properties: {}, geometry: polygon });
        const [lon, lat] = centroid;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        const id = `${country.iso2}-${countryIndex}-${index}`;
        const interactive: PieceProps = {
          iso2: country.iso2,
          name: country.name,
          note: null,
          interactive: true,
          small: country.small,
        };
        byBoard.world.push(polygonFeature(polygon, `world-${id}`, interactive));
        const boards = hits(lon, lat);
        if (boards.length === 0 && country.primary !== "world") {
          byBoard[country.primary].push(polygonFeature(polygon, `${country.primary}-${id}`, interactive));
          return;
        }
        const playableHere = boards.filter((board) => country.boards.includes(board));
        if (playableHere.length > 0) {
          for (const board of playableHere) {
            byBoard[board].push(polygonFeature(polygon, `${board}-${id}`, interactive));
          }
          return;
        }
        for (const board of boards) {
          byBoard[board].push(
            polygonFeature(polygon, `${board}-part-${id}`, {
              iso2: null,
              name: null,
              note: `This place belongs to ${country.name}. It is not its own country in the game.`,
              interactive: false,
              small: false,
            }),
          );
        }
      });
    });
  });

  places.forEach((place) => {
    source.features.forEach((shape, shapeIndex) => {
      if (claimed.has(shapeIndex)) return;
      const numeric = shape.id == null ? null : String(Number(shape.id));
      const same =
        (place.numeric && numeric === place.numeric) ||
        (place.numeric == null && (shape.properties as { name?: string } | null)?.name === place.neName);
      if (!same) return;
      claimed.add(shapeIndex);
      asPolygons(shape.geometry).forEach((polygon, index) => {
        const [lon, lat] = geoCentroid({ type: "Feature", properties: {}, geometry: polygon });
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        const props: PieceProps = {
          iso2: null,
          name: place.neName,
          note: place.note,
          interactive: false,
          small: false,
        };
        const id = `place-${place.neName}-${index}`;
        byBoard.world.push(polygonFeature(polygon, `world-${id}`, props));
        for (const board of hits(lon, lat)) {
          byBoard[board].push(polygonFeature(polygon, `${board}-${id}`, props));
        }
      });
    });
  });

  return byBoard;
}

const pieces = build();

export function boardPieces(board: BoardId) {
  return pieces[board];
}

export function globeFeatures(board: BoardId): GlobeFeature[] {
  const grouped = new Map<string, { props: PieceProps; coordinates: Polygon["coordinates"][] }>();
  for (const piece of pieces[board]) {
    const key = piece.properties.iso2 ?? `place:${piece.properties.note ?? piece.properties.name ?? "land"}`;
    const group = grouped.get(key) ?? { props: piece.properties, coordinates: [] };
    group.coordinates.push(piece.geometry.coordinates);
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group, index) => ({
    type: "Feature" as const,
    id: group.props.iso2 ?? `place-${index}`,
    properties: group.props,
    geometry:
      group.coordinates.length === 1
        ? { type: "Polygon" as const, coordinates: group.coordinates[0] }
        : { type: "MultiPolygon" as const, coordinates: group.coordinates },
  }));
}

function featureKey(props: PieceProps) {
  return props.iso2 ?? `place:${props.note ?? props.name ?? "land"}`;
}

export function globeSpinFeatures(board: BoardId): GlobeFeature[] {
  const detail = globeFeatures(board);
  if (board !== "world") return detail;
  const fast: GlobeFeature[] = [];
  const seen = new Set<string>();
  const claimed = new Set<number>();

  coarse.features.forEach((shape, index) => {
    if (!shape.geometry || (shape.geometry.type !== "Polygon" && shape.geometry.type !== "MultiPolygon")) return;
    const numeric = shape.id == null ? null : String(Number(shape.id));
    const name = (shape.properties as { name?: string } | null)?.name ?? null;
    const country = countries.find(
      (item) => (item.numeric != null && item.numeric === numeric) || (item.numeric == null && name === item.neName),
    );
    if (!country) return;
    claimed.add(index);
    const key = country.iso2;
    if (seen.has(key)) return;
    seen.add(key);
    fast.push({
      type: "Feature",
      id: key,
      properties: {
        iso2: country.iso2,
        name: country.name,
        note: null,
        interactive: true,
        small: country.small,
      },
      geometry: shape.geometry,
    });
  });

  coarse.features.forEach((shape, index) => {
    if (claimed.has(index) || !shape.geometry) return;
    if (shape.geometry.type !== "Polygon" && shape.geometry.type !== "MultiPolygon") return;
    const numeric = shape.id == null ? null : String(Number(shape.id));
    const name = (shape.properties as { name?: string } | null)?.name ?? null;
    const place = places.find(
      (item) => (item.numeric != null && item.numeric === numeric) || (item.numeric == null && name === item.neName),
    );
    if (!place) return;
    const key = `place:${place.note}`;
    if (seen.has(key)) return;
    seen.add(key);
    fast.push({
      type: "Feature",
      id: key,
      properties: {
        iso2: null,
        name: place.neName,
        note: place.note,
        interactive: false,
        small: false,
      },
      geometry: shape.geometry,
    });
  });

  for (const item of detail) {
    const key = featureKey(item.properties);
    if (seen.has(key)) continue;
    seen.add(key);
    fast.push(item);
  }
  return fast;
}

export function requiredIsos(board: BoardId) {
  const isos = new Set<string>();
  for (const piece of pieces[board]) {
    if (!piece.properties.interactive || !piece.properties.iso2) continue;
    const country = countryByIso.get(piece.properties.iso2);
    if (country && !country.bonus) isos.add(country.iso2);
  }
  return [...isos];
}

function largest(features: LandFeature[]) {
  return features.reduce<LandFeature | null>((best, current) => {
    if (!best) return current;
    return geoArea(current) > geoArea(best) ? current : best;
  }, null);
}

export function silhouetteOf(iso: string) {
  const match = pieces.world.filter((piece) => piece.properties.iso2 === iso);
  return largest(match);
}
