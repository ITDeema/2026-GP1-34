// Requests to our backend (and the sun path and wind from riyadh-climate.json).
// The analytical diagrams come from the backend's saved OpenStreetMap file (no request to Overpass). Set NEXT_PUBLIC_API_URL for a deployed backend.

import { pointKey, shared, waitFor } from "@/lib/shared-request";
import riyadhClimate from "@/lib/riyadh-climate.json";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

/* ---------- types ---------- */

export type SunPoint = { hour: number; azimuth: number; altitude: number };
export type SunPath = {
  arcs: { summer: SunPoint[]; equinox: SunPoint[]; winter: SunPoint[] };
};

export type WindDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type Wind = {
  frequencies: Record<WindDirection, number>; // % of the windy hours, by the direction the wind comes from
  dominant: WindDirection; // the direction the wind comes from most often
  meanSpeed: number; // m/s
  calmShare: number; // % of the hours below 0.5 m/s
  hours: number;
  // the hot wind (summer, June–August) and the cool wind (winter, December–February); older backends do not send it
  seasons?: Partial<Record<"summer" | "winter", WindSeason>>;
};
export type WindSeason = {
  dominant: WindDirection;
  frequencies: Record<WindDirection, number>; // % of the windy hours of the season
  meanSpeed: number; // m/s
};

export type Poi = { id: string; name: string; lat: number; lon: number; cats: string[] };

export type RawBuilding = {
  pts: [number, number][]; // [lat, lon]
  subtype: string | null;
  class: string | null;
};

export type ServicesResponse = {
  radius: number; // meters
  services: Record<string, { count: number; nearest: number | null }>;
};


export type Tags = Record<string, string | undefined>;
export type OsmPoint = { lat: number; lon: number };
export type OsmElement = {
  type: "node" | "way" | "relation";
  lat?: number;
  lon?: number;
  tags?: Tags;
  geometry?: OsmPoint[];
  members?: { role: string; geometry?: OsmPoint[] }[];
};
export type OverpassResult = { elements: OsmElement[] };

/* ---------- helpers ---------- */

// A request that stops after `ms`, or when the page stops waiting for it.
function limited(parent: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  parent?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

/* ---------- our backend ---------- */

// The sun path and the wind are the same for every plot in Riyadh (one fixed point, like the dataset),
// so they are read from riyadh-climate.json (made by backend/tools/export_riyadh_climate.py):
// they show at once, with no request to the backend.
export function fetchSunPath(_lat: number, _lng: number, signal?: AbortSignal): Promise<SunPath> {
  return waitFor(Promise.resolve(riyadhClimate.sunPath as SunPath), signal);
}

export function fetchWind(signal?: AbortSignal): Promise<Wind> {
  return waitFor(Promise.resolve(riyadhClimate.wind as Wind), signal);
}

// Per-façade indicators of the plot from our backend, same calculation as the dataset
// (the plot, its façades, the building and the solar radiation on each wall).
export type FacadeDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type SeasonRadiation = {
  total: number | null; // kWh/m² over the season (the dataset value)
  perDay: number | null; // kWh/m²/day
  blocked: number | null; // 0..1 share of the sun blocked by the neighbours
};
// What stands next to a façade (dataset columns for that direction).
export type FacadeNeighbours = {
  use: string | null; // adjoining parcel use (ParcelSub), "شارع", or "لا يوجد" (no edge this way); null if unknown
  across: string | null; // use across the street, or "لا يوجد"
  streetWidth: number | null; // m
  streetWidthEstimated?: boolean; // true = the street has no width in the layer: its type's width (defaults.py)
  streetClass: string | null;
  streetName: string | null;
  streetDistance?: number | null; // m from this side of the plot to the edge of the street in front of it (older backends do not send it)
  nearestDistance: number; // m from this side of the plot to the nearest building straight in front of it; 300 = none within 300 m
  nearestHeight: number; // m, 0 = none
  useEstimated?: boolean; // true = the use is not known ("غير محدد"): shown as unknown, estimated data
  modelUse?: string; // the use the model takes: the same, or "سكني" when it is not known
  modelAcross?: string;
};

// Estimated data in the indicators of one wall (the page marks its values with a star):
// buildingHeight: no height was entered and GBA has none for the house (or the plot is vacant): 14 m;
// setbacks: a vacant plot's building is drawn from setbacks that rest on an estimated street width or main façade.
export type IndicatorEstimate = { buildingHeight: boolean; setbacks: boolean };

export type FacadeIndicatorsResponse = {
  mainFacade: FacadeDirection;
  mainFacadeEstimated?: boolean; // true = no street runs along the plot (nearest street in front, or longest edge)
  buildingSource: "measured_footprint" | "regulation_envelope" | "user_design";
  buildingHeight: number; // m
  site: {
    summerMaxTemp: number; // °C, mean daily maximum in June–August (EPW temp_air)
    avgHeight: number | null; // m, all neighbouring buildings within 300 m
    maxHeight: number | null; // m, tallest of the neighbours per direction (the neighbours card)
  };
  facades: Record<
    FacadeDirection,
    {
      onStreet: boolean;
      streetWidth: number | null; // m
      radiation: { summer: SeasonRadiation; winter: SeasonRadiation }; // null when no wall faces this way
      shade: { summer: number | null }; // 0..1 = Shade_p / 100, summer (June–August): 0 never shaded, 1 always shaded
      sky: number | null; // 0..1, sky view of the wall (Steger 2022, the dataset's wall_svf)
      wind: { good: number | null; bad: number | null }; // degrees, dataset Wind_block_good / Wind_block_bad
      facadeLength: number | null; // m, dataset facade_length (the house walls facing this way)
      neighbours: FacadeNeighbours; // dataset neighbor_use, across_use, street_*, dist, height
      indicatorsEstimated?: IndicatorEstimate; // what is estimated in this wall's indicators (older backends: none)
    }
  >;
};

// The user's design: the land area (m2) and expected building height (m) they entered.
// The building is calculated from them (null = not given).
export type Design = { area?: number | null; height?: number | null };

// Shared: the analysis page starts it, the results page reuses it (the same plot and the same design).
export function fetchFacadeIndicators(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  design: Design = {},
): Promise<FacadeIndicatorsResponse> {
  const key = `facade:${pointKey(lat, lng)}:${design.area ?? ""}:${design.height ?? ""}`;
  return waitFor(shared(key, () => loadFacadeIndicators(lat, lng, design)), signal);
}

async function loadFacadeIndicators(lat: number, lng: number, design: Design): Promise<FacadeIndicatorsResponse> {
  const request = limited(undefined, 90_000);
  const query = new URLSearchParams({ latitude: String(lat), longitude: String(lng) });
  if (design.area) query.set("area", String(design.area));
  if (design.height) query.set("height", String(design.height));
  try {
    const res = await fetch(`${API_URL}/facade-indicators?${query}`, {
      signal: request.signal,
    });
    if (!res.ok) throw new Error(`Facade indicators request failed (${res.status})`);
    const data = (await res.json()) as FacadeIndicatorsResponse;
    if (!data.facades) throw new Error("Facade indicators response has no facades");
    return data;
  } finally {
    request.done();
  }
}

// Nearest services (mosque, school...) from our backend, same calculation as the dataset.
// Throws on failure so the card can show its own error and a retry button.
// Shared: the analysis page starts it, the results page reuses it.
export function fetchServices(lat: number, lng: number, signal?: AbortSignal): Promise<ServicesResponse> {
  return waitFor(shared(`services:${pointKey(lat, lng)}`, () => loadServices(lat, lng)), signal);
}

async function loadServices(lat: number, lng: number): Promise<ServicesResponse> {
  const request = limited(undefined, 30_000);
  try {
    const res = await fetch(`${API_URL}/services?latitude=${lat}&longitude=${lng}`, {
      signal: request.signal,
    });
    if (!res.ok) throw new Error(`Services request failed (${res.status})`);
    const data = (await res.json()) as ServicesResponse;
    if (!data.services) throw new Error("Services response has no services");
    return data;
  } finally {
    request.done();
  }
}

/* ---------- population density ---------- */

export type DensityResponse = {
  neighborhood: string;
  density: number; // people per km²
  level: "L" | "M" | "H";
};

// Shared: the analysis page starts it, the results page reuses it.
export function fetchDensity(neighborhood: string, signal?: AbortSignal): Promise<DensityResponse> {
  return waitFor(shared(`density:${neighborhood}`, () => loadDensity(neighborhood)), signal);
}

async function loadDensity(neighborhood: string): Promise<DensityResponse> {
  const request = limited(undefined, 30_000);

  try {
    const url =
      `${API_URL}/api/density?neighborhood=${encodeURIComponent(neighborhood)}`;

    const res = await fetch(url, {
      signal: request.signal,
    });

    if (!res.ok) {
      throw new Error(`Density request failed (${res.status})`);
    }

    const data = (await res.json()) as DensityResponse;

    if (
      !Number.isFinite(data.density) ||
      !["L", "M", "H"].includes(data.level)
    ) {
      throw new Error("Invalid density response");
    }

    return data;
  } finally {
    request.done();
  }
}


/* ---------- OpenStreetMap for the diagrams (saved file, backend) ---------- */

// The OpenStreetMap data of the analytical diagrams, from the backend's saved file (riyadh_osm.parquet, updated
// every 6 months), in the same shape Overpass returned: roads and transit, and buildings and land use.
// null when the backend does not answer (the diagram then shows its error and a retry button).
export async function fetchOsmSurroundings(
  lat: number,
  lng: number,
  radius: number,
  signal?: AbortSignal,
): Promise<{ roads: OverpassResult; context: OverpassResult } | null> {
  const request = limited(signal, 60_000);
  try {
    const res = await fetch(`${API_URL}/surroundings?latitude=${lat}&longitude=${lng}&radius=${radius}`, {
      signal: request.signal,
    });
    if (!res.ok) throw new Error(`Surroundings request failed (${res.status})`);
    const data = (await res.json()) as { roads?: OverpassResult; context?: OverpassResult };
    return { roads: data.roads ?? { elements: [] }, context: data.context ?? { elements: [] } };
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn("Surroundings error:", error);
    return null;
  } finally {
    request.done();
  }
}


// Road noise level of the plot (low, medium or high). Our backend measures the distance to the nearest road
// of each class, the same measures as the dataset, and turns them into a level.
// "shop": the level comes from a shop or commercial land within 50 m, not from a road
export type NoiseRoadClass = "motorway" | "arterial" | "main" | "collector" | "local" | "footway" | "rail" | "shop";
export type NoiseResponse = {
  level: "low" | "medium" | "high";
  reason: { class: NoiseRoadClass; distance: number } | null; // the road (or shop) that decided the level
  // per direction, dataset Noise_<d> = R + C (0..2), dist_major_<d>, dist_shop_<d> (1000 = none)
  facades?: Partial<Record<FacadeDirection, { noise: number; road: number; shop: number; distMajor: number; distShop: number }>>;
  distances: Record<string, number | null>; // m, from the road edge; 1000 = none within 1000 m
};

// Shared: the analysis page starts it, the results page reuses it.
export function fetchNoise(lat: number, lng: number, signal?: AbortSignal): Promise<NoiseResponse> {
  return waitFor(shared(`noise:${pointKey(lat, lng)}`, () => loadNoise(lat, lng)), signal);
}

async function loadNoise(lat: number, lng: number): Promise<NoiseResponse> {
  const request = limited(undefined, 60_000);
  try {
    const res = await fetch(`${API_URL}/noise?latitude=${lat}&longitude=${lng}`, { signal: request.signal });
    if (!res.ok) throw new Error(`Noise request failed (${res.status})`);
    const data = (await res.json()) as NoiseResponse;
    if (data.level !== "low" && data.level !== "medium" && data.level !== "high") {
      throw new Error("Noise response has no level");
    }
    return data;
  } finally {
    request.done();
  }
}