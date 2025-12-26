/**
 * script.js
 * Core logic for the ENERG1 Outlet Finder.
 * * Features:
 * 1. Loads outlet data from a CSV file.
 * 2. Handles Manual Search with Auto-Suggestions (Nominatim API).
 * 3. Calculates distance using two methods:
 * - Haversine (Straight line) for quick filtering.
 * - OSRM (Road network) for accurate driving distance.
 * 4. Renders the interactive Map using Leaflet.js.
 */

// Global variables to store application state
let outlets = [];           // Array to hold all outlet data loaded from CSV
let debounceTimer;          // Timer to delay API calls while typing
let mapInstance = null;     // Reference to the active Leaflet map
let routeLayer = null;      // Reference to the blue route line on the map

// ** CONFIGURATION **
// Optimization: To save data and speed up results, we only check the 
// actual driving distance for the top N closest outlets (by straight line).
const candidateCount = 2; 

// ** STEP 1: CSV LOADING FUNCTION **
// Uses PapaParse to read 'locations.csv' and convert it to JSON
function loadOutletsFromCSV() {
    Papa.parse('locations.csv', {
        download: true,       // Fetch the file from the server
        header: true,         // Use first row as column names (name, lat, lng)
        dynamicTyping: true,  // Auto-convert numbers (e.g., "6.93" -> 6.93)
        complete: function(results) {
            // Filter out invalid rows that might be missing coordinates
            outlets = results.data.filter(row => row.name && row.lat && row.lng);
            
            // Check if we are on the Manual Search page (index.html)
            const manualInput = document.getElementById('manual-input');
            if (manualInput) {
                // Initialize map with default view (Sri Lanka center)
                initMap(7.8731, 80.7718); 

                // Event: Search when "Enter" key is pressed
                manualInput.addEventListener("keypress", function(event) {
                    if (event.key === "Enter") {
                        event.preventDefault(); // Stop form submission
                        performManualSearch();
                        document.getElementById('suggestions-list').style.display = 'none';
                    }
                });

                // Event: Fetch suggestions while typing
                manualInput.addEventListener("input", function() {
                    clearTimeout(debounceTimer); // Reset timer on every keystroke
                    const query = this.value;
                    
                    // Only search if user typed 3+ characters (reduces API spam)
                    if (query.length < 3) {
                        document.getElementById('suggestions-list').style.display = 'none';
                        return; 
                    }
                    
                    // Debounce: Wait 300ms after typing stops to call API
                    debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
                });
                
                // Event: Hide suggestions if clicking outside the box
                document.addEventListener('click', function(e) {
                    if (e.target.id !== 'manual-input') {
                         document.getElementById('suggestions-list').style.display = 'none';
                    }
                });
            } else {
                // We are on Auto GPS page: Start GPS immediately
                startGeolocationProcess();
            }
        },
        error: function(error) {
            console.error("Error loading CSV:", error);
            if(document.getElementById('nearest-outlet-name')) {
                document.getElementById('nearest-outlet-name').textContent = 'Error loading outlet data.';
            }
        }
    });
}

// ** STEP 2: FETCH SUGGESTIONS (Nominatim API) **
// Gets place name suggestions (e.g., "Kandy") from OpenStreetMap
function fetchSuggestions(query) {
    const list = document.getElementById('suggestions-list');
    
    // API Request: Limit to 5 results, restrict to Sri Lanka (countrycodes=lk)
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=lk&limit=5`)
        .then(res => res.json())
        .then(data => {
            list.innerHTML = ''; // Clear old suggestions
            if (data.length > 0) {
                data.forEach(place => {
                    const li = document.createElement('li');
                    // Clean up name: "Kandy, Central, Sri Lanka" -> "Kandy, Central"
                    const displayName = place.display_name.split(',').slice(0, 3).join(',');
                    li.textContent = displayName;
                    
                    // Logic for clicking a suggestion
                    li.onclick = function() {
                        document.getElementById('manual-input').value = displayName;
                        list.style.display = 'none';
                        // Get coordinates from the suggestion result
                        const lat = parseFloat(place.lat);
                        const lon = parseFloat(place.lon);
                        document.getElementById('search-status').textContent = `Selected: ${displayName}`;
                        // Start finding the nearest outlet
                        processFoundLocation(lat, lon);
                    };
                    list.appendChild(li);
                });
                list.style.display = 'block';
            } else {
                list.style.display = 'none';
            }
        })
        .catch(err => console.error("Suggestion error:", err));
}

// ** STEP 3: GPS GEOLOCATION **
function startGeolocationProcess() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
    } else {
        handleError('Geolocation not supported.');
    }
}

// ** STEP 4: MANUAL SEARCH EXECUTION **
// Called when the "Search" button is clicked
function performManualSearch() {
    const input = document.getElementById('manual-input').value;
    const statusMsg = document.getElementById('search-status');
    const list = document.getElementById('suggestions-list');

    if(list) list.style.display = 'none';
    
    if (!input) {
        statusMsg.textContent = "Please enter a location.";
        return;
    }

    statusMsg.textContent = "Searching...";
    
    // Convert typed location to Coordinates
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&countrycodes=lk`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                statusMsg.textContent = `Found: ${result.display_name}`;
                processFoundLocation(lat, lon);
            } else {
                statusMsg.textContent = "Location not found. Try a broader city name.";
            }
        })
        .catch(err => {
            console.error(err);
            statusMsg.textContent = "Error connecting to search service.";
        });
}

// ** STEP 5: MATH DISTANCE (Haversine Formula) **
// Calculates "as the crow flies" distance. Used for initial sorting.
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// ** STEP 6: CORE LOGIC (Smart Search) **
// 1. Calculates straight-line distance to ALL outlets.
// 2. Picks the top 2 closest ones.
// 3. Checks accurate driving distance for ONLY those 2 via API.
async function processFoundLocation(userLat, userLng) {
    // Show loading UI
    const infoCard = document.getElementById('nearest-info');
    if(infoCard) {
        infoCard.style.display = 'block';
        document.getElementById('nearest-outlet-name').textContent = "Analyzing routes...";
        document.getElementById('distance-display').textContent = "Calculating best route...";
    }

    // Phase 1: Quick Math Filter
    outlets.forEach(outlet => {
        outlet.straightDistance = haversineDistance(userLat, userLng, outlet.lat, outlet.lng);
    });

    // Sort and pick top candidates
    const candidates = outlets.sort((a, b) => a.straightDistance - b.straightDistance).slice(0, candidateCount);

    // Phase 2: Detailed API Check (Parallel Requests)
    // We create a list of "Promises" to fetch data for all candidates at once
    const drivingAnalysisPromises = candidates.map(outlet => {
        // OSRM Driving API URL
        const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${outlet.lng},${outlet.lat}?overview=full&geometries=geojson`;
        
        return fetch(url)
            .then(res => res.json())
            .then(data => {
                if(data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    return {
                        ...outlet, 
                        drivingDistance: route.distance, // Meters
                        routeGeometry: route.geometry    // Map path (GeoJSON)
                    };
                }
                return { ...outlet, drivingDistance: Infinity }; 
            })
            .catch(err => {
                console.error("OSRM Error for " + outlet.name, err);
                return { ...outlet, drivingDistance: Infinity };
            });
    });

    // Wait for all API calls to finish
    const analyzedOutlets = await Promise.all(drivingAnalysisPromises);

    // Phase 3: Pick the Winner
    let nearestOutlet = analyzedOutlets[0];
    let minDrivingDist = Infinity;

    analyzedOutlets.forEach(outlet => {
        if(outlet.drivingDistance < minDrivingDist) {
            minDrivingDist = outlet.drivingDistance;
            nearestOutlet = outlet;
        }
    });

    // Update screen
    updateUIWithWinner(userLat, userLng, nearestOutlet);
}

// ** STEP 7: UPDATE UI & MAP **
function updateUIWithWinner(userLat, userLng, nearestOutlet) {
    // Log data to Google Sheets
    logLocationToSheet(userLat, userLng);

    document.getElementById('nearest-outlet-name').textContent = nearestOutlet.name;
    
    // Display Distance (Meters -> KM)
    const distKm = (nearestOutlet.drivingDistance / 1000).toFixed(1);
    document.getElementById('distance-display').innerHTML = 
        `🚗 Driving Distance: ${distKm} km`;

    // Create External Google Maps Link (Turn-by-turn navigation)
    // Note: '6' in the URL below seems to be part of a custom format or typo, 
    // usually standard format is used, but keeping original code logic here.
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=$${userLat},${userLng}&destination=${nearestOutlet.lat},${nearestOutlet.lng}`;
    
    document.getElementById('nearest-outlet-link').innerHTML = 
        `<a href="${googleMapsUrl}" target="_blank">Get Directions on Google Maps</a>`;

    // Draw Map with Route
    initMap(userLat, userLng, nearestOutlet);
}

// Helper: GPS Success
function success(position) {
    processFoundLocation(position.coords.latitude, position.coords.longitude);
}

// Helper: Log Data to Google Sheet (Backend)
function logLocationToSheet(lat, lng) {
    const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycby4Mn8Rgvo1NyvTxBG4ckE_aEJOiBvhFnq8dJ3RAgyQIvrPGt0rKUM5SCt68IHHSYbn/exec'; 
    fetch(API_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors', // Opaque response (security feature)
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({latitude: lat, longitude: lng})
    }).catch(e => console.log("Logging error", e));
}

// Helper: GPS Error
function error() {
    handleError('Location access denied.');
}

// Helper: Generic Error Handler
function handleError(msg) {
    const nameEl = document.getElementById('nearest-outlet-name');
    const linkEl = document.getElementById('nearest-outlet-link');
    if(nameEl) nameEl.textContent = msg;
    if(linkEl) linkEl.textContent = 'Please enable location services or use Manual Search.';
    initMap(7.8731, 80.7718); // Reset map to center
}

// ** MAP INTEGRATION (Leaflet) **
function initMap(centerLat, centerLng, nearestOutlet = null) {
    // Clean up old map instance if it exists
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
        routeLayer = null; 
    }

    const hasUserLocation = nearestOutlet !== null;
    const zoom = hasUserLocation ? 9 : 7; 
    
    // Create Map
    mapInstance = L.map('mapid').setView([centerLat, centerLng], zoom);

    // Add Tile Layer (The visual map images)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);

    // Add User Marker
    if (hasUserLocation) {
        L.marker([centerLat, centerLng])
            .addTo(mapInstance)
            .bindPopup("Your Location")
            .openPopup();
    }

    // Add Outlet Markers
    outlets.forEach(outlet => {
        const marker = L.marker([outlet.lat, outlet.lng]).addTo(mapInstance);
        let popupContent = `<b>${outlet.name}</b>`;
        
        // Add directions link to popup
        if (hasUserLocation) {
            const dirUrl = `https://www.google.com/maps/dir/?api=1&origin=${centerLat},${centerLng}&destination=${outlet.lat},${outlet.lng}`;
            popupContent += `<br><a href="${dirUrl}" target="_blank">Get Directions</a>`;
        }

        if (outlet.phone) {
            popupContent += `<br>Phone: <a href="tel:${outlet.phone}">0${outlet.phone}</a>`;
        }

        // Highlight nearest outlet (Red Marker)
        if (nearestOutlet && outlet.name === nearestOutlet.name) {
            popupContent = `<b>(Nearest Outlet)</b><br>` + popupContent;
            marker.setIcon(L.divIcon({className: 'nearest-marker', html: '🔴'})); 
            marker.setZIndexOffset(1000); 
        }
        marker.bindPopup(popupContent);
    });

    // Draw the Route Line (if route geometry exists)
    if (nearestOutlet && nearestOutlet.routeGeometry) {
        routeLayer = L.geoJSON(nearestOutlet.routeGeometry, {
            style: {
                color: 'blue',
                weight: 5,
                opacity: 0.7
            }
        }).addTo(mapInstance);

        // Zoom map to fit the whole route
        mapInstance.fitBounds(routeLayer.getBounds().pad(0.1));
    } else if (nearestOutlet) {
        // Fallback zoom if no route line
        const bounds = L.latLngBounds([
            [centerLat, centerLng], 
            [nearestOutlet.lat, nearestOutlet.lng]
        ]);
        mapInstance.fitBounds(bounds.pad(0.2)); 
    }
}

// Initialize the app
loadOutletsFromCSV();