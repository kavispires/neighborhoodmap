var ViewModel = function() {
    var self = this;

    // Initialize all starting functions (this function is only called at the end of the ViewModel)
    this.initApp = function() {
        // Screen Size
        self.determineScreenSize();
        // Populates observables: cityList, cityLocations, currentCity and currentLocations 
        self.populateCityObservables();
        // Populates filter list (this function is also called whenever currentCity is updated)
        self.populatefilterList();
        // Initiate map
        self.initMap();
    };

    /*  --------------
        LOCAL STORAGE
        -------------- */

    // Reads localStorage and updates cityLocations observable
    this.userSavedFavorites = function() {
        // Check if Browser supports localStorage
        if (typeof(Storage) !== 'undefined') {
            var localData = window.localStorage;
            // Check if saved data is meant for this app
            if(localData['app'] == '10places') {
                // Loop through object
                var cityNumber, locationNumber;
                for(var i = 0; i < localData.length - 1; i++) {
                    cityNumber = Number(localData.key(i)[0]);
                    locationNumber = Number(localData.key(i)[1]);
                    // Update favorites
                    self.cityLocations()[cityNumber][locationNumber].favorite(true);
                }
                
            } else {
                // If localStorage data is not for this app, clear it and reset it
                window.localStorage.clear();
                window.localStorage.setItem('app', '10places');
            }
        } else {
            alert('No browser Web Storage support. No data will be saved.');
        }
    };

    

    /*  --------------
        MENUS 
        -------------- */

    // Hamburger Menus for Small Screens
    this.smallScreen = ko.observable();
    this.navigationMenu = ko.observable();
    this.floaterWindow = ko.observable();
    
    // Populate observables based on screensize
    this.determineScreenSize = function(){
        var windowWidth = $(window).width();
        if(windowWidth < 680) self.smallScreen(true);
        if (self.smallScreen()) {
            self.navigationMenu(false);
            self.floaterWindow(false);
        } else {
            self.navigationMenu(true);
            self.floaterWindow(true);
        }
    };

    // Show/Hide .nav-list
    this.toggleNavigationMenu = function() {
        self.navigationMenu(!self.navigationMenu());
        // Always hides floater, in small screens
        self.hidefloaterWindow();
    };

    // Show/hide .floater
    this.toggleFloaterWindow = function() {
        self.floaterWindow(!self.floaterWindow());
    };

    // Always hides floater, in small screens
    this.hidefloaterWindow = function() {
        if(self.smallScreen()) self.floaterWindow(false);
    };

    /*  --------------
        APP FEATURES 
        -------------- */

    this.cityList = ko.observableArray([]); // Contains just the city names
    this.cityLocations = ko.observableArray([]); // Contains arrays with the city locations objects

    // Populate cityList with city names from database
    // Also, populate cityLocations with objects for each city [city[locations{}]] from database
    // Then populates currentCity and cityLocations
    this.populateCityObservables = function() {
        for (var key in database) {
            self.cityList.push(key);
            var cityArr = [];
            if (database.hasOwnProperty(key)) {
                for (var i = 0; i < database[key].length; i++) {
                    cityArr.push(database[key][i]);
                }
            }
            self.cityLocations.push(cityArr);
        }
        // Restore saved data
        self.userSavedFavorites();
        // Populate currentCity and currentLocations
        self.currentCity(self.cityList()[self.currentCityIndex]);
        self.currentLocations(self.cityLocations()[self.currentCityIndex]);
    };

    // Determine current City and Locations
    this.currentCityIndex = 0;
    this.currentCity = ko.observable();
    this.currentLocations = ko.observableArray();

    // .nav-item click updates currentCity and cuttentLocations
    this.updateCurrentCity = function(data) {
        // Update currentCity
        var index = self.cityList.indexOf(data);
        // Run only if new city is different than currentCity
        if(index !== self.currentCityIndex) {
            self.currentCity(self.cityList()[index]);
            self.currentLocations(self.cityLocations()[index]);
            self.currentCityIndex = index;
            self.initMap();
            // Recolor Markers
            self.recolorFavoriteMarkers(data);
            // Updates search field filter list
            self.populatefilterList();
        }
        // if smallScreen only, close nav
        if(self.smallScreen()) self.navigationMenu(false);
    };

    // Show Favotires/Show All Locations
    this.favoriteStatus = ko.observable(false);
    this.toggleFavoriteLink = ko.observable('Filter Favorites Only');
    this.toggleFavorite = function(data) {
        var status = self.favoriteStatus();
        var j;
        if (status) {
            self.favoriteStatus(false);
            self.toggleFavoriteLink('Filter Favorites Only');
            // Show all markers
            for (j = 0; j < self.markers().length; j++) {
                self.markers()[j].setVisible(true);
            }
            // Fit Bounds to All Bounds
            var bounds = new google.maps.LatLngBounds();
            self.bounds(self.boundsAll);
        } else {
            self.favoriteStatus(true);
            self.toggleFavoriteLink('List All Locations');
            // Show only Favorite
            for (j = 0; j < self.markers().length; j++) {
                if(self.markers()[j].favorite === true) {
                    self.markers()[j].setVisible(true);
                } else {
                    self.markers()[j].setVisible(false);
                }
            }
            // Fit Bounds to Favorite Bounds if any location has been favorited ONLY
            if (self.boundsFavorites) {
                self.bounds(self.boundsFavorites);
            }          
        }
        // Close info window
        self.largeInfowindow.close();
        // Set map zoom
        self.map.setZoom(12);
        self.map.fitBounds(self.bounds());
    };

    // Toggle Markers
    this.toggleMarkersLink = ko.observable('Hide Markers');
    this.toggleMarkers = function(data) {
        var active = self.toggleMarkersLink();
        if (active == "Hide Markers") {
            self.toggleMarkersLink('Show Markers');
            // Hide all markers
            for (var i = 0; i < self.markers().length; i++) {
                self.markers()[i].setVisible(false);
            }
        } else {
            self.toggleMarkersLink('Hide Markers');
            // Show all markers
            var bounds = new google.maps.LatLngBounds();
            for (var j = 0; j < self.markers().length; j++) {
                self.markers()[j].setVisible(true);
                bounds.extend(self.markers()[j].position);
            }
            self.map.fitBounds(bounds);
        }
        self.largeInfowindow.close();
    };



    /*  --------------
        MAP FEATURES 
        -------------- */

    // Inicialize Map
    this.map = ko.observable();
    this.markers = ko.observableArray([]);
    this.visibleMarkers = ko.observableArray([]);
    this.bounds = ko.observable();
    this.boundsAll;
    this.boundsFavorites;

    // Create Markers
    this.makeMarkerIcon = function(color) {
        var markerImage = {
            url: 'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|' + color,
            size: new google.maps.Size(21, 34),
            origin: new google.maps.Point(0, 0),
            anchor: new google.maps.Point(10, 34),
            scaledSize: new google.maps.Size(21, 34)
        };
        return markerImage;
    };

    // Markers Styles
    this.defaultIcon = this.makeMarkerIcon('63bde2');
    this.highlightedIcon = this.makeMarkerIcon('fff');
    this.favoritedIcon = this.makeMarkerIcon('c1272d');
    this.markerIcon = ko.observable(self.defaultIcon);

    this.largeInfowindow = new google.maps.InfoWindow();

    this.initMap = function() {
        // Clear markers and visibleMarkers
        self.markers([]);
        self.visibleMarkers([]);

        self.map = new google.maps.Map(document.getElementById('map'), {
            center: {
                lat: 37.9397,
                lng: -122.5644
            },
            zoom: 6,
            styles: mapStyles, // these styles are gotten from jsMapStyles.js loaded in the html
            mapTypeControl: false
        });

        var bounds = new google.maps.LatLngBounds();
        
        // Add Markers to markers
        for (var i = 0; i < self.currentLocations().length; i++) {
            var position = self.currentLocations()[i].coord;
            var title = self.currentLocations()[i].title;
            var address = self.currentLocations()[i].address;
            var marker = new google.maps.Marker({
                map: self.map,
                position: position,
                title: title,
                address: address,
                icon: self.markerIcon(),
                animation: google.maps.Animation.DROP,
                index: i,
                favorite: false,
                fsid: ko.observable(self.currentLocations()[i].fsid()),
                photos: ko.observableArray(self.currentLocations()[i].photos()),
            });

            // Recolor marker if it's favorited
            if(self.currentLocations()[i].favorite()) {
                marker.icon = self.favoritedIcon;
                marker.favorite = true;
            }

            // Marker Listeners
            marker.addListener('click', function() {
                // Open windowindow
                self.populateInfoWindow(this, self.largeInfowindow);
                // Toggle animation
                self.turnOffMarkerAnimation();
                this.setAnimation(google.maps.Animation.BOUNCE);
            });
            marker.addListener('mouseover', function() {
                // Highlight list item and marker
                self.markerIcon(self.highlightedIcon);
                this.setIcon(self.markerIcon());
                self.currentLocations()[this.index].highlight(true);
            });
            marker.addListener('mouseout', function() {
                // Turns marker back to its original color depending on favorite result
                if(this.favorite) {
                    self.markerIcon(self.favoritedIcon);
                } else {
                    self.markerIcon(self.defaultIcon);
                }
                this.setIcon(self.markerIcon());
                // Un-highlight list item
                self.currentLocations()[this.index].highlight(false);
            });

            bounds.extend(marker.position);
            // Save bounds for all locations
            self.boundsAll = bounds;
            // Update observable for bounds
            self.bounds(bounds);

            // Push Markers
            self.markers.push(marker);
            self.visibleMarkers.push(marker);
        }
        self.map.fitBounds(self.bounds());

    };

    // Removes animation of any marker that is bouncing
    this.turnOffMarkerAnimation = function() {
        for (i = 0; i < self.markers().length; i++) {
            if(self.markers()[i].getAnimation() !== null);
            self.markers()[i].setAnimation(null);
        }
    };

    // Add content to infowindow
    this.geocodeAddress = ko.observable();
    this.infowindowPhotos = ko.observableArray([]);
    this.populateInfoWindow = function(marker, infowindow) {
        if (infowindow.marker != marker) {
            // Clear infowindow
            infowindow.setContent('');
            infowindow.marker = marker;
            // Close infowindow when x is clicked
            infowindow.addListener('closeclick', function() {
                self.turnOffMarkerAnimation();
                infowindow.marker = null;
            });

            // Start contentString
            var contentString = '<div class="info-window">';

            // Add location name
            contentString += '<div class="info"><h3>' + marker.title + '</h3>';

            // Add address p
            contentString += '<p id="address" data-bind="text: geocodeAddress"></p>';

            // Close info div in contentString
            contentString += '</div>';

            // Add foursquare photos div
            contentString += '<div id="photos" data-bind="foreach: infowindowPhotos"><img src="" data-bind="attr: {src: $data}, click: $parent.openModal"></div>';

            // Add foursquare photo credits
            contentString += '<small>Images powered by <a href="http://www.foursquare.com" target="_blank">FourSquare</a>.</small>';

            // Add pano div
            contentString += '<div id="pano"></div>';

            // Close contentString
            contentString += '</div>';

            contentString = $.parseHTML(contentString)[0];

            infowindow.setContent(contentString);

            /*
            GOOGLE GEOCODER
            */

            // Get Address with Geocoder
            function getGeocoder() {
                var geocoder = new google.maps.Geocoder;
                var pos = marker.position;
                var mi = marker.index;
                var cci = self.currentCityIndex;
                var address = self.cityLocations()[cci][mi].address;
                if (address == '?'){ 
                    geocoder.geocode({'location': pos}, function(results, status) {
                        if (status === 'OK') {
                            if (results[0]) {
                                address = results[0].formatted_address;
                                writeGeocoder(address, cci, mi);    
                            } else {
                                address = 'Address not available.'; 
                                writeGeocoder(address, cci, mi);  
                            }
                        } else {
                            address = 'Address not available.'; 
                            alert('Geocoder failed due to: ' + status);
                            writeGeocoder(address, cci, mi); 
                        }
                    });
                } else {
                    writeGeocoder(address, cci, mi);
                }
            }
            
            getGeocoder();

            // This function writes on the infowindow and it's called from inside the geocoder in order to wait for a callback
            function writeGeocoder(address,cci, mi) {
                console.log('Writing Geocoder address...');
                self.cityLocations()[cci][mi].address = address;
                self.geocodeAddress(address);      
            }

            /*
            FOURSQUARE
            */

            // If photos array is empty, get ID
            if (marker.photos().length < 1) {
                // Get place id with Foursquare API
                self.getFoursquareID(marker);
            } else {
                self.infowindowPhotos(self.currentLocations()[marker.index].photos());
                //ko.applyBindings(self, $('#photos')[0]); 
            }

            // Subscripe to fsid, tracking if it changes
            marker.fsid.subscribe(function(){
                self.getFoursquarePhotos(marker);
            });

            /*
            GOOGLE STREETVIEW
            */

            // Get StreetView on InfoWindow
            var streetViewService = new google.maps.StreetViewService();
            var radius = 50;

            function getStreetView(data, status) {
                if (status == google.maps.StreetViewStatus.OK) {
                    var nearStreetViewLocation = data.location.latLng;
                    var heading = google.maps.geometry.spherical.computeHeading(nearStreetViewLocation, marker.position);
                    var panoramaOptions = {
                        position: nearStreetViewLocation,
                        pov: {
                            heading: heading,
                            pitch: 30
                        }
                    };
                    var panorama = new google.maps.StreetViewPanorama(document.getElementById('pano'), panoramaOptions);
                } else {
                    contentString += '<div>No Street View Found</div>';
                }
            }

            // Call function
            streetViewService.getPanoramaByLocation(marker.position, radius, getStreetView);

            // Updates modalCaption with location title
            self.modalCaption(marker.title);

            infowindow.open(self.map, marker);
            
            // Apply new bindings
            ko.applyBindings(self, $('#photos')[0]);
            ko.applyBindings(self, $('#address')[0]);
        }
    };

    // Toggle favorite when Heart is clicked
    this.markAsFavorite = function(data) {
        var index = data.index;
        var marker = self.markers()[index];
        var key = self.currentCityIndex.toString() + index.toString();
        if(data.favorite()) {
            // Remove from localStorage
            window.localStorage.removeItem(key);
            // Change favorite value
            data.favorite(false);
            // Recolor marker to default
            self.markerIcon(self.defaultIcon);
        } else {
            // Save to localStorage
            window.localStorage.setItem(key, true);
            // Change favorite value
            data.favorite(true);
            // Recolor marker to red
            self.markerIcon(self.favoritedIcon);
        }
        self.markers()[index].favorite = !self.markers()[index].favorite;
        self.markers()[index].setIcon(self.markerIcon());
        self.calculateBoundsForFavorite();
    };

    // When currentCity is updated, recolor markers
    this.recolorFavoriteMarkers = function() {
        var markers = self.markers();
        var marker;
        var location;
        for (var i = 0; i < markers.length; i++) {
            location = self.cityLocations()[self.currentCityIndex][i];
            marker = markers[i];
            if (location.favorite()) {
                self.markerIcon(self.favoritedIcon);
            } else {
                self.markerIcon(self.defaultIcon);
            }
            self.markers()[i].setIcon(self.markerIcon());
        }
    };

    // Recalculate bounds based of Favorite Locations
    this.calculateBoundsForFavorite = function() {
        // Loop through all Locations
        // If favorite is true, add to bounds
        // Update observable
        var boundsfav = new google.maps.LatLngBounds();
        var locations = self.currentLocations();
        var markers = self.markers();
        for(var i = 0; i < locations.length; i++) {
            if(locations[i].favorite()){
                boundsfav.extend(markers[i].position);              
            }
        }
        self.boundsFavorites = boundsfav;
    };

    // Location list item is clicked
    this.listItemClick = function(data) {
        var marker = self.markers()[data.index];
        self.focusMarker(data, marker);
        self.openMarkerInfoWindow(data, marker);
    };

    // Open corresponding marker's infowindow
    this.openMarkerInfoWindow = function(data, marker) {
        self.populateInfoWindow(marker, self.largeInfowindow);
        // Toggle animation
        self.turnOffMarkerAnimation();
        marker.setAnimation(google.maps.Animation.BOUNCE);
    };

    // Zoom on corresponding marker
    this.focusMarker = function(data, marker) {
        var latLng = marker.getPosition();
        self.map.setCenter(latLng);
        self.map.setZoom(17);
    };

    this.resetZoom = function() {
        self.map.setZoom(12);
        self.map.fitBounds(self.bounds());
    };

    // When mouseover list-item, recolor corresponding marker to white (highlitedned icon)
    this.highlightMarkerOn = function(data) {
        self.markerIcon(self.highlightedIcon);
        self.markers()[data.index].setIcon(self.markerIcon());
    };

    // When mouseout list-item, recolor back to default
    this.highlightMarkerOff = function(data) {
        if(data.favorite()) {
            // Recolor marker to default
            self.markerIcon(self.favoritedIcon);
        } else {
            // Recolor marker to red
            self.markerIcon(self.defaultIcon);
        }
        self.markers()[data.index].setIcon(self.markerIcon());
    };

    /*  --------------
        FOURSQUARE API 
        -------------- */

    // Determine photosize based on screen size
    this.photosize = function(){
        if(self.smallScreen()){
            return "100x100";
        } else {
            return "100x100";
        }   
    };

    // Request ID
    this.getFoursquareID = function(marker) {
        // In case marker is undefined
        if(marker == undefined) {
            alert("Foursquare data could not be loaded. Data not available.");
            return;
        }
        // Only if it doens't have one already
        if(!marker.fsid()){
            console.log('Requesting ID...');
            // Build url
            var url = self.buidFoursquareIdUrl(marker);
            // Request ID and write on Location
            $.getJSON(url, function(data) {
                $.each(data.response.venues, function(i,venues){
                    marker.fsid(venues.id);
                    self.currentLocations()[marker.index].fsid(venues.id);
               });
            })
            .fail(function() {
                marker.fsid(null);
                self.currentLocations()[marker.index].fsid(null);
                alert("Foursquare data could not be loaded. Photos may not appear.");
            });
        } else {
            console.log("It already has an ID.");
        }
    };

    // Build ID Request URL
    this.buidFoursquareIdUrl = function(marker){
        var url = 'https://api.foursquare.com/v2/venues/search' +
        '?client_id=' + fs_clientid +
        '&client_secret=' + fs_clientsecret +
        '&v=20130815&ll=' + marker.position.lat() + "," + marker.position.lng() + "&intent=checkin&radius=500" +
        "&limit=1";
        return url;
    };

    // Request Photos
    this.getFoursquarePhotos = function(marker) {
        if(marker.fsid() !== null) {
            // Only if it doesn't have photos already
            if(marker.photos().length === 0){
                console.log('Requesting Photos...');
                // Build photo url
                var url = self.buidFoursquarePhotoUrl(marker);
                // Request Photos and push to Location photos
                $.getJSON(url,
                    function(data) {
                        $.each(data.response.photos.items, function(i,photo){                   
                            photo_url = photo.prefix + self.photosize() + photo.suffix;
                            // Push photo_url to observable arrays
                            self.currentLocations()[marker.index].photos.push(photo_url);
                        });
                        self.infowindowPhotos(self.currentLocations()[marker.index].photos());
                    })
                    .fail(function() {
                        self.currentLocations()[marker.index].photos(null);
                        alert("Foursquare data could not be loaded. Photos may not appear.");
                    });
            } else {
                self.infowindowPhotos(self.currentLocations()[marker.index].photos());
            }
        }
    };

    // Build Photos Request URL
    this.buidFoursquarePhotoUrl = function(marker){
        var url = 'https://api.foursquare.com/v2/venues/' + marker.fsid() +
        '/photos?client_id=' + fs_clientid +
        '&client_secret=' + fs_clientsecret +
        '&v=20130815&limit=3';
        return url;
    };

    /*  --------------
        MODAL WINDOW for FOURSQUARE PHOTOS
        -------------- */

    this.toggleModal = ko.observable(false);
    this.modalImage = ko.observable();
    this.modalCaption = ko.observable();

    // Opens Modal and updates modalImage observable
    this.openModal = function(data) {
        // Get Image url and remove the size
        var url = data.split(self.photosize());
        // Apply new size
        if(self.smallScreen()){
            url.push("300x300");
        } else {
            url.push("600x600");
        }  
        // Update modal image with new url
        url = url[0] + url[2] + url[1];
        self.modalImage(url);
        self.toggleModal(true);
    };

    // Closes Modal
    this.closeModal = function() {
        self.toggleModal(false);
    };

    /*  --------------
        INPUT FIELD FILTERING 
        -------------- */

    // Input Text Field
    this.filter = ko.observable('');
    this.filterList = ko.observableArray([]);

     // Populate filterList with currentCity location names
    this.populatefilterList = function() {
        var index = self.currentCityIndex;
        var locationList = self.currentLocations();
        var locationName;
        // Empty filterList array
        self.filterList = ko.observableArray([]);
        // Get location names from currentCity, convert name (trimString) and push them to filterList
        for (var i = 0; i < locationList.length; i++) {
            locationName = locationList[i].title;
            locationName = self.trimString(locationName);
            self.filterList.push(locationName);
        }
    };

    // Trims 'string' removing all the whitespace and converting to lowercase
    this.trimString = function(string) {
        string = string.toLowerCase().trim().replace(/\s+/g, '');
        return string;
    };

    // Filter locations list on screen
    this.filter.subscribe(function() {
        var typed = self.trimString(self.filter());
        var list = self.filterList();
        var i, j, match;
        var indexArray = [];   
        // Iterate though all items on list and compared typed with each, push index to indexArray
        $.each(list, function(index, element) {
            for(i = 0; i < element.length; i++){
                match = element.indexOf(typed);
                if(match > -1){
                    indexArray.push(index);
                }
            }
        });
        // Clear all filtered() observables to false
        $.each(self.currentLocations(), function(index, element){
            self.currentLocations()[index].filtered(false);
        });
        // Continues if indexArrey has at least one element
        if (indexArray.length > 0) {
            // Remove duplicate indexes in indexArray
            var tempArray = [];
            $.each(indexArray, function(index, element){
                if($.inArray(element, tempArray) === -1) tempArray.push(element);
            });
            indexArray = tempArray;
            // Loop through indexes and update filtered() observable
            for(i = 0; i < indexArray.length; i++){
                self.currentLocations()[indexArray[i]].filtered(true);

            }
            // Show only filtered markers
            for (i = 0; i < self.markers().length; i++) {
                for(j = 0; j < indexArray.length; j++) {
                    if(indexArray.indexOf(self.markers()[i].index) != -1) {
                        self.markers()[i].setVisible(true);
                    } else {
                        self.markers()[i].setVisible(false);
                    }
                }
            }
        } else {
            console.log('No matches.');
            // Show all markers
            for (i = 0; i < self.markers().length; i++) {
                self.markers()[i].setVisible(true);
            }
        }
        // Close info window
        self.largeInfowindow.close();
        // Reset Zoom
        self.resetZoom();
    });

    // 'x' clear button for Input Text Field
    this.clearInputTextField = function() {
        self.filter('');
    };

    /*  --------------
        INITIATE APP 
        -------------- */

    // After all code is read, initiates app
    this.initApp();
};


function init() {
    ko.applyBindings(new ViewModel());
}

function mapError() {
    console.log("Google Maps faield to load. Application will not work properly.");
    alert("Google Maps failed to load. Application will not work properly.");
}