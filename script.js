// Global variable to store outlets loaded from CSV
let outlets = [];
let debounceTimer; 
let mapInstance = null; 
let routeLayer = null; 

// ** CONFIGURATION: Fine-tune the website here **
const candidateCount = 2; // How many "straight-line" nearest outlets to check via API

// ** STEP 1: CSV LOADING FUNCTION **
function loadOutletsFromCSV() {
    Papa.parse('locations.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            outlets = results.data.filter(row => row.name && row.lat && row.lng);
            
            const manualInput = document.getElementById('manual-input');
            if (manualInput) {
                initMap(7.8731, 80.7718); 

                manualInput.addEventListener("keypress", function(event) {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        performManualSearch();
                        document.getElementById('suggestions-list').style.display = 'none';
                    }
                });

                manualInput.addEventListener("input", function() {
                    clearTimeout(debounceTimer);
                    const query = this.value;
                    if (query.length < 3) {
                        document.getElementById('suggestions-list').style.display = 'none';
                        return; 
                    }
                    debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
                });
                
                document.addEventListener('click', function(e) {
                    if (e.target.id !== 'manual-input') {
                         document.getElementById('suggestions-list').style.display = 'none';
                    }
                });
            } else {
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

// ** STEP 2: FETCH SUGGESTIONS **
function fetchSuggestions(query) {
    const list = document.getElementById('suggestions-list');
    
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=lk&limit=5`)
        .then(res => res.json())
        .then(data => {
            list.innerHTML = ''; 
            if (data.length > 0) {
                data.forEach(place => {
                    const li = document.createElement('li');
                    const displayName = place.display_name.split(',').slice(0, 3).join(',');
                    li.textContent = displayName;
                    
                    li.onclick = function() {
                        document.getElementById('manual-input').value = displayName;
                        list.style.display = 'none';
                        const lat = parseFloat(place.lat);
                        const lon = parseFloat(place.lon);
                        document.getElementById('search-status').textContent = `Selected: ${displayName}`;
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

// ** STEP 3: GEOLOCATION **
function startGeolocationProcess() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
    } else {
        handleError('Geolocation not supported.');
    }
}

// ** STEP 4: MANUAL SEARCH **
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

// ** STEP 5: MATH (Straight Line Distance) **
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

// ** STEP 6: CORE LOGIC (Optimized 2-Phase Search) **
async function processFoundLocation(userLat, userLng) {
    // Show loading state
    const infoCard = document.getElementById('nearest-info');
    if(infoCard) {
        infoCard.style.display = 'block';
        document.getElementById('nearest-outlet-name').textContent = "Analyzing routes...";
        // UPDATED: Generic loading text
        document.getElementById('distance-display').textContent = "Calculating best route...";
    }

    // 1. Calculate Straight Line Distance for ALL outlets
    outlets.forEach(outlet => {
        outlet.straightDistance = haversineDistance(userLat, userLng, outlet.lat, outlet.lng);
    });

    // 2. Sort by straight line distance and pick top N candidates
    const candidates = outlets.sort((a, b) => a.straightDistance - b.straightDistance).slice(0, candidateCount);

    // 3. Fetch Driving Distance for these candidates (Parallel Requests)
    const drivingAnalysisPromises = candidates.map(outlet => {
        const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${outlet.lng},${outlet.lat}?overview=full&geometries=geojson`;
        
        return fetch(url)
            .then(res => res.json())
            .then(data => {
                if(data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    return {
                        ...outlet, 
                        drivingDistance: route.distance, // meters
                        routeGeometry: route.geometry // Shape of the road
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

    // 4. Find the winner based on actual DRIVING distance
    let nearestOutlet = analyzedOutlets[0];
    let minDrivingDist = Infinity;

    analyzedOutlets.forEach(outlet => {
        if(outlet.drivingDistance < minDrivingDist) {
            minDrivingDist = outlet.drivingDistance;
            nearestOutlet = outlet;
        }
    });

    // 5. Update UI with the winner
    updateUIWithWinner(userLat, userLng, nearestOutlet);
}

// ** STEP 7: UPDATE UI & MAP **
function updateUIWithWinner(userLat, userLng, nearestOutlet) {
    // Send coordinates to Google Sheet
    logLocationToSheet(userLat, userLng);

    document.getElementById('nearest-outlet-name').textContent = nearestOutlet.name;
    
    // Convert units (Meters -> KM)
    const distKm = (nearestOutlet.drivingDistance / 1000).toFixed(1);

    document.getElementById('distance-display').innerHTML = 
        `🚗 Driving Distance: ${distKm} km`;

    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${nearestOutlet.lat},${nearestOutlet.lng}`;
    
    document.getElementById('nearest-outlet-link').innerHTML = 
        `<a href="${googleMapsUrl}" target="_blank">Get Directions on Google Maps</a>`;

    initMap(userLat, userLng, nearestOutlet);
}

function success(position) {
    processFoundLocation(position.coords.latitude, position.coords.longitude);
}

function logLocationToSheet(lat, lng) {
    const API_ENDPOINT = 'https://script.google.com/macros/s/AKfycby4Mn8Rgvo1NyvTxBG4ckE_aEJOiBvhFnq8dJ3RAgyQIvrPGt0rKUM5SCt68IHHSYbn/exec'; 
    fetch(API_ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({latitude: lat, longitude: lng})
    }).catch(e => console.log("Logging error", e));
}

function error() {
    handleError('Location access denied.');
}

function handleError(msg) {
    const nameEl = document.getElementById('nearest-outlet-name');
    const linkEl = document.getElementById('nearest-outlet-link');
    if(nameEl) nameEl.textContent = msg;
    if(linkEl) linkEl.textContent = 'Please enable location services or use Manual Search.';
    initMap(7.8731, 80.7718); 
}

// ** MAP INTEGRATION **
function initMap(centerLat, centerLng, nearestOutlet = null) {
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
        routeLayer = null; 
    }

    const hasUserLocation = nearestOutlet !== null;
    const zoom = hasUserLocation ? 9 : 7; 
    
    mapInstance = L.map('mapid').setView([centerLat, centerLng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);

    if (hasUserLocation) {
        L.marker([centerLat, centerLng])
            .addTo(mapInstance)
            .bindPopup("Your Location")
            .openPopup();
    }

    // Add markers for all outlets
    outlets.forEach(outlet => {
        const marker = L.marker([outlet.lat, outlet.lng]).addTo(mapInstance);
        let popupContent = `<b>${outlet.name}</b>`;
        
        if (hasUserLocation) {
            const dirUrl = `https://www.google.com/maps/dir/?api=1&origin=${centerLat},${centerLng}&destination=${outlet.lat},${outlet.lng}`;
            popupContent += `<br><a href="${dirUrl}" target="_blank">Get Directions</a>`;
        }

        if (outlet.phone) {
            popupContent += `<br>Phone: <a href="tel:${outlet.phone}">0${outlet.phone}</a>`;
        }

        // Highlight the nearest one
        if (nearestOutlet && outlet.name === nearestOutlet.name) {
            popupContent = `<b>(Nearest Outlet)</b><br>` + popupContent;
            marker.setIcon(L.divIcon({className: 'nearest-marker', html: '🔴'})); 
            marker.setZIndexOffset(1000); 
        }
        marker.bindPopup(popupContent);
    });

    // Draw the route line for the winner
    if (nearestOutlet && nearestOutlet.routeGeometry) {
        routeLayer = L.geoJSON(nearestOutlet.routeGeometry, {
            style: {
                color: 'blue',
                weight: 5,
                opacity: 0.7
            }
        }).addTo(mapInstance);

        // Fit map to show user + route + destination
        mapInstance.fitBounds(routeLayer.getBounds().pad(0.1));
    } else if (nearestOutlet) {
        // Fallback bounds if geometry failed
        const bounds = L.latLngBounds([
            [centerLat, centerLng], 
            [nearestOutlet.lat, nearestOutlet.lng]
        ]);
        mapInstance.fitBounds(bounds.pad(0.2)); 
    }
}

loadOutletsFromCSV();