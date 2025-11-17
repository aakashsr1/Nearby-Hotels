"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const findBtn = document.getElementById("findBtn");
  const statusEl = document.getElementById("status");
  const hotelsList = document.getElementById("hotelsList");
  const mapContainer = document.getElementById("map");

  if (!findBtn || !statusEl || !hotelsList || !mapContainer) {
    console.error("One or more required elements are missing in HTML.");
    return;
  }

  let map;
  let userMarker;
  let hotelsLayer;

  function initMap(lat, lon) {
    if (!map) {
      map = L.map("map").setView([lat, lon], 15);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
    } else {
      map.setView([lat, lon], 15);
    }

    if (userMarker) {
      userMarker.setLatLng([lat, lon]);
    } else {
      userMarker = L.marker([lat, lon]).addTo(map).bindPopup("You are here");
    }

    if (hotelsLayer) {
      hotelsLayer.clearLayers();
    } else {
      hotelsLayer = L.layerGroup().addTo(map);
    }
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async function fetchHotels(lat, lon) {
    statusEl.textContent = "Searching for hotels nearby…";

    const radiusMeters = 3000; // 3 km
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["tourism"="hotel"](around:${radiusMeters},${lat},${lon});
        way["tourism"="hotel"](around:${radiusMeters},${lat},${lon});
        relation["tourism"="hotel"](around:${radiusMeters},${lat},${lon});
      );
      out center;
    `;

    const url =
      "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(overpassQuery);

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Overpass error " + res.status);
      const data = await res.json();

      const results = [];

      for (const el of data.elements || []) {
        let hLat, hLon;

        if (el.type === "node" && el.lat && el.lon) {
          hLat = el.lat;
          hLon = el.lon;
        } else if (el.center && el.center.lat && el.center.lon) {
          hLat = el.center.lat;
          hLon = el.center.lon;
        } else {
          continue;
        }

        const name =
          el.tags && el.tags.name
            ? el.tags.name
            : "Unnamed hotel (OpenStreetMap)";

        const dist = distanceKm(lat, lon, hLat, hLon);

        results.push({
          name,
          lat: hLat,
          lon: hLon,
          distanceKm: dist,
        });
      }

      if (!results.length) {
        statusEl.textContent =
          "No hotels found nearby. Try moving outside / closer to main road.";
        hotelsList.innerHTML = "";
        return;
      }

      results.sort((a, b) => a.distanceKm - b.distanceKm);
      const top = results.slice(0, 6); // show up to 6

      renderHotels(top);
      plotHotelsOnMap(top);
      statusEl.textContent = `Found ${results.length} places, showing closest ${
        top.length
      }.`;
    } catch (err) {
      console.error(err);
      statusEl.textContent =
        "Error contacting map server. Check internet and try again.";
      hotelsList.innerHTML = "";
    }
  }

  function renderHotels(hotels) {
    hotelsList.innerHTML = "";

    hotels.forEach((hotel) => {
      const card = document.createElement("div");
      card.className = "hotel-card";

      const distanceStr = hotel.distanceKm.toFixed(2);

      card.innerHTML = `
        <div class="hotel-name">${hotel.name}</div>
        <div class="hotel-distance">${distanceStr} km away from you</div>
        <div class="hotel-actions">
          <button class="open-maps-btn">Open in Maps</button>
        </div>
      `;

      const btn = card.querySelector(".open-maps-btn");
      btn.addEventListener("click", () => {
        const url = `https://www.google.com/maps/search/?api=1&query=${hotel.lat},${hotel.lon}`;
        window.open(url, "_blank");
      });

      hotelsList.appendChild(card);
    });
  }

  function plotHotelsOnMap(hotels) {
    if (!hotelsLayer) return;

    hotelsLayer.clearLayers();

    hotels.forEach((hotel) => {
      L.marker([hotel.lat, hotel.lon])
        .addTo(hotelsLayer)
        .bindPopup(`${hotel.name}<br>${hotel.distanceKm.toFixed(2)} km away`);
    });
  }

  function getLocationAndSearch() {
    if (!navigator.geolocation) {
      statusEl.textContent = "Geolocation not supported on this device.";
      return;
    }

    statusEl.textContent = "Getting your location…";
    findBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        initMap(lat, lon);
        fetchHotels(lat, lon).finally(() => {
          findBtn.disabled = false;
        });
      },
      (err) => {
        console.error(err);
        statusEl.textContent =
          "Location permission denied or unavailable. Please enable location and try again.";
        findBtn.disabled = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
      }
    );
  }

  // Initial UI state
  statusEl.textContent = "Waiting for search…";
  hotelsList.innerHTML = "";

  // Button click
  findBtn.addEventListener("click", getLocationAndSearch);
});