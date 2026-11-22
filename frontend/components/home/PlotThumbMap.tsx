"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { VillaThumb } from "@/components/home/HomeParts";
import { lookupPlot } from "@/lib/analysis";
import { loadSavedResults } from "@/lib/analysis-store";
import { FACADES, getConstraints, mainFacades, plotDimensions } from "@/lib/analysis-detail";
import type { Facade } from "@/lib/analysis-detail";
import type { LatLng } from "@/lib/geo";
import type { VillaType } from "@/lib/results";

const ResultMap = dynamic(() => import("@/components/map/ResultMap"), { ssr: false });

type Props = {
  id: string;
  lat: number;
  lng: number;
  area: number;
  villaType?: VillaType;
  label: string;
  className?: string;
};

// The same map as the results page (the plot boundary and its coloured façades), as a small fixed picture.
// The villa drawing stays underneath until the map has tiles, and when the plot cannot be shown.
export default function PlotThumbMap({ id, lat, lng, area, villaType, label, className = "" }: Props) {
  const [outline, setOutline] = useState<LatLng[] | null>(null);
  const [heat, setHeat] = useState<Record<Facade, number | null> | null>(null);

  useEffect(() => {
    let active = true;
    lookupPlot({ lat, lng }).then((plot) => {
      if (active) setOutline(plot.outline);
    });
    loadSavedResults(id).then((data) => {
      if (!active || !data) return;
      const values = {} as Record<Facade, number | null>;
      FACADES.forEach((f) => {
        values[f] = data.facades[f].radiation;
      });
      setHeat(values);
    });
    return () => {
      active = false;
    };
  }, [id, lat, lng]);

  const dims = useMemo(() => plotDimensions(area), [area]);
  const setbacks = useMemo(() => getConstraints().setbacks, []);
  const shown = useMemo(() => mainFacades(outline), [outline]);
  const tips = useMemo(() => Object.fromEntries(FACADES.map((f) => [f, ""])) as Record<Facade, string>, []);

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <VillaThumb type={villaType} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 z-0" dir="ltr">
        <ResultMap
          lat={lat}
          lng={lng}
          width={dims.width}
          depth={dims.depth}
          setbacks={setbacks}
          heat={heat}
          selected="north"
          tips={tips}
          label={label}
          outline={outline}
          shown={shown}
          preview
        />
      </div>
    </div>
  );
}
