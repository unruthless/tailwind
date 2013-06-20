var map,
    polyline       = {},
    mapOptions     = {},
    path           = [],
    markers        = [],
    service        = new google.maps.DirectionsService(),
    ERROR_STATUSES = [
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
 * startRoute()
 */

function startRoute(event) {

    console.log('== startRoute() ==');

    var location = event.latLng,
        origin   = _addMarker(location);

    // Set the clicked location, the path's origin, to be the first point.
    path.push(location);

    // Create the polyline and draw the path.
    polyline = new google.maps.Polyline({ map: map });
    polyline.setPath(path);
}

/**
 * extendRoute()
 */

function extendRoute(event) {

    console.log('== extendRoute() ==');

    // Calculate directions between the previous point and the current point.
    service.route({

        origin:      path[path.length - 1],

        destination: event.latLng,

        travelMode:  google.maps.DirectionsTravelMode.BICYCLING

    }, function(result, status) {

        if (status === "OK") {

            _addPoint(result);

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

/**
 * resetRoute()
 */

function resetRoute() {

    console.log('== resetRoute() ==');

    // Remove the path data, then redraw polyline, which erases it.
    if (polyline.setPath !== 'undefined') {
        path = [];
        polyline.setPath(path);
    }

    // Remove the markers and underlying marker data.
    for (var i = markers.length - 1; i >= 0; i--) {
        _removeMarker(i);
    }
}

/**
 * _addPoint()
 */

function _addPoint(result) {

    console.log('== _addPoint() ==');

    // If the path contains more than one point, remove the marker from the old last point.
    if (path.length > 1) {
        _removeMarker(markers.length - 1);
    }

    // Add the point to the path array.
    path = path.concat(result.routes[0].overview_path);

    // Place a marker at the new last point.
    _addMarker(path[path.length - 1]);

    // Draw the path.
    polyline.setPath(path);
}

/**
 *
 */
 function _removePoint() {
    console.log('== _removePoint() ==');
 }


/**
 * _addMarker()
 */
function _addMarker(location) {

    console.log('== _addMarker() ==');

    // Draw a marker at the provided location.
    var marker = new google.maps.Marker({
            position: location,
            map: map
        });

    markers.push(marker);
}

/**
 * _removeMarker()
 */

function _removeMarker(index) {

    console.log('== _removeMarker() ==');

    // Erase this marker from the map.
    markers[index].setMap();

    // Remove this marker's data from the markers array.
    markers.splice(index, 1);
}

/**
 * throwError()
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

    console.log('== init() ==');

    // Set map options
    mapOptions = {
        center:    new google.maps.LatLng(40.25275, -108.64038),
        zoom:      15,
        mapTypeId: google.maps.MapTypeId.TERRAIN
    };

    // Assign map to HTML element
    map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

    // Kick off controls
    controls();

    // On click
    google.maps.event.addListener(map, "click", function(event) {

        if (path.length == 0) {
            startRoute(event);
        } else {
            extendRoute(event);
        }

    });
}


/**
 * controls()
 */

function controls() {

    var $resetBtn = $('#control-reset'),
        $undoBtn  = $('#control-undo');

    $resetBtn.on('click', function(event) {
        resetRoute();
    });

    $undoBtn.on('click', function(event) {
        console.log('undo button clicked');
    });

}


// Kickoff
google.maps.event.addDomListener(window, 'load', init);