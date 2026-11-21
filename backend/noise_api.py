"""Noise for the results page, calculated the same way as the dataset notebook
(DataSet_Phase1.ipynb, "Noise and facade length" cell).

For each side of the plot, the area straight in front of it (1000 m deep, 0.5 m shorter at each end):
  * R = 1 when a road that makes noise is in front of the side within its limit (from the road's edge):
        motorway, exit, entrance                                   500 m
        arterial, bridge, main street, U-turn, collector,
        roundabout, service road                                   100 m      (Ottawa guidelines)
  * C = 1 when a shop or a commercial / mixed-use parcel is in front of the side within 50 m (team's choice)
  * Noise = R + C (0..2); each direction takes the highest R and the highest C of its sides
  * dist_major = the nearest of those roads in front of the side, dist_shop = the nearest shop (1000 = none)
The sides' directions are snapped to the house axes, as in the notebook (the house = the GBA building on the
plot, else the envelope allowed by the regulations).

For the plot (the notebook's "B" columns, Helbich et al. 2025 table 1):
  * dist_road_<class>   m from the plot to the edge of the nearest road of each class (1000 = none within 1000 m)
  * len_<class>_<R>m    m of road of that class inside the buffer of R m around the plot
  * n_bldg_<R>m         GBA buildings within R m (the plot's own house left out)

The page's level: the highest Noise of the directions, 0 = low, 1 = medium, 2 = high.

Differences from the notebook (the data the backend has):
  * shops: the places of pois_riyadh_merged.parquet in the groups auto, nuisance and commercial (the same
    three groups as the notebook's SHOP_GROUPS). The notebook reads overture_places_riyadh.parquet; put that
    file in data/ (or set OVERTURE_FILE) and it is used instead, with the notebook's category patterns.
  * streets and parcels come from ArcGIS (the newest data); when ArcGIS does not answer, from the local files
    (local_data.py). A street without a width takes the median of its class among the streets loaded from
    ArcGIS; from the local file, the median of its class over the city (as the notebook).

Endpoint
    GET /noise?latitude=&longitude=
        {"level": "low" | "medium" | "high",
         "reason": {"class": motorway|arterial|main|collector|shop, "distance": m} | null,
         "facades": {dir: {"noise": 0..2, "road": 0|1, "shop": 0|1, "distMajor": m, "distShop": m}},
         "distances": {class: m}, "lengths": {class: {R: m}}, "buildings": {R: n}}
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
import shapely
from fastapi import APIRouter, HTTPException, Query
from shapely.geometry import LineString, Point, Polygon
from shapely.geometry.polygon import orient

import local_data
from facade_indicators_api import (
    DIRS, METRIC_SR, PARCELS_URL, DataFileError, _get_all, esri_to_shapely, fetch_parcel, fetch_streets,
    gba_raw, house_axis, house_of, online_or_local, parcel_sides, street_arrays, used_sources, wall_dir,
)

router = APIRouter()
HERE = Path(__file__).parent

# ---- R: the roads (Ottawa guidelines), the notebook's R_LIMIT
R_LIMIT = {**{c: 500 for c in ["طريق سريع", "مخرج", "مدخل"]},
           **{c: 100 for c in ["طريق رئيسي", "كوبري", "شارع رئيسي", "U-Turn", "شارع مجمع", "دوار", "طريق خدمة"]}}
# the road class the page names for each of them
R_KEY = {"طريق سريع": "motorway", "مخرج": "motorway", "مدخل": "motorway",
         "طريق رئيسي": "arterial", "كوبري": "arterial",
         "شارع رئيسي": "main", "U-Turn": "main",
         "شارع مجمع": "collector", "دوار": "collector", "طريق خدمة": "collector"}
# ---- C: shops and commercial land
SHOP_R = 50
COMM_PARCEL = ["تجاري", "متعددة الاستخدام"]
SHOP_GRP = ["auto", "nuisance", "commercial"]
SHOP_GROUPS = {  # the notebook's patterns, used with the Overture file
    "auto": r"car_wash|auto|automotive|gas_station|fuel|mechanic|tire|car_repair|oil_change|car_dealer",
    "nuisance": r"cafe|coffee|restaurant|fast_food|food_court|burger|pizza|shawarma|juice|dessert|"
                r"hookah|event|wedding|banquet|gym|fitness|sports_club|stadium|entertainment|amusement|cinema",
    "commercial": r"pharmacy|grocery|supermarket|convenience|market|retail|shop|store|bank|atm|office|"
                  r"salon|barber|laundry|clinic|dentist|doctor|bakery|mall|tailor|optic|electronics"}
FRONT = 1000  # m, the area in front of a side
CORNER_GAP = 0.5  # m, cut from each end of the side
MAXD = 1000  # m, farther = 1000

# ---- the plot's columns
RAW_CLASSES = {"motorway": ["طريق سريع"], "arterial": ["طريق رئيسي"], "main": ["شارع رئيسي"],
               "collector": ["شارع مجمع"], "local": ["شارع فرعي"], "footway": ["ممر مشاه", "ممر"]}
LEN_BUFFERS = {"motorway": [100, 200, 300, 500, 1000], "arterial": [100, 200, 300, 500, 1000],
               "main": [50, 100, 200, 300, 500, 1000], "collector": [50, 100, 200, 300, 500, 1000],
               "local": [50, 100, 200, 300, 500, 1000], "footway": [50, 100, 200]}
BLDG_BUFFERS = [50, 100, 200, 300, 500, 1000]


# ------------------------------------------------------------------ data


@lru_cache(maxsize=1)
def shops():
    """The shop points (EPSG:32638) and their spatial index."""
    import geopandas as gpd

    overture = os.environ.get("OVERTURE_FILE") or str(HERE / "data" / "overture_places_riyadh.parquet")
    if Path(overture).exists():  # the notebook's file and rule
        pl = gpd.read_parquet(overture)

        def first(v, key):
            if isinstance(v, dict):
                return v.get(key)
            if isinstance(v, str):
                try:
                    return json.loads(v).get(key)
                except ValueError:
                    return None
            return None

        cat = pl["categories"].map(lambda v: first(v, "primary")) if "categories" in pl else None
        if "basic_category" in pl:
            cat = pl["basic_category"] if cat is None else cat.fillna(pl["basic_category"])
        cat = cat.fillna("").astype(str).str.lower()
        pl = pl[cat.str.contains("|".join(f"(?:{p})" for p in SHOP_GROUPS.values()), regex=True)]
    else:
        path = Path(os.environ.get("POIS_FILE", HERE / "data" / "pois_riyadh_merged.parquet"))
        if not path.exists():
            raise DataFileError(f"Places file not found: {path.name}")
        pl = gpd.read_parquet(path)
        pl = pl[pl["grp"].isin(SHOP_GRP)]
    if pl.crs is None:
        pl = pl.set_crs(4326)
    g = pl.to_crs(METRIC_SR).geometry.to_numpy()
    return g, shapely.STRtree(g)


def fetch_roads(parcel) -> list[dict]:
    """Every street within 1000 m of the plot (ArcGIS, else the local streets file)."""
    return fetch_streets(parcel, FRONT + 20)


def fetch_commercial(parcel) -> np.ndarray:
    """The commercial and mixed-use parcels within 1000 m of the plot (ArcGIS, else the local parcels file),
    the plot itself left out."""
    w, s, e, n = parcel.buffer(FRONT + 20).bounds

    def online():
        where = "ParcelSub IN (" + ",".join(f"'{c}'" for c in COMM_PARCEL) + ")"
        feats = _get_all(PARCELS_URL, {
            "geometry": f"{w},{s},{e},{n}", "geometryType": "esriGeometryEnvelope", "inSR": METRIC_SR,
            "spatialRel": "esriSpatialRelIntersects", "where": where, "outFields": "ParcelSub",
            "returnGeometry": "true", "outSR": METRIC_SR, "f": "json",
        })
        return [g for g in (esri_to_shapely(f.get("geometry")) for f in feats) if g is not None and not g.is_empty]

    geoms = online_or_local(online, lambda: list(local_data.parcels_in(shapely.box(w, s, e, n), COMM_PARCEL)[0]),
                            local_data.parcels)
    return np.array([g for g in geoms if g.intersection(parcel).area <= 0.8 * min(g.area, parcel.area)],
                    dtype=object)


# ------------------------------------------------------------------ the calculation


def side_noise(a, b, nx, ny, streets, lim, comm, comm_tree, shop_g, shop_tree):
    """Notebook side_noise: R, C, the distances, and the road that made R (its class and distance)."""
    ST_G, ST_W, ST_C, st_tree = streets
    seg = LineString([a, b])
    L = seg.length
    s = min(CORNER_GAP, L / 4)
    ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    a2, b2 = (a[0] + ux * s, a[1] + uy * s), (b[0] - ux * s, b[1] - uy * s)
    front = Polygon([a2, b2, (b2[0] + nx * FRONT, b2[1] + ny * FRONT), (a2[0] + nx * FRONT, a2[1] + ny * FRONT)])
    # the roads in front of the side: the distance to the road's edge
    R, dmaj, road = 0, float(MAXD), None
    if st_tree is not None:
        idx = st_tree.query(front, predicate="intersects")
        idx = idx[lim[idx] > 0]
        if len(idx):
            dist = np.clip(shapely.distance(shapely.intersection(ST_G[idx], front), seg) - ST_W[idx] / 2, 0, None)
            within = dist <= lim[idx]
            R = int(within.any())
            dmaj = float(min(dist.min(), MAXD))
            if R:
                k = np.flatnonzero(within)[np.argmin(dist[within])]
                road = (R_KEY.get(ST_C[idx[k]], "main"), float(dist[k]))
    # the shops and commercial parcels in front of the side
    dshop = float(MAXD)
    idx = shop_tree.query(front, predicate="intersects")
    if len(idx):
        dshop = min(dshop, float(shapely.distance(shop_g[idx], seg).min()))
    if comm_tree is not None:
        idx = comm_tree.query(front, predicate="intersects")
        if len(idx):
            dshop = min(dshop, float(shapely.distance(shapely.intersection(comm[idx], front), seg).min()))
    return R, int(dshop <= SHOP_R), dmaj, dshop, road


def noise_for(lat: float, lon: float) -> dict:
    from pyproj import Transformer

    x, y = Transformer.from_crs(4326, METRIC_SR, always_xy=True).transform(lon, lat)
    P = fetch_parcel(Point(x, y))
    if P is None:
        raise LookupError("No parcel at this point")
    if P.geom_type == "MultiPolygon":
        P = max(P.geoms, key=lambda g: g.area)
    streets = street_arrays(fetch_roads(P))
    ST_G, ST_W, ST_C, st_tree = streets
    lim = np.array([R_LIMIT.get(c, 0) for c in ST_C], float)  # 0 = not counted in R
    comm = fetch_commercial(P)
    comm_tree = shapely.STRtree(comm) if len(comm) else None
    shop_g, shop_tree = shops()
    gba = gba_raw()

    # the house (the dataset's rule), for the directions of the sides and to leave it out of n_bldg
    P1, sides = parcel_sides(P, streets)
    E, _, site_idx, _ = house_of(P1, sides, streets, gba)
    axis = house_axis(E)

    per: dict[str, dict] = {}
    reasons = []
    ring = np.asarray(orient(P, 1.0).exterior.coords)
    for (x1, y1), (x2, y2) in zip(ring[:-1], ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        L = np.hypot(dx, dy)
        if L < 0.5:
            continue
        nx, ny = dy / L, -dx / L
        R, C, dmaj, dshop, road = side_noise((x1, y1), (x2, y2), nx, ny, streets, lim, comm, comm_tree,
                                             shop_g, shop_tree)
        d = wall_dir([np.degrees(np.arctan2(nx, ny)) % 360], axis)[0]
        p = per.setdefault(d, {"road": 0, "shop": 0, "distMajor": float(MAXD), "distShop": float(MAXD)})
        p["road"], p["shop"] = max(p["road"], R), max(p["shop"], C)
        p["distMajor"], p["distShop"] = min(p["distMajor"], dmaj), min(p["distShop"], dshop)
        if road:
            reasons.append(road)
        elif C:
            reasons.append(("shop", dshop))
    facades = {}
    for d in DIRS:
        if d in per:
            p = per[d]
            facades[d] = {"noise": p["road"] + p["shop"], "road": p["road"], "shop": p["shop"],
                          "distMajor": round(p["distMajor"], 1), "distShop": round(p["distShop"], 1)}
    top = max((f["noise"] for f in facades.values()), default=0)
    level = ["low", "medium", "high"][top]
    # the reason shown on the page: the nearest road that made R, else the nearest shop that made C
    roads = [r for r in reasons if r[0] != "shop"]
    pick = min(roads or reasons, key=lambda r: r[1]) if reasons else None
    reason = {"class": pick[0], "distance": round(pick[1], 1)} if pick else None

    # the plot: the nearest road of each class and the length of road in each buffer
    rings = {r: P.buffer(r) for r in BLDG_BUFFERS}
    distances, lengths = {}, {}
    for k, subs in RAW_CLASSES.items():
        m = np.isin(ST_C, subs)
        g, w = ST_G[m], ST_W[m]
        if len(g):
            distances[k] = round(float(min(np.clip(shapely.distance(g, P) - w / 2, 0, None).min(), MAXD)), 1)
        else:
            distances[k] = float(MAXD)
        lengths[k] = {str(r): round(float(shapely.length(shapely.intersection(g, rings[r])).sum()), 1) if len(g) else 0.0
                      for r in LEN_BUFFERS[k]}
    # the plot: the buildings around it (its own house left out)
    G, _, tree = gba
    idx = tree.query(rings[1000])
    idx = idx[~np.isin(idx, site_idx)]
    buildings = {str(r): int(shapely.intersects(G[idx], rings[r]).sum()) if len(idx) else 0 for r in BLDG_BUFFERS}
    return {"level": level, "reason": reason, "facades": facades,
            "distances": distances, "lengths": lengths, "buildings": buildings,
            "dataSource": used_sources()}  # "arcgis" and/or "local" (ArcGIS did not answer)


@router.get("/noise")
def get_noise(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    try:
        return noise_for(latitude, longitude)
    except DataFileError as error:
        raise HTTPException(status_code=503, detail=str(error))
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except OSError as error:  # ArcGIS could not be reached
        raise HTTPException(status_code=502, detail=f"Data source unavailable: {error}")
