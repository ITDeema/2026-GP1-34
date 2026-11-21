"""The plot under a point from the local parcels file (riyadh_parcels_all.parquet), for the website when ArcGIS
does not answer (the website asks ArcGIS first: frontend/lib/analysis.ts, lookupPlot).

Endpoint
    GET /plot?latitude=&longitude=
        {"area": m2, "outline": [[lat, lon], ...], "landUse": ParcelSub or null, "estimated": false}
    When there is no parcel at the point or no parcels file: the fixed area of defaults.py, no outline,
    "estimated": true (the website shows it as estimated data).
"""
from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Query
from pyproj import Transformer
from shapely.geometry import Point

import defaults
import local_data
from facade_indicators_api import METRIC_SR

router = APIRouter()
_to_m = Transformer.from_crs(4326, METRIC_SR, always_xy=True)
_to_ll = Transformer.from_crs(METRIC_SR, 4326, always_xy=True)


@router.get("/plot")
def get_plot(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    P = local_data.parcels()
    geom = None
    if P is not None:
        x, y = _to_m.transform(longitude, latitude)
        geom = local_data.parcel_at(Point(x, y))
    if geom is None or geom.is_empty:
        return {"area": defaults.LAND_AREA, "outline": None, "landUse": None, "estimated": True}
    idx = P["tree"].query(geom.representative_point(), predicate="intersects")
    use = None
    for i in idx:  # the ParcelSub of the parcel picked (the same shape)
        if P["g"][i].equals(geom) or abs(P["g"][i].area - geom.area) < 0.5:
            use = str(P["sub"][i]) if P["sub"][i] not in (None, "", "غير محدد") else None
            break
    ring = np.asarray(geom.exterior.coords)[:, :2]
    lon, lat = _to_ll.transform(ring[:, 0], ring[:, 1])
    return {
        "area": round(float(geom.area)),
        "outline": np.round(np.column_stack([lat, lon]), 7).tolist(),
        "landUse": use,
        "estimated": False,
    }
