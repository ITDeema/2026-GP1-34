"""Writes the sun path and the wind of Riyadh to frontend/lib/riyadh-climate.json.

Both are the same for every plot (the sun path of one fixed point for Riyadh, like the dataset, and the wind
of the EPW weather station), so the website reads them from that file instead of asking the backend each time.
Run it again when the EPW file (data/*Khalid*.epw) or the calculation changes:

    cd backend
    python tools/export_riyadh_climate.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sun_wind_api import DATASET_LAT, DATASET_LON, sun_path, wind_stats  # noqa: E402

OUTPUT = BACKEND.parent / "frontend" / "lib" / "riyadh-climate.json"


def main() -> None:
    data = {
        "point": {"latitude": DATASET_LAT, "longitude": DATASET_LON},
        "sunPath": sun_path(DATASET_LAT, DATASET_LON),
        "wind": wind_stats(),
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Written {OUTPUT} ({OUTPUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
