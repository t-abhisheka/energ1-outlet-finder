/**
 * route_script.js
 * Logic for Route Groups.
 * Includes "Open in Google Maps" splitting logic.
 */

const WAREHOUSE_LOC = { lat: 6.738495357574309, lng: 80.027898324218 };
const WAREHOUSE_NAME = "Head Office";

let allOutlets = [];
let mapInstance = null;
let routeLayer = null;
let markersLayer = L.layerGroup(); 

function loadOutlets() {
    Papa.parse('locations.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            allOutlets = results.data.filter(r => r.name && r.lat && r.lng);
            populateRouteDropdown();
            initMap();
        },
        error: err => console.error("CSV Error:", err)
    });
}

function populateRouteDropdown() {
    const selector = document.getElementById('route-select');
    const routes = new Set();
    allOutlets.forEach(o => { if (o.route && o.route.trim()) routes.add(o.route.trim()); });

    Array.from(routes).sort().forEach(r => {
        const option = document.createElement('option');
        option.value = r;
        option.textContent = r;
        selector.appendChild(option);
    });
}

function calculateAndDrawRoute() {
    const selectedRoute = document.getElementById('route-select').value;
    if (!selectedRoute) return alert("Please select a route first.");

    let stopsToVisit = allOutlets.filter(o => o.route === selectedRoute);
    if (stopsToVisit.length === 0) return alert("No outlets found for this route.");

    let currentPos = WAREHOUSE_LOC;
    let sortedPath = [];
    let remaining = [...stopsToVisit];

    while (remaining.length > 0) {
        let nearestIndex = -1;
        let minDistance = Infinity;

        remaining.forEach((stop, index) => {
            const dist = haversineDistance(currentPos.lat, currentPos.lng, stop.lat, stop.lng);
            if (dist < minDistance) {
                minDistance = dist;
                nearestIndex = index;
            }
        });

        const nextStop = remaining[nearestIndex];
        sortedPath.push(nextStop);
        currentPos = { lat: nextStop.lat, lng: nextStop.lng };
        remaining.splice(nearestIndex, 1);
    }

    drawRouteOnMap(sortedPath);
    displayRouteList(sortedPath);
    renderGoogleMapsButtons(sortedPath);
}

function drawRouteOnMap(sortedOutlets) {
    markersLayer.clearLayers();
    if (routeLayer) mapInstance.removeLayer(routeLayer);

    const startMarker = L.marker([WAREHOUSE_LOC.lat, WAREHOUSE_LOC.lng])
        .bindPopup(`<b>${WAREHOUSE_NAME}</b>`)
        .addTo(markersLayer);
    
    startMarker.setIcon(L.divIcon({
        className: 'custom-pin',
        html: `<div style="background:black;color:white;border-radius:50%;width:30px;height:30px;text-align:center;line-height:30px;font-weight:bold;border:2px solid white;">HQ</div>`
    }));

    let coordinatesString = `${WAREHOUSE_LOC.lng},${WAREHOUSE_LOC.lat}`; 

    sortedOutlets.forEach((outlet, index) => {
        const num = index + 1;
        coordinatesString += `;${outlet.lng},${outlet.lat}`;
        const marker = L.marker([outlet.lat, outlet.lng])
            .bindPopup(`<b>#${num}: ${outlet.name}</b><br>${outlet.phone || ''}`)
            .addTo(markersLayer);
            
        marker.setIcon(L.divIcon({
            className: 'number-icon',
            html: `<div style="background:#004d40;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;">${num}</div>`
        }));
    });

    coordinatesString += `;${WAREHOUSE_LOC.lng},${WAREHOUSE_LOC.lat}`;
    markersLayer.addTo(mapInstance);

    const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesString}?overview=full&geometries=geojson`;

    document.getElementById('route-stats').textContent = "Calculating round trip...";

    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                routeLayer = L.geoJSON(route.geometry, { style: { color: 'blue', weight: 5, opacity: 0.7 } }).addTo(mapInstance);
                mapInstance.fitBounds(routeLayer.getBounds().pad(0.1));
                const km = (route.distance / 1000).toFixed(1);
                document.getElementById('route-stats').innerHTML = `🔄 Round Trip: ${km} km`;
            }
        })
        .catch(err => {
            const latlngs = [WAREHOUSE_LOC, ...sortedOutlets, WAREHOUSE_LOC];
            routeLayer = L.polyline(latlngs, {color: 'red', dashArray: '5, 10'}).addTo(mapInstance);
            mapInstance.fitBounds(routeLayer.getBounds());
        });
}

function displayRouteList(sortedOutlets) {
    const list = document.getElementById('stops-container');
    const container = document.getElementById('route-details');
    list.innerHTML = "";
    
    list.innerHTML += `
        <div class="sequence-item" style="background:#f0f0f0;">
            <div class="name-group">
                <span class="stop-badge" style="background:black;">0</span>
                <b>${WAREHOUSE_NAME} (Start)</b>
            </div>
        </div>`;

    sortedOutlets.forEach((o, i) => {
        let actionHTML = '';
        if (o.phone) actionHTML += `<a href="tel:0${o.phone}" class="nav-link">Call</a> | `;
        actionHTML += `<a href="https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}" target="_blank" class="nav-link">Navigate ➡</a>`;

        list.innerHTML += `
            <div class="sequence-item">
                <div class="name-group">
                    <span class="stop-badge">${i+1}</span>
                    <b>${o.name}</b>
                </div>
                <div class="action-group">
                    ${actionHTML}
                </div>
            </div>`;
    });

    list.innerHTML += `
        <div class="sequence-item" style="background:#f0f0f0;">
            <div class="name-group">
                <span class="stop-badge" style="background:black;">End</span>
                <b>Return to Company</b>
            </div>
        </div>`;

    container.style.display = 'block';
}

function renderGoogleMapsButtons(sortedOutlets) {
    const container = document.getElementById('google-maps-container');
    container.innerHTML = '';

    // Create full point list including Start & End Warehouse
    // We add the 'name' property to the warehouse for clarity
    const warehouseObj = { ...WAREHOUSE_LOC, name: "Warehouse" };
    const allPoints = [warehouseObj, ...sortedOutlets, warehouseObj];

    // Google Maps Limit: ~10 stops (Origin + 9 Waypoints + Destination = 11 points max strictly)
    // To be safe and readable, let's use chunks of 10 points (0 to 9, 9 to 18...)
    // This ensures continuity: The Destination of Link 1 becomes the Origin of Link 2.
    
    const CHUNK_SIZE = 10; 
    let part = 1;

    for (let i = 0; i < allPoints.length - 1; i += (CHUNK_SIZE - 1)) {
        // Slice the chunk
        const chunk = allPoints.slice(i, i + CHUNK_SIZE);
        
        if (chunk.length < 2) break;

        const origin = chunk[0];
        const destination = chunk[chunk.length - 1];
        const waypoints = chunk.slice(1, chunk.length - 1);

        // Build URL
        let url = `https://www.google.com/maps/dir/?api=1`;
        url += `&origin=${origin.lat},${origin.lng}`;
        url += `&destination=${destination.lat},${destination.lng}`;
        
        if (waypoints.length > 0) {
            const wpStr = waypoints.map(wp => `${wp.lat},${wp.lng}`).join('|');
            url += `&waypoints=${wpStr}`;
        }

        // Create Button
        const btn = document.createElement('a');
        btn.className = 'gmaps-btn';
        btn.href = url;
        btn.target = '_blank';
        btn.innerHTML = `Open in Google Maps ${allPoints.length > CHUNK_SIZE ? `(Part ${part})` : ''} ↗`;
        
        container.appendChild(btn);
        part++;
    }
}

function initMap() {
    mapInstance = L.map('mapid').setView([WAREHOUSE_LOC.lat, WAREHOUSE_LOC.lng], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapInstance);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

loadOutlets();