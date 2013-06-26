var map,
    $map = $("#canvas"),
    polyline = {},
    controls = {
            $reset:  $('#control-reset'),
            $undo:   $('#control-undo'),
            $finish: $('#control-finish')
        },
    route = {
            points:   [],
            segments: [],
            markers:  [],
            data:     []
        },
    intent = '', // only way (for now) to pass intent into handleRoute callback :/ 
    mapOptions = {
            zoom: 15,
            mapTypeId: google.maps.MapTypeId.TERRAIN,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.RIGHT_TOP
            },
            panControl: true,
            panControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
            },
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
            }
        },
    TRAVEL_MODE        = google.maps.DirectionsTravelMode.BICYCLING,
    UNIT_SYSTEM        = google.maps.UnitSystem.METRIC,
    AVOID_HIGHWAYS     = true,
    OPTIMIZE_WAYPOINTS = false,
    PROVIDE_ROUTE_ALTERNATIVES = false,
    DIRECTIONS_SERVICE = new google.maps.DirectionsService(), // using Google Maps Directions API
    ELEVATION_SERVICE  = new google.maps.ElevationService(),  // using Google Maps Elevation API
    WEATHER_SERVICE_KEY = 'ba53b8ecbdb1972c';                 // using Weather Underground API

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
        console.log('[DayTrip] Error: Invalid location passed to createRoute()');
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
        console.log('[DayTrip] Error: unable to destroy route that doesn\'t exist.');
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
}

function extendRoute(location) {

    // Check argument.
    if (!location || typeof(location) !== 'object') {
        console.log('[DayTrip] Error: Invalid location passed to extendRoute()');
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
        console.log('[DayTrip] Error: Invalid origin passed to getRoute()');
        return;
    }

    if (!destination || typeof(destination) !== 'object') {
        console.log('[DayTrip] Error: Invalid destination passed to getRoute()');
        return;
    }

    if (!intent || (intent !== 'draw' && intent !== 'direct')) {
        console.log('[DayTrip] Error: Invalid intent within getRoute()');
        return;
    }

    var data = {
            origin:                   origin,
            destination:              destination,
            travelMode:               TRAVEL_MODE,
            unitSystem:               UNIT_SYSTEM,
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

                console.log('[DayTrip] Error: bad value for `intent`:', intent);

            }

            break;

        case 'INVALID_REQUEST':
            // If we get this error, check everything in routeOptions.
            console.log('[DayTrip] Google Directions API error code ' + status + ': The DirectionsRequest provided was invalid.');
            break;

        case 'MAX_WAYPOINTS_EXCEEDED':
            // The getDirections() function should prevent this error.
            console.log('[DayTrip] Google Directions API error code ' + status + ': Too many DirectionsWaypoints were provided in the DirectionsRequest. The total allowed waypoints is 8, plus the origin and destination. Maps API for Business customers are allowed 23 waypoints, plus the origin, and destination.');
            break;

        case 'NOT_FOUND':
            // If we get this error, check origin, destination, and all of the points in waypoints.
            console.log('[DayTrip] Google Directions API error code ' + status + ': At least one of the origin, destination, or waypoints could not be geocoded.');
            break;

        case 'OVER_QUERY_LIMIT':
            // If we get this error, kill the app.
            console.log('[DayTrip] Google Directions API error code ' + status + ': The webpage has gone over the requests limit in too short a period of time.');
            break;

        case 'REQUEST_DENIED':
            // If we get this error, check the settings where I got the API key.
            console.log('[DayTrip] Google Directions API error code ' + status + ': The webpage is not allowed to use the directions service.');
            break;

        case 'UNKNOWN_ERROR':
            // If we get this error, wait a tick, then try the request again some fixed number of times.
            console.log('[DayTrip] Google Directions API error code ' + status + ': A directions request could not be processed due to a server error. The request may succeed if you try again.');
            break;

        case 'ZERO_RESULTS':
            // If we get this error, check if the origin and destination are in different countries.
            // If they are, a few possibilities:
            //  - switch to the MapQuest API that uses openstreetmap data: http://open.mapquestapi.com/directions/
            //  - switch to walking directions and avoid highways.
            console.log('[DayTrip] Google Directions API error code ' + status + ': No route could be found between the origin and destination.');
            break;

        default:
            console.log('[DayTrip] The Google Directions API has returned an unknown status code:', status);
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
        console.log('[DayTrip] Error: Invalid result passed to renderDirections()');
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
 * {method} renderElevations
 */

function requestElevations() {

    if (!route.points || route.points.length === 0) {
        console.log('[DayTrip] Error: No points for getElevation()');
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
            renderElevations(results);
            break;

        case 'INVALID_REQUEST':
            console.log('[DayTrip] Google Elevation API error code ' + status + ': The API request was malformed.');
            break;

        case 'OVER_QUERY_LIMIT':
            console.log('[DayTrip] Google Elevation API error code ' + status + ': The requestor has exceeded quota.');
            break;

        case 'REQUEST_DENIED':
            console.log('[DayTrip] Google Elevation API error code ' + status + ': The API did not complete the request.');
            break;

        case 'UNKNOWN_ERROR':
            console.log('[DayTrip] Google Elevation API error code ' + status + ': An elevation request could not be processed due to a server error. The request may succeed if you try again.');
            break;

        default:
            console.log('[DayTrip] The Google Elevation API has returned an unknown status code:', status);
            break;
    }
}

function renderElevations(results) {

    // If fewer than 2 points, reset everything.
    if (route.points.length < 2) {
        $('#elevation-overview').html('');
        return;
    }

    // Check argument.
    if (!results || typeof(results) !== 'object') {
        console.log('[DayTrip] Error: Invalid results passed to renderElevations()');
        return;
    }

    var deltaMeters     = 0,
        netDeltaMeters  = 0,
        netDeltaFeet    = 0,
        ascentMeters    = 0,
        ascentFeet      = 0,
        descentMeters   = 0,
        descentFeet     = 0;

    for (var r = 0, rlen = results.length; r < rlen; r++) {

        if (r + 1 < rlen) {
            
            deltaMeters = (results[r + 1]['elevation'] - results[r]['elevation']);
            
            if (deltaMeters < 0) {
                descentMeters += Math.abs(deltaMeters);
            } else {
                ascentMeters += deltaMeters;
            }
        }
    }

    // Convert to feet.
    ascentFeet = __metersToFeet(ascentMeters);
    descentFeet = __metersToFeet(descentMeters);

    // Calculate net elevation change.
    netDeltaMeters = ascentMeters - descentMeters;
    netDeltaFeet = ascentFeet - descentFeet;

    // Round to nearest unit and stringify.
    ascentMeters = Math.floor(ascentMeters).toString();
    descentMeters = Math.floor(descentMeters).toString();
    ascentFeet = Math.floor(ascentFeet).toString();
    descentFeet = Math.floor(descentFeet).toString();
    netDeltaMeters = Math.floor(netDeltaMeters).toString();
    netDeltaFeet = Math.floor(netDeltaFeet).toString();

    // Output all the things.
    $('#elevation-overview').html('<p>'
        + ascentMeters   + ' meters (' + ascentFeet   + ' feet) total climb.<br>'
        + descentMeters  + ' meters (' + descentFeet  + ' feet) total drop.<br>'
        + netDeltaMeters + ' meters (' + netDeltaFeet + ' feet) overall elevation change.'
        + '</p>');
}

/**
 * WEATHER METHODS
 * {method} requestWeather
 * {method} handleWeatherRequestError
 * {method} handleWeatherRequestSuccess
 * {method} renderWeather
 */

function requestWeather(requestType) {

    console.log('== [API] REQUEST WEATHER ==');

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
                    console.log('[DayTrip] Weather Underground API error: ' + data.response.error.type + ' (' + data.response.error.description + ')');
                    return;
                }

                renderWeather(data, 'origin');
            },
            error: function() {
                console.log('[DayTrip] There was an error contacting the Weather Underground API.');
                return;
            }
        },
        destinationSettings = {
            url: "http://api.wunderground.com/api/ba53b8ecbdb1972c/hourly/geolookup/conditions/q/" + destination.lat + "," + destination.lng + ".json",
            dataType: "jsonp",
            success: function(data) {

                // Check for error response from Weather Underground
                if (data.response.error !== undefined) {
                    console.log('[DayTrip] Weather Underground API error: ' + data.response.error.type + ' (' + data.response.error.description + ')');
                    return;
                }

                renderWeather(data, 'destination');
            },
            error: function() {
                console.log('[DayTrip] There was an error contacting the Weather Underground API.');
                return;
            }
        };

    // S'up, Weather Underground.
    $.ajax(originSettings);
    $.ajax(destinationSettings);
}

function renderWeather(data, location) {

    console.log('== Rendering weather for the next 12 hours at ' + location + ' ==');

    var time,
        humidity,
        temp_f,
        temp_c,
        wind_degrees,
        wind_direction,
        wind_speed_mph,
        wind_speed_kph,
        html = '';

    for (var i = 0, len = 12; i < len; i++) {

        time            = data.hourly_forecast[i]['FCTTIME']['weekday_name_abbrev'] + ' ' + data.hourly_forecast[i]['FCTTIME']['civil'];
        humidity        = data.hourly_forecast[i]['humidity'];
        temp_f          = data.hourly_forecast[i]['temp']['english'];
        temp_c          = data.hourly_forecast[i]['temp']['metric'];
        wind_degrees    = data.hourly_forecast[i]['wdir']['degrees'];
        wind_direction  = data.hourly_forecast[i]['wdir']['dir'];
        wind_speed_mph  = data.hourly_forecast[i]['wspd']['english'];
        wind_speed_kph  = data.hourly_forecast[i]['wspd']['metric'];

        // Imperial
        html += '<p>' + time + ' | ' + humidity + '% humidity | ' + temp_f + 'ºF | Wind ' + wind_speed_mph + 'mph from the ' + wind_direction + ' (' + wind_degrees + 'º)</p>';

        // Metric
        //console.log(time, '|', humidity, '% humidity |', temp_c, 'ºC | Wind', wind_speed_kph, 'kph from the', wind_direction, '(', wind_degrees, 'º)');
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
        console.log('[DayTrip] Error: Invalid result passed to addSegment()');
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
        console.log('[DayTrip] Error: Invalid location passed to createMarker()');
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
        console.log('[DayTrip] Error: Invalid index passed to destroyMarker()');
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
        console.log('[DayTrip] Error: Invalid index passed to drawMarker()');
        return;
    }

    // Draw this marker on the map.
    route.markers[index].setMap(map);
}

function eraseMarker(index) {

    // Check argument.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to eraseMarker()');
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
    mapOptions['center'] = new google.maps.LatLng(arboretum[0],arboretum[1]);

    // Assign map to HTML element.
    map = new google.maps.Map($map.get(0), mapOptions);

    // Kick off controls
    controls.$reset.on('click', function(event) {
        destroyRoute();
    });

    controls.$undo.on('click', function(event) {
        truncateRoute();
    });

    controls.$finish.on('click', function(event) {
        finishRoute();
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