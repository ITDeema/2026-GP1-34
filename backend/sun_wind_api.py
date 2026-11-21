"""Sun path and wind for the results page, calculated the same way as the dataset notebook.

Add it to the app in main.py with two lines:
    from sun_wind_api import router as sun_wind_router
    app.include_router(sun_wind_router)

Endpoints
    GET /sunpath?latitude=&longitude=   hourly sun positions on 21 June, 21 March, 21 December
    GET /wind                           wind frequency per direction (EPW), same for every plot

Notebook rules that are kept on purpose
  Sun path ("Sun path and Shadow"):
    * year 2025, time zone Asia/Riyadh, one point per hour from 00:00 to 23:00
    * pvlib.solarposition.get_solarposition, altitude = "apparent_elevation", only points above the horizon
    * one fixed Riyadh point (24.71 N, 46.67 E) for every parcel, as in the dataset
      (set SUNPATH_USE_REQUEST_LOCATION=1 to use the plot's own coordinates instead)
  Wind (the wind rose of the page):
    * the EPW weather file (King Khalid airport TMYx), the same file as the façade indicators and the
      notebook's Wind block cell: wind_direction (the direction the wind comes FROM) and wind_speed per hour
    * eight 45-degree sectors; calm hours (speed < 0.5 m/s) are left out; frequency = share of the
      remaining hours, in percent
    * meanSpeed: mean over all the hours
    * seasons: the same calculation on the summer months (June-August, the hot wind) and on the winter
      months (December-February, the cool wind), for the sun and wind diagram
"""

from __future__ import annotations

import os
from functools import lru_cache

import numpy as np
import pandas as pd
import pvlib
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

# ------------------------------------------------------------------ sun path

DATASET_LAT = 24.71
DATASET_LON = 46.67
TIMEZONE = "Asia/Riyadh"
YEAR = 2025

# key used by the frontend -> (month, day)
SEASON_DAYS: dict[str, tuple[int, int]] = {
    "summer": (6, 21),
    "equinox": (3, 21),
    "winter": (12, 21),
}


@lru_cache(maxsize=256)
def sun_path(lat: float = DATASET_LAT, lon: float = DATASET_LON) -> dict:
    """{"arcs": {"summer": [...], "equinox": [...], "winter": [...]}}, each point being
    {"hour": local hour 0-23, "azimuth": degrees clockwise from north, "altitude": degrees}."""
    arcs: dict[str, list[dict]] = {}
    for key, (month, day) in SEASON_DAYS.items():
        times = pd.date_range(
            f"{YEAR}-{month:02d}-{day:02d} 00:00", periods=24, freq="h", tz=TIMEZONE
        )
        position = pvlib.solarposition.get_solarposition(times, lat, lon)
        arcs[key] = [
            {"hour": int(hour), "azimuth": round(float(az), 3), "altitude": round(float(alt), 3)}
            for hour, az, alt in zip(times.hour, position["azimuth"], position["apparent_elevation"])
            if alt > 0
        ]
    return {"arcs": arcs}


# ------------------------------------------------------------------ wind

DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
CALM_THRESHOLD = 0.5  # m/s
SEASON_MONTHS = {"summer": (6, 7, 8), "winter": (12, 1, 2)}  # hot wind, cool wind


class WindDataError(RuntimeError):
    """The EPW weather file is missing or has no usable wind."""


def wind_from_epw(direction, speed) -> dict:
    """Wind rose from EPW hours: direction the wind comes FROM (degrees from north), speed (m/s)."""
    direction = np.asarray(direction, dtype=float) % 360  # 360 = 0 (north)
    speed = np.asarray(speed, dtype=float)
    ok = np.isfinite(direction) & np.isfinite(speed)
    direction, speed = direction[ok], speed[ok]
    if speed.size == 0:
        raise WindDataError("The EPW file has no valid wind hours")
    calm = speed < CALM_THRESHOLD
    if calm.all():
        raise WindDataError("Every hour in the EPW file is calm")
    sector = np.floor(((direction + 22.5) % 360) / 45).astype(int)
    frequencies = 100 * np.bincount(sector[~calm], minlength=8) / (~calm).sum()
    return {
        "frequencies": {d: round(float(f), 2) for d, f in zip(DIRECTIONS, frequencies)},
        "dominant": DIRECTIONS[int(np.argmax(frequencies))],
        "meanSpeed": round(float(speed.mean()), 1),
        "calmShare": round(float(100 * calm.mean()), 1),
        "hours": int(speed.size),
    }


@lru_cache(maxsize=1)
def wind_stats() -> dict:
    """Read the EPW file once (one station for the whole city, the same file as the façade indicators)."""
    from facade_indicators_api import DataFileError, epw_path

    try:
        epw, _ = pvlib.iotools.read_epw(epw_path())
    except DataFileError as error:
        raise WindDataError(str(error)) from error
    wd, ws = epw["wind_direction"].to_numpy(float), epw["wind_speed"].to_numpy(float)
    stats = wind_from_epw(wd, ws)
    months = epw.index.month.to_numpy()
    seasons = {}
    for season, wanted in SEASON_MONTHS.items():
        rows = np.isin(months, wanted)
        part = wind_from_epw(wd[rows], ws[rows])
        seasons[season] = {k: part[k] for k in ("dominant", "frequencies", "meanSpeed")}
    stats["seasons"] = seasons
    return stats


# ------------------------------------------------------------------ routes


@router.get("/sunpath")
def get_sun_path(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> dict:
    if os.environ.get("SUNPATH_USE_REQUEST_LOCATION") == "1":
        return sun_path(round(latitude, 3), round(longitude, 3))
    return sun_path(DATASET_LAT, DATASET_LON)  # like the dataset: one fixed point for Riyadh


@router.get("/wind")
def get_wind() -> dict:
    try:
        return wind_stats()
    except WindDataError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
