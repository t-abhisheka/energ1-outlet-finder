/**
 * custom_route.js
 * Logic for "Combined Selection & Sequence" Workflow.
 * Includes "Open in Google Maps" splitting logic.
 */

const WAREHOUSE_LOC = { lat: 6.738495357574309, lng: 80.027898324218 };
const WAREHOUSE_NAME = "Head Office";

let allOutlets = [];      
let userList = [];        
let mapInstance = null;
let routeLayer = null;
let markersLayer = L.layerGroup(); 
let isRouteMode = false;  

function loadOutlets() {
    Papa.parse('locations.csv', {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: function(results) {
            allOutlets = results.data
                .filter(r => r.name && r.lat && r.lng)
                .sort((a, b) => a.name.localeCompare(b.name));
            
            populateOutletDropdown();
            populateRouteDropdown();
            initMap();
        }
    });
}

function populateOutletDropdown() {
    const dropdown = document.getElementById('outlet-dropdown');
    dropdown.innerHTML = '<option value="" disabled selected>Select an outlet...</option>';
    allOutlets.forEach((outlet, index) => {
        const option = document.createElement('option');
        option.value = index; 
        option.textContent = outlet.name;
        dropdown.appendChild(option);
    });
}

function populateRouteDropdown() {
    const dropdown = document.getElementById('route-dropdown');
    dropdown.innerHTML = '<option value="" disabled selected>Select a region...</option>';
    const routes = new Set();
    allOutlets.forEach(o => { if (o.route) routes.add(o.route.trim()); });
    Array.from(routes).sort().forEach(r => {
        const option = document.createElement('option');
        option.value = r;
        option.textContent = r;
        dropdown.appendChild(option);
    });
}

function addSingleOutlet() {
    const idx = document.getElementById('outlet-dropdown').value;
    if (idx === "") return alert("Select an outlet first.");
    addToList(allOutlets[idx]);
    document.getElementById('outlet-dropdown').value = "";
}

function addRouteGroup() {
    const route = document.getElementById('route-dropdown').value;
    if (route === "") return alert("Select a route region first.");
    const group = allOutlets.filter(o => o.route === route);
    if (group.length === 0) return alert("No outlets found.");
    
    group.forEach(o => addToList(o));
    document.getElementById('route-dropdown').value = "";
    
    const container = document.getElementById('main-list');
    container.scrollTop = container.scrollHeight;
}

function addToList(outlet) {
    if (userList.find(i => i.name === outlet.name)) return;
    userList.push({ ...outlet, isChecked: true });
    if (!isRouteMode) renderListMode();
}

function renderListMode() {
    const container = document.getElementById('main-list');
    container.innerHTML = '';
    
    if (userList.length === 0) {
        container.innerHTML = '<div class="empty-msg">No outlets added yet.</div>';
        return;
    }

    userList.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        if (item.isChecked) div.style.backgroundColor = '#e0f2f1';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.isChecked;
        checkbox.onchange = () => {
            item.isChecked = checkbox.checked;
            div.style.backgroundColor = item.isChecked ? '#e0f2f1' : 'white';
        };

        const label = document.createElement('label');
        label.textContent = item.name;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-icon';
        removeBtn.innerHTML = '✕';
        removeBtn.onclick = () => {
            userList.splice(index, 1);
            renderListMode();
        };

        div.appendChild(checkbox);
        div.appendChild(label);
        div.appendChild(removeBtn);
        container.appendChild(div);
    });
}

function renderSequenceMode(sortedPath) {
    const container = document.getElementById('main-list');
    container.innerHTML = '';

    container.innerHTML += `
        <div class="sequence-item" style="background:#f0f0f0;">
            <div class="name-group">
                <span class="stop-badge" style="background:black;">0</span>
                <b>${WAREHOUSE_NAME} (Start)</b>
            </div>
        </div>`;

    sortedPath.forEach((outlet, index) => {
        const num = index + 1;
        const div = document.createElement('div');
        div.className = 'sequence-item';
        
        let actionHTML = '';
        if (outlet.phone) actionHTML += `<a href="tel:0${outlet.phone}" class="nav-link">Call</a> | `;
        actionHTML += `<a href="https://www.google.com/maps/dir/?api=1&destination=${outlet.lat},${outlet.lng}" target="_blank" class="nav-link">Navigate ➡</a>`;

        div.innerHTML = `
            <div class="name-group">
                <span class="stop-badge">${num}</span>
                <b>${outlet.name}</b>
            </div>
            <div class="action-group">
                ${actionHTML}
            </div>
        `;
        container.appendChild(div);
    });

    container.innerHTML += `
        <div class="sequence-item" style="background:#f0f0f0;">
            <div class="name-group">
                <span class="stop-badge" style="background:black;">End</span>
                <b>Return to Company</b>
            </div>
        </div>`;
}

function renderGoogleMapsButtons(sortedOutlets) {
    const container = document.getElementById('google-maps-container');
    container.innerHTML = '';

    const warehouseObj = { ...WAREHOUSE_LOC, name: "Warehouse" };
    const allPoints = [warehouseObj, ...sortedOutlets, warehouseObj];
    
    // Chunk size 10 ensures continuity (Origin + 8 waypoints + Destination)
    const CHUNK_SIZE = 10; 
    let part = 1;

    for (let i = 0; i < allPoints.length - 1; i += (CHUNK_SIZE - 1)) {
        const chunk = allPoints.slice(i, i + CHUNK_SIZE);
        if (chunk.length < 2) break;

        const origin = chunk[0];
        const destination = chunk[chunk.length - 1];
        const waypoints = chunk.slice(1, chunk.length - 1);

        let url = `https://www.google.com/maps/dir/?api=1`;
        url += `&origin=${origin.lat},${origin.lng}`;
        url += `&destination=${destination.lat},${destination.lng}`;
        
        if (waypoints.length > 0) {
            const wpStr = waypoints.map(wp => `${wp.lat},${wp.lng}`).join('|');
            url += `&waypoints=${wpStr}`;
        }

        const btn = document.createElement('a');
        btn.className = 'gmaps-btn';
        btn.href = url;
        btn.target = '_blank';
        btn.innerHTML = `Open in Google Maps ${allPoints.length > CHUNK_SIZE ? `(Part ${part})` : ''} ↗`;
        
        container.appendChild(btn);
        part++;
    }
}

function calculateCustomRoute() {
    const activeOutlets = userList.filter(item => item.isChecked);
    if (activeOutlets.length === 0) return alert("Select at least one outlet.");

    let currentPos = WAREHOUSE_LOC;
    let sortedPath = [];
    let remaining = [...activeOutlets];

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

    isRouteMode = true;
    document.getElementById('selection-controls').style.display = 'none';
    document.getElementById('btn-generate').style.display = 'none';
    document.getElementById('btn-clear').style.display = 'none';
    document.getElementById('btn-edit').style.display = 'block';
    document.getElementById('list-title').textContent = "Optimized Route Sequence:";

    renderSequenceMode(sortedPath);
    drawRouteOnMap(sortedPath);
    renderGoogleMapsButtons(sortedPath);
}

function editSelection() {
    isRouteMode = false;
    document.getElementById('selection-controls').style.display = 'flex';
    document.getElementById('btn-generate').style.display = 'block';
    document.getElementById('btn-clear').style.display = 'block';
    document.getElementById('btn-edit').style.display = 'none';
    document.getElementById('list-title').textContent = "Your Selection:";
    document.getElementById('route-stats').style.display = 'none';
    document.getElementById('google-maps-container').innerHTML = ''; // Clear buttons

    markersLayer.clearLayers();
    if(routeLayer) mapInstance.removeLayer(routeLayer);
    
    renderListMode();
}

function clearAll() {
    userList = [];
    renderListMode();
}

function drawRouteOnMap(sortedOutlets) {
    markersLayer.clearLayers();
    if (routeLayer) mapInstance.removeLayer(routeLayer);

    L.marker([WAREHOUSE_LOC.lat, WAREHOUSE_LOC.lng]).addTo(markersLayer)
        .bindPopup("<b>Warehouse</b>").setIcon(L.divIcon({className:'custom-pin', html:`<div style="background:black;color:white;border-radius:50%;width:30px;height:30px;text-align:center;line-height:30px;">HQ</div>`}));

    let coords = `${WAREHOUSE_LOC.lng},${WAREHOUSE_LOC.lat}`;
    sortedOutlets.forEach((o, i) => {
        coords += `;${o.lng},${o.lat}`;
        L.marker([o.lat, o.lng]).addTo(markersLayer)
            .bindPopup(`<b>${i+1}. ${o.name}</b>`)
            .setIcon(L.divIcon({className:'number-icon', html:`<div style="background:#004d40;color:white;border-radius:50%;width:24px;height:24px;text-align:center;line-height:24px;font-weight:bold;border:2px solid white;">${i+1}</div>`}));
    });
    coords += `;${WAREHOUSE_LOC.lng},${WAREHOUSE_LOC.lat}`; 

    markersLayer.addTo(mapInstance);

    document.getElementById('route-stats').style.display = 'block';
    document.getElementById('route-stats').textContent = "Calculating path...";
    
    fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`)
        .then(res => res.json())
        .then(data => {
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                routeLayer = L.geoJSON(route.geometry, { style: { color: 'blue', weight: 5, opacity: 0.7 } }).addTo(mapInstance);
                mapInstance.fitBounds(routeLayer.getBounds().pad(0.1));
                const km = (route.distance / 1000).toFixed(1);
                document.getElementById('route-stats').innerHTML = `✅ Total Distance: ${km} km`;
            }
        })
        .catch(e => {
            const latlngs = [WAREHOUSE_LOC, ...sortedOutlets, WAREHOUSE_LOC];
            routeLayer = L.polyline(latlngs, {color:'red', dashArray:'5,10'}).addTo(mapInstance);
            mapInstance.fitBounds(routeLayer.getBounds());
            document.getElementById('route-stats').textContent = "Showing direct path (API unavailable).";
        });
}

function initMap() {
    mapInstance = L.map('mapid').setView([WAREHOUSE_LOC.lat, WAREHOUSE_LOC.lng], 9);
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