// Global variable to store outlets loaded from CSV
let outlets = [];

// ** STEP 1: CSV LOADING FUNCTION **
function loadOutletsFromCSV() {
    // Papa Parse will fetch the CSV file (locations.csv)
    Papa.parse('locations.csv', {
        download: true, // Tell Papa Parse to download the file
        header: true,   // Treat the first row as column headers (name, lat, lng)
        dynamicTyping: true, // Automatically convert 'lat' and 'lng' columns to numbers
        
        complete: function(results) {
            // Store the parsed data
            outlets = results.data.filter(row => row.name && row.lat && row.lng);
            
            // Once data is loaded, start the Geolocation process
            startGeolocationProcess();
        },
        
        error: function(error) {
            console.error("Error loading CSV:", error);
            document.getElementById('nearest-outlet-name').textContent = 'Error loading outlet data.';
            initMap(6.738379, 80.027515); // Show map with default center even if data fails
        }
    });
}

// ** STEP 2: GEOLOCATION WRAPPER **
function startGeolocationProcess() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
    } else {
        document.getElementById('nearest-outlet-name').textContent = 'Geolocation not supported.';
        document.getElementById('nearest-outlet-link').textContent = 'Please update your browser to use this feature.';
        initMap(37.0902, -95.7129); 
    }
}

// ** STEP 3: HAversine Distance Calculation **
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// ** STEP 4: FIND NEAREST OUTLET LOGIC **
function findNearestOutlet(userLat, userLng) {
    let nearest = null;
    let minDistance = Infinity;

    outlets.forEach(outlet => {
        const distance = haversineDistance(userLat, userLng, outlet.lat, outlet.lng);
        outlet.distance = distance; 

        if (distance < minDistance) {
            minDistance = distance;
            nearest = outlet;
        }
    });

    return nearest;
}

// ** STEP 5: GEOLOCATION SUCCESS HANDLER **
function success(position) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;
    
    // Find the nearest outlet
    const nearestOutlet = findNearestOutlet(userLat, userLng);

    // 1. Log user location to Google Sheet via Apps Script Web App
    const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycby4Mn8Rgvo1NyvTxBG4ckE_aEJOiBvhFnq8dJ3RAgyQIvrPGt0rKUM5SCt68IHHSYbn/exec'; // PASTE YOUR URL HERE

    const logData = {
        latitude: userLat,
        longitude: userLng
    };

    fetch(API_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'application/json',
        },
        // The Apps Script expects the data as a JSON string
        body: JSON.stringify(logData), 
    })
    .then(response => {
        if (response.ok) {
            console.log("CORS request sent successfully (status check unavailable in no-cors mode). Check Google Sheet for data.");
        } else {
            console.error('Error sending location data:', error);
        }
    })
    .catch(error => console.error('Error sending location data:', error));

    // 2. Update UI with nearest outlet info
    document.getElementById('nearest-outlet-name').textContent = nearestOutlet.name;
    
    // 3. Create Google Maps Link for the Nearest Outlet
    const googleMapsUrl = `https://www.google.com/maps/dir/${userLat},${userLng}/${nearestOutlet.lat},${nearestOutlet.lng}`;
    
    document.getElementById('nearest-outlet-link').innerHTML = 
        `<a href="${googleMapsUrl}" target="_blank">Get Directions on Google Maps</a>`;

    // 4. Initialize Map, passing user location and nearest outlet
    initMap(userLat, userLng, nearestOutlet);
}

// ** STEP 6: GEOLOCATION ERROR HANDLER **
function error() {
    // Hide the nearest outlet header
    document.querySelector('#nearest-info h4').style.display = 'none';

    // Handle error gracefully
    document.getElementById('nearest-outlet-name').textContent = 'Location access denied.';
    document.getElementById('nearest-outlet-link').textContent = 'Please enable location services to find your nearest outlet.';
    
    // Initialize map on a default center, showing all loaded outlets
    initMap(6.738379, 80.027515); 
}

// ** STEP 7: MAP INTEGRATION (Leaflet) **
function initMap(centerLat, centerLng, nearestOutlet = null) {
    const container = L.DomUtil.get('mapid');
    if(container != null){
        container._leaflet_id = null;
    }

    // Determine if user location was successfully obtained
    const hasUserLocation = nearestOutlet !== null;

    // Set zoom level based on whether location was found
    const zoom = hasUserLocation ? 8 : 5; 
    const map = L.map('mapid').setView([centerLat, centerLng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add user marker only if location was successfully obtained
    if (hasUserLocation) {
        L.marker([centerLat, centerLng])
            .addTo(map)
            .bindPopup("You Are Here")
            .openPopup();
    }

    // Add all outlet markers from the globally loaded array
    const allOutletPoints = [];
    outlets.forEach(outlet => {
        allOutletPoints.push([outlet.lat, outlet.lng]);
        const marker = L.marker([outlet.lat, outlet.lng]).addTo(map);
        
        let popupContent = `<b>${outlet.name}</b>`;

        if (hasUserLocation) {
            // URL for directions from user location to this specific outlet
            const directionUrl = `https://www.google.com/maps/dir/${centerLat},${centerLng}/${outlet.lat},${outlet.lng}`;
            popupContent += `<br><a href="${directionUrl}" target="_blank">Find on Google Maps</a>`;
        } else {
            // If we don't have user location, just show the outlet on the map
            const searchUrl = `https://www.google.com/maps/search/?api=1&query=${outlet.lat},${outlet.lng}`;
            popupContent += `<br><a href="${searchUrl}" target="_blank">View on Google Maps</a>`;
        }

        // Add phone number if it exists in the CSV data
        if (outlet.phone) {
            popupContent += `<br>Phone: <a href="tel:${outlet.phone}">0${outlet.phone}</a>`;
        }

        // Highlight the nearest one
        if (nearestOutlet && outlet.name === nearestOutlet.name) {
            popupContent = `<b>(Your Nearest ENERG1 Outlet)</b><br>` + popupContent;
            marker.setIcon(L.divIcon({className: 'nearest-marker', html: '🔴'})); 
            marker.setZIndexOffset(1000); 
        }
        
        marker.bindPopup(popupContent);
    });
    
    // Adjust map bounds to fit markers
    if (nearestOutlet) {
        const bounds = L.latLngBounds([
            [centerLat, centerLng], 
            [nearestOutlet.lat, nearestOutlet.lng]
        ]);
        map.fitBounds(bounds.pad(0.2)); 
    } else if (allOutletPoints.length > 0) {
        // If no user location, show all outlets
        map.fitBounds(L.latLngBounds(allOutletPoints).pad(0.5));
    }
}


// Start the application by loading the data
loadOutletsFromCSV();