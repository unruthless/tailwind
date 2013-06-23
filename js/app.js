var map,
    $map               = $("#canvas"),
    $resetBtn          = $('#control-reset'),
    $undoBtn           = $('#control-undo'),
    polyline           = {},
    route              = {
            points:   [],
            segments: [],
            markers:  [],
            data:     []
        },
    intent             = '', // only way (for now) to pass intent into handleRoute callback :/ 
    mapOptions         = {
            zoom: 13,
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
    UNIT_SYSTEM        = google.maps.UnitSystem.IMPERIAL,
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

    console.log('== [ROUTE] CREATE ROUTE ==');

    // Argument sanity check.
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

    console.log('== [ROUTE] DESTROY ROUTE ==');

    // If the user clicks Reset button before creating the route
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

    // Update info
    _printDirections();
}

function extendRoute(location) {

    console.log('== [ROUTE] EXTEND ROUTE ==');

    // Argument sanity check.
    if (!location || typeof(location) !== 'object') {
        console.log('[DayTrip] Error: Invalid location passed to extendRoute()');
        return;
    }

    var origin      = route.points[route.points.length - 1],
        destination = location,
        waypoints   = [],
        result;

    // Request routing to update map
    intent = 'draw';
    getRoute(origin, destination, waypoints);
}

function truncateRoute() {

    console.log('== [ROUTE] TRUNCATE ROUTE ==');

    // Remove a segment
    _removeSegment();
}

/**
 * API METHODS
 * {method} getRoute
 * {method} handleRoute
 */

function getRoute(origin, destination, waypoints) {

    console.log('== [API] GET ROUTE ==');

    // Argument sanity checking.
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

    var routeOptions = {
            origin:                   origin,
            destination:              destination,
            travelMode:               TRAVEL_MODE,
            unitSystem:               UNIT_SYSTEM,
            avoidHighways:            AVOID_HIGHWAYS,
            optimizeWaypoints:        OPTIMIZE_WAYPOINTS,
            provideRouteAlternatives: PROVIDE_ROUTE_ALTERNATIVES
        };

    // Handle waypoints, which are optional.
    routeOptions['waypoints'] = (waypoints && typeof(waypoints) === 'array') ? waypoints : [];

    // S'up, Google.
    DIRECTIONS_SERVICE.route(routeOptions, handleRoute);
}

function handleRoute(result, status) {

    console.log('== [API] HANDLE ROUTE ==');

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
            console.log('The DirectionsRequest provided was invalid.');
            break;

        case 'MAX_WAYPOINTS_EXCEEDED':
            // The getDirections() function should prevent this error.
            console.log('Too many DirectionsWaypoints were provided in the DirectionsRequest. The total allowed waypoints is 8, plus the origin and destination. Maps API for Business customers are allowed 23 waypoints, plus the origin, and destination.');
            break;

        case 'NOT_FOUND':
            // If we get this error, check origin, destination, and all of the points in waypoints.
            console.log('At least one of the origin, destination, or waypoints could not be geocoded.');
            break;

        case 'OVER_QUERY_LIMIT':
            // If we get this error, kill the app.
            console.log('The webpage has gone over the requests limit in too short a period of time.');
            break;

        case 'REQUEST_DENIED':
            // If we get this error, 
            console.log('The webpage is not allowed to use the directions service.');
            break;

        case 'UNKNOWN_ERROR':
            // If we get this error, wait a tick, then try the request again some fixed number of times.
            console.log('A directions request could not be processed due to a server error. The request may succeed if you try again.');
            break;

        case 'ZERO_RESULTS':
            // If we get this error, check if the origin and destination are in different countries.
            // If they are, a few possibilities:
            //  - switch to the MapQuest API that uses openstreetmap data: http://open.mapquestapi.com/directions/
            //  - switch to walking directions and avoid highways.
            console.log('No route could be found between the origin and destination.');
            break;

        default:
            console.log('The Google Directions API has returned an unknown status code.');
            break;
    }
}

/**
 * DIRECTIONS METHODS
 * {method} extendDirections
 * {method} truncateDirections
 * {method} _printDirections
 */

function extendDirections() {

    console.log('== [DIRECTIONS] EXTEND DIRECTIONS ==');

    /* Google Maps API limit is 8 waypoints plus origin and destination. :(
       This is a problem with longer or more complex routes:
       because not every point is being sent to Google to use as a waypoint,
       the printed directions aren't necessarily going to match the route
       drawn on-screen.
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
    getRoute(origin, destination, waypoints);
}

function truncateDirections() {

    console.log('== [DIRECTIONS] TRUNCATE DIRECTIONS ==');

    // TBD. Stepping back shouldn't require another API call;
    // we should cache the directions from the previous segment.
}

function _printDirections(result) {

    console.log('== [DIRECTIONS] _printDirections ==');

    var leg,
        steps,
        origin,
        destination,
        totalDistance,
        totalDuration,
        directions;

    // If fewer than 2 points, reset everything.
    if (route.points.length < 2) {
        $('#origin').text('');
        $('#destination').text('');
        $('#totalDistance').text('');
        $('#totalDuration').text('');
        $('#directions').text('');
        return;
    }

    // Argument sanity check.
    if (!result || typeof(result) !== 'object') {
        console.log('[DayTrip] Error: Invalid result passed to _displayDirections()');
        return;
    }

    // Assumptions: only one route, only one leg.
    leg           = result.routes[0].legs[0] || [];
    origin        = leg['start_address']     || '';
    destination   = leg['end_address']       || '';
    totalDistance = leg['distance']['text']  || '';
    totalDuration = leg['duration']['text']  || '';
    steps         = leg['steps']             || [];
    directions    = '';

    // Build turn-by-turn directions.
    for (var s = 0, slen = steps.length; s < slen; s++) {

        directions += (s === 0) ? '<ol>' : '';

        directions += '<li>' + steps[s]['instructions'] + ' (' + steps[s]['distance']['text'] + ')</li>';

        directions += (s === slen - 1) ? '</ol>' : '';
    }

    // Output all the things.
    $('#origin').text('From ' + origin);
    $('#destination').text('To ' + destination);
    $('#totalDistance').text(totalDistance);
    $('#totalDuration').text(totalDuration);
    $('#directions').html(directions);
}

/**
 * SEGMENT METHODS
 * {method} _addSegment
 * {method} _removeSegment
 */

function _addSegment(result) {

    // Argument sanity check.
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

    // Recalculate directions.
    intent = 'direct';
    extendDirections();
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

    // Remove the last segment's number of points from the route.
    route.points.splice(-pointsToRemove, pointsToRemove);

    // If the route still contains more than one point, draw a marker at the new last point.
    if (route.points.length > 1) {
        _drawMarker(route.markers.length - 1);
    }

    // Redraw the polyline on the map.
    polyline.setPath(route.points);

    // Delete the last segment's data.
    route.segments.splice(-1, 1);

    // Recalculate directions.
    intent = 'direct';
    extendDirections();
}

/**
 * MARKER METHODS
 * {method} _createMarker
 * {method} _destroyMarker
 * {method} _drawMarker
 * {method} _eraseMarker
 */

function _createMarker(location) {

    // Argument sanity check.
    if (!location || typeof(location) !== 'object') {
        console.log('[DayTrip] Error: Invalid location passed to _createMarker()');
        return;
    }

    // Draw a marker at the provided location.
    var marker = new google.maps.Marker({
            position: location,
            map: map
        });

    // Append this marker's data to the route.
    route.markers.push(marker);
}

function _destroyMarker(index) {

    // Argument sanity check.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _destroyMarker()');
        return;
    }

    // Erase this marker from the map.
    _eraseMarker(index);

    // Remove this marker from the route data.
    route.markers.splice(index, 1);
}

function _drawMarker(index) {

    // Argument sanity check.
    if (index === undefined || typeof(index) !== 'number' || route.markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _drawMarker()');
        return;
    }

    // Draw this marker on the map.
    route.markers[index].setMap(map);
}

function _eraseMarker(index) {

    // Argument sanity check.
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
 */

function __LOG(caller) {
    console.log('LOG FROM', caller);
    console.log('route.points',route.points,'route.points.length',route.points.length);
    console.log('route.segments',route.segments,'route.segments.length',route.segments.length);
    console.log('route.markers',route.markers,'route.markers.length',route.markers.length);
    console.log('intent',intent);
}

/**
 * init()
 */

function init() {

    console.log('== INIT ==');

    var arboretum = [42.29871, -71.12783];
    var massadona = [40.25275, -108.64038];

    // Set map center
    mapOptions['center'] = new google.maps.LatLng(arboretum[0],arboretum[1]);

    // Assign map to HTML element
    map = new google.maps.Map($map.get(0), mapOptions);

    // Kick off controls
    $resetBtn.on('click', function(event) {
        destroyRoute();
    });

    $undoBtn.on('click', function(event) {
        truncateRoute();
    });

    // On click
    google.maps.event.addListener(map, "click", function(event) {

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