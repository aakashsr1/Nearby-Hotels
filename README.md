# NearbyHotels

A responsive, location-based hotel finder that helps users discover real hotels near their current location.

## 🌐 Live Demo

**[Open NearbyHotels](https://aakashsr1.github.io/Nearby-Hotels/)**

## ✨ Features

- 📍 **Live location detection** — Uses the device's location to center the map.
- 🏨 **Nearby hotel discovery** — Finds mapped hotels within a 5 km radius.
- 🗺️ **Interactive map** — Displays your location and nearby hotels using Leaflet.
- 📏 **Distance calculation** — Sorts results by distance from the user.
- 🧭 **Google Maps directions** — Open a hotel directly in Google Maps.
- 🌙 **Dark / light mode** — Theme preference is saved locally.
- ♿ **Accessibility section** — Includes a dedicated CWSN/accessibility page.
- 📱 **Responsive design** — Optimized for mobile and desktop screens.

## 🛠️ Technologies

- HTML5
- CSS3
- JavaScript
- Leaflet.js
- OpenStreetMap
- Overpass API
- GitHub Pages

## 🔍 How It Works

1. The user opens NearbyHotels and grants location permission.
2. The application gets the user's current coordinates.
3. Nearby hotel data is requested from OpenStreetMap through the Overpass API.
4. Hotels are calculated and sorted by distance.
5. The closest results are displayed on the map and in the hotel list.
6. Users can open a selected hotel in Google Maps.

## 📂 Project Structure

```text
Nearby-Hotels/
├── index.html        # Main application page
├── styles.css        # Responsive UI and themes
├── script.js         # Location, hotel search and map logic
├── cwsn.html         # Accessibility page
├── leaflet.js        # Leaflet map library
├── leaflet.css       # Leaflet styles
├── logo.png          # Application logo
└── images/           # Project images and map icons
```

## 🚀 Running Locally

Because this is a client-side web application, it can be run with a simple local web server.

1. Clone the repository.
2. Open the project folder.
3. Start a local HTTP server.
4. Open the provided local URL in your browser.
5. Allow location access when prompted.

> **Note:** Browser geolocation generally requires a secure context such as HTTPS or a local development environment.

## 📌 Data & Attribution

Hotel data is retrieved from **OpenStreetMap** through the **Overpass API**.

Map tiles are provided by **OpenStreetMap contributors**.

## 👨‍💻 Author

**Aakash**

Built as a location-based web development project focused on geolocation, interactive maps, API-based data retrieval, and responsive UI design.
