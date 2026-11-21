Data files for the backend

In the repository:
  SAU_RI_Riyadh-Khalid.Intl.AP.404370_TMYx.2011-2025.epw
      weather: radiation, shade, wind shelter (/facade-indicators) and the wind rose (riyadh-climate.json)
  riyadh_streets.parquet          streets (Streets_NEW): the analysis when ArcGIS does not answer
  overture_places_riyadh.parquet  Overture places: the shops of /noise (as the dataset)
  pois_riyadh_merged.parquet      Overture + OSM + Foursquare: the services card (/services)
  Density.csv                     population density (/density)
  data_version.json               the date of the data above (made by the update)

Not in the repository:
  riyadh_parcels_all.parquet (130 MB, over GitHub's 100 MB limit)
      parcels with their use: the analysis when ArcGIS does not answer.
      Downloaded by the backend from the GitHub release "data-<date>" when it starts (local_data.py).
      Until the first release exists: copy it by hand from Drive: Maamar into this folder.
      Private repository: set the environment variable GITHUB_TOKEN (a token that can read the repository).
  riyadh_osm.parquet    OpenStreetMap for the analytical diagrams (buildings, land use, roads, transit): the same
      data the diagrams used to ask Overpass for. Downloaded from the release like the parcels; until then, copy it
      from Drive: Maamar.
  gba_riyadh.parquet    GBA buildings (does not change): run from the backend folder  python tools/clip_gba.py

Updates every 6 months (all except the EPW and GBA), counted from the date in data_version.json, the same for
every computer and the hosting server: GitHub Actions ".github/workflows/update-data.yml" runs every day, and
when 6 months have passed it runs tools/update_data.py, commits the small files and publishes the parcels as a
release. "Run workflow" (Actions tab, force = true) updates now. After an update: git pull, and restart the backend.

Where the data comes from during an analysis:
  * the plot, its neighbours, the streets, the noise: ArcGIS first (the newest); when it does not answer, the files above
  * the analytical diagrams: riyadh_osm.parquet only; the sun and wind diagram: riyadh-climate.json (the EPW)
