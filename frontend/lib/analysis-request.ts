// What the user chose on the plot page, handed to the next page in memory instead of in the link, so it
// cannot be changed by editing the address bar: the analyzing page only runs what the plot page checked.
// It lives as long as the tab (a reload of the analyzing page has nothing, and goes back to the plot page).

export type VillaType = "attachedBoth" | "attachedOne" | "detached";

export type AnalysisRequest = {
  lat: number;
  lng: number;
  area: number; // m2, checked by the plot page (the plot's own area, or a subdivision within the rules)
  height: number | null; // m, null = not entered
  villaType: VillaType;
};

// "New analysis" from a result: the plot page opens with the same plot and villa type already chosen.
export type PlotPrefill = { lat: number; lng: number; villaType: VillaType | null };

let request: AnalysisRequest | null = null;
let prefill: PlotPrefill | null = null;

export function setAnalysisRequest(next: AnalysisRequest) {
  request = next;
}

export function getAnalysisRequest(): AnalysisRequest | null {
  return request;
}

export function clearAnalysisRequest() {
  request = null;
}

export function setPlotPrefill(next: PlotPrefill) {
  prefill = next;
}

// Read once: a later visit to the plot page starts empty.
export function takePlotPrefill(): PlotPrefill | null {
  const value = prefill;
  prefill = null;
  return value;
}

// Test switches in the link ("?demo=..."): only while developing (npm run dev), never on the real site.
export const DEMO_ALLOWED = process.env.NODE_ENV !== "production";