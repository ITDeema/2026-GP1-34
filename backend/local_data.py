"""The parcels and streets of Riyadh from the local files (the same files as the dataset notebooks).
The analysis asks ArcGIS first and uses these when ArcGIS does not answer; the analytical diagrams use only these.

Files (backend/data, see data/README.txt):
  riyadh_parcels_all.parquet   parcels with ParcelSub         } large: published as a release,
  riyadh_osm.parquet           OpenStreetMap, for the diagrams } downloaded by sync_release_files
  riyadh_streets.parquet       streets with width and class (in the repository)

The same data everywhere: data/data_version.json (in the repository) names the version of the data; when the
local large files are of another version (or missing), sync_release_files downloads that version's files from the
release "data-<version>". The files are updated every 6 months by tools/update_data.py (GitHub Actions).
main.py starts sync + reading in the background when the server starts.
"""
from __future__ import annotations

import json
import os
import threading
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import shapely

HERE = Path(__file__).parent
METRIC_SR = 32638
PARCELS_FILE = Path(os.environ.get("PARCELS_FILE", HERE / "data" / "riyadh_parcels_all.parquet"))
STREETS_FILE = Path(os.environ.get("STREETS_FILE", HERE / "data" / "riyadh_streets.parquet"))
VERSION_FILE = HERE / "data" / "data_version.json"
OSM_FILE = Path(os.environ.get("OSM_FILE", HERE / "data" / "riyadh_osm.parquet"))
VERSIONS = HERE / "data" / ".release_versions.json"  # the data version of each large file on this computer
RELEASE_FILES = [PARCELS_FILE, OSM_FILE]  # too large for the repository: published as a release
DATA_REPO = os.environ.get("DATA_REPO", "ITDeema/Maamar-GP")
_lock = threading.Lock()  # the server can ask from two requests at once: read each file only once
_cache: dict = {}


def data_version() -> str | None:
    try:
        return json.loads(VERSION_FILE.read_text(encoding="utf-8"))["version"]
    except (OSError, ValueError, KeyError):
        return None


def _local_versions() -> dict:
    try:
        return json.loads(VERSIONS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _download(version: str, path: Path) -> None:
    tag, name = f"data-{version}", path.name
    token = os.environ.get("GITHUB_TOKEN")
    if token:  # private repository: through the API
        head = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
        req = urllib.request.Request(f"https://api.github.com/repos/{DATA_REPO}/releases/tags/{tag}", headers=head)
        with urllib.request.urlopen(req, timeout=60) as r:
            asset = next(a for a in json.load(r)["assets"] if a["name"] == name)
        req = urllib.request.Request(asset["url"], headers={**head, "Accept": "application/octet-stream"})
    else:
        req = urllib.request.Request(f"https://github.com/{DATA_REPO}/releases/download/{tag}/{name}")
    print(f"Downloading {name} of {version} ...")
    tmp = path.with_suffix(".part")
    with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    os.replace(tmp, path)


def sync_release_files() -> None:
    """Downloads the large files (RELEASE_FILES) of the repository's data version when the local ones are missing
    or of another version. Public repository: no token needed. Private: set the environment variable GITHUB_TOKEN
    (a token that can read the repository). A failure keeps the local file as it is."""
    version = data_version()
    if version is None:
        return  # no release yet: the files copied by hand (Drive) are used
    have = _local_versions()
    for path in RELEASE_FILES:
        if have.get(path.name) == version and path.exists():
            continue
        try:
            _download(version, path)
            have[path.name] = version
            VERSIONS.write_text(json.dumps(have, indent=2), encoding="utf-8")
            _cache.pop(path.name, None)  # read the new file next time
            print(f"{path.name} updated to {version}")
        except Exception as error:  # noqa: BLE001 - no internet, no release yet, no access: keep the local file
            print(f"{path.name} of {version} not downloaded ({error}); using the local file")


def _read(path: Path):
    import geopandas as gpd

    df = gpd.read_parquet(path)
    if df.crs is None:
        df = df.set_crs(4326)
    df = df.to_crs(METRIC_SR)
    return df[df.geometry.notna() & ~df.geometry.is_empty].reset_index(drop=True)


def _parcels():
    with _lock:
        if PARCELS_FILE.name in _cache:
            return _cache[PARCELS_FILE.name]
        if not PARCELS_FILE.exists():
            return None  # not cached: the file may arrive later (sync_release_files)
        df = _read(PARCELS_FILE)
        g = shapely.make_valid(df.geometry.to_numpy())
        sub = (df["ParcelSub"].fillna("غير محدد").astype(str).to_numpy(object) if "ParcelSub" in df
               else np.full(len(df), "غير محدد", dtype=object))
        _cache[PARCELS_FILE.name] = {"g": g, "sub": sub, "tree": shapely.STRtree(g)}
        return _cache[PARCELS_FILE.name]


def _streets():
    with _lock:
        if "streets" in _cache:
            return _cache["streets"]
        if not STREETS_FILE.exists():
            return None
        df = _read(STREETS_FILE)
        cols = {c.upper(): c for c in df.columns}
        wcol = next((c for c in df.columns if "width" in c.lower() or "عرض" in c), None)
        ccol = next((cols[k] for k in ("SUBTYPECLASS", "CLASS") if k in cols), None)
        mcol = cols.get("STREETCLASS")
        ncol = cols.get("STREETANAME") or next((c for c in df.columns if "name" in c.lower()), None)
        raw = pd.to_numeric(df[wcol], errors="coerce") if wcol else pd.Series(np.nan, index=df.index)
        raw = raw.where(raw > 0)
        cls = df[ccol].astype(str) if ccol else pd.Series("", index=df.index)
        # the notebook: the width, else the median of its class over the city, else the median of all
        W = raw.fillna(raw.groupby(cls).transform("median")).fillna(raw.median()).fillna(0.0)
        g = df.geometry.to_numpy()
        _cache["streets"] = {
            "g": g, "raw": raw.to_numpy(float), "W": W.to_numpy(float), "cls": cls.to_numpy(object),
            "main": df[mcol].astype(str).to_numpy(object) if mcol else np.full(len(df), None, dtype=object),
            "name": df[ncol].to_numpy(object) if ncol else np.full(len(df), None, dtype=object),
            "tree": shapely.STRtree(g),
        }
        return _cache["streets"]


def _osm():
    with _lock:
        if OSM_FILE.name in _cache:
            return _cache[OSM_FILE.name]
        if not OSM_FILE.exists():
            return None
        import geopandas as gpd

        df = gpd.read_parquet(OSM_FILE)
        if df.crs is None:
            df = df.set_crs(4326)
        df = df.to_crs(4326)
        metric = df.to_crs(METRIC_SR).geometry.to_numpy()  # for the search around the plot
        _cache[OSM_FILE.name] = {
            "g": df.geometry.to_numpy(), "type": df["osm_type"].astype(str).to_numpy(object),
            "tags": df["tags"].to_numpy(object), "tree": shapely.STRtree(metric),
        }
        return _cache[OSM_FILE.name]


def osm():
    """The OpenStreetMap features of the analytical diagrams (riyadh_osm.parquet), or None when the file is not there."""
    try:
        return _osm()
    except Exception as error:  # noqa: BLE001
        print("Local OSM file could not be read:", error)
        return None


def parcels():
    """The parcels, or None when the file is not there or cannot be read."""
    try:
        return _parcels()
    except Exception as error:  # a broken file: the callers use ArcGIS
        print("Local parcels could not be read:", error)
        return None


def streets():
    try:
        return _streets()
    except Exception as error:
        print("Local streets could not be read:", error)
        return None


def warm_up() -> None:
    """When the server starts, in the background: bring the parcels to the repository's data version, then read
    the files, so the first analysis is fast too."""
    def run():
        sync_release_files()
        parcels()
        streets()
        osm()
    threading.Thread(target=run, daemon=True).start()


# ------------------------------------------------------------------ queries (the shapes ArcGIS returned)


def parcel_at(point):
    """Notebook get_parcel: the parcel under the point (a residential one first, then the smallest);
    else the nearest parcel within 30 m. None when there is none."""
    p = parcels()
    idx = p["tree"].query(point, predicate="intersects")
    if len(idx):
        res = np.array(["سكني" in str(p["sub"][i]) for i in idx])
        if res.any():
            idx = idx[res]
        geom = p["g"][idx[np.argmin(shapely.area(p["g"][idx]))]]
    else:
        idx = p["tree"].query(point.buffer(30), predicate="intersects")
        if not len(idx):
            return None
        geom = p["g"][idx[np.argmin(shapely.distance(p["g"][idx], point))]]
    if geom.geom_type == "GeometryCollection":
        geom = shapely.union_all([q for q in geom.geoms if q.geom_type in ("Polygon", "MultiPolygon")])
    return max(geom.geoms, key=lambda q: q.area) if geom.geom_type == "MultiPolygon" else geom


def parcels_in(area, subs: list[str] | None = None) -> tuple[np.ndarray, np.ndarray]:
    """The parcels that touch `area` (and whose ParcelSub is in `subs`, when given)."""
    p = parcels()
    idx = p["tree"].query(area, predicate="intersects")
    if subs is not None:
        idx = idx[np.isin(p["sub"][idx], subs)]
    return p["g"][idx], p["sub"][idx]


def street_features(area) -> list[dict]:
    """The streets that touch `area`, in the same shape as an ArcGIS answer (attributes + paths), plus "W":
    the width filled as in the notebook (city medians)."""
    s = streets()
    out = []
    for i in s["tree"].query(area, predicate="intersects"):
        g = s["g"][i]
        parts = g.geoms if g.geom_type == "MultiLineString" else [g]
        paths = [np.asarray(q.coords)[:, :2].tolist() for q in parts if q.geom_type == "LineString"]
        if not paths:
            continue
        raw = s["raw"][i]
        out.append({
            "attributes": {
                "STREETWIDTH": None if np.isnan(raw) else float(raw), "W": float(s["W"][i]),
                "SUBTYPECLASS": s["cls"][i], "STREETCLASS": s["main"][i], "STREETANAME": s["name"][i],
            },
            "geometry": {"paths": paths},
        })
    return out
