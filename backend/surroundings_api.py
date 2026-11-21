"""The surroundings of the plot for the analytical diagrams (land use, roads and transit, sun and wind plan).

The diagrams used to ask Overpass (OpenStreetMap) for two things around the plot; the same OpenStreetMap data is
now saved in riyadh_osm.parquet (made the same way, updated every 6 months by tools/update_data.py), and this
endpoint answers in the same shape Overpass did, so the website draws exactly what it drew before:
  roads:   way[highway], way[railway], node[highway=bus_stop], node[railway~station|subway_entrance|tram_stop],
           node[public_transport=station]
  context: way/relation[building], way[natural~water|wood|scrub|grassland], way[waterway], way[leisure],
           way[landuse], way[amenity~parking|school|...|clinic], relation[leisure~park|garden|nature_reserve],
           relation[natural~water|wood]
When the file is missing it answers 503.

Endpoint
    GET /surroundings?latitude=&longitude=&radius=
        {"roads": {"elements": [...]}, "context": {"elements": [...]}}   (Overpass "out geom" elements)
"""
from __future__ import annotations

import json

import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pyproj import Transformer
from shapely.geometry import Point

import local_data
from facade_indicators_api import METRIC_SR

router = APIRouter()
_to_m = Transformer.from_crs(4326, METRIC_SR, always_xy=True)


def _pts(coords) -> list[dict]:
    a = np.round(np.asarray(coords)[:, :2], 7)
    return [{"lat": float(y), "lon": float(x)} for x, y in a]


def _element(kind: str, tags: dict, g) -> dict | None:
    """One feature as Overpass returns it with "out geom"."""
    if kind == "node":
        if g.geom_type != "Point":
            return None
        return {"type": "node", "lat": round(g.y, 7), "lon": round(g.x, 7), "tags": tags}
    polys = list(g.geoms) if g.geom_type == "MultiPolygon" else [g] if g.geom_type == "Polygon" else []
    if kind == "relation":
        if not polys:
            return None
        return {"type": "relation", "tags": tags,
                "members": [{"role": "outer", "geometry": _pts(p.exterior.coords)} for p in polys]}
    # a way: its line, or the outline of a closed way
    if polys:
        return {"type": "way", "tags": tags, "geometry": _pts(polys[0].exterior.coords)}
    lines = list(g.geoms) if g.geom_type == "MultiLineString" else [g] if g.geom_type == "LineString" else []
    if not lines:
        return None
    return {"type": "way", "tags": tags, "geometry": _pts(lines[0].coords)}


def surroundings(lat: float, lon: float, radius: float) -> dict:
    O = local_data.osm()
    if O is None:
        raise FileNotFoundError("riyadh_osm.parquet is not in backend/data")
    x, y = _to_m.transform(lon, lat)
    roads, context = [], []
    for i in O["tree"].query(Point(x, y).buffer(radius), predicate="intersects"):
        kind, tags = O["type"][i], json.loads(O["tags"][i])
        el = _element(kind, tags, O["g"][i])
        if el is None:
            continue
        on_roads = kind == "node" or (kind == "way" and ("highway" in tags or "railway" in tags))
        (roads if on_roads else context).append(el)
    return {"radius": radius, "roads": {"elements": roads}, "context": {"elements": context}}


@router.get("/surroundings")
def get_surroundings(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius: float = Query(860, gt=0, le=1500),
):
    try:
        return surroundings(latitude, longitude, radius)
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error))
