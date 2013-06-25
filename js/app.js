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
    DIRECTIONS_SERVICE = new google.maps.DirectionsService(),
    ELEVATION_SERVICE  = new google.maps.ElevationService();

/**
 * ROUTE METHODS
 * {method} createRoute
 * {method} destroyRoute
 * {method} extendRoute
 * {method} truncateRoute
 */

function createRoute(location) {

    // Check argument.
    if (!location || typeof(location) !== 'object') {
        console.log('[DayTrip] Error: Invalid location passed to createRoute()');
        return;
    }

    // Create a marker at the clicked location.
    _createMarker(location);

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
        _destroyMarker(i - 1);
    }

    // Update directions.
    _printDirections();

    // Update elevations.
    _printElevations();
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
    _removeSegment();
}

function finishRoute() {

    // Calculate directions.
    intent = 'direct';
    getDirections();

    // Get elevation data for all points.
    requestElevation();
}

/**
 * API METHODS
 * {method} requestRoute
 * {method} handleRouteRequest
 * {method} requestElevation
 * {method} handleElevationRequest
 */

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

                _addSegment(result);

            } else if (intent === 'direct') {

                _printDirections(result);

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

function requestElevation() {

    if (!route.points || route.points.length === 0) {
        console.log('[DayTrip] Error: No points for getElevation()');
        return;
    }

    var data = {
        locations: route.points
    };

    // S'up, Google.
    ELEVATION_SERVICE.getElevationForLocations(data, handleElevationRequest);
}

function handleElevationRequest(results, status) {

    console.log('== [API] HANDLE ELEVATION REQUEST ==');

    switch (status) {

        case 'OK':
            _printElevations(results);
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

/**
 * DIRECTIONS METHODS
 * {method} getDirections
 * {method} _printDirections
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

function _printDirections(result) {

    // If fewer than 2 points, reset everything.
    if (route.points.length < 2) {
        $('#route-overview').html('');
        $('#route-directions').html('');
        return;
    }

    // Check argument.
    if (!result || typeof(result) !== 'object') {
        console.log('[DayTrip] Error: Invalid result passed to _printDirections()');
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
 * ELEVATIONS METHODS
 * {method} _printElevations
 */ 

function _printElevations(results) {

    // If fewer than 2 points, reset everything.
    if (route.points.length < 2) {
        $('#elevation-overview').html('');
        return;
    }

    // Check argument.
    if (!results || typeof(results) !== 'object') {
        console.log('[DayTrip] Error: Invalid results passed to _printElevations()');
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
    ascentFeet = metersToFeet(ascentMeters);
    descentFeet = metersToFeet(descentMeters);

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
 * SEGMENT METHODS
 * {method} _addSegment
 * {method} _removeSegment
 */

function _addSegment(result) {

    // Check argument.
    if (!result || typeof(result) !== 'object') {
        console.log('[DayTrip] Error: Invalid result passed to _addSegment()');
        return;
    }

    var segment = result.routes[0].overview_path        || [],
        seg_pts = result.routes[0].overview_path.length || 0;

    // If the route contains more than one point, erase the old final point's marker.
    if (route.points.length > 1) {
        _eraseMarker(route.markers.length - 1);
    }

    // Cache the number of points in this segment.
    route.segments.push(seg_pts);

    // Append this segment's points to the route.
    route.points = route.points.concat(segment);

    // Place a marker at the new final point.
    _createMarker(route.points[route.points.length - 1]);

    // Redraw the polyline on the map.
    polyline.setPath(route.points);
}

function _removeSegment() {

    // If no segments to remove, reset the route.
    if (route.segments.length === 0) {
        destroyRoute();
        return;
    }

    var pointsToRemove = route.segments[route.segments.length - 1];

    // Destroy the last marker in the marker's array.
    _destroyMarker(route.markers.length - 1);

    // If the route still contains more than one point, draw a marker at the new last point.
    if (route.points.length > 1) {
        _drawMarker(route.markers.length - 1);
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
 * {method} _createMarker
 * {method} _destroyMarker
 * {method} _drawMarker
 * {method} _eraseMarker
 */

function _createMarker(location) {

    // Check argument.
    if (!location || typeof(location) !== 'object') {
        console.log('[DayTrip] Error: Invalid location passed to _createMarker()');
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

function _destroyMarker(index) {

    // Check argument.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _destroyMarker()');
        return;
    }

    // Erase this marker from the map.
    _eraseMarker(index);

    // Remove this marker's data from the route.
    route.markers.splice(index, 1);
}

function _drawMarker(index) {

    // Check argument.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _drawMarker()');
        return;
    }

    // Draw this marker on the map.
    route.markers[index].setMap(map);
}

function _eraseMarker(index) {

    // Check argument.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _eraseMarker()');
        return;
    }

    // Erase this marker from the map.
    route.markers[index].setMap();
}

/**
 * UTILITIES
 * {method} __LOG
 * {method} metersToFeet
 */

function __LOG(caller) {
    console.log('LOG FROM', caller);
    console.log('route.points',route.points,'route.points.length',route.points.length);
    console.log('route.segments',route.segments,'route.segments.length',route.segments.length);
    console.log('route.markers',route.markers,'route.markers.length',route.markers.length);
    console.log('intent',intent);
}

function metersToFeet(meters) {

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