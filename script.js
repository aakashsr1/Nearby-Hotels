// Wrap everything so it runs after the page is fully loaded
window.addEventListener("load", function () {
  const statusEl = document.getElementById("status");
  const hotelsListEl = document.getElementById("hotelsList");
  const findBtn = document.getElementById("findBtn");
  const themeToggle = document.getElementById("themeToggle");

  let map;
  let userMarker;
  let hotelMarkers = [];

  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

  /* ---------- THEME ---------- */

  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.body.classList.add("dark");
      themeToggle.textContent = "Light";
    } else {
      themeToggle.textContent = "Dark";
    }
  }

  initTheme();

  themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    themeToggle.textContent = isDark ? "Light" : "Dark";
    localStorage.setItem("theme", isDark ? "dark" : "light");
    if (map) {
      setTimeout(() => map.invalidateSize(true), 200);
    }
  });

  /* ---------- MAP INIT ---------- */

  function initMap() {
    if (typeof L === "undefined") {
      console.error("Leaflet (L) is not loaded");
      statusEl.textContent =
        "Map library failed to load. Check your internet.";
      return;
    }

    map = L.map("map").setView([20, 0], 2);

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors"
      }
    ).addTo(map);
  }

  initMap();

  /* ---------- LIVE LOCATION ON LOAD ---------- */

  function getLiveLocationOnLoad() {
    if (!navigator.geolocation) {
      statusEl.textContent =
        "Geolocation not supported on this device.";
      return;
    }

    statusEl.textContent = "Getting your live location...";

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        if (map) {
          map.setView([lat, lon], 15);
        }

        if (userMarker) {
          userMarker.setLatLng([lat, lon]);
        } else if (map) {
          userMarker = L.marker([lat, lon])
            .addTo(map)
            .bindPopup("You are here")
            .openPopup();
        }

        statusEl.textContent = "Live location ready. Tap the button above.";
      },
      function (err) {
        console.error(err);
        statusEl.textContent =
          "Could not get your location. Please allow location access.";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  getLiveLocationOnLoad();

  /* ---------- BUTTON: FIND NEARBY HOTELS ---------- */

  findBtn.addEventListener("click", function () {
    if (!navigator.geolocation) {
      statusEl.textContent = "Geolocation not supported.";
      return;
    }

    statusEl.textContent = "Searching for real nearby hotels...";

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        if (map) {
          map.setView([lat, lon], 15);
        }
        if (userMarker) {
          userMarker.setLatLng([lat, lon]);
        } else if (map) {
          userMarker = L.marker([lat, lon])
            .addTo(map)
            .bindPopup("You are here")
            .openPopup();
        }

        fetchNearbyHotels(lat, lon);
      },
      function (err) {
        console.error(err);
        statusEl.textContent =
          "Could not get your location. Please allow location access.";
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  /* ---------- FETCH HOTELS (OVERPASS) ---------- */

  function fetchNearbyHotels(lat, lon) {
    const radius = 5000; // in meters (5 km)

    const query =
      '[out:json][timeout:25];(' +
      'node["tourism"="hotel"](around:' +
      radius +
      "," +
      lat +
      "," +
      lon +
      ");" +
      'way["tourism"="hotel"](around:' +
      radius +
      "," +
      lat +
      "," +
      lon +
      ");" +
      'relation["tourism"="hotel"](around:' +
      radius +
      "," +
      lat +
      "," +
      lon +
      ");" +
      ");out center;";

    fetch(OVERPASS_URL, {
      method: "POST",
      body: query
    })
      .then((res) => res.text())
      .then((text) => {
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Overpass returned non-JSON", text.slice(0, 200));
          statusEl.textContent =
            "Hotel data service is busy. Try again in a minute.";
          return;
        }

        const elements = (data.elements || []).filter((el) => {
          return el.tags && el.tags.tourism === "hotel";
        });

        renderHotels(
          lat,
          lon,
          elements.map((el) => {
            const centerLat =
              (el.center && el.center.lat) || el.lat;
            const centerLon =
              (el.center && el.center.lon) || el.lon;
            return {
              lat: centerLat,
              lon: centerLon,
              name: el.tags.name || "Unnamed Hotel"
            };
          })
        );
      })
      .catch((err) => {
        console.error(err);
        statusEl.textContent =
          "Could not load hotel data. Please try again.";
      });
  }

    /* ---------- RENDER HOTELS ---------- */

  function renderHotels(userLat, userLon, hotels) {
    // Clear markers from previous search
    hotelMarkers.forEach((m) => {
      if (map) map.removeLayer(m);
    });
    hotelMarkers = [];
    hotelsListEl.innerHTML = "";

    if (!hotels.length) {
      statusEl.textContent =
        "No hotels found nearby. Try moving towards a main road.";
      return;
    }

    // CREATE YOUR CUSTOM HOTEL ICON OBJECT HERE
    // Leaflet needs to know the icon URLs, sizes, and anchor points so it sits perfectly on the map coord
    const hotelIcon = L.icon({
      iconUrl: 'images/hotel-icon.png',       // Point this to your separate transparent hotel image file!
      iconRetinaUrl: 'images/hotel-icon.png', // Point this to the high-res one if you have it, or same file
      iconSize: [25, 41],                    // Default Leaflet marker width & height
      iconAnchor: [12, 41],                  // The exact tip point of the pin that touches the map
      popupAnchor: [1, -34],                 // Where the text popup builds relative to the pin tip
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', // Uses standard shadow
      shadowSize: [41, 41]
    });

    // Add distance and sort
    const withDistance = hotels
      .map((h) => {
        const dist = distanceInKm(userLat, userLon, h.lat, h.lon);
        return { ...h, dist };
      })
      .sort((a, b) => a.dist - b.dist);

    const maxToShow = Math.min(5, withDistance.length);
    statusEl.textContent =
      "Found " +
      withDistance.length +
      " places, showing closest " +
      maxToShow +
      ".";

    if (map && withDistance.length) {
      const hotelLatLngs = withDistance.map((h) => [h.lat, h.lon]);
      const bounds = L.latLngBounds(hotelLatLngs);
      if (userMarker) bounds.extend(userMarker.getLatLng());
      map.fitBounds(bounds.pad(0.2));
    }

    withDistance.slice(0, maxToShow).forEach((hotel) => {
      if (map) {
        // PASS THE CUSTOM ICON TO THE MARKER HERE USING THE { icon: hotelIcon } OPTION
        const marker = L.marker([hotel.lat, hotel.lon], { icon: hotelIcon })
          .addTo(map)
          .bindPopup(hotel.name);
        hotelMarkers.push(marker);
      }

      const item = document.createElement("div");
      item.className = "hotel";
      item.innerHTML =
        '<div class="hotel-info">' +
        '<div class="hotel-title">' +
        hotel.name +
        "</div>" +
        '<div class="hotel-distance">' +
        hotel.dist.toFixed(2) +
        " km away</div>" +
        "</div>" +
        '<button class="open-btn">Open in Maps</button>';

      const btn = item.querySelector(".open-btn");
      btn.addEventListener("click", function () {
        const url =
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(hotel.lat + "," + hotel.lon);
        window.open(url, "_blank");
      });

      hotelsListEl.appendChild(item);
    });
  }


  /* ---------- DISTANCE HELPER ---------- */

  function distanceInKm(lat1, lon1, lat2, lon2) {
    function toRad(v) {
      return (v * Math.PI) / 180;
    }

    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
});