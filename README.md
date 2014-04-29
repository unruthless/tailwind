Tailwind
=======

<b>Planning a long bicycle ride? Use Tailwind to</b>

* draw your route
* instantly see where (and how big) the climbs are
* get turn-by-turn directions
* check weather and wind conditions for your ride


Data Sources & Dependencies
----------------------------

Tailwind consumes data from the following services.
If the listed limitations prove untenable, I've also listed alternative data sources.
Eventually, it'd be nice to make these data sources interchangeable.

1. Google Maps v3 API for slippy map, markers, and polyline.
  * limited to 25000 map loads per day.
  * [Google Maps v3 API Documentation](https://developers.google.com/maps/documentation/javascript/)
  * Alternatives: [OpenLayers](http://openlayers.org/), [OpenStreetMap](http://switch2osm.org/), [MapQuest API](http://developer.mapquest.com/), [Leaflet.js](http://leafletjs.com/)

2. Google Directions API for turn-by-turn bicycling directions.
  * Limited to routes with 8 or fewer waypoints + origin & destination.
  * Refuses to give bicycle directions across international boundaries.
  * [Google Directions API Documentation](https://developers.google.com/maps/documentation/directions/)

3. Google Elevation API for elevation data along polyline.
  * Limited to 2500 requests per day.
  * [Google Elevation API Documentation](https://developers.google.com/maps/documentation/elevation/)
  * Alternatives: [USA National Elevation Dataset (NED)](http://gisdata.usgs.gov/bulk.php), [GeoNames Bulk Address Geocoder](http://www.geonames.org/export/)

4. Weather Underground API for current and forecasted weather conditions along route.
  * 500 requests per day, capped at 10 requests per minute
  * [Weather Underground API Documentation](http://www.wunderground.com/weather/api/)
  * Alternative: [OpenWeatherMap API](http://openweathermap.org/API)

Tailwind uses the following JavaScript libraries:

1. D3.js for drawing the elevation profile.
  * Alternative: [Google Chart API](https://developers.google.com/chart/)

2. Zepto.js for DOM manipulation.
  * Alternative: jQuery, or native code, or using D3's DOM manipulation helper functions.

3. Underscore.js
  * Alternative: create a smaller build with only the functions I'm using in it.


Developer Notes
---------------

The following are useful reading for now, and will be removed prior to beta release.

* [Add markers to Google Maps polyline at regular intervals](http://stackoverflow.com/questions/2698112/how-to-add-markers-on-google-maps-polylines-based-on-distance-along-the-line)
* [Basis for elevation profile](http://bl.ocks.org/mbostock/3883195)
* [Normalize elevation data when concatenating routes](http://bl.ocks.org/mbostock/1667367)
* [Calculate distance between two points on a globe](http://stackoverflow.com/questions/1502590/calculate-distance-between-two-points-in-google-maps-v3)
