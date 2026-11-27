"""Per-façade indicators for the results page, calculated the same way as the dataset notebook
(DataSet_Phase1.ipynb: "Rad" cell, "Wind block" cell; the shade is new, see below).

Add it to the app in main.py with two lines:
    from facade_indicators_api import router as facade_router
    app.include_router(facade_router)

Endpoint
    GET /facade-indicators?latitude=&longitude=[&height=&area=]
        the plot under the point, its façades, and on each façade: solar radiation, shade, sky view,
        wind shelter (desirable and undesirable wind) and the length of the walls

Same as the notebook
  * the building: the GBA building on the plot (real_house), otherwise the envelope allowed by the
    residential regulations (setbacks 4-1-4 / 4-1-5, neighbour sides >= 1.5 m, coverage <= 75 %, 14 m);
    with the user's design (height / area entered) the envelope is used with the user's height and land area
  * the wall points: a 2 x 2 m grid on every wall, the point in the middle of the square, 10 cm outside the wall
  * the horizon: 72 sectors of 5 degrees, the neighbours (GBA) within 100 m AND the house itself
    (an L-shaped house shades itself), beta = max arctan((H - h) / D) in each sector
  * the direction of a wall: snapped to the house axes (smallest rotated rectangle) + multiples of 45 degrees
  * sky view of the wall: Steger et al. 2022 Eq. 10, 0..1 (1 = nothing blocks the sky)
  * radiation: Rad = sum over the hours (DNI x max(0, cos(az - n) x cos(alt)) x lit + DHI x SVF/2) / 1000,
    kWh/m2 per season (summer = June-August, 92 days; winter = December-February, 90 days),
    lit = the sun is higher than the horizon of its sector; Rad_block (summer) = 1 - sum(Rad) / sum(open),
    open = the same wall with no neighbours (lit = 1, SVF/2 = 0.5)
  * sun position: NREL SPA (pvlib) at the EPW time stamps (no shift, the notebook's timing check)
  * wind: EPW hours classified with ASHRAE 55 adaptive comfort (de Dear & Brager 2002):
    good = 10 <= Tm <= 33.5 and LO <= T <= HI and wind > 0; bad = every other hour with wind;
    Wind_block = sum F(k) w(k) beta(k) / sum F(k) w(k), w = max(0, Cp ratio) (Swami & Chandra 1987), degrees
  * per direction: the mean of the points of the walls that face it (a direction with no wall = null)

New (not in the dataset)
  * shade (summer): Shade_p = 100 x (1 - sum_t sum_i lit_i(t) / (N_p x |T_p|))  [%]
      T_p = the summer hours (June-August) when the sun is up (alt > 0) and in front of the façade
            (cos(az - gamma_p) > 0), gamma_p = the façade's direction (the snapped wall direction)
      lit_i(t) = 1 when alt(t) > beta_i(az(t)), beta_i = the horizon of point i (neighbours within 100 m
            and the house itself), N_p = the points of the façade (2 m grid)
      0 % = never shaded, 100 % = always shaded (Appelbaum & Peled 2026; EnergyPlus Sunlit Fraction).
      The API sends it as a share 0..1 (Shade_p / 100), the unit the results page and the database use.
  * the radiation is also given per day (season total / days of the season), the unit the page shows

Data files (see data/README.txt):
  * EPW weather file   EPW_FILE, default data/*Khalid*.epw (the notebook's file), else any data/*.epw
  * GBA buildings      GBA_FILE, default data/gba_riyadh.parquet (made once with tools/clip_gba.py)
  * parcels, streets   data/riyadh_parcels_all.parquet, data/riyadh_streets.parquet (local_data.py);
                       when a file is missing, the parcels / streets come from ArcGIS as before
"""

from __future__ import annotations

import contextvars
import glob
import json
import os
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
import pvlib
import shapely
import shapely.affinity
from fastapi import APIRouter, HTTPException, Query
from shapely.geometry import LineString, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

import defaults
import local_data

router = APIRouter()

HERE = Path(__file__).parent
ARCGIS = "https://services-ap1.arcgis.com/if9krLUYaMWhxyMO/ArcGIS/rest/services"
PARCELS_URL = f"{ARCGIS}/Riyadh_Parcel/FeatureServer/0/query"
STREETS_URL = f"{ARCGIS}/Streets_NEW/FeatureServer/0/query"
METRIC_SR = 32638  # UTM 38N, meters (same as the notebook)

DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

# ---- façades ("v8")
TOL, MAX_ANGLE, CAND_RADIUS = 3.0, 30, 80
EXCLUDE_CLASS = {"سكة حديد", "طريق مقترح", "نفق", "كوبري"}

# ---- the notebook's constants (Rad / Wind block cells)
RES = 2.0  # m, wall grid (Chatzipoulka et al. 2018)
NSEC = 72  # sectors of 5 degrees
SEARCH = 100.0  # m, neighbours that can block a wall point
OFFSET = 0.10  # m, the point is 10 cm outside its wall
MIN_AREA = 20.0  # m2, smaller GBA shapes are not a house
SEC_C = (np.arange(NSEC) + 0.5) * 360 / NSEC  # middle of each sector
SEASONS = {"Summer": ([6, 7, 8], 92), "Winter": ([12, 1, 2], 90)}
NB_SETBACK, COVER_MAX = 1.5, 0.75  # regulations 4-1-4 and 4-1-1
VACANT_H = defaults.HEIGHT  # m, the height of a vacant plot's building
FALLBACK_R = 50.0  # m, the street in front of a side when no street touches the plot
H_DESIGN = 14.0  # m, the highest height the user can enter

# ---- the neighbours card (not the indicators)
SEARCH_RADIUS = 300.0
IMPUTED_NEIGHBOR_H = defaults.HEIGHT


class DataFileError(RuntimeError):
    """A data file the calculation needs is missing."""



# ------------------------------------------------------------------ requests (ArcGIS)


def _get_json(url: str, params: dict) -> dict:
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=30) as res:
        data = json.load(res)
    if "error" in data:
        raise RuntimeError(data["error"])
    return data


def _ring_signed_area(ring) -> float:
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:])) / 2.0


def esri_to_shapely(geometry: dict | None):
    """Notebook esri_to_shapely: outer rings are clockwise (negative area), holes counter-clockwise."""
    outers, holes = [], []
    for ring in (geometry or {}).get("rings", []):
        if len(ring) < 4:
            continue
        poly = Polygon(ring)
        if not poly.is_valid:
            poly = poly.buffer(0)
        (outers if _ring_signed_area(ring) < 0 else holes).append(poly)
    if not outers:
        return None
    geom = unary_union(outers)
    if holes:
        geom = geom.difference(unary_union(holes))
    return geom if geom.is_valid else geom.buffer(0)


def pick_parcel(point: Point, features: list[dict]):
    """The smallest parcel that really contains the point (the plot that was clicked)."""
    best = None
    for feature in features:
        geom = esri_to_shapely(feature.get("geometry"))
        if geom is None or geom.is_empty or not geom.buffer(0.01).contains(point):
            continue
        if best is None or geom.area < best.area:
            best = geom
    if best is not None and best.geom_type == "MultiPolygon":
        best = max(best.geoms, key=lambda g: g.area)
    return best


# ArcGIS first (the newest data); when it does not answer, the local files (data/, see local_data.py).
# OSError: no connection or timeout; RuntimeError: ArcGIS answered an error; ValueError: a broken answer.
SOURCE_ERRORS = (OSError, RuntimeError, ValueError)
_sources: contextvars.ContextVar[set] = contextvars.ContextVar("sources")


def used_sources() -> list[str]:
    """Where this request's parcels and streets came from: "arcgis", "local" or both."""
    return sorted(_sources.get(set()))


def _note(source: str) -> None:
    got = _sources.get(None)
    if got is None:
        got = set()
        _sources.set(got)
    got.add(source)


def online_or_local(online, local, ready):
    """online() from ArcGIS; if it fails and the local file is there (ready() is not None), local()."""
    try:
        out = online()
        _note("arcgis")
        return out
    except SOURCE_ERRORS as error:
        if ready() is None:
            raise
        print(f"ArcGIS failed ({str(error)[:120]}), using the local file")
        out = local()
        _note("local")
        return out


def fetch_parcel(point: Point):
    """The plot under the point."""
    def online():
        data = _get_json(PARCELS_URL, {
            "geometry": f"{point.x},{point.y}", "geometryType": "esriGeometryPoint", "inSR": METRIC_SR,
            "spatialRel": "esriSpatialRelIntersects", "outFields": "Area", "returnGeometry": "true",
            "outSR": METRIC_SR, "f": "json",
        })
        return pick_parcel(point, data.get("features", []))
    return online_or_local(online, lambda: local_data.parcel_at(point), local_data.parcels)


def fetch_streets(parcel, reach: float = CAND_RADIUS + 20) -> list[dict]:
    """The streets within `reach` m of the plot (all pages)."""
    w, s, e, n = parcel.buffer(reach).bounds

    def online():
        return _get_all(STREETS_URL, {
            "geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope", "inSR": METRIC_SR,
            "spatialRel": "esriSpatialRelIntersects", "where": "1=1",
            "outFields": "STREETWIDTH,STREETCLASS,SUBTYPECLASS,STREETANAME",
            "returnGeometry": "true", "outSR": METRIC_SR, "f": "json",
        })
    return online_or_local(online, lambda: local_data.street_features(shapely.box(w, s, e, n)), local_data.streets)


# ------------------------------------------------------------------ façades ("v8")


def _sec(az: float) -> int:
    return int(((az + 22.5) % 360) // 45)


def _adiff_scalar(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def street_table(features: list[dict]) -> pd.DataFrame:
    rows = []
    for f in features:
        a = f.get("attributes") or {}
        paths = [p for p in (f.get("geometry") or {}).get("paths", []) if len(p) >= 2]
        if not paths:
            continue
        geom = LineString(paths[0]) if len(paths) == 1 else shapely.MultiLineString(paths)
        rows.append({
            "STREETWIDTH": a.get("STREETWIDTH"), "STREETCLASS": a.get("STREETCLASS"),
            "SUBTYPECLASS": a.get("SUBTYPECLASS"), "STREETANAME": a.get("STREETANAME"), "geometry": geom,
        })
    st = pd.DataFrame(rows, columns=["STREETWIDTH", "STREETCLASS", "SUBTYPECLASS", "STREETANAME", "geometry"])
    st["STREETWIDTH"] = pd.to_numeric(st["STREETWIDTH"], errors="coerce")
    st = st[~st["STREETCLASS"].isin(EXCLUDE_CLASS) & ~st["SUBTYPECLASS"].isin(EXCLUDE_CLASS)].copy()
    # a street without a width: the fixed width of its type (defaults.py), else the width of any street
    st["W_DETECT"] = st["STREETWIDTH"].where(st["STREETWIDTH"] > 0)
    st["W_DETECT"] = st["W_DETECT"].fillna(st["SUBTYPECLASS"].astype(str).map(defaults.STREET_WIDTH))
    st["W_DETECT"] = st["W_DETECT"].fillna(defaults.STREET_WIDTH_ANY)
    return st[st["W_DETECT"].notna()].reset_index(drop=True)


def street_dir_at(line, pt: Point) -> float:
    if line.geom_type == "MultiLineString":
        line = min(line.geoms, key=lambda g: g.distance(pt))
    s = line.project(pt)
    a, b = line.interpolate(max(s - 1, 0)), line.interpolate(min(s + 1, line.length))
    return float(np.degrees(np.arctan2(b.x - a.x, b.y - a.y)) % 180)


def facades_for(parcel, st: pd.DataFrame) -> dict:
    """Notebook facades_for (v8), without the nearest main road (not used here)."""
    ring = list(orient(parcel, 1.0).exterior.coords)
    geoms = st["geometry"].to_numpy()
    wdet = st["W_DETECT"].to_numpy(float)
    widths = st["STREETWIDTH"].to_numpy(float)
    classes = st["SUBTYPECLASS"].to_numpy(object)
    names = st["STREETANAME"].to_numpy(object)
    edges = []
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        length = float(np.hypot(dx, dy))
        if length < 0.5:
            continue
        mid = Point((x1 + x2) / 2, (y1 + y2) / 2)
        normal_az = float(np.degrees(np.arctan2(dy, -dx)) % 360)
        edge_dir = float(np.degrees(np.arctan2(dx, dy)) % 180)
        best = None
        if len(geoms):
            dist = shapely.distance(geoms, mid)
            idx = np.nonzero(dist <= CAND_RADIUS)[0]
            resid = dist[idx] - wdet[idx] / 2
            ok = resid <= TOL
            for j in idx[ok][np.argsort(np.abs(resid[ok]))]:
                par = _adiff_scalar(street_dir_at(geoms[j], mid), edge_dir)
                if min(par, 180 - par) <= MAX_ANGLE:
                    best = {"width": widths[j], "class": classes[j], "name": names[j]}
                    break
        edges.append({"len": length, "normal": normal_az, "street": best})
    n = len(edges)
    for i, e in enumerate(edges):
        if e["street"] is None:
            continue
        p, q = edges[(i - 1) % n], edges[(i + 1) % n]
        if p["street"] and q["street"]:
            if 30 <= _adiff_scalar(e["normal"], p["normal"]) <= 60 and 30 <= _adiff_scalar(e["normal"], q["normal"]) <= 60:
                e["chamfer"] = True
    res = {}
    for d in DIRS:
        res[f"facade_{d}"] = 0
        res[f"street_width_{d}"] = 0.0
        res[f"street_class_{d}"] = None
        res[f"street_name_{d}"] = None
    best_len = {d: 0.0 for d in DIRS}
    for e in edges:
        if e["street"] is None or e.get("chamfer"):
            continue
        d = DIRS[_sec(e["normal"])]
        s = e["street"]
        w_new = -1 if np.isnan(s["width"]) else s["width"]
        w_old = -1 if pd.isna(res[f"street_width_{d}"]) else res[f"street_width_{d}"]
        if res[f"facade_{d}"] == 0 or (w_new, e["len"]) > (w_old, best_len[d]):
            res[f"facade_{d}"] = 1
            res[f"street_width_{d}"] = np.nan if np.isnan(s["width"]) else float(s["width"])
            res[f"street_class_{d}"] = s["class"]
            res[f"street_name_{d}"] = s["name"]
            best_len[d] = e["len"]
    res["street_count"] = sum(res[f"facade_{d}"] for d in DIRS)
    res["_edge_len"] = best_len
    return res


def main_facade(parcel, row: dict, streets=None) -> tuple[str, bool]:
    """The façade on the widest street (then the longest edge). With no street along the plot, as the dataset
    (nearest_front_street): the side with the nearest street in front of it within 50 m; else the longest edge.
    Returns (direction, estimated): estimated = no street runs along the plot (the same as the website)."""
    on_street = [d for d in DIRS if row[f"facade_{d}"] == 1]
    if on_street:
        def key(d):
            w = row[f"street_width_{d}"]
            return (w if pd.notna(w) else -1, row["_edge_len"][d])
        return max(on_street, key=key), False
    if streets is not None:
        _, sides = parcel_sides(parcel, streets)
        if any(s["street"] is not None for s in sides) or nearest_front_street(sides, streets):
            front = max((s for s in sides if s["street"] is not None), key=lambda s: (s["width"], s["length"]))
            return DIRS[_sec(float(front["nz"]))], True
    ring = np.asarray(orient(parcel, 1.0).exterior.coords)
    best = max(zip(ring[:-1], ring[1:]), key=lambda e: np.hypot(*(e[1] - e[0])))
    (x1, y1), (x2, y2) = best
    return DIRS[_sec(float(np.degrees(np.arctan2(y2 - y1, -(x2 - x1))) % 360))], True




def _get_all(url: str, params: dict, page: int = 2000) -> list[dict]:
    """All the features of an ArcGIS query, page by page (a layer sends at most `page` at a time)."""
    feats, offset = [], 0
    while True:
        data = _get_json(url, {**params, "resultOffset": offset, "resultRecordCount": page})
        got = data.get("features", [])
        feats += got
        if not data.get("exceededTransferLimit") or not got:
            return feats
        offset += len(got)


# ------------------------------------------------------------------ data files


def _find(patterns: list[str]) -> str | None:
    for pattern in patterns:
        hits = sorted(glob.glob(str(HERE / "data" / pattern)))
        if hits:
            return hits[0]
    return None


def epw_path() -> str:
    """The notebook's EPW: King Khalid airport TMYx (the file with "Khalid" in its name), else the first .epw."""
    path = os.environ.get("EPW_FILE") or _find(["*Khalid*.epw", "*.epw"])
    if not path or not Path(path).exists():
        raise DataFileError("EPW weather file not found (data/*Khalid*.epw)")
    return path


@lru_cache(maxsize=1)
def epw_data() -> dict:
    """Notebook: sun position (NREL SPA) at the EPW time stamps, no shift (timing check: offset 0 gives the
    lowest closure error GHI = DNI sin(alt) + DHI), the hours of each season, and the wind hours."""
    epw, meta = pvlib.iotools.read_epw(epw_path())
    tm = epw.index
    sp = pvlib.solarposition.get_solarposition(tm, meta["latitude"], meta["longitude"])
    alt, az = sp["apparent_elevation"].to_numpy(float), sp["azimuth"].to_numpy(float)
    dni, dhi = epw["dni"].to_numpy(float), epw["dhi"].to_numpy(float)
    seasons = {}
    for name, (months, days) in SEASONS.items():
        m = np.isin(tm.month, months)
        seasons[name] = dict(alt=alt[m], az=az[m], dni=dni[m], dhi=dhi[m], days=days)

    # wind: each hour classified with the ASHRAE 55 adaptive model (de Dear & Brager 2002)
    T, WS = epw["temp_air"].to_numpy(float), epw["wind_speed"].to_numpy(float)
    WD = epw["wind_direction"].to_numpy(float) % 360  # the direction the wind comes FROM (360 = 0)
    month = tm.month
    Tm = pd.Series(T).groupby(np.asarray(month)).transform("mean").to_numpy()  # mean of the month's hours
    lo, hi = 0.31 * Tm + 14.3, 0.31 * Tm + 21.3  # 80 % acceptability
    apply = (Tm >= 10) & (Tm <= 33.5)  # where the model applies
    windy = WS > 0  # calm hours have no direction
    good = apply & (T >= lo) & (T <= hi) & windy
    bad = ~good & windy
    k = sec_of(WD)
    wind = {"good": np.bincount(k[good], minlength=NSEC) / len(T),  # F(k) = hours / 8760
            "bad": np.bincount(k[bad], minlength=NSEC) / len(T)}
    daily_max = epw["temp_air"].resample("D").max()
    summer_max = round(float(daily_max[daily_max.index.month.isin([6, 7, 8])].mean()), 1)
    return {"seasons": seasons, "wind": wind, "summer_max": summer_max}


def summer_max_temperature() -> float:
    """Mean daily maximum air temperature in June-August (EPW temp_air), deg C; one value for Riyadh."""
    return epw_data()["summer_max"]


@lru_cache(maxsize=1)
def gba_raw():
    """All the GBA buildings as the notebook reads them (EPSG:32638, the height as it is, NaN when missing)."""
    import geopandas as gpd

    path = os.environ.get("GBA_FILE") or str(HERE / "data" / "gba_riyadh.parquet")
    if not Path(path).exists():
        raise DataFileError("GBA buildings file not found (data/gba_riyadh.parquet, see tools/clip_gba.py)")
    gba = gpd.read_parquet(path)
    if gba.crs is None:
        gba = gba.set_crs(4326)
    gba = gba.to_crs(METRIC_SR)
    gba = gba[gba.geometry.notna() & ~gba.geometry.is_empty].reset_index(drop=True)
    hcol = next(c for c in gba.columns if "height" in c.lower())
    geoms = gba.geometry.to_numpy()
    return geoms, pd.to_numeric(gba[hcol], errors="coerce").to_numpy(float), shapely.STRtree(geoms)


@lru_cache(maxsize=1)
def gba_buildings():
    """For the neighbours card (unchanged): height < 2 m left out, no height -> 14 m (height_raw keeps it empty)."""
    geoms, h, _ = gba_raw()
    raw = np.where(h > 0, h, np.nan)
    keep = ~(raw < 2.0)
    g, raw = geoms[keep], raw[keep]
    return g, np.where(np.isnan(raw), IMPUTED_NEIGHBOR_H, raw), raw, shapely.STRtree(g)


# ------------------------------------------------------------------ notebook helpers


def sec_of(az):
    return (np.asarray(az) // (360 / NSEC)).astype(int) % NSEC


def dir8(az: float) -> str:
    return DIRS[int(((az + 22.5) % 360) // 45)]


def adiff(a, b):
    return np.abs((np.asarray(a) - b + 180) % 360 - 180)


def house_axis(E) -> float:
    """The house's main direction = its smallest rotated rectangle (SMBR, Duchêne et al. 2003); repeats every 90°."""
    R = np.asarray(shapely.minimum_rotated_rectangle(E).exterior.coords)
    (x0, y0), (x1, y1) = R[0], R[1]
    return float(np.degrees(np.arctan2(x1 - x0, y1 - y0)) % 90)


def snapped_az(nz, axis: float) -> np.ndarray:
    """Each wall's direction snapped to the house axes + multiples of 45° (parallel walls get the same one)."""
    return (axis + np.round((np.asarray(nz) - axis) / 45) * 45) % 360


def wall_dir(nz, axis: float) -> list[str]:
    return [dir8(a) for a in snapped_az(nz, axis)]


# ------------------------------------------------------------------ the plot's sides and the building


def street_arrays(features: list[dict]):
    """The streets around the plot as the notebook uses them: every class, the width = STREETWIDTH (> 0),
    else the fixed width of its type (defaults.py), else the width of any street."""
    g, w, c = [], [], []
    for f in features:
        a = f.get("attributes") or {}
        paths = [p for p in (f.get("geometry") or {}).get("paths", []) if len(p) >= 2]
        if not paths:
            continue
        g.append(LineString(paths[0]) if len(paths) == 1 else shapely.MultiLineString(paths))
        w.append(a.get("STREETWIDTH"))
        c.append(str(a.get("SUBTYPECLASS")))
    st = pd.DataFrame({"W": pd.to_numeric(pd.Series(w, dtype=object), errors="coerce"), "C": c})
    st["W"] = st["W"].where(st["W"] > 0)
    st["W"] = st["W"].fillna(st["C"].map(defaults.STREET_WIDTH)).fillna(defaults.STREET_WIDTH_ANY)
    geoms = np.array(g, dtype=object)
    return geoms, st["W"].to_numpy(float), st["C"].to_numpy(object), shapely.STRtree(geoms) if len(g) else None


def _line_dir(line, pt) -> float:
    if line.geom_type == "MultiLineString":
        line = min(line.geoms, key=lambda q: q.distance(pt))
    s = line.project(pt)
    a, b = line.interpolate(max(s - 1, 0)), line.interpolate(min(s + 1, line.length))
    return float(np.degrees(np.arctan2(b.x - a.x, b.y - a.y)) % 180)


def parcel_sides(P, streets):
    """Notebook parcel_sides: each side of the plot and the street that touches it (edge <= 3 m, <= 30°)."""
    ST_G, ST_W, ST_C, tree = streets
    if P.geom_type == "MultiPolygon":
        P = max(P.geoms, key=lambda g: g.area)
    ring = np.asarray(orient(P, 1.0).exterior.coords)
    sides = []
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        L = np.hypot(dx, dy)
        if L < 0.5:
            continue
        seg = LineString([(x1, y1), (x2, y2)])
        mid = seg.interpolate(0.5, normalized=True)
        nz = np.degrees(np.arctan2(dy, -dx)) % 360
        edir = np.degrees(np.arctan2(dx, dy)) % 180
        street = None
        idx = tree.query(mid.buffer(CAND_RADIUS)) if tree is not None else []
        if len(idx):
            resid = shapely.distance(ST_G[idx], mid) - ST_W[idx] / 2
            for j in idx[np.argsort(np.abs(resid))]:
                if shapely.distance(ST_G[j], mid) - ST_W[j] / 2 > TOL:
                    break
                par = float(adiff(_line_dir(ST_G[j], mid), edir))
                if min(par, 180 - par) <= MAX_ANGLE:
                    street = j
                    break
        sides.append(dict(seg=seg, nz=nz, length=L, street=street,
                          width=ST_W[street] if street is not None else np.nan,
                          cls=ST_C[street] if street is not None else None))
    return P, sides


def setback(width, cls, is_main) -> float:
    """Regulations 4-1-4 and 4-1-5 (page 17)."""
    cls = cls if isinstance(cls, str) else ""
    w = width if pd.notna(width) and width > 0 else 0
    if "ممر" in cls:
        return 1.5
    if "ساح" in cls or "ميد" in cls:
        return max(3.0, w / 5)
    if is_main:
        return 6.0 if w >= 30 else max(3.0, w / 5)
    return max(2.0, w / 5)


def nearest_front_street(sides, streets) -> bool:
    """No street touches the plot: the side with the nearest street in front of it (to the street's edge)."""
    ST_G, ST_W, ST_C, tree = streets
    if tree is None:
        return False
    best = None
    for s in sides:
        mid = s["seg"].interpolate(0.5, normalized=True)
        nx, ny = np.sin(np.radians(s["nz"])), np.cos(np.radians(s["nz"]))
        for j in tree.query(mid.buffer(FALLBACK_R)):
            q = ST_G[j].interpolate(ST_G[j].project(mid))
            vx, vy = q.x - mid.x, q.y - mid.y
            dist = np.hypot(vx, vy)
            if dist > 0 and (vx * nx + vy * ny) / dist < np.cos(np.radians(60)):
                continue  # the street is not in front of this side
            edge = max(dist - ST_W[j] / 2, 0)
            if edge <= FALLBACK_R and (best is None or edge < best[0]):
                best = (edge, s, j)
    if best is None:
        return False
    _, s, j = best
    s.update(street=j, width=ST_W[j], cls=ST_C[j])
    return True


def _largest(geom):
    return max(geom.geoms, key=lambda g: g.area) if geom.geom_type == "MultiPolygon" else geom


def envelope(P, sides, streets, land_area: float | None = None):
    """Notebook envelope: the plot minus the setbacks (streets by 4-1-4/4-1-5, neighbours 1.5 m), then the
    neighbour setback grows until the building covers at most 75 %. land_area (website): the user's land
    area replaces the plot's area in the 75 % rule (the notebook has no user input)."""
    st = [s for s in sides if s["street"] is not None]
    if not st and nearest_front_street(sides, streets):
        st = [s for s in sides if s["street"] is not None]
    main = max(st, key=lambda s: (s["width"], s["length"])) if st else None
    cut, nb = [], []
    for s in sides:
        if s["street"] is not None:
            s["setback"] = setback(s["width"], s["cls"], s is main)
        else:
            s["setback"] = NB_SETBACK
            nb.append(s["seg"])
        cut.append(s["seg"].buffer(s["setback"], cap_style=3))
    E = _largest(P.difference(shapely.union_all(cut)))
    if E.is_empty or E.area < 0.2 * P.area:
        E = P
    target = COVER_MAX * (land_area if land_area and land_area > 0 else P.area)
    if E.area > target and nb:
        nbu = shapely.union_all(nb)
        lo, hi = NB_SETBACK, NB_SETBACK + 10
        for _ in range(25):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if _largest(E.difference(nbu.buffer(mid, cap_style=3))).area > target else (lo, mid)
        E = _largest(E.difference(nbu.buffer(hi, cap_style=3)))
    if land_area and E.area > target * 1.01:
        # website only: still larger than 75 % of the user's land (no neighbour side, or a much smaller
        # land area than the plot): shrink it evenly around its centre
        E = shapely.affinity.scale(E, *(2 * [float(np.sqrt(target / E.area))]), origin="centroid")
    return E


def real_house(P, gba):
    """Notebook real_house: the GBA buildings that make the plot's house, and their indices."""
    G, H, tree = gba
    idx = tree.query(P.buffer(5), predicate="intersects")
    if len(idx) == 0:
        return None, np.zeros(0, int)
    g = G[idx]
    pc = P.centroid if P.contains(P.centroid) else P.representative_point()
    area = shapely.area(g)
    inter = shapely.area(shapely.intersection(g, P))
    frac = np.divide(inter, area, out=np.zeros_like(area), where=area > 0)
    site = (shapely.within(shapely.centroid(g), P) | (frac >= 0.5) | shapely.contains(g, pc)
            | (shapely.distance(g, pc) <= 2.0))
    if not site.any():
        return None, np.zeros(0, int)
    E = _largest(shapely.union_all(g[site]).intersection(P.buffer(1.0)))
    return (E, idx[site]) if (not E.is_empty and E.area >= MIN_AREA) else (None, idx[site])


AREA_TOL = 1.0  # m2: an entered land area within 1 m2 of the plot's area is the plot's own (not changed)


def _shrink_to(E, target: float):
    """The house pulled in by the same distance on every side (its shape kept) until its area is at most
    target; when that would break it apart, shrunk evenly around its centre instead."""
    lo, hi = 0.0, 0.5 * np.sqrt(E.area)
    for _ in range(30):
        mid = (lo + hi) / 2
        part = _largest(E.buffer(-mid, join_style="mitre"))
        lo, hi = (mid, hi) if (not part.is_empty and part.area > target) else (lo, mid)
    out = _largest(E.buffer(-hi, join_style="mitre"))
    if out.is_empty or out.area < 0.5 * target:
        out = shapely.affinity.scale(E, *(2 * [float(np.sqrt(target / E.area))]), origin="centroid")
    return out


def house_of(P, sides, streets, gba, height: float | None = None, land_area: float | None = None):
    """The building and the GBA indices that are not neighbours.
    A built plot (a GBA house on it): the house as it stands. The user's height replaces its GBA height (else
    the GBA height); a land area the user changed keeps its shape but pulls its walls in until it covers at most
    75 % of that area (a house already within 75 % stays as it is).
    A vacant plot: the envelope (setbacks, 75 % of the land area) at the user's height, else 14 m.
    Without user input this is the notebook (the GBA house, else the envelope at 14 m)."""
    G, H, tree = gba
    E0, site_idx = real_house(P, gba)
    if E0 is not None:
        h = H[site_idx]
        h = h[np.isfinite(h) & (h > 0)]
        Hb = float(height) if height else (float(h.max()) if len(h) else VACANT_H)
        E = E0
        if land_area and abs(land_area - P.area) > AREA_TOL and E.area > COVER_MAX * land_area:
            E = _shrink_to(E, COVER_MAX * land_area)
        return E, Hb, site_idx, "measured_footprint"
    E = envelope(P, sides, streets, land_area)
    return E, float(height or VACANT_H), np.union1d(site_idx, tree.query(E, predicate="intersects")), \
        "regulation_envelope"


# ------------------------------------------------------------------ wall points, horizon, sky view


def facade_points(E, Hb):
    """Notebook facade_points: 2 x 2 m squares on every wall, the point in the middle, 10 cm outside."""
    hs = np.arange(RES / 2, Hb, RES) if Hb > RES else np.array([Hb / 2])
    ring = np.asarray(orient(E, 1.0).exterior.coords)
    X, Y, Z, NZ = [], [], [], []
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        L = np.hypot(dx, dy)
        if L < 1.0:
            continue
        nx, ny = dy / L, -dx / L  # outward normal
        n = max(1, int(round(L / RES)))
        t = (np.arange(n) + 0.5) / n
        px, py = x1 + t * dx + nx * OFFSET, y1 + t * dy + ny * OFFSET
        nz = np.degrees(np.arctan2(nx, ny)) % 360
        for h in hs:
            X.append(px)
            Y.append(py)
            Z.append(np.full(n, h))
            NZ.append(np.full(n, nz))
    return np.concatenate(X), np.concatenate(Y), np.concatenate(Z), np.concatenate(NZ)


def obstacles(E, Hb, site_idx, gba):
    """Notebook obstacles: the neighbours within 100 m + the house itself, their outlines in points close
    enough to fall in every 5° sector (step = 0.04 x the distance to our walls, 0.05..4 m)."""
    G, H, tree = gba
    idx = tree.query(E.buffer(SEARCH + 5), predicate="intersects")
    idx = idx[~np.isin(idx, site_idx)]
    idx = idx[np.isfinite(H[idx]) & (H[idx] > 0)]
    geoms = np.concatenate([G[idx], np.array([E], dtype=object)])
    hts = np.append(H[idx], Hb)
    D0 = np.maximum(shapely.distance(geoms, E.exterior), 0.5)
    step = np.clip(D0 * 0.04, 0.05, 4.0)
    xy, k = shapely.get_coordinates(shapely.segmentize(shapely.boundary(geoms), step), return_index=True)
    return xy[:, 0], xy[:, 1], hts[k]


def horizon(px, py, ph, ox, oy, oh, chunk: int = 40):
    """beta for each point x 72 sectors: the largest arctan((H - h) / D) in the sector within 100 m (0 if lower)."""
    beta = np.zeros((len(px), NSEC))
    for a in range(0, len(px), chunk):
        b_ = slice(a, a + chunk)
        dx = ox[None, :] - px[b_, None]
        dy = oy[None, :] - py[b_, None]
        D = np.hypot(dx, dy)
        dH = oh[None, :] - ph[b_, None]
        r, c = np.nonzero((D > 0.01) & (D <= SEARCH) & (dH > 0))
        np.maximum.at(beta, (r + a, sec_of(np.degrees(np.arctan2(dx[r, c], dy[r, c])) % 360)),
                      np.degrees(np.arctan2(dH[r, c], D[r, c])))
    return beta


def wall_svf(beta, nz):
    """Steger et al. 2022 Eq. 10: SVF = sum(w t) / sum(w), 0..1;
    w = max(0, cos(phi - n)), t = (pi/2 - beta - sin(beta) cos(beta)) / (pi/2)."""
    w = np.clip(np.cos(np.radians(SEC_C[None, :] - nz[:, None])), 0, None)
    b = np.radians(beta)
    t = (np.pi / 2 - b - np.sin(b) * np.cos(b)) / (np.pi / 2)
    return (w * t).sum(1) / w.sum(1)


# ------------------------------------------------------------------ the indicators


def radiation(beta, nz, svf_raw, S):
    """Notebook radiation: kWh/m2 for the season at each point, and the same wall with no neighbours."""
    up = S["alt"] > 0
    alt, az, dni, dhi = S["alt"][up], S["az"][up], S["dni"][up], S["dhi"][up]
    inc = np.clip(np.cos(np.radians(az[None, :] - nz[:, None])) * np.cos(np.radians(alt[None, :])), 0, None)
    lit = alt[None, :] > beta[:, sec_of(az)]  # the sun is higher than the horizon of its sector
    direct = dni[None, :] * inc
    rad = ((direct * lit).sum(1) + dhi.sum() * svf_raw) / 1000
    opn = (direct.sum(1) + dhi.sum() * 0.5) / 1000
    return rad, opn


def shade_pct(beta, gamma_p: float, S) -> float:
    """Shade_p = 100 x (1 - sum_t sum_i lit_i(t) / (N_p |T_p|)), T_p = summer hours with alt > 0 and
    cos(az - gamma_p) > 0. NaN when the sun never faces the façade."""
    T = (S["alt"] > 0) & (np.cos(np.radians(S["az"] - gamma_p)) > 0)
    if not T.any():
        return np.nan
    alt, az = S["alt"][T], S["az"][T]
    lit = alt[None, :] > beta[:, sec_of(az)]
    return float(100 * (1 - lit.mean()))


def cp_ratio(alpha, G):
    """Wind pressure on the wall relative to the direct wind, Swami & Chandra 1987 (FSEC-CR-163-86).
    alpha = the wind's angle on the wall (0 = straight on), G = ln(wall length / the adjacent wall's length)."""
    a = np.radians(alpha)
    arg = (1.248 - 0.703 * np.sin(a / 2) - 1.175 * np.sin(a) ** 2 - 0.131 * np.sin(2 * a * G) ** 3
           + 0.769 * np.cos(a / 2) + 0.071 * G ** 2 * np.sin(a / 2) ** 2 + 0.717 * np.cos(a / 2) ** 2)
    return np.log(np.clip(arg, 1e-9, None))


def wall_G(nz, E):
    """G per point from the house's smallest rectangle: a wall along the long side gets ln(long/short), and back."""
    R = np.asarray(shapely.minimum_rotated_rectangle(E).exterior.coords)
    e1, e2 = R[1] - R[0], R[2] - R[1]
    L1, L2 = np.linalg.norm(e1), np.linalg.norm(e2)
    az1 = np.degrees(np.arctan2(e1[0], e1[1])) % 180
    dd = adiff(nz, az1) % 180
    dd = np.minimum(dd, 180 - dd)
    return np.where(dd < 45, np.log(L2 / L1), np.log(L1 / L2))


def wind_block(B, nz, G, Fk):
    """Wind_block = sum F(k) w(k) beta(k) / sum F(k) w(k), w = max(0, Cp/Cp0); NaN when no wind hits the wall."""
    alpha = adiff(SEC_C[None, :], nz[:, None])
    W = Fk[None, :] * np.clip(cp_ratio(alpha, G[:, None]), 0, None)
    den = W.sum(1)
    return np.divide((W * B).sum(1), den, out=np.full(len(nz), np.nan), where=den > 0)


def plot_facades(P):
    """The plot's four façades as the page shows them (mainFacades in the frontend): the four directions
    (dir8 of each side's outward normal) with the longest sides, each with the mean normal of its sides.
    The page measures from true north and these metres are UTM: the grid is turned by the meridian convergence
    (about 0.7° in Riyadh), added here so that a side near the border of two directions falls as on the page."""
    from pyproj import Transformer

    lon, lat = Transformer.from_crs(METRIC_SR, 4326, always_xy=True).transform(P.centroid.x, P.centroid.y)
    gamma = (lon - 45.0) * np.sin(np.radians(lat))  # UTM zone 38N: central meridian 45° E
    ring = np.asarray(orient(P, 1.0).exterior.coords)
    length, vec = {}, {}
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        L = float(np.hypot(dx, dy))
        if L < 0.5:
            continue
        nx, ny = dy / L, -dx / L
        d = dir8(float(np.degrees(np.arctan2(nx, ny)) + gamma) % 360)
        length[d] = length.get(d, 0.0) + L
        vx, vy = vec.get(d, (0.0, 0.0))
        vec[d] = (vx + nx * L, vy + ny * L)
    top = sorted(length, key=length.get, reverse=True)[:4]
    return np.array([np.degrees(np.arctan2(*vec[d])) % 360 for d in top]), np.array(top, dtype=object)


def facade_of(nz, facades) -> np.ndarray:
    """Each wall's façade: the plot façade whose direction is closest to the wall's (so the walls of a house
    drawn a little turned from its plot still belong to the façades the page shows)."""
    normals, names = facades
    nz = np.atleast_1d(np.asarray(nz, dtype=float))
    return names[np.argmin(adiff(nz[:, None], normals[None, :]), axis=1)]


def wall_lengths(E, axis: float, facades=None) -> dict:
    """Notebook (noise cell) facade_length: the length of the house walls facing each direction (m)."""
    ring = np.asarray(orient(E, 1.0).exterior.coords)
    out: dict[str, float] = {}
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        L = float(np.hypot(dx, dy))
        if L < 1.0:
            continue
        a = np.degrees(np.arctan2(dy / L, -dx / L)) % 360
        d = facade_of(a, facades)[0] if facades is not None else wall_dir([a], axis)[0]
        out[d] = out.get(d, 0.0) + L
    return out


def indicators_for(P, streets, height: float | None = None, land_area: float | None = None) -> dict:
    """All the façade indicators of one plot, per direction (only the directions that have a wall)."""
    gba = gba_raw()
    ep = epw_data()
    S = ep["seasons"]
    P1, sides = parcel_sides(P, streets)
    E, Hb, site_idx, source = house_of(P1, sides, streets, gba, height, land_area)
    px, py, ph, nz = facade_points(E, Hb)
    ox, oy, oh = obstacles(E, Hb, site_idx, gba)
    B = horizon(px, py, ph, ox, oy, oh)
    svf = wall_svf(B, nz)
    rs, opn = radiation(B, nz, svf / 2, S["Summer"])  # / 2: a vertical wall sees at most half the sky
    rw, _ = radiation(B, nz, svf / 2, S["Winter"])
    axis = house_axis(E)
    snap = snapped_az(nz, axis)
    # the façade of each wall point: the plot's façade it faces (as the page shows them), not the house's own
    # axis, so that a GBA house turned a little from its plot keeps the same four façades as the plot
    facades = plot_facades(P1)
    dirs = facade_of(nz, facades)
    G = wall_G(nz, E)
    wg = wind_block(B, nz, G, ep["wind"]["good"])
    wb = wind_block(B, nz, G, ep["wind"]["bad"])
    lengths = wall_lengths(E, axis, facades)

    def mean(v):
        v = v[np.isfinite(v)]
        return float(v.mean()) if len(v) else np.nan

    out = {}
    for d in DIRS:
        m = dirs == d
        if not m.any():
            continue
        vals, cnt = np.unique(np.round(snap[m], 6), return_counts=True)
        out[d] = {
            "Rad_summer": float(rs[m].mean()),
            "Rad_winter": float(rw[m].mean()),
            "Rad_block": float(1 - rs[m].sum() / opn[m].sum()),
            "Shade": shade_pct(B[m], float(vals[np.argmax(cnt)]), S["Summer"]),
            "SVF": float(svf[m].mean()),
            "Wind_block_good": mean(wg[m]),
            "Wind_block_bad": mean(wb[m]),
            "facade_length": lengths.get(d, np.nan),
        }
    # estimated data: our own height when the user did not enter one and GBA has none (or the plot is vacant): 14 m
    own_h = gba[1][site_idx]
    height_est = not height and (source == "regulation_envelope" or not np.any(np.isfinite(own_h) & (own_h > 0)))
    return {"by_dir": out, "building": E, "building_height": Hb, "building_source": source,
            "est_height": bool(height_est),
            "days": {k: v["days"] for k, v in S.items()}}


# ------------------------------------------------------------------ neighbours (notebook: land use level 1 + nearest building)

MIN_EDGE, OUT_STEP, ACROSS_MAX = 2.0, 1.5, 150  # m, same as the notebook (level1)
TOUCH_TOL, SITE_OVERLAP, COVER_THRESHOLD = 0.05, 0.5, 0.10  # same as the notebook (compute_fixed)


def fetch_parcels_around(parcel) -> tuple[np.ndarray, np.ndarray]:
    """The Riyadh parcels around the plot (geometry + ParcelSub), for the adjoining and across land use."""
    w, s, e, n = parcel.buffer(ACROSS_MAX + 10).bounds

    def online():
        geoms, subs = [], []
        for f in _get_all(PARCELS_URL, {
            "geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope", "inSR": METRIC_SR,
            "spatialRel": "esriSpatialRelIntersects", "where": "1=1", "outFields": "ParcelSub",
            "returnGeometry": "true", "outSR": METRIC_SR, "f": "json",
        }):
            g = esri_to_shapely(f.get("geometry"))
            if g is not None and not g.is_empty:
                geoms.append(g)
                subs.append((f.get("attributes") or {}).get("ParcelSub") or "غير محدد")
        return np.array(geoms, dtype=object), np.array(subs, dtype=object)

    def local():
        g, sub = local_data.parcels_in(shapely.box(w, s, e, n))
        return g, np.array([x or "غير محدد" for x in sub], dtype=object)
    return online_or_local(online, local, local_data.parcels)


def land_use_level1(P, ap_g: np.ndarray, ap_sub: np.ndarray) -> dict:
    """Notebook level1: for each edge, the adjoining parcel's use, or "شارع" and the parcel across the street."""
    tree = shapely.STRtree(ap_g) if len(ap_g) else None
    self_i = -1
    if tree is not None:
        idx = tree.query(P, predicate="intersects")
        if len(idx):
            iou = shapely.area(shapely.intersection(ap_g[idx], P)) / shapely.area(shapely.union(ap_g[idx], P))
            k = int(np.argmax(iou))
            self_i = int(idx[k]) if iou[k] > 0.8 else -1

    def parcel_at(pts):
        out = np.full(len(pts), -1)
        if tree is None:
            return out
        pi, gi = tree.query(pts, predicate="within")
        for p, g in zip(pi, gi):
            if g != self_i and out[p] == -1:
                out[p] = g
        return out

    ring = np.asarray(orient(P, 1.0).exterior.coords)
    best = {}
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        L = np.hypot(dx, dy)
        if L < MIN_EDGE:
            continue
        nx, ny = dy / L, -dx / L
        d = DIRS[_sec(np.degrees(np.arctan2(nx, ny)) % 360)]
        t = np.linspace(0.15, 0.85, 7)
        bx, by = x1 + t * dx, y1 + t * dy
        hits = parcel_at(shapely.points(bx + nx * OUT_STEP, by + ny * OUT_STEP))
        if (hits >= 0).sum() >= 4:
            vals, cnt = np.unique(hits[hits >= 0], return_counts=True)
            nb, ac = ap_sub[vals[np.argmax(cnt)]], "لا يوجد"
        else:
            nb, ac = "شارع", "لا يوجد"
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            steps = np.arange(OUT_STEP + 1, ACROSS_MAX + 1, 1.0)
            h = parcel_at(shapely.points(mx + nx * steps, my + ny * steps))
            if (h >= 0).any():
                ac = ap_sub[h[np.argmax(h >= 0)]]
        if d not in best or L > best[d][0]:
            best[d] = (L, nb, ac)
    out = {}
    for d in DIRS:
        _, nb, ac = best.get(d, (0, "لا يوجد", "لا يوجد"))
        out[f"neighbor_use_{d}"], out[f"across_use_{d}"] = nb, ac
    return out


def neighbour_heights(P, buildings) -> float | None:
    """Mean height of the neighbouring buildings within 300 m of the plot (the plot's own building left out,
    the same buildings as the nearest neighbours; a building with no GBA height counts as 14 m, as in the dataset)."""
    G_ALL, H_ALL, _, tree = buildings
    pc = P.centroid if P.contains(P.centroid) else P.representative_point()
    idx = tree.query(P.buffer(SEARCH_RADIUS), predicate="intersects")
    g, h = G_ALL[idx], H_ALL[idx]
    if not len(g):
        return None
    area = shapely.area(g)
    inter = shapely.area(shapely.intersection(g, P))
    frac = np.divide(inter, area, out=np.zeros_like(area), where=area > 0)
    is_site = shapely.within(shapely.centroid(g), P) | (frac >= SITE_OVERLAP) | shapely.contains(g, pc)
    cover = inter / P.area
    if not is_site.any() and cover.max() > COVER_THRESHOLD:
        is_site[np.argmax(cover)] = True
    keep = (~is_site) & (h > 0) & (shapely.distance(g, P) <= SEARCH_RADIUS)
    return round(float(h[keep].mean()), 1) if keep.any() else None


def nearest_buildings(P, buildings) -> dict:
    """Notebook compute_fixed, nearest neighbour per direction: from the plot boundary, within 300 m
    (dist_<dir> = 300 and height_<dir> = 0 when there is none)."""
    G_ALL, H_ALL, _, tree = buildings
    out = {}
    for d in DIRS:
        out[f"dist_{d}"], out[f"height_{d}"] = float(SEARCH_RADIUS), 0.0
    pc = P.centroid if P.contains(P.centroid) else P.representative_point()
    idx = tree.query(P.buffer(SEARCH_RADIUS), predicate="intersects")
    g, h = G_ALL[idx], H_ALL[idx]
    if not len(g):
        return out
    area = shapely.area(g)
    inter = shapely.area(shapely.intersection(g, P))
    frac = np.divide(inter, area, out=np.zeros_like(area), where=area > 0)
    is_site = shapely.within(shapely.centroid(g), P) | (frac >= SITE_OVERLAP) | shapely.contains(g, pc)
    cover = inter / P.area
    if not is_site.any() and cover.max() > COVER_THRESHOLD:
        is_site[np.argmax(cover)] = True
    nb = (~is_site) & (h > 0)
    gn, hn = g[nb], h[nb]
    if not len(gn):
        return out
    db = shapely.distance(gn, P)
    line = shapely.shortest_line(P, gn)
    s0, e0 = shapely.get_point(line, 0), shapely.get_point(line, 1)
    dx = shapely.get_x(e0) - shapely.get_x(s0)
    dy = shapely.get_y(e0) - shapely.get_y(s0)
    touch = db <= TOUCH_TOL
    c, pcen = shapely.centroid(gn), P.centroid
    dx = np.where(touch, shapely.get_x(c) - pcen.x, dx)
    dy = np.where(touch, shapely.get_y(c) - pcen.y, dy)
    sec = ((np.degrees(np.arctan2(dx, dy)) % 360 + 22.5) % 360 // 45).astype(int)
    within = db <= SEARCH_RADIUS
    for k, d in enumerate(DIRS):
        m = within & (sec == k)
        if m.any():
            j = np.flatnonzero(m)[np.argmin(db[m])]
            out[f"dist_{d}"] = round(float(db[j]), 2)
            out[f"height_{d}"] = round(float(hn[j]), 1)
    return out


# ------------------------------------------------------------------ neighbours card (per side of the plot)

NEIGHBOUR_RADIUS = 300.0  # m in front of a side
CORNER_GAP = 0.5  # m, the dataset noise cell


def _sides(parcel, d: str) -> list:
    """The sides of the plot boundary that face direction d, with each side's outward normal (unit)."""
    p = max(parcel.geoms, key=lambda g: g.area) if parcel.geom_type == "MultiPolygon" else parcel
    ring = list(orient(p, 1.0).exterior.coords)
    out = []
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        length = float(np.hypot(dx, dy))
        if length < 0.5:
            continue
        nx, ny = dy / length, -dx / length  # outward normal
        if DIRS[_sec(float(np.degrees(np.arctan2(nx, ny)) % 360))] == d:
            out.append(((x1, y1), (x2, y2), nx, ny))
    return out


def _corridor(a, b, nx, ny, reach: float) -> Polygon:
    """The area straight in front of a side (perpendicular to it), up to `reach` metres."""
    return Polygon([a, b, (b[0] + nx * reach, b[1] + ny * reach), (a[0] + nx * reach, a[1] + ny * reach)])


def street_distance(parcel, d: str, streets, reach: float = NEIGHBOUR_RADIUS) -> float:
    """From the sides of the plot facing d: m to the edge of the nearest street in front of them, as the
    dataset measures dist_major (noise cell, side_noise): the area straight in front of the side, 0.5 m shorter
    at each end (so a street that only touches the corner belongs to the next side), the street's centre line
    inside it, minus half its width. NaN when there is no street within `reach` m."""
    best = np.nan
    st_geom, st_wdet, st_tree = streets
    if st_tree is None:
        return best
    for a, b, nx, ny in _sides(parcel, d):
        seg = LineString([a, b])
        L = seg.length
        gap = min(CORNER_GAP, L / 4)
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        a2, b2 = (a[0] + ux * gap, a[1] + uy * gap), (b[0] - ux * gap, b[1] - uy * gap)
        front = _corridor(a2, b2, nx, ny, reach)
        idx = st_tree.query(front, predicate="intersects")
        if len(idx):
            dist = np.clip(shapely.distance(shapely.intersection(st_geom[idx], front), seg) - st_wdet[idx] / 2, 0, None)
            if np.isnan(best) or dist.min() < best:
                best = round(float(dist.min()), 2)
    return best


# GBA footprints (satellite) and the parcels (municipality) are drawn from different sources and are often
# 0.5-1.5 m apart: our own house sticks out of the plot as a thin strip (that the card showed as a neighbour at
# 0 m with our own height), and a neighbour sticks into it. Only solid parts outside the plot are neighbours.
SLIVER_M = 1.0      # m: a part of a building outside the plot thinner than 2 x 1 m is a drawing offset
OWN_SLIVER_M = 2.0  # m: around our own house, what is left outside the plot must be at least 4 m deep
OWN_SHARE = 0.3     # a footprint with at least 30 % of its area inside the plot is our own house


def _solid(parts, t: float):
    """The parts without anything thinner than 2*t: shrunk by t and grown back (square corners kept),
    then clipped to the parts themselves so that growing back never adds area."""
    opened = shapely.buffer(shapely.buffer(parts, -t, join_style="mitre"), t, join_style="mitre")
    return shapely.intersection(opened, parts)


def _neighbour_parts(parcel, geoms):
    """The GBA footprints without the plot, without the thin strips left by the drawing offset. Around our own
    house only a part at least 4 m deep is kept: a house attached to ours that GBA drew as the same block."""
    inside = shapely.area(shapely.intersection(geoms, parcel))
    own = inside >= OWN_SHARE * shapely.area(geoms)
    outside = shapely.difference(geoms, parcel)
    return np.where(own, _solid(outside, OWN_SLIVER_M), _solid(outside, SLIVER_M))


MAIN_EXTRA_M = 30.0  # m: the neighbour's house is looked for at most 30 m behind the nearest building


def _main_building(parcel, near, near_d, near_h, seg, corridor, buildings, around):
    """The neighbour's house: on the plot of the nearest building in front, the tallest building (then the
    largest) that is also straight in front of the side and at most 30 m behind the nearest one, so that an
    annex or a car shade by the wall is not taken as the house. Never lower than the nearest building.
    (m from the side, height), or None when that plot is not known (no parcels, or not on a plot)."""
    if around is None or not len(around[0]):
        return None
    ap_g = around[0]
    hit = np.nonzero(shapely.contains(ap_g, shapely.point_on_surface(near)))[0]
    if not len(hit):
        return None
    nb = ap_g[hit[np.argmin(shapely.area(ap_g[hit]))]]  # the smallest plot that holds it
    if shapely.area(shapely.intersection(nb, parcel)) > 0.5 * nb.area:
        return None  # our own plot
    g_all, h_all, _, tree = buildings
    idx = tree.query(nb, predicate="intersects")
    idx = idx[h_all[idx] > 0]
    if not len(idx):
        return None
    g = g_all[idx]
    mine = shapely.area(shapely.intersection(g, parcel)) >= OWN_SHARE * shapely.area(g)
    part = shapely.intersection(shapely.difference(g, parcel), corridor)
    dist = shapely.distance(part, seg)
    keep = (shapely.contains(nb, shapely.point_on_surface(g)) & ~mine & (shapely.area(part) >= 1.0)
            & (dist <= near_d + MAIN_EXTRA_M))
    if not keep.any():
        return None
    k = np.nonzero(keep)[0]
    j = k[np.lexsort((-shapely.area(g[k]), -h_all[idx[k]]))[0]]  # tallest, then largest
    if h_all[idx[j]] <= near_h:
        return None  # the nearest building is as tall as any: it is the house
    return float(dist[j]), float(h_all[idx[j]])


def front_building(parcel, d: str, buildings, around=None, reach: float = NEIGHBOUR_RADIUS) -> tuple[float, float]:
    """The neighbour's house straight in front of the sides of the plot facing d: (m from the side, height),
    (NaN, NaN) when there is no building within `reach` m. The footprints are cut by the plot first and their
    thin strips dropped (_neighbour_parts): GBA often draws attached houses as one block that covers our plot
    too, and the solid part outside it is the neighbour (0 m for a shared wall). The nearest building found,
    the card shows the main building of its plot (_main_building, with `around` = the parcels around), else
    the nearest building itself."""
    g_all, h_all, _, tree = buildings
    best = None
    for a, b, nx, ny in _sides(parcel, d):
        seg = LineString([a, b])
        corridor = _corridor(a, b, nx, ny, reach)
        idx = tree.query(corridor, predicate="intersects")
        idx = idx[h_all[idx] > 0]
        if not len(idx):
            continue
        part = shapely.intersection(_neighbour_parts(parcel, g_all[idx]), corridor)
        ok = shapely.area(part) >= 1.0  # under 1 m2 = drawing leftovers, not a building
        if ok.any():
            dist = shapely.distance(part[ok], seg)
            k = int(np.argmin(dist))
            if best is None or dist[k] < best[0]:
                best = (float(dist[k]), float(h_all[idx][ok][k]), part[ok][k], seg, corridor)
    if best is None:
        return np.nan, np.nan
    dist, height, near, seg, corridor = best
    main = _main_building(parcel, near, dist, height, seg, corridor, buildings, around)
    if main is not None:
        dist, height = main
    return round(dist, 2), round(height, 1)


def street_index(st: pd.DataFrame):
    """The streets (centre lines and widths) with a spatial index, for street_distance."""
    if not len(st):
        return np.array([], dtype=object), np.array([]), None
    geoms = st["geometry"].to_numpy()
    return geoms, st["W_DETECT"].to_numpy(float), shapely.STRtree(geoms)




# ------------------------------------------------------------------ endpoint


def _num(value, digits: int):
    """A rounded number, or None for NaN / missing."""
    if value is None:
        return None
    value = float(value)
    return None if np.isnan(value) else round(value, digits)


def facade_indicators(lat: float, lon: float, height: float | None = None, area: float | None = None) -> dict:
    """height, area: the expected building height (m) and land area (m2) the user entered. When given, the
    building is the user's design; without them, the dataset's rule (the GBA house or the envelope)."""
    from pyproj import Transformer

    to_m = Transformer.from_crs(4326, METRIC_SR, always_xy=True)
    x, y = to_m.transform(lon, lat)
    parcel = fetch_parcel(Point(x, y))
    if parcel is None:
        raise LookupError("No parcel at this point")
    features = fetch_streets(parcel, NEIGHBOUR_RADIUS + 20)  # 300 m: also the neighbours card's street distance
    st = street_table(features)
    row = facades_for(parcel, st)
    arrays = street_arrays(features)
    try:
        around = fetch_parcels_around(parcel)
    except SOURCE_ERRORS:  # neither ArcGIS nor the parcels file answered: the use is not known
        around = None
    ind = indicators_for(parcel, arrays, height=height, land_area=area)
    days = ind["days"]
    # the neighbours card: from each side of the plot, straight in front of it
    buildings = gba_buildings()
    streets = street_index(st)
    street_d = {d: street_distance(parcel, d, streets) for d in DIRS}
    # the neighbour's house straight in front of each side (a shared wall = 0 m)
    front = {d: front_building(parcel, d, buildings, around) for d in DIRS}
    adjoining = [h for _, h in front.values() if not np.isnan(h)]
    if around is not None:
        uses = land_use_level1(parcel, *around)
    else:
        uses = {}
        for d in DIRS:
            has_side = bool(_sides(parcel, d))
            uses[f"neighbor_use_{d}"] = "غير محدد" if has_side else "لا يوجد"
            uses[f"across_use_{d}"] = "لا يوجد"

    facades = {}
    for d in DIRS:
        v = ind["by_dir"].get(d, {})  # empty = no wall faces this way: every value is null
        rs, rw = v.get("Rad_summer"), v.get("Rad_winter")
        shade = v.get("Shade")
        facades[d] = {
            "onStreet": bool(row[f"facade_{d}"]),
            "streetWidth": _num(row[f"street_width_{d}"], 2) if row[f"facade_{d}"] else None,
            "radiation": {
                # total = the dataset column Rad_<season>_<d> (kWh/m2 per season); perDay = total / days
                "summer": {"total": _num(rs, 2), "perDay": _num(rs / days["Summer"], 2) if rs is not None else None,
                           "blocked": _num(v.get("Rad_block"), 4)},  # dataset Rad_block_<d> (summer), 0..1
                "winter": {"total": _num(rw, 2), "perDay": _num(rw / days["Winter"], 2) if rw is not None else None,
                           "blocked": None},  # the dataset has Rad_block for the summer only
            },
            # Shade_p (summer) as a share 0..1 (x 100 = %): 0 = never shaded, 1 = always shaded
            "shade": {"summer": _num(shade / 100, 4) if shade is not None else None},
            "sky": _num(v.get("SVF"), 3),  # sky view of the wall, 0..1 (Steger 2022)
            # degrees: the horizon the wind that hits the wall meets (0 = fully exposed)
            "wind": {"good": _num(v.get("Wind_block_good"), 2),  # dataset Wind_block_good_<d>
                     "bad": _num(v.get("Wind_block_bad"), 2)},  # dataset Wind_block_bad_<d>
            "facadeLength": _num(v.get("facade_length"), 2),  # m, dataset facade_length_<d>
            "neighbours": {
                "use": uses[f"neighbor_use_{d}"],  # adjoining parcel use, "شارع", or "لا يوجد" (no edge this way)
                "across": uses[f"across_use_{d}"],  # use across the street, or "لا يوجد"
                # the page shows an unknown use ("غير محدد") as "unknown, estimated data"; the model takes
                # residential instead (by far the most common use in Riyadh)
                "useEstimated": uses[f"neighbor_use_{d}"] == "غير محدد" or uses[f"across_use_{d}"] == "غير محدد",
                "modelUse": defaults.LAND_USE if uses[f"neighbor_use_{d}"] == "غير محدد" else uses[f"neighbor_use_{d}"],
                "modelAcross": defaults.LAND_USE if uses[f"across_use_{d}"] == "غير محدد" else uses[f"across_use_{d}"],
                "streetWidth": _num(row[f"street_width_{d}"], 2) if row[f"facade_{d}"] else None,
                # the street has no width in the layer: the calculations take the width of its type (defaults.py)
                "streetWidthEstimated": bool(row[f"facade_{d}"]) and not (row[f"street_width_{d}"] > 0),
                "streetClass": row[f"street_class_{d}"] if row[f"facade_{d}"] else None,
                "streetName": row[f"street_name_{d}"] if row[f"facade_{d}"] else None,
                # m from this side of the plot to the edge of the street in front of it (None = no street)
                "streetDistance": _num(street_d[d], 2),
                # the nearest building straight in front of this side: m from the side (300 = none), height (0 = none)
                "nearestDistance": NEIGHBOUR_RADIUS if np.isnan(front[d][0]) else front[d][0],
                "nearestHeight": 0.0 if np.isnan(front[d][1]) else front[d][1],
            },
        }
    main_dir, main_est = main_facade(parcel, row, arrays)
    # estimated data in the indicators of each wall (the page marks them):
    #   buildingHeight: the user entered no height and GBA has none for the house (or the plot is vacant): 14 m
    #   setbacks: a vacant plot's building is drawn from the setbacks, and a street width or the main façade
    #             is estimated
    setbacks_est = ind["building_source"] == "regulation_envelope" and (
        main_est or any(f["neighbours"]["streetWidthEstimated"] for f in facades.values()))
    for d in DIRS:
        facades[d]["indicatorsEstimated"] = {
            "buildingHeight": ind["est_height"],
            "setbacks": bool(setbacks_est),
        }
    return {
        "mainFacade": main_dir,
        "mainFacadeEstimated": main_est,
        "buildingSource": ind["building_source"],
        "buildingHeight": round(ind["building_height"], 2),
        "site": {
            "summerMaxTemp": summer_max_temperature(),  # deg C, mean daily maximum in June-August (EPW)
            "avgHeight": neighbour_heights(parcel, buildings),  # m, all neighbouring buildings within 300 m
            "maxHeight": max(adjoining) if adjoining else None,  # m, tallest of the neighbours per direction
        },
        "facades": facades,
        "dataSource": used_sources(),  # "arcgis" and/or "local" (ArcGIS did not answer)
    }


@router.get("/facade-indicators")
def get_facade_indicators(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    height: float | None = Query(None, gt=0, le=H_DESIGN),  # the user's height (m), at most the allowed 14 m
    area: float | None = Query(None, gt=0, le=100_000),  # the land area the user entered (m2)
):
    try:
        return facade_indicators(latitude, longitude, height, area)
    except DataFileError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except OSError as error:  # ArcGIS could not be reached
        raise HTTPException(status_code=502, detail=f"Data source unavailable: {error}")