"use client";

import { useMemo } from "react";
import { geoEqualEarth, geoPath } from "d3-geo";
import { silhouetteOf } from "@/lib/map-model";

export function Silhouette({ iso }: { iso: string }) {
  const shape = useMemo(() => silhouetteOf(iso), [iso]);
  const d = useMemo(() => {
    if (!shape) return "";
    const projection = geoEqualEarth().fitExtent(
      [
        [28, 28],
        [292, 252],
      ],
      shape,
    );
    return geoPath(projection)(shape) ?? "";
  }, [shape]);

  return (
    <svg viewBox="0 0 320 280" className="h-full w-full" role="img" aria-label="A mystery country shape">
      <rect width="320" height="280" fill="#9ed7ea" />
      <path d={d} fill="#f4d48a" stroke="#2a241b" strokeWidth={5} strokeLinejoin="round" />
    </svg>
  );
}
