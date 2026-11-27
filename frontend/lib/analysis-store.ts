import { createClient } from "@/lib/supabase/client";
import { FACADES, METRICS } from "@/lib/analysis-detail";
import type { Facade, FacadeIndicators, IndicatorsData, Level, MetricKey } from "@/lib/analysis-detail";
import { SERVICE_KINDS } from "@/lib/neighbourhood";
import type { Service, ServiceKind } from "@/lib/neighbourhood";
import type { FacadeNeighbours, IndicatorEstimate, NoiseRoadClass } from "@/lib/site-api";

// The indicators of a finished analysis are kept ONLY in "Site_Indicator" (one row per indicator, and per
// facade for the facade indicators), as the ER diagram says. Opening a result from the history rebuilds the
// dashboard from those rows, so it shows exactly what was calculated then, without calculating again.
// Row level security makes sure each user only reads and writes the rows of their own analyses.

// Raise it when the shape of the saved rows changes, so older saved analyses are calculated again.
// It is kept in Analysis.version. v3: the building is the user's design, services saved; v4: read from Site_Indicator only.
export const RESULTS_VERSION = "v4";

// One row of Site_Indicator (the ER diagram keeps every indicator in its own row).
export type IndicatorRow = {
  indicatorName: string;
  facade: string | null;
  nearestService?: string | null; // only the nearest-services rows: the service kind (mosque, hospital...)
  value: number;
  unit: string;
};

const METRIC_UNITS: Record<MetricKey, string> = {
  radiation: "kWh/m2/day",
  shade: "ratio",
  wind: "deg",
  sky: "ratio",
};
const NOISE_NUMBER = { low: 1, medium: 2, high: 3 } as const;
const NOISE_LEVELS: Level[] = ["low", "medium", "high"];
const DENSITY_NUMBER = { L: 1, M: 2, H: 3 } as const;
const DENSITY_LEVELS = ["L", "M", "H"] as const;

// The indicators of an analysis as Site_Indicator rows. Empty values (no wall, no data) are left out.
export function indicatorRows(data: IndicatorsData): IndicatorRow[] {
  const rows: IndicatorRow[] = [];
  const add = (indicatorName: string, facade: string | null, value: number | null | undefined, unit: string) => {
    if (typeof value === "number" && Number.isFinite(value)) rows.push({ indicatorName, facade, value, unit });
  };

  for (const facade of FACADES) {
    for (const metric of METRICS) add(metric, facade, data.facades[facade]?.[metric], METRIC_UNITS[metric]);
  }

  const site = data.site;
  add("windSpeed", site.windFrom, site.windSpeed, "m/s"); // the facade is the side the wind comes from
  add("windShare", site.windFrom, site.windShare, "%");
  add("temperature", null, site.temperature, "C");
  add("density", null, site.density, "people/km2");
  if (site.densityLevel) add("densityLevel", null, DENSITY_NUMBER[site.densityLevel], "level (1 L, 2 M, 3 H)");
  add("avgHeight", null, site.avgHeight, "m");
  add("maxHeight", null, site.maxHeight, "m");
  if (site.noise) add("noiseLevel", null, NOISE_NUMBER[site.noise], "level (1 low, 2 medium, 3 high)");
  add("noiseDistance", site.noiseReason?.roadClass ?? null, site.noiseReason?.distance, "m"); // facade = road class
  if (data.neighbours) rows.push(...neighbourRows(data.neighbours));
  rows.push(...estimateRows(data.estimated));
  if (data.services) rows.push(...serviceRows(data.services));
  return rows;
}

// The neighbours of each façade (the neighbours card): from this side of the plot, the distance to the street
// in front of it and its width, and the distance to the nearest building straight in front of it and its height.
// 300 m = no building within 300 m; height 0 = none. A value the backend did not send has no row.
// Site_Indicator.value is a number, so the words of the card (the use next to the plot, across the street,
// the street class and name) are kept in the row's "unit" column, with value 0; an estimate flag is 1 or 0.
const NEIGHBOUR_TEXTS = [
  ["neighbourUse", "use"],
  ["neighbourAcross", "across"],
  ["neighbourModelUse", "modelUse"],
  ["neighbourModelAcross", "modelAcross"],
  ["streetClass", "streetClass"],
  ["streetName", "streetName"],
] as const;
const NEIGHBOUR_FLAGS = [
  ["streetWidthEstimated", "streetWidthEstimated"],
  ["useEstimated", "useEstimated"],
] as const;

export function neighbourRows(neighbours: NonNullable<IndicatorsData["neighbours"]>): IndicatorRow[] {
  const rows: IndicatorRow[] = [];
  const add = (indicatorName: string, facade: string, value: number | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) rows.push({ indicatorName, facade, value, unit: "m" });
  };
  for (const facade of FACADES) {
    const n = neighbours[facade];
    if (!n) continue;
    add("streetDistance", facade, n.streetDistance);
    add("streetWidth", facade, n.streetWidth);
    add("nearestBuildingDistance", facade, n.nearestDistance);
    add("nearestBuildingHeight", facade, n.nearestHeight);
    for (const [indicatorName, key] of NEIGHBOUR_TEXTS) {
      const text = n[key];
      if (typeof text === "string" && text !== "") rows.push({ indicatorName, facade, value: 0, unit: text });
    }
    for (const [indicatorName, key] of NEIGHBOUR_FLAGS) {
      if (typeof n[key] === "boolean") rows.push({ indicatorName, facade, value: n[key] ? 1 : 0, unit: "flag" });
    }
  }
  return rows;
}

// What is estimated in the indicators of each wall, as flag rows (value 1); nothing estimated = no row.
const ESTIMATE_FLAGS = [
  ["estBuildingHeight", "buildingHeight"],
  ["estSetbacks", "setbacks"],
] as const;

export function estimateRows(estimated: IndicatorsData["estimated"]): IndicatorRow[] {
  const rows: IndicatorRow[] = [];
  for (const facade of FACADES) {
    const e = estimated?.[facade];
    if (!e) continue;
    for (const [indicatorName, key] of ESTIMATE_FLAGS) {
      if (e[key]) rows.push({ indicatorName, facade, value: 1, unit: "flag" });
    }
  }
  return rows;
}

// The nearest services as Site_Indicator rows: for each kind (in the nearestService column) the distance to the
// nearest one and how many there are. No distance row when there is none of that kind nearby.
export function serviceRows(services: Service[]): IndicatorRow[] {
  const rows: IndicatorRow[] = [];
  for (const service of services) {
    if (typeof service.distance === "number" && Number.isFinite(service.distance)) {
      rows.push({ indicatorName: "serviceDistance", facade: null, nearestService: service.kind, value: service.distance, unit: "m" });
    }
    rows.push({ indicatorName: "serviceCount", facade: null, nearestService: service.kind, value: service.count, unit: "count" });
  }
  return rows;
}

type SavedRow = {
  indicatorName: string;
  facade: string | null;
  nearestService?: string | null;
  value: number | string;
  unit: string | null;
};
type SavedAnalysis = { status?: string; version?: string; Site_Indicator?: SavedRow[] | null };

const isFacade = (value: string | null): value is Facade => FACADES.includes(value as Facade);

// Rebuilds the dashboard data from the Site_Indicator rows of an analysis (the opposite of indicatorRows).
// Returns null unless the analysis is finished, in the current version, and has its wind and temperature.
export function dataFromRows(analysis: SavedAnalysis | null | undefined): IndicatorsData | null {
  if (!analysis || analysis.status !== "completed" || analysis.version !== RESULTS_VERSION) return null;
  const rows = analysis.Site_Indicator ?? [];
  if (rows.length === 0) return null;

  const facades = {} as Record<Facade, FacadeIndicators>;
  for (const facade of FACADES) facades[facade] = { radiation: null, shade: null, wind: null, sky: null };
  const neighbours = {} as Record<Facade, FacadeNeighbours>;
  for (const facade of FACADES) {
    neighbours[facade] = {
      use: null, across: null, streetWidth: null, streetClass: null, streetName: null,
      nearestDistance: 300, nearestHeight: 0,
    };
  }
  let hasNeighbours = false;
  const estimated: Partial<Record<Facade, IndicatorEstimate>> = {};
  const kinds = new Map<ServiceKind, Service>();
  const siteValues = new Map<string, { facade: string | null; value: number }>();

  for (const row of rows) {
    const value = Number(row.value);
    const name = row.indicatorName;
    const facade = row.facade;
    if (METRICS.includes(name as MetricKey) && isFacade(facade)) {
      if (Number.isFinite(value)) facades[facade][name as MetricKey] = value;
    } else if (isFacade(facade) && ["streetDistance", "streetWidth", "nearestBuildingDistance", "nearestBuildingHeight"].includes(name)) {
      hasNeighbours = true;
      const n = neighbours[facade];
      if (name === "streetDistance") n.streetDistance = value;
      else if (name === "streetWidth") n.streetWidth = value;
      else if (name === "nearestBuildingDistance") n.nearestDistance = value;
      else n.nearestHeight = value;
    } else if (isFacade(facade) && NEIGHBOUR_TEXTS.some(([rowName]) => rowName === name)) {
      hasNeighbours = true;
      const key = NEIGHBOUR_TEXTS.find(([rowName]) => rowName === name)![1];
      (neighbours[facade] as Record<string, unknown>)[key] = row.unit ?? null;
    } else if (isFacade(facade) && NEIGHBOUR_FLAGS.some(([rowName]) => rowName === name)) {
      const key = NEIGHBOUR_FLAGS.find(([rowName]) => rowName === name)![1];
      neighbours[facade][key] = value === 1;
    } else if (isFacade(facade) && ESTIMATE_FLAGS.some(([rowName]) => rowName === name)) {
      const key = ESTIMATE_FLAGS.find(([rowName]) => rowName === name)![1];
      const e = (estimated[facade] ??= { buildingHeight: false, setbacks: false });
      e[key] = value === 1;
    } else if (name === "serviceDistance" || name === "serviceCount") {
      // rows saved before the nearestService column kept the kind in the facade column
      const kind = (row.nearestService ?? facade) as ServiceKind;
      const service = kinds.get(kind) ?? { kind, distance: null, count: 0 };
      if (name === "serviceDistance") service.distance = value;
      else service.count = value;
      kinds.set(kind, service);
    } else if (Number.isFinite(value)) {
      siteValues.set(name, { facade, value });
    }
  }

  const wind = siteValues.get("windSpeed");
  const temperature = siteValues.get("temperature");
  if (!wind || !isFacade(wind.facade) || !temperature) return null;
  const noise = siteValues.get("noiseLevel");
  const noiseWhy = siteValues.get("noiseDistance");
  const density = siteValues.get("densityLevel");
  const num = (name: string) => siteValues.get(name)?.value ?? null;

  const services = SERVICE_KINDS.filter((kind) => kinds.has(kind)).map((kind) => kinds.get(kind)!);
  return {
    complete: true,
    facades,
    site: {
      windSpeed: wind.value,
      windFrom: wind.facade,
      windShare: num("windShare"),
      temperature: temperature.value,
      density: num("density"),
      densityLevel: density ? (DENSITY_LEVELS[density.value - 1] ?? null) : null,
      avgHeight: num("avgHeight"),
      maxHeight: num("maxHeight"),
      noise: noise ? (NOISE_LEVELS[noise.value - 1] ?? null) : null,
      noiseReason: noiseWhy?.facade ? { roadClass: noiseWhy.facade as NoiseRoadClass, distance: noiseWhy.value } : null,
    },
    neighbours: hasNeighbours ? neighbours : null,
    estimated,
    services: services.length > 0 ? services : null,
  };
}

// A project points to its analysis (Project.analysisID -> Analysis.analysisID), and the analysis has its
// Site_Indicator rows. Returns null when nothing complete is saved for this project (or it could not be read).
export async function loadSavedResults(projectId: string): Promise<IndicatorsData | null> {
  const { data, error } = await createClient()
    .from("Project")
    .select("Analysis(status, version, Site_Indicator(indicatorName, facade, nearestService, value, unit))")
    .eq("projectID", projectId)
    .maybeSingle();
  if (error) {
    console.error("Saved results error:", error.message);
    return null;
  }
  return dataFromRows((data as { Analysis?: SavedAnalysis | null } | null)?.Analysis);
}

// Saves a COMPLETE analysis as Site_Indicator rows. An incomplete one (the backend did not answer) is never saved.
// Resolves to true when saved.
export async function saveResults(
  projectId: string,
  data: IndicatorsData,
  options: { renew?: boolean } = {},
): Promise<boolean> {
  if (data.complete !== true) return false;
  const supabase = createClient();
  if (options.renew) {
    // Copy-on-write: when other projects use the same analysis, this project gets its own copy first,
    // so updating it never changes what the other users see (see supabase/analysis-reuse.sql).
    const own = await supabase.rpc("own_analysis", { p_project: projectId });
    if (own.error || typeof own.data !== "string") {
      console.error("Save results error:", own.error?.message ?? "no analysis for this project");
      return false;
    }
  }
  // The function replaces the old rows of the analysis, marks it completed, and sets its version
  // (and its date, when it is renewed). supabase/site-indicators.sql
  const saved = await supabase.rpc("save_site_indicators", {
    p_project: projectId,
    p_rows: indicatorRows(data),
    p_version: RESULTS_VERSION,
    p_renew: options.renew === true,
  });
  if (saved.error) {
    console.error("Save results error:", saved.error.message);
    return false;
  }
  return true;
}

// The services arrived after the analysis was saved (the homeowner's card loaded them on its own):
// they are added to the saved analysis, only when it has none yet. Resolves to true when added.
export async function saveServices(projectId: string, services: Service[]): Promise<boolean> {
  const { data, error } = await createClient().rpc("add_services", {
    p_project: projectId,
    p_rows: serviceRows(services),
  });
  if (error) console.error("Save services error:", error.message);
  return data === true;
}

// Is there an analysis to reuse (the same plot, villa type, area and height, less than 6 months old)?
// The analysis page then does not calculate again. False when it cannot tell.
export async function hasReusableAnalysis(input: {
  boundary: unknown;
  villaType: string;
  area: number;
  height: number | null;
}): Promise<boolean> {
  if (!input.boundary) return false;
  const { data, error } = await createClient().rpc("has_reusable_analysis", {
    p_boundary: input.boundary,
    p_villa_type: input.villaType,
    p_area: input.area,
    p_height: input.height,
  });
  if (error) {
    console.warn("Reuse check error:", error.message);
    return false;
  }
  return data === true;
}