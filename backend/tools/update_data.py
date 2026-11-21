"""Updates the data files every 6 months (all of them except the EPW weather file and GBA, which do not change).

The same code as the notebooks that made them the first time:
  riyadh_streets.parquet          Streets_NEW (ArcGIS)                         Preparing_dataset, cell 32
  riyadh_parcels_all.parquet      Riyadh_Parcel with ParcelSub (ArcGIS)        Preparing_dataset, cell 38
  overture_places_riyadh.parquet  Overture Maps places                         Preparing_dataset, cell 59
  pois_riyadh_merged.parquet      Overture + OSM + Foursquare, duplicates out  Preparing_dataset, cell 60
  riyadh_osm.parquet              OpenStreetMap for the analytical diagrams    the diagrams' old Overpass queries
The area is fixed: Riyadh, 46.15-47.35 E, 24.25-25.25 N (the same as tools/clip_gba.py).

The 6 months count from the date of the data in the repository (data/data_version.json), not from each computer:
GitHub Actions (.github/workflows/update-data.yml) runs this once a day; it only updates when 6 months have
passed since that date, then commits the new files and publishes the parcels file (too large for the repository)
as a release. Every computer and the hosting server then take the same files (local_data.sync_parcels).

Run by hand (needs osmium-tool, and: pip install overturemaps duckdb boto3 requests geopandas pyarrow):
    cd backend
    python tools/update_data.py            # only when 6 months have passed
    python tools/update_data.py --force    # now
Prints "updated=true" or "updated=false" (the workflow reads it).
"""
from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"
WORK = DATA / "_update"  # the new files are made here; the old ones are replaced only when all are ready
VERSION_FILE = DATA / "data_version.json"
MONTHS = 6
W, S, E, N = 46.15, 24.25, 47.35, 25.25
AREA = {"geometry": f"{W},{S},{E},{N}", "geometryType": "esriGeometryEnvelope",
        "inSR": 4326, "spatialRel": "esriSpatialRelIntersects"}
ARCGIS = "https://services-ap1.arcgis.com/if9krLUYaMWhxyMO/ArcGIS/rest/services"
FILES = ["riyadh_streets.parquet", "riyadh_parcels_all.parquet", "overture_places_riyadh.parquet",
         "pois_riyadh_merged.parquet", "riyadh_osm.parquet"]
RELEASE_FILES = ["riyadh_parcels_all.parquet", "riyadh_osm.parquet"]  # too large for the repository


def due(force: bool) -> bool:
    if force or not VERSION_FILE.exists():
        return True
    last = dt.date.fromisoformat(json.loads(VERSION_FILE.read_text(encoding="utf-8"))["version"])
    nxt = (pd.Timestamp(last) + pd.DateOffset(months=MONTHS)).date()
    print(f"last update {last}, next {nxt}")
    return dt.date.today() >= nxt


def get(session, url, params, tries=5):
    for attempt in range(tries):
        try:
            r = session.get(url, params=params, timeout=120)
            r.raise_for_status()
            js = r.json()
            if "error" in js:
                raise RuntimeError(js["error"])
            return js
        except Exception as ex:  # noqa: BLE001 - retried, then reported
            print(f"   try {attempt + 1}: {str(ex)[:120]}")
            time.sleep(5 * (attempt + 1))
    return None


def streets(session):
    """Preparing_dataset cell 32."""
    import geopandas as gpd

    url = f"{ARCGIS}/Streets_NEW/FeatureServer/0/query"
    total = get(session, url, {**AREA, "where": "1=1", "returnCountOnly": "true", "f": "json"})["count"]
    parts, offset = [], 0
    while offset < total:
        js = get(session, url, {**AREA, "where": "1=1", "outFields": "*", "returnGeometry": "true", "f": "geojson",
                                "orderByFields": "OBJECTID ASC", "resultOffset": offset, "resultRecordCount": 1000})
        if js is None:
            raise RuntimeError("streets download failed")
        feats = js.get("features", [])
        if not feats:
            break
        parts.append(gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326"))
        offset += len(feats)
    st = gpd.GeoDataFrame(pd.concat(parts, ignore_index=True), geometry="geometry", crs="EPSG:4326").to_crs(32638)
    st = st.drop_duplicates(subset="OBJECTID").reset_index(drop=True)
    st.to_parquet(WORK / "riyadh_streets.parquet")
    print(f"streets: {len(st):,}")


def parcels(session):
    """Preparing_dataset cell 38: by FID ranges, resumes where it stopped."""
    import geopandas as gpd

    url = f"{ARCGIS}/Riyadh_Parcel/FeatureServer/0/query"
    parts_dir = WORK / "parcels_parts"
    parts_dir.mkdir(exist_ok=True)
    step = 2000
    st = get(session, url, {"where": "1=1", "f": "json",
                            "outStatistics": '[{"statisticType":"min","onStatisticField":"FID","outStatisticFieldName":"mn"},'
                                             '{"statisticType":"max","onStatisticField":"FID","outStatisticFieldName":"mx"}]'})
    mn, mx = st["features"][0]["attributes"]["mn"], st["features"][0]["attributes"]["mx"]
    have = {int(Path(f).name[4:-8]) for f in glob.glob(str(parts_dir / "fid_*.parquet"))}
    todo = [a for a in range(mn, mx + 1, step) if a not in have]
    print(f"parcels: {len(todo)} ranges to download")
    failed = []
    for k, a in enumerate(todo, 1):
        js = get(session, url, {**AREA, "where": f"FID >= {a} AND FID < {a + step}",
                                "outFields": "FID,ParcelSub", "returnGeometry": "true", "f": "geojson"})
        if js is None:
            failed.append(a)
            continue
        feats = js.get("features", [])
        g = (gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326") if feats
             else gpd.GeoDataFrame({"FID": [], "ParcelSub": []}, geometry=[], crs="EPSG:4326"))
        g.to_parquet(parts_dir / f"fid_{a:09d}.parquet")
        if k % 100 == 0:
            print(f"   {k}/{len(todo)}")
    if failed:
        raise RuntimeError(f"{len(failed)} parcel ranges failed: run again, it continues where it stopped")
    allp = pd.concat([gpd.read_parquet(f) for f in sorted(glob.glob(str(parts_dir / "fid_*.parquet")))], ignore_index=True)
    allp = gpd.GeoDataFrame(allp, geometry="geometry", crs="EPSG:4326")
    allp = allp[allp.geometry.notna() & ~allp.geometry.is_empty]
    allp = allp.drop_duplicates(subset="FID").to_crs(32638).reset_index(drop=True)
    allp["geometry"] = allp.geometry.make_valid()
    allp.to_parquet(WORK / "riyadh_parcels_all.parquet")
    shutil.rmtree(parts_dir, ignore_errors=True)
    print(f"parcels: {len(allp):,}")


def overture():
    """Preparing_dataset cell 59."""
    subprocess.run(["overturemaps", "download", f"--bbox={W},{S},{E},{N}", "-f", "geoparquet",
                    "--type=place", "-o", str(WORK / "overture_places_riyadh.parquet")], check=True)


def osm(pbf_dir: Path):
    """OSM places (Preparing_dataset cell 60) and the OpenStreetMap features of the analytical diagrams."""
    import geopandas as gpd
    import shapely

    pbf = pbf_dir / "gcc-states-latest.osm.pbf"
    if not pbf.exists():
        subprocess.run(["wget", "-q", "-O", str(pbf), "https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf"], check=True)
    riyadh = pbf_dir / "riyadh.osm.pbf"
    subprocess.run(["osmium", "extract", "-b", f"{W},{S},{E},{N}", str(pbf), "-o", str(riyadh), "--overwrite"], check=True)

    def export(filters, name):
        f_pbf, out = pbf_dir / f"{name}.osm.pbf", pbf_dir / f"{name}.geojsonseq"
        subprocess.run(["osmium", "tags-filter", str(riyadh), *filters, "-o", str(f_pbf), "--overwrite"], check=True)
        subprocess.run(["osmium", "export", str(f_pbf), "-f", "geojsonseq", "-o", str(out), "--overwrite"], check=True)
        with open(out, encoding="utf-8") as f:
            for line in f:
                yield json.loads(line.strip().lstrip("\x1e"))

    rows = []
    for ft in export(["nwr/amenity", "nwr/shop", "nwr/leisure", "nwr/office"], "poi"):
        t = ft.get("properties", {})
        a, sh, le, of = t.get("amenity"), t.get("shop"), t.get("leisure"), t.get("office")
        if a == "place_of_worship":
            c = "mosque" if t.get("religion") == "muslim" else "place_of_worship"
        elif a:
            c = a
        elif sh:
            c = f"shop_{sh}"
        elif le:
            c = f"leisure_{le}"
        elif of:
            c = "government_office" if of == "government" else f"office_{of}"
        else:
            continue
        g = shapely.geometry.shape(ft["geometry"])
        rows.append({"name": t.get("name:ar") or t.get("name") or t.get("name:en"), "cat": c.lower(),
                     "geometry": g if g.geom_type == "Point" else g.representative_point()})
    gpd.GeoDataFrame(rows, geometry="geometry", crs=4326).to_parquet(WORK / "osm_pois_riyadh.parquet")
    print(f"OSM places: {len(rows):,}")

    # the analytical diagrams: the same OpenStreetMap features the website used to ask Overpass for
    def has(t, k, pattern=None):
        v = t.get(k)
        return v is not None and (pattern is None or re.search(pattern, v) is not None)

    def keep(kind, t):
        if kind == "node":
            return (t.get("highway") == "bus_stop" or has(t, "railway", "station|subway_entrance|tram_stop")
                    or t.get("public_transport") == "station")
        if kind == "way":
            return (has(t, "highway") or has(t, "railway") or has(t, "building")
                    or has(t, "natural", "water|wood|scrub|grassland") or has(t, "waterway") or has(t, "leisure")
                    or has(t, "landuse")
                    or has(t, "amenity", "parking|school|university|college|kindergarten|place_of_worship|hospital|clinic"))
        if kind == "relation":
            return has(t, "building") or has(t, "leisure", "park|garden|nature_reserve") or has(t, "natural", "water|wood")
        return False

    f_pbf, out = pbf_dir / "diagrams.osm.pbf", pbf_dir / "diagrams.geojsonseq"
    subprocess.run(["osmium", "tags-filter", str(riyadh), "w/highway", "w/railway", "n/highway", "n/railway",
                    "n/public_transport", "wr/building", "w/natural", "w/waterway", "w/leisure", "w/landuse",
                    "w/amenity", "r/leisure", "r/natural", "-o", str(f_pbf), "--overwrite"], check=True)
    subprocess.run(["osmium", "export", str(f_pbf), "-f", "geojsonseq", "-a", "type,id", "-o", str(out),
                    "--overwrite"], check=True)
    rows = []
    with open(out, encoding="utf-8") as f:
        for line in f:
            ft = json.loads(line.strip().lstrip("\x1e"))
            p = dict(ft.get("properties", {}))
            kind = p.pop("@type", None)
            p.pop("@id", None)
            if not keep(kind, p):
                continue
            g = shapely.geometry.shape(ft["geometry"])
            if not g.is_empty:
                rows.append({"osm_type": kind, "tags": json.dumps(p, ensure_ascii=False), "geometry": g})
    gpd.GeoDataFrame(rows, geometry="geometry", crs=4326).to_parquet(WORK / "riyadh_osm.parquet")
    print(f"OSM for the diagrams: {len(rows):,}")


def foursquare():
    """Preparing_dataset cell 60: Foursquare OS Places (Source Cooperative, public, no key)."""
    import boto3
    import duckdb
    import geopandas as gpd
    from botocore import UNSIGNED
    from botocore.config import Config

    s3 = boto3.client("s3", endpoint_url="https://data.source.coop", config=Config(signature_version=UNSIGNED))
    pref = s3.list_objects_v2(Bucket="fused", Prefix="fsq-os-places/", Delimiter="/").get("CommonPrefixes", [])
    rel = sorted(p["Prefix"] for p in pref if re.search(r"\d{4}-\d{2}-\d{2}/$", p["Prefix"]))[-1]
    print(f"Foursquare release: {rel}")
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs;")
    con.sql("SET s3_endpoint='data.source.coop'; SET s3_url_style='path'; SET s3_region='us-west-2';")
    fsq = con.sql(f"""
        SELECT name, latitude, longitude, CAST(fsq_category_labels AS VARCHAR) AS labels
        FROM read_parquet('s3://fused/{rel}places/*.parquet')
        WHERE country = 'SA' AND date_closed IS NULL
          AND longitude BETWEEN {W} AND {E} AND latitude BETWEEN {S} AND {N}
    """).df()
    leaf = (fsq["labels"].fillna("").str.split(">").str[-1].str.strip(" []'\"").str.lower()
            .str.replace(r"[ ,&/-]+", "_", regex=True))
    gpd.GeoDataFrame({"name": fsq["name"], "cat": leaf},
                     geometry=gpd.points_from_xy(fsq["longitude"], fsq["latitude"]), crs=4326
                     ).to_parquet(WORK / "fsq_os_places_riyadh.parquet")
    print(f"Foursquare: {len(fsq):,}")


GROUPS = [  # Preparing_dataset cell 60 (corrected groups)
    ("mosque",     r"mosque|muslim|islamic|place_of_worship|religious"),
    ("education",  r"school|kindergarten|preschool|nursery|day_care|daycare|college|university|education|place_of_learning"),
    ("hospital",   r"hospital|emergency"),
    ("government", r"government|public_service|police|court|embassy|municipal|post_office|townhall|city_hall"),
    ("park",       r"^(park|playground|garden|botanical_garden|recreation_area|plaza|dog_park|leisure_park|leisure_playground|leisure_garden)$"),
    ("auto",       r"car_wash|automotive|auto_|^auto|gas_station|fuel|mechanic|tire|car_repair|oil_change|car_dealer|shop_car"),
    ("nuisance",   r"caf[eé]|coffee|restaurant|eatery|fast_food|food_court|burger|pizza|shawarma|juice|dessert|"
                   r"cafeteria|tea_house|hookah|shisha|event|wedding|banquet|gym|fitness|sports|stadium|"
                   r"entertainment|amusement|cinema|leisure_sports_centre|leisure_fitness_centre"),
    ("commercial", r"pharmacy|grocery|supermarket|convenience|market|retail|shop|store|bank|atm|office|"
                   r"salon|barber|laundry|clinic|dentist|doctor|bakery|mall|tailor|optic|electronics"),
]


def group_of(c):
    if not c or "parking" in c:
        return None
    for g, pat in GROUPS:
        if re.search(pat, c):
            return g
    return None


def _first(v, key):
    if isinstance(v, dict):
        return v.get(key)
    if isinstance(v, str):
        try:
            return json.loads(v).get(key)
        except ValueError:
            return None
    return None


def merge():
    """Preparing_dataset cell 60: the three sources, then the same place from two sources within 20 m counts once
    (Foursquare first, then OSM, then Overture)."""
    import geopandas as gpd
    import shapely

    ov = gpd.read_parquet(WORK / "overture_places_riyadh.parquet")
    cat = ov["categories"].map(lambda v: _first(v, "primary")) if "categories" in ov.columns else ov["basic_category"]
    ov = gpd.GeoDataFrame({"src": "overture",
                           "name": ov["names"].map(lambda v: _first(v, "primary")) if "names" in ov.columns else None,
                           "cat": cat.fillna("").astype(str).str.lower()}, geometry=ov.geometry, crs=ov.crs)
    osm_ = gpd.read_parquet(WORK / "osm_pois_riyadh.parquet")
    osm_["src"] = "osm"
    fsq = gpd.read_parquet(WORK / "fsq_os_places_riyadh.parquet")
    fsq["src"] = "fsq"
    allpoi = pd.concat([p[["src", "name", "cat", "geometry"]].to_crs(32638) for p in (ov, osm_, fsq)], ignore_index=True)
    allpoi = gpd.GeoDataFrame(allpoi, geometry="geometry", crs=32638)
    allpoi["grp"] = allpoi["cat"].map({c: group_of(c) for c in allpoi["cat"].unique()})
    allpoi = allpoi[allpoi["grp"].notna()].reset_index(drop=True)
    keep = np.ones(len(allpoi), bool)
    order = allpoi["src"].map({"fsq": 0, "osm": 1, "overture": 2}).to_numpy()
    G, GR, SRC = allpoi.geometry.to_numpy(), allpoi["grp"].to_numpy(object), allpoi["src"].to_numpy(object)
    a, b = shapely.STRtree(G).query(G, predicate="dwithin", distance=20)
    m = (a < b) & (GR[a] == GR[b]) & (SRC[a] != SRC[b])
    for i, j in zip(a[m], b[m]):
        if keep[i] and keep[j]:
            keep[j if order[j] >= order[i] else i] = False
    merged = allpoi[keep].reset_index(drop=True)
    merged.to_parquet(WORK / "pois_riyadh_merged.parquet")
    print(f"merged places: {len(allpoi):,} -> {len(merged):,}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="update now, even before 6 months")
    args = ap.parse_args()
    if not due(args.force):
        print("updated=false")
        return
    import requests

    WORK.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    done = lambda name: (WORK / name).exists()  # noqa: E731 - a step that finished is not repeated
    if not done("riyadh_streets.parquet"):
        streets(session)
    if not done("riyadh_parcels_all.parquet"):
        parcels(session)
    if not done("overture_places_riyadh.parquet"):
        overture()
    if not (done("osm_pois_riyadh.parquet") and done("riyadh_osm.parquet")):
        osm(WORK)
    if not done("fsq_os_places_riyadh.parquet"):
        foursquare()
    if not done("pois_riyadh_merged.parquet"):
        merge()

    import geopandas as gpd

    today = dt.date.today()
    info = {"version": today.isoformat(),
            "next": (pd.Timestamp(today) + pd.DateOffset(months=MONTHS)).date().isoformat(),
            "bbox": [W, S, E, N], "files": {}}
    for f in FILES:
        shutil.move(str(WORK / f), str(DATA / f))
        info["files"][f] = {"rows": int(len(gpd.read_parquet(DATA / f))), "mb": round(os.path.getsize(DATA / f) / 1e6, 1)}
    VERSION_FILE.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / ".release_versions.json").write_text(json.dumps({f: info["version"] for f in RELEASE_FILES}, indent=2),
                                                 encoding="utf-8")
    shutil.rmtree(WORK, ignore_errors=True)
    print(json.dumps(info, ensure_ascii=False, indent=2))
    print("updated=true")
    print(f"version={info['version']}")


if __name__ == "__main__":
    sys.exit(main())
