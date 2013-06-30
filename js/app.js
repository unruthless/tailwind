'use strict';

var map,
    $map = $("#canvas"),
    map_controls = {
            $reset:  $('#control-reset'),
            $undo:   $('#control-undo'),
            $finish: $('#control-finish')
        },
    mode_controls = {
            $metric: $('#mode-distance-metric'),
            $imperial: $('#mode-distance-imperial'),
            $fahrenheit: $('#mode-temperature-f'),
            $celcius: $('#mode-temperature-c')
        },
    route = {
            points:     [],
            segments:   [],
            markers:    [],
            elevations: []
        },
    polyline = {},
    intent = '', // only way (for now) to pass intent into handleRoute callback :/ 
    mapOptions = {
            zoom: 14,
            mapTypeId: google.maps.MapTypeId.TERRAIN,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.TOP_LEFT
            },
            panControl: true,
            panControlOptions: {
                position: google.maps.ControlPosition.LEFT_TOP
            },
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.LEFT_TOP,
                style: google.maps.ZoomControlStyle.SMALL
            }
        },
    TRAVEL_MODE         = google.maps.DirectionsTravelMode.BICYCLING,
    DISTANCE_UNITS      = google.maps.UnitSystem.IMPERIAL, // Distances in Imperial units by default
    TEMPERATURE_UNITS   = 'F',                             // Temperatures in Fahrenheit by default
    AVOID_HIGHWAYS      = true,
    OPTIMIZE_WAYPOINTS  = false,
    PROVIDE_ROUTE_ALTERNATIVES = false,
    DIRECTIONS_SERVICE  = new google.maps.DirectionsService(), // using Google Maps Directions API
    ELEVATION_SERVICE   = new google.maps.ElevationService(),  // using Google Maps Elevation API
    WEATHER_SERVICE_KEY = 'ba53b8ecbdb1972c';                  // using Weather Underground API

/**
 * MODE METHODS
 * {method} setDistanceUnits
 * {method} setTemperatureUnits
 */

function setDistanceUnits(units) {

    if (!units) {
        console.log('[Tailwind] Error: Invalid units passed to setDistanceUnits()');
        return;
    }

    if (units === 'metric') {
        DISTANCE_UNITS = google.maps.UnitSystem.METRIC;
    }

    if (units === 'imperial') {
        DISTANCE_UNITS = google.maps.UnitSystem.IMPERIAL;
    }

    // Recalculate and re-render directions for the route.
    intent = 'direct';
    getDirections();

    // Recalculate and re-render elevation data for all points on the route.
    requestElevations();
}


function setTemperatureUnits(units) {

    if (!units) {
        console.log('[Tailwind] Error: Invalid units passed to setTemperatureUnits()');
        return;
    }

    if (units === 'f') {
        TEMPERATURE_UNITS = 'F';
    }

    if (units === 'c') {
        TEMPERATURE_UNITS = 'C';
    }

    // Re-render weather along the route.
    requestWeather();
}


/**
 * ROUTE METHODS
 * {method} createRoute
 * {method} destroyRoute
 * {method} extendRoute
 * {method} truncateRoute
 * {method} finishRoute
 * {method} requestRoute
 * {method} handleRouteRequest
 */

function createRoute(location) {

    // Check argument.
    if (!location || typeof(location) !== 'object') {
        console.log('[Tailwind] Error: Invalid location passed to createRoute()');
        return;
    }

    // Create a marker at the clicked location.
    createMarker(location);

    // Set the clicked location to be the first point on the route.
    route.points.push(location);

    // Create the polyline and draw it on the map.
    polyline = new google.maps.Polyline({ map: map });
    polyline.setPath(route.points);
}

function destroyRoute() {

    // If the user clicks Reset button before creating the route.
    if (polyline.setPath === undefined) {
        console.log('[Tailwind] Error: unable to destroy route that doesn\'t exist.');
        return;
    }

    // Delete all points on the route, then erase the polyline.
    route.points = [];
    polyline.setPath(route.points);

    // Remove the markers and underlying marker data.
    for (var i = route.markers.length; i > 0; i--) {
        destroyMarker(i - 1);
    }

    // Update directions.
    renderDirections();

    // Update elevations.
    renderElevations();

    // Update weather.
    renderWeather();
}

function extendRoute(location) {

    // Check argument.
    if (!location || typeof(location) !== 'object') {
        console.log('[Tailwind] Error: Invalid location passed to extendRoute()');
        return;
    }

    var origin      = route.points[route.points.length - 1],
        destination = location,
        waypoints   = [],
        result;

    // Request routing to update map.
    intent = 'draw';
    requestRoute(origin, destination, waypoints);
}

function truncateRoute() {

    // Remove the last segment from the route.
    removeSegment();
}

function finishRoute() {

    // Calculate directions for the route.
    intent = 'direct';
    getDirections();

    // Get elevation data for all points on the route.
    requestElevations();

    // Get weather along the route.
    requestWeather();
}

function requestRoute(origin, destination, waypoints) {

    // Check arguments.
    if (!origin || typeof(origin) !== 'object') {
        console.log('[Tailwind] Error: Invalid origin passed to getRoute()');
        return;
    }

    if (!destination || typeof(destination) !== 'object') {
        console.log('[Tailwind] Error: Invalid destination passed to getRoute()');
        return;
    }

    if (!intent || (intent !== 'draw' && intent !== 'direct')) {
        console.log('[Tailwind] Error: Invalid intent within getRoute()');
        return;
    }

    var data = {
            origin:                   origin,
            destination:              destination,
            travelMode:               TRAVEL_MODE,
            unitSystem:               DISTANCE_UNITS,
            avoidHighways:            AVOID_HIGHWAYS,
            optimizeWaypoints:        OPTIMIZE_WAYPOINTS,
            provideRouteAlternatives: PROVIDE_ROUTE_ALTERNATIVES
        };

    // Handle waypoints, which are optional.
    data['waypoints'] = (waypoints && typeof(waypoints) === 'array') ? waypoints : [];

    // S'up, Google.
    DIRECTIONS_SERVICE.route(data, handleRouteRequest);
}

function handleRouteRequest(result, status) {

    console.log('== [API] HANDLE ROUTE REQUEST ==');

    switch (status) {

        case 'OK':

            if (intent === 'draw') {

                addSegment(result);

            } else if (intent === 'direct') {

                renderDirections(result);

            } else {

                console.log('[Tailwind] Error: bad value for `intent`:', intent);

            }

            break;

        case 'INVALID_REQUEST':
            // If we get this error, check everything in routeOptions.
            console.log('[Tailwind] Google Directions API error code ' + status + ': The DirectionsRequest provided was invalid.');
            break;

        case 'MAX_WAYPOINTS_EXCEEDED':
            // The getDirections() function should prevent this error.
            console.log('[Tailwind] Google Directions API error code ' + status + ': Too many DirectionsWaypoints were provided in the DirectionsRequest. The total allowed waypoints is 8, plus the origin and destination. Maps API for Business customers are allowed 23 waypoints, plus the origin, and destination.');
            break;

        case 'NOT_FOUND':
            // If we get this error, check origin, destination, and all of the points in waypoints.
            console.log('[Tailwind] Google Directions API error code ' + status + ': At least one of the origin, destination, or waypoints could not be geocoded.');
            break;

        case 'OVER_QUERY_LIMIT':
            // If we get this error, kill the app.
            console.log('[Tailwind] Google Directions API error code ' + status + ': The webpage has gone over the requests limit in too short a period of time.');
            break;

        case 'REQUEST_DENIED':
            // If we get this error, check the settings where I got the API key.
            console.log('[Tailwind] Google Directions API error code ' + status + ': The webpage is not allowed to use the directions service.');
            break;

        case 'UNKNOWN_ERROR':
            // If we get this error, wait a tick, then try the request again some fixed number of times.
            console.log('[Tailwind] Google Directions API error code ' + status + ': A directions request could not be processed due to a server error. The request may succeed if you try again.');
            break;

        case 'ZERO_RESULTS':
            // If we get this error, check if the origin and destination are in different countries.
            // If they are, a few possibilities:
            //  - switch to the MapQuest API that uses openstreetmap data: http://open.mapquestapi.com/directions/
            //  - switch to walking directions and avoid highways.
            console.log('[Tailwind] Google Directions API error code ' + status + ': No route could be found between the origin and destination.');
            break;

        default:
            console.log('[Tailwind] The Google Directions API has returned an unknown status code:', status);
            break;
    }
}

/**
 * DIRECTIONS METHODS
 * {method} getDirections
 * {method} renderDirections
 */ 

function getDirections() {

    /*
       Google Maps API limit is 8 waypoints plus origin and destination. Lame.
       Below is a hack to make sure we aren't exceeding the API limit, but
       this needs a better solution for long or complex routes:
       because not every point is being sent to Google to use as a waypoint,
       the printed directions often don't match the route drawn on-screen.
    */
    var origin      = route.points[0],
        destination = route.points[route.points.length - 1],
        waypoints   = [],
        intervals   = _.uniq([
            Math.round(0.1111 * (route.points.length - 1)),
            Math.round(0.2222 * (route.points.length - 1)),
            Math.round(0.3333 * (route.points.length - 1)),
            Math.round(0.4444 * (route.points.length - 1)),
            Math.round(0.5555 * (route.points.length - 1)),
            Math.round(0.6666 * (route.points.length - 1)),
            Math.round(0.7777 * (route.points.length - 1)),
            Math.round(0.8888 * (route.points.length - 1))
        ]);

    for (var i = 0, len = intervals.length; i < len; i++) {
        waypoints[i] = {
            location: route.points[intervals[i]],
            stopover: false
        };
    }

    // Calculate the new route
    intent = 'direct';
    requestRoute(origin, destination, waypoints);
}

function renderDirections(result) {

    // If fewer than 2 points, reset everything.
    if (route.points.length < 2) {
        $('#route-overview').html('');
        $('#route-directions').html('');
        return;
    }

    // Check argument.
    if (!result || typeof(result) !== 'object') {
        console.log('[Tailwind] Error: Invalid result passed to renderDirections()');
        return;
    }

    // Assumptions: only one route, only one leg.
    var leg           = result.routes[0].legs[0] || [],
        origin        = leg['start_address']     || '',
        destination   = leg['end_address']       || '',
        totalDistance = leg['distance']['text']  || '',
        totalDuration = leg['duration']['text']  || '',
        steps         = leg['steps']             || [],
        directions    = '';


    // Build turn-by-turn directions.
    for (var s = 0, slen = steps.length; s < slen; s++) {

        directions += (s === 0) ? '<ol>' : '';

        directions += '<li>' + steps[s]['instructions'] + ' (' + steps[s]['distance']['text'] + ')</li>';

        directions += (s === slen - 1) ? '</ol>' : '';
    }

    // Output all the things.
    $('#route-overview').html('<p>' + 'From ' +  origin + ' to ' + destination + '</p><p>' + totalDistance + ' ' + totalDuration + '</p>');
    $('#route-directions').html(directions);
}

/**
 * ELEVATION METHODS
 * {method} requestElevations
 * {method} handleElevationsRequest
 * {method} logElevations
 * {method} renderProfile
 * {method} renderElevations
 */

function requestElevations() {

    if (!route.points || route.points.length === 0) {
        console.log('[Tailwind] Error: No points for getElevation()');
        return;
    }

    var data = {
        locations: route.points
    };

    // S'up, Google.
    ELEVATION_SERVICE.getElevationForLocations(data, handleElevationsRequest);
}

function handleElevationsRequest(results, status) {

    console.log('== [API] HANDLE ELEVATION REQUEST ==');

    switch (status) {

        case 'OK':
            logElevations(results);
            break;

        case 'INVALID_REQUEST':
            console.log('[Tailwind] Google Elevation API error code ' + status + ': The API request was malformed.');
            break;

        case 'OVER_QUERY_LIMIT':
            console.log('[Tailwind] Google Elevation API error code ' + status + ': The requestor has exceeded quota.');
            break;

        case 'REQUEST_DENIED':
            console.log('[Tailwind] Google Elevation API error code ' + status + ': The API did not complete the request.');
            break;

        case 'UNKNOWN_ERROR':
            console.log('[Tailwind] Google Elevation API error code ' + status + ': An elevation request could not be processed due to a server error. The request may succeed if you try again.');
            break;

        default:
            console.log('[Tailwind] The Google Elevation API has returned an unknown status code:', status);
            break;
    }
}

function logElevations(results) {

    // If fewer than 2 points, don't log anything.
    if (route.points.length < 2) {
        return;
    }

    // Check argument.
    if (!results || typeof(results) !== 'object') {
        console.log('[Tailwind] Error: Invalid results passed to logElevations()');
        return;
    }

    var latlng    = {},
        elevation = 0,
        x_delta   = 0,
        y_delta   = 0,
        distance  = 0,
        grade     = 0;

    for (var p = 0, plen = route.points.length; p < plen; p++) {

        latlng = route.points[p];

        elevation = results[p]['elevation'];

        if (p > 0) {
            x_delta = google.maps.geometry.spherical.computeDistanceBetween(route.points[p], route.points[p - 1]);
            y_delta = results[p]['elevation'] - results[p - 1]['elevation'];
        }

        distance += x_delta;

        grade = (x_delta !== 0) ? 100 * (y_delta / x_delta) : 0;

        route.elevations[p] = {
            'latlng'    : latlng,
            'elevation' : elevation,
            'x_delta'   : x_delta,
            'y_delta'   : y_delta,
            'distance'  : distance,
            'grade'     : grade
        }
    }

    renderProfile();
    renderElevations(results);
}

function renderProfile() {

    var w   = parseFloat($("#elevation-profile").css('width').replace('px',''), 10) || 0,
        h   = parseFloat($("#elevation-profile").css('height').replace('px',''), 10) || 0,
        gap = 1,
        svg = d3.select("#elevation-profile")
                .append("svg")
                .attr("width", w)
                .attr("height", h);

    svg.selectAll("rect")
        .data(route.elevations)
        .enter()
        .append("rect")
        .attr("x", function(d, i) {
            return i * (w / route.elevations.length);
        })
        .attr("y", function(d, i) {
            return h - d["elevation"];
        })
        .attr("width", function(d, i) {
            return w / route.elevations.length - gap;
        })
        .attr("height", function(d, i) {
            return d["elevation"];
        })
        .attr("fill", "blue");;
}

function renderElevations(results) {

    // If fewer than 2 points, reset everything.
    if (route.points.length < 2) {
        $('#elevation-overview').html('');
        return;
    }

    // Check argument.
    if (!results || typeof(results) !== 'object') {
        console.log('[Tailwind] Error: Invalid results passed to renderElevations()');
        return;
    }

    var delta_metric   = 0,
        ascent_metric  = 0,
        descent_metric = 0,
        delta,
        ascent,
        descent,
        unit_singular = '',
        unit_plural   = '';

    for (var r = 0, rlen = results.length; r < rlen; r++) {

        if (r + 1 < rlen) {
            
            delta_metric = (results[r + 1]['elevation'] - results[r]['elevation']);
            
            if (delta_metric < 0) {
                descent_metric += Math.abs(delta_metric);
            } else {
                ascent_metric += delta_metric;
            }
        }
    }

    if (DISTANCE_UNITS === google.maps.UnitSystem.IMPERIAL) {

        // Imperial
        ascent = __metersToFeet(ascent_metric);
        descent = __metersToFeet(descent_metric);
        unit_singular = 'foot';
        unit_plural = 'feet';

    } else {

        // Default to metric
        ascent = ascent_metric;
        descent = descent_metric;
        unit_singular = 'meter';
        unit_plural = 'meters';

    }

    // Calculate net change
    delta = ascent - descent;


    // Round to nearest unit and stringify.
    ascent  = Math.floor(ascent).toString();
    descent = Math.floor(descent).toString();
    delta   = Math.floor(delta).toString();

    // Set unit string.
    ascent  = (ascent  === '1') ? (ascent  + ' ' + unit_singular) : (ascent  + ' ' + unit_plural);
    descent = (descent === '1') ? (descent + ' ' + unit_singular) : (descent + ' ' + unit_singular);
    delta   = (delta   === '1') ? (delta   + ' ' + unit_singular) : (delta   + ' ' + unit_plural);

    // Output all the things.
    $('#elevation-overview').html('<p>' + ascent  + ' total climb, ' + descent + ' total drop, ' + delta   + ' net elevation change.</p>');
}

/**
 * WEATHER METHODS
 * {method} requestWeather
 * {method} handleWeatherRequestError
 * {method} handleWeatherRequestSuccess
 * {method} renderWeather
 */

function requestWeather() {

    console.log('== [API] REQUEST WEATHER ==');

    // Make sure that there is at least one point on the route
    if (!route.points || route.points.length === 0) {
        console.log('[Tailwind] Error: No points for requestWeather()');
        return;
    }

    var origin = {
            lat: route.points[0].lat(),
            lng: route.points[0].lng()
        },
        destination = {
            lat: route.points[route.points.length - 1].lat(),
            lng: route.points[route.points.length - 1].lng()
        },
        originSettings = {
            url: "http://api.wunderground.com/api/ba53b8ecbdb1972c/hourly/geolookup/conditions/q/" + origin.lat + "," + origin.lng + ".json",
            dataType: "jsonp",
            success: function(data) {

                // Check for error response from Weather Underground
                if (data.response.error !== undefined) {
                    console.log('[Tailwind] Weather Underground API error: ' + data.response.error.type + ' (' + data.response.error.description + ')');
                    return;
                }

                renderWeather(data, 'origin');
            },
            error: function() {
                console.log('[Tailwind] There was an error contacting the Weather Underground API.');
                return;
            }
        },
        destinationSettings = {
            url: "http://api.wunderground.com/api/ba53b8ecbdb1972c/hourly/geolookup/conditions/q/" + destination.lat + "," + destination.lng + ".json",
            dataType: "jsonp",
            success: function(data) {

                // Check for error response from Weather Underground
                if (data.response.error !== undefined) {
                    console.log('[Tailwind] Weather Underground API error: ' + data.response.error.type + ' (' + data.response.error.description + ')');
                    return;
                }

                renderWeather(data, 'destination');
            },
            error: function() {
                console.log('[Tailwind] There was an error contacting the Weather Underground API.');
                return;
            }
        };

    // S'up, Weather Underground.
    $.ajax(originSettings);
    $.ajax(destinationSettings);
}

function renderWeather(data, location) {

    // If fewer than 2 points, reset everything.
    if (route.points.length < 2) {
        $('#weather-hourly').html('');
        return;
    }

    // Check arguments
    if (!data || typeof(data) !== 'object') {
        console.log('[Tailwind] Error: Invalid data passed to renderWeather()');
        return;
    }

    var location = location || 'unknown location';

    // console.log('== Rendering weather for the next 12 hours at ' + location + ' ==');

    var time,
        humidity,
        temp,
        temp_f,
        temp_c,
        wind_degrees,
        wind_direction,
        wind_speed,
        wind_speed_mph,
        wind_speed_kph,
        html = '';

    for (var i = 0, len = 4; i < len; i++) {

        time            = data.hourly_forecast[i]['FCTTIME']['weekday_name_abbrev'] + ' ' + data.hourly_forecast[i]['FCTTIME']['civil'];
        humidity        = data.hourly_forecast[i]['humidity'] + '% humidity';
        temp_f          = data.hourly_forecast[i]['temp']['english'];
        temp_c          = data.hourly_forecast[i]['temp']['metric'];
        wind_degrees    = data.hourly_forecast[i]['wdir']['degrees'];
        wind_direction  = data.hourly_forecast[i]['wdir']['dir'];
        wind_speed_mph  = data.hourly_forecast[i]['wspd']['english'];
        wind_speed_kph  = data.hourly_forecast[i]['wspd']['metric'];

        temp = (TEMPERATURE_UNITS === 'F') ? (temp_f + '&deg;F') : (temp_c + '&deg;C');

        wind_speed = (DISTANCE_UNITS === google.maps.UnitSystem.IMPERIAL) ? (wind_speed_mph + 'mph') : (wind_speed_kph + 'kph');

        html += '<p>' + time + ' | ' + humidity + ' | ' + temp + ' | Wind ' + wind_speed + ' from the ' + wind_direction + ' (' + wind_degrees + '&deg;)</p>';
    }

    // Output all the things.
    $("#weather-hourly").html(html);
}

/**
 * SEGMENT METHODS
 * {method} addSegment
 * {method} removeSegment
 */

function addSegment(result) {

    // Check argument.
    if (!result || typeof(result) !== 'object') {
        console.log('[Tailwind] Error: Invalid result passed to addSegment()');
        return;
    }

    var segment = result.routes[0].overview_path        || [],
        seg_pts = result.routes[0].overview_path.length || 0;

    // If the route contains more than one point, erase the old final point's marker.
    if (route.points.length > 1) {
        eraseMarker(route.markers.length - 1);
    }

    // Cache the number of points in this segment.
    route.segments.push(seg_pts);

    // Append this segment's points to the route.
    route.points = route.points.concat(segment);

    // Place a marker at the new final point.
    createMarker(route.points[route.points.length - 1]);

    // Redraw the polyline on the map.
    polyline.setPath(route.points);
}

function removeSegment() {

    // If no segments to remove, reset the route.
    if (route.segments.length === 0) {
        destroyRoute();
        return;
    }

    var pointsToRemove = route.segments[route.segments.length - 1];

    // Destroy the last marker in the marker's array.
    destroyMarker(route.markers.length - 1);

    // If the route still contains more than one point, draw a marker at the new last point.
    if (route.points.length > 1) {
        drawMarker(route.markers.length - 1);
    }

    // Delete the last segment's data.
    route.segments.splice(-1, 1);

    // Remove the last segment's number of points from the route.
    route.points.splice(-pointsToRemove, pointsToRemove);

    // Redraw the polyline on the map.
    polyline.setPath(route.points);
}

/**
 * MARKER METHODS
 * {method} createMarker
 * {method} destroyMarker
 * {method} drawMarker
 * {method} eraseMarker
 */

function createMarker(location) {

    // Check argument.
    if (!location || typeof(location) !== 'object') {
        console.log('[Tailwind] Error: Invalid location passed to createMarker()');
        return;
    }

    // Create a marker at the provided location and draw it on the map.
    var marker = new google.maps.Marker({
            position: location,
            map: map
        });

    // Append this marker's data to the route.
    route.markers.push(marker);
}

function destroyMarker(index) {

    // Check argument.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[Tailwind] Error: Invalid index passed to destroyMarker()');
        return;
    }

    // Erase this marker from the map.
    eraseMarker(index);

    // Remove this marker's data from the route.
    route.markers.splice(index, 1);
}

function drawMarker(index) {

    // Check argument.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[Tailwind] Error: Invalid index passed to drawMarker()');
        return;
    }

    // Draw this marker on the map.
    route.markers[index].setMap(map);
}

function eraseMarker(index) {

    // Check argument.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[Tailwind] Error: Invalid index passed to eraseMarker()');
        return;
    }

    // Erase this marker from the map.
    route.markers[index].setMap();
}

/**
 * UTILITIES
 * {method} __LOG
 * {method} __metersToFeet
 */

function __LOG(caller) {
    console.log('LOG FROM', caller);
    console.log('route.points',route.points,'route.points.length',route.points.length);
    console.log('route.segments',route.segments,'route.segments.length',route.segments.length);
    console.log('route.markers',route.markers,'route.markers.length',route.markers.length);
    console.log('intent',intent);
}

function __metersToFeet(meters) {

    return (3.28084 * meters);
}

/**
 * INITIALIZATION
 */

function init() {

    console.log('== INIT ==');

    // Sample starter points, for convenience.
    var arboretum = [ 42.29871, -71.12783  ],
        massadona = [ 40.25275, -108.64038 ],
        castro    = [ 37.762,   -122.435   ];

    // Set map center.
    mapOptions['center'] = new google.maps.LatLng(castro[0],castro[1]);

    // Assign map to HTML element.
    map = new google.maps.Map($map.get(0), mapOptions);

    // Kick off map controls
    map_controls.$reset.on('click', function(event) {
        destroyRoute();
    });

    map_controls.$undo.on('click', function(event) {
        truncateRoute();
    });

    map_controls.$finish.on('click', function(event) {
        finishRoute();
    });

    // Kick off mode controls
    mode_controls.$metric.on('click', function(event) {
        setDistanceUnits('metric');
    });

    mode_controls.$imperial.on('click', function(event) {
        setDistanceUnits('imperial');
    });

    mode_controls.$fahrenheit.on('click', function(event) {
        setTemperatureUnits('f');
    });

    mode_controls.$celcius.on('click', function(event) {
        setTemperatureUnits('c');
    });

    // On click
    google.maps.event.addListener(map, 'click', function(event) {

        var location = event.latLng || '';

        if (route.points.length == 0) {
            createRoute(location);
        } else {
            extendRoute(location);
        }

    });
}

// Kickoff
google.maps.event.addDomListener(window, 'load', init);