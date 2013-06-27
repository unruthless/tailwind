Tailwind
=======

Easier planning for better riding.

Tailwind helps you streamline your route planning before your next all-day bicycle ride.

Riders, use this unified interface to draw your route, instantly see where (and how big) the climbs are, get turn-by-turn directions, and get a heads-up about the heat, humidity, and headwinds you may encounter along the way.


Data
----

Tailwind consumes data from the following services:

* Google Maps v3 API:
  [documentation] https://developers.google.com/maps/documentation/javascript/
  [rate limiting] 25000 map loads per day

* Google Directions API:
  [documentation] https://developers.google.com/maps/documentation/directions/
  [rate limiting] ?

* Google Elevation API
  [documentation] https://developers.google.com/maps/documentation/elevation/
  [rate limiting] 2500 requests/day

* Weather Underground API
  [documentation] http://www.wunderground.com/weather/api/
  [rate limiting] 500 requests/day, 10 requests/minute

Notes
-----

(The following are running developer notes; will be removed before official release.)

Google Chart API
https://developers.google.com/chart/

Datasets:
Elevation in USA: National Elevation Dataset (NED)
http://gisdata.usgs.gov/bulk.php

Geocoding addresses:
http://www.geonames.org/export/

Add markers to polyline at regular intervals:
http://stackoverflow.com/questions/2698112/how-to-add-markers-on-google-maps-polylines-based-on-distance-along-the-line