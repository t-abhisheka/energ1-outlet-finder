# ENERG1 Outlet Finder 🔋

A smart, location-based web application that helps customers find their nearest ENERG1 battery outlet. The app supports both automatic GPS detection and manual location searching, complete with driving routes and distance calculations.

🔗 **Live Demo:** [https://t-abhisheka.github.io/energ1-outlet-finder/](https://t-abhisheka.github.io/energ1-outlet-finder/)

## 🚀 Features

* **📍 Auto GPS Locator:** Automatically detects the user's current position to find the nearest outlet.
* **🔍 Manual Search:** Users can type their city or location (e.g., "Kandy") with **auto-suggestions** powered by OpenStreetMap.
* **🛣️ Smart Routing:** Calculates the **actual driving distance** (not just straight line) using the OSRM API.
* **🗺️ Interactive Map:** Visualizes the route from the user to the shop on a Leaflet map.
* **📊 Analytics Integration:** Logs user search locations to a Google Sheet for marketing analysis.
* **📱 Responsive Design:** Works seamlessly on mobile phones and desktop computers.
* **🔗 Google Maps Ready:** Provides a direct link to open turn-by-turn navigation in the Google Maps app.

## 🛠️ Technologies Used

* **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
* **Mapping Library:** [Leaflet.js](https://leafletjs.com/) (OpenStreetMap)
* **Geocoding API:** [Nominatim](https://nominatim.org/) (Free search)
* **Routing API:** [OSRM](http://project-osrm.org/) (Open Source Routing Machine)
* **Data Parsing:** [PapaParse](https://www.papaparse.com/) (CSV to JSON)
* **Backend Logging:** Google Apps Script (Web App)

## 📂 Project Structure

```text
/
├── index.html       # Main application page (Manual Search & Auto GPS logic)
├── auto.html        # Dedicated Auto-GPS entry point (optional)
├── script.js        # Core logic: Map handling, API calls, Routing
├── styles.css       # Styling for the card, map, and suggestions
├── locations.csv    # Database of outlet locations (Name, Lat, Lng, Phone)
└── logo.jpg         # Company branding