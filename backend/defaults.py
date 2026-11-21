"""The fixed values used when a value is missing and neither ArcGIS nor the local files have it.
Only the calculations and the model take them; the website marks the land area and the land use as
"بيانات تقديرية" (estimated data).

Where the numbers come from (Colab, run once):
  HEIGHT        the dataset's rule for a plot without a height (regulations 5-1-5)
  LAND_AREA     the median land_area of the dataset (villas_deema/renad/linah/jana.csv, 22,939 plots)
  STREET_WIDTH  the median STREETWIDTH of each street type (SUBTYPECLASS) in riyadh_streets.parquet
  STREET_WIDTH_ANY  the median of all streets, for a type not in the list
  LAND_USE      a neighbour whose use is not known is taken as residential
"""

HEIGHT = 14.0  # m
LAND_AREA = 499  # m2
STREET_WIDTH = {  # m
    "شارع رئيسي": 40.0,
    "شارع فرعي": 15.0,
    "شارع مجمع": 30.0,
    "طريق رئيسي": 60.0,
    "طريق سريع": 84.0,
    "طريق مقترح": 100.0,
    "ممر": 10.0,
    "ممر مشاه": 8.0,
}
STREET_WIDTH_ANY = 15.0  # m
LAND_USE = "سكني"
