var map,
    MAP_NODE           = $("#canvas").get(0),
    $resetBtn          = $('#control-reset'),
    $undoBtn           = $('#control-undo'),
    mapOptions         = {
            zoom: 13,
            mapTypeId: google.maps.MapTypeId.TERRAIN,
            mapTypeControl: true,
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.LEFT_TOP
            },
            panControl: true,
            panControlOptions: {
                position: google.maps.ControlPosition.LEFT_CENTER
            },
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.LEFT_CENTER
            }
        },
    polyline           = {},
    path               = [], // cache points
    segments           = [], // cache calculated segments
    directions         = [], // cache calculated directions
    markers            = [], // cache point marker objects
    TRAVEL_MODE        = google.maps.DirectionsTravelMode.BICYCLING,
    UNIT_SYSTEM        = google.maps.UnitSystem.IMPERIAL,
    AVOID_HIGHWAYS     = true,
    OPTIMIZE_WAYPOINTS = false,
    PROVIDE_ROUTE_ALTERNATIVES = false,
    DIRECTIONS_SERVICE = new google.maps.DirectionsService(),
    ERROR_STATUSES     = [
        {
            constant    : "INVALID_REQUEST",
            description : "The DirectionsRequest provided was invalid.",
            remedy      : "Email ruthie@cyclingcoder.com."
        },
        {
            constant    : "MAX_WAYPOINTS_EXCEEDED",
            description : "Too many DirectionsWaypoints were provided in the DirectionsRequest. The total allowed waypoints is 8, plus the origin and destination. Maps API for Business customers are allowed 23 waypoints, plus the origin, and destination.",
            remedy      : "Email ruthie@cyclingcoder.com."
        },
        {
            constant    : "NOT_FOUND",
            description : "At least one of the origin, destination, or waypoints could not be geocoded.",
            remedy      : "Email ruthie@cyclingcoder.com."
        },
        {
            constant    : "OVER_QUERY_LIMIT",
            description : "The webpage has gone over the requests limit in too short a period of time.",
            remedy      : "Email ruthie@cyclingcoder.com."
        },
        {
            constant    : "REQUEST_DENIED",
            description : "The webpage is not allowed to use the directions service.",
            remedy      : "Email ruthie@cyclingcoder.com."
        },
        {
            constant    : "UNKNOWN_ERROR",
            description : "A directions request could not be processed due to a server error. The request may succeed if you try again.",
            remedy      : "Email ruthie@cyclingcoder.com."
        },
        {
            constant    : "ZERO_RESULTS",
            description : "No route could be found between the origin and destination.",
            remedy      : "Try not crossing over country boundaries."
        }
    ];

/**
 * ROUTE METHODS
 * {method} createRoute
 * {method} destroyRoute
 * {method} extendRoute
 * {method} curtailRoute
 */

function createRoute(location) {

    console.log('== CREATE ROUTE ==');

    // Argument sanity check.
    if (!location || typeof(location) !== 'object') {
        console.log('[DayTrip] Error: Invalid location passed to createRoute()');
        return;
    }

    // Create a marker at the clicked location.
    _createMarker(location);

    // Set the clicked location, the path's origin, to be the first point.
    path.push(location);

    // Create the polyline and draw the path.
    polyline = new google.maps.Polyline({ map: map });
    polyline.setPath(path);
}

function destroyRoute() {

    console.log('== DESTROY ROUTE ==');

    // If the user clicks Reset button before creating the route
    if (polyline.setPath === undefined) {
        console.log('[DayTrip] Error: unable to destroy route that doesn\'t exist.');
        return;
    }

    // Empty all points from path, then erase the polyline.
    path = [];
    polyline.setPath(path);

    // Remove the markers and underlying marker data.
    for (var i = markers.length; i > 0; i--) {
        _destroyMarker(i - 1);
    }
}

function extendRoute(location) {

    console.log('== EXTEND ROUTE ==');

    // Argument sanity check.
    if (!location || typeof(location) !== 'object') {
        console.log('[DayTrip] Error: Invalid location passed to extendRoute()');
        return;
    }

    // Calculate directions between the previous point and the current point.
    DIRECTIONS_SERVICE.route({

        origin:                   path[path.length - 1],

        destination:              location,

        travelMode:               TRAVEL_MODE,

        unitSystem:               UNIT_SYSTEM,

        avoidHighways:            AVOID_HIGHWAYS,

        optimizeWaypoints:        OPTIMIZE_WAYPOINTS,

        provideRouteAlternatives: PROVIDE_ROUTE_ALTERNATIVES

    }, function(result, status) {

        if (status === "OK") {

            _addSegment(result);

            getDirections();

        } else {

            for (var s = 0, slen = ERROR_STATUSES.length; s < slen; s++) {
                if (status === ERROR_STATUSES[s]['constant']) {
                    throwError(ERROR_STATUSES[s], result);
                    return;
                }
            }
        }
    });
}

function curtailRoute() {

    console.log('== CURTAIL ROUTE ==');

    _removeSegment();
}

/**
 * DIRECTIONS METHODS
 * {method} getDirections
 * {method} _displayDirections
 */

function getDirections() {

    /* Google Maps API limit is 8 waypoints plus origin and destination. :( */
    var origin      = path[0],
        destination = path[path.length - 1],
        intervals   = _.uniq([
            Math.round(0.1111 * (path.length - 1)),
            Math.round(0.2222 * (path.length - 1)),
            Math.round(0.3333 * (path.length - 1)),
            Math.round(0.4444 * (path.length - 1)),
            Math.round(0.5555 * (path.length - 1)),
            Math.round(0.6666 * (path.length - 1)),
            Math.round(0.7777 * (path.length - 1)),
            Math.round(0.8888 * (path.length - 1))
        ])
        waypoints = [];

    for (var i = 0, len = intervals.length; i < len; i++) {
        waypoints[i] = {
            location: path[intervals[i]],
            stopover: false
        };
    }

    DIRECTIONS_SERVICE.route({

        origin:                   origin,

        destination:              destination,

        waypoints:                waypoints,

        travelMode:               TRAVEL_MODE,

        unitSystem:               UNIT_SYSTEM,

        avoidHighways:            AVOID_HIGHWAYS,

        optimizeWaypoints:        OPTIMIZE_WAYPOINTS,

        provideRouteAlternatives: PROVIDE_ROUTE_ALTERNATIVES

    }, function(result, status) {

        if (status === "OK") {

            _displayDirections(result);

        } else {

            for (var s = 0, slen = ERROR_STATUSES.length; s < slen; s++) {
                if (status === ERROR_STATUSES[s]['constant']) {
                    throwError(ERROR_STATUSES[s], result);
                    return;
                }
            }
        }
    });
}

function _displayDirections(result) {

    // Argument sanity check.
    if (!result || typeof(result) !== 'object') {
        console.log('[DayTrip] Error: Invalid result passed to _displayDirections()');
        return;
    }

    // Assumptions: only one route, only one leg.
    var leg           = result.routes[0].legs[0],
        steps         = leg['steps'] || [],
        origin        = leg['start_address'],
        destination   = leg['end_address'],
        totalDistance = leg['distance']['text'],
        totalDuration = leg['duration']['text'],
        stepsHTML     = '';

    stepsHTML = '<ol>';
    for (var s = 0, slen = steps.length; s < slen; s++) {
        stepsHTML += '<li>' + steps[s]['instructions'] + ' (' + steps[s]['distance']['text'] + ')</li>';
    }
    stepsHTML += '</ol>';

    $('#origin').text('From ' + origin);
    $('#destination').text('To ' + destination);
    $('#totalDistance').text(totalDistance);
    $('#totalDuration').text(totalDuration);
    $('#directions').html(stepsHTML);
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

    // If the path contains more than one point, erase the old final point's marker.
    if (path.length > 1) {
        _eraseMarker(markers.length - 1);
    }

    segments.push(seg_pts);

    // Add this segment's points to the path array.
    path = path.concat(segment);

    // Place a marker at the new final point.
    _createMarker(path[path.length - 1]);

    // Redraw the path.
    polyline.setPath(path);
}

function _removeSegment() {

    console.log('== _removeSegment() ==');

    var pointsToRemove = segments[segments.length - 1];

    // If no segments to remove, reset the route.
    if (segments.length === 0) {

        destroyRoute();

    } else {

        // Destroy the last marker in the marker's array
        _destroyMarker(markers.length - 1);

        // Remove the last (segment's number of) items from the path array
        path.splice(-pointsToRemove, pointsToRemove);

        // If path still contains more than one point, draw a marker at the new last point.
        if (path.length > 1) {
            _drawMarker(markers.length - 1);
        }

        // Redraw the path.
        polyline.setPath(path);

        // Remove the last item in the segment array.
        segments.splice(-1, 1);
    }
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

    // Append this marker to the markers array.
    markers.push(marker);
}

function _destroyMarker(index) {

    // Argument sanity check.
    if (index === undefined || typeof(index) !== 'number' || markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _destroyMarker()');
        return;
    }

    // Erase this marker from the map.
    _eraseMarker(index);

    // Remove this marker's data from the markers array.
    markers.splice(index, 1);
}

function _drawMarker(index) {

    // Argument sanity check.
    if (index === undefined || typeof(index) !== 'number' || markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _drawMarker()');
        return;
    }

    // Draw this marker on the map.
    markers[index].setMap(map);
}

function _eraseMarker(index) {

    // Argument sanity check.
    if (index === undefined || typeof(index) !== 'number' || markers[index] === undefined) {
        console.log('[DayTrip] Error: Invalid index passed to _eraseMarker()');
        return;
    }

    // Erase this marker from the map.
    markers[index].setMap();
}


/**
 * ERROR METHOD
 */

function throwError(status, result) {

    console.log('[DayTrip] ERROR.');
    console.log('|  type  |', status['constant']);
    console.log('|  desc  |', status['description']);
    console.log('| remedy |', status['remedy']);
    // console.log('debug result object from google', result);
}

/**
 * init()
 */

function init() {

    console.log('== INIT ==');

    // Set map center
    mapOptions['center'] = new google.maps.LatLng(40.25275, -108.64038);

    // Assign map to HTML element
    map = new google.maps.Map(MAP_NODE, mapOptions);

    // Kick off controls
    $resetBtn.on('click', function(event) {
        destroyRoute();
    });

    $undoBtn.on('click', function(event) {
        curtailRoute();
    });

    // On click
    google.maps.event.addListener(map, "click", function(event) {

        var location = event.latLng || '';

        if (path.length == 0) {
            createRoute(location);
        } else {
            extendRoute(location);
        }

    });
}

// Kickoff
google.maps.event.addDomListener(window, 'load', init);