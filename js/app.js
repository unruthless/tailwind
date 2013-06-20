function initialize() {

    // Set map options
    var mapOptions = {
        center: new google.maps.LatLng(-34.397, 150.644),
        zoom: 8,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    // Assign map to HTML element
    var map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

    // Configure Drawing Manager
    var drawingManager = new google.maps.drawing.DrawingManager({
        
        drawingMode: google.maps.drawing.OverlayType.MARKER,

        drawingControl: true,

        drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [
                google.maps.drawing.OverlayType.POLYLINE
            ]
        },

        markerOptions: {
            icon: 'images/beachflag.png'
        },

        circleOptions: {
            fillColor: '#ffff00',
            fillOpacity: 1,
            strokeWeight: 5,
            clickable: false,
            editable: true,
            zIndex: 1
        }
    });

    // Kick off Drawing Manager on map
    drawingManager.setMap(map);
}

google.maps.event.addDomListener(window, 'load', initialize);



