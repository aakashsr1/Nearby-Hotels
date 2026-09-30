// NearbyHotels — location centering, theme switching and hotel discovery
window.addEventListener("load", function () {
  const statusEl = document.getElementById("status");
  const hotelsListEl = document.getElementById("hotelsList");
  const findBtn = document.getElementById("findBtn");
  const locateBtn = document.getElementById("locateBtn");
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = themeToggle.querySelector(".theme-label");
  const themeIcon = themeToggle.querySelector(".theme-icon");

  let map;
  let userMarker;
  let hotelMarkers = [];
  let latestLocation = null;
  let locationWatchId = null;
  let currentTileLayer = null;

  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const HOTEL_RADIUS = 3000;
  const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";

  /* ---------- THEME ---------- */

  function applyTheme() {
    const isDark = document.body.classList.contains("dark");
    themeLabel.textContent = isDark ? "Light" : "Dark";
    themeIcon.textContent = isDark ? "☀" : "◐";
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute("content", isDark ? "#070b12" : "#0b1220");

    updateMapTiles();
  }

  function initTheme() {
    const saved = localStorage.getItem("theme");

    if (saved === "dark") {
      document.body.classList.add("dark");
    } else if (saved === "light") {
      document.body.classList.remove("dark");
    } else {
      document.body.classList.remove("dark");
    }

    applyTheme();
  }

  function updateMapTiles() {
    if (!map || typeof L === "undefined") return;

    const isDark = document.body.classList.contains("dark");
    const tileUrl = isDark ? DARK_TILES : LIGHT_TILES;

    if (!currentTileLayer || currentTileLayer._url !== tileUrl) {
      if (currentTileLayer) map.removeLayer(currentTileLayer);

      currentTileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors"
      }).addTo(map);
    }

    setTimeout(() => map.invalidateSize(true), 100);
  }

  initTheme();

  themeToggle.addEventListener("click", function () {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    applyTheme();
  });

  /* ---------- MAP ---------- */

  function initMap() {
    if (typeof L === "undefined") {
      statusEl.textContent = "Map library failed to load. Check your internet.";
      return;
    }

    map = L.map("map").setView([20, 0], 2);
    updateMapTiles();
  }

  initMap();

  /* ---------- LOCATION ---------- */

  function updateUserMarker(lat, lon, shouldCenter) {
    latestLocation = { lat, lon };

    if (!map) return;

    if (userMarker) {
      userMarker.setLatLng([lat, lon]);
    } else {
      userMarker = L.marker([lat, lon])
        .addTo(map)
        .bindPopup("You are here");
    }

    if (shouldCenter) {
      map.setView([lat, lon], 16, { animate: true });
    }
  }

  function locationOptions(quick) {
    return {
      enableHighAccuracy: !quick,
      timeout: quick ? 3500 : 8000,
      maximumAge: quick ? 60000 : 5000
    };
  }

  function getCurrentLocation(shouldCenter, onSuccess) {
    if (!navigator.geolocation) {
      statusEl.textContent = "Geolocation is not supported on this device.";
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const location = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        updateUserMarker(location.lat, location.lon, shouldCenter);
        if (onSuccess) onSuccess(location);
      },
      function () {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            const location = {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            };
            updateUserMarker(location.lat, location.lon, shouldCenter);
            if (onSuccess) onSuccess(location);
          },
          function (err) {
            console.error(err);
            statusEl.textContent =
              "Could not get your location. Please allow location access.";
            if (onSuccess) onSuccess(null);
          },
          locationOptions(false)
        );
      },
      locationOptions(true)
    );
  }

  function startLocationUpdates() {
    if (!navigator.geolocation || locationWatchId !== null) return;

    locationWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        updateUserMarker(
          pos.coords.latitude,
          pos.coords.longitude,
          false
        );
      },
      function (err) {
        console.warn("Location watch:", err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000
      }
    );
  }

  function locateMe() {
    locateBtn.disabled = true;
    statusEl.textContent = "Finding your location…";

    if (latestLocation && map) {
      map.setView([latestLocation.lat, latestLocation.lon], 16, {
        animate: true
      });
    }

    getCurrentLocation(true, function (location) {
      locateBtn.disabled = false;

      if (location) {
        const accuracy = Math.round(location.accuracy || 0);
        statusEl.textContent =
          accuracy > 0
            ? "You're here • accuracy about " + accuracy + " m."
            : "Centered on your current location.";
      }
    });
  }

  locateBtn.addEventListener("click", locateMe);

  function getLiveLocationOnLoad() {
    statusEl.textContent = "Getting your location…";

    getCurrentLocation(false, function (location) {
      if (location) {
        statusEl.textContent = "Location ready. Tap Find nearby hotels.";
        startLocationUpdates();
      }
    });
  }

  getLiveLocationOnLoad();

  /* ---------- HOTEL SEARCH ---------- */

  findBtn.addEventListener("click", function () {
    findBtn.disabled = true;
    findBtn.setAttribute("aria-busy", "true");
    statusEl.textContent = "Finding your location…";

    getCurrentLocation(true, function (location) {
      if (!location) {
        findBtn.disabled = false;
        findBtn.removeAttribute("aria-busy");
        return;
      }

      fetchNearbyHotels(location.lat, location.lon);
    });
  });

  function fetchNearbyHotels(lat, lon) {
    statusEl.textContent = "Searching nearby hotels…";

    const query =
      '[out:json][timeout:10];(' +
      'node["tourism"="hotel"](around:' + HOTEL_RADIUS + "," + lat + "," + lon + ");" +
      'way["tourism"="hotel"](around:' + HOTEL_RADIUS + "," + lat + "," + lon + ");' +
      ");out center;";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 11000);

    fetch(OVERPASS_URL, {
      method: "POST",
      body: query,
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) throw new Error("Hotel data request failed");
        return res.json();
      })
      .then((data) => {
        const hotels = (data.elements || [])
          .filter((el) => el.tags && el.tags.tourism === "hotel")
          .map((el) => {
            const hotelLat = (el.center && el.center.lat) || el.lat;
            const hotelLon = (el.center && el.center.lon) || el.lon;

            return {
              lat: hotelLat,
              lon: hotelLon,
              name: el.tags.name || "Unnamed Hotel"
            };
          })
          .filter(
            (hotel) =>
              Number.isFinite(hotel.lat) && Number.isFinite(hotel.lon)
          );

        renderHotels(lat, lon, hotels);
      })
      .catch((err) => {
        console.error(err);

        statusEl.textContent =
          err.name === "AbortError"
            ? "Hotel search took too long. Please try again."
            : "Could not load hotel data. Please try again.";
      })
      .finally(() => {
        clearTimeout(timeoutId);
        findBtn.disabled = false;
        findBtn.removeAttribute("aria-busy");
      });
  }

  /* ---------- RENDER HOTELS ---------- */

  function renderHotels(userLat, userLon, hotels) {
    hotelMarkers.forEach((marker) => {
      if (map) map.removeLayer(marker);
    });

    hotelMarkers = [];
    hotelsListEl.innerHTML = "";

    if (!hotels.length) {
      statusEl.textContent =
        "No hotels found within 3 km. Try again in a busier area.";
      return;
    }

    const hotelIcon = L.icon({
      iconUrl: "images/hotel-icon.png",
      iconRetinaUrl: "images/hotel-icon.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      shadowSize: [41, 41]
    });

    const withDistance = hotels
      .map((hotel) => ({
        ...hotel,
        dist: distanceInKm(userLat, userLon, hotel.lat, hotel.lon)
      }))
      .sort((a, b) => a.dist - b.dist);

    const maxToShow = Math.min(5, withDistance.length);

    statusEl.textContent =
      "Found " +
      withDistance.length +
      " hotels, showing the closest " +
      maxToShow +
      ".";

    const visibleHotels = withDistance.slice(0, maxToShow);

    if (map && visibleHotels.length) {
      const bounds = L.latLngBounds(
        visibleHotels.map((hotel) => [hotel.lat, hotel.lon])
      );

      if (userMarker) bounds.extend(userMarker.getLatLng());

      map.fitBounds(bounds.pad(0.2), {
        maxZoom: 16,
        animate: true
      });
    }

    visibleHotels.forEach((hotel) => {
      if (map) {
        const marker = L.marker([hotel.lat, hotel.lon], {
          icon: hotelIcon
        })
          .addTo(map)
          .bindPopup(hotel.name);

        hotelMarkers.push(marker);
      }

      const item = document.createElement("div");
      item.className = "hotel";
      item.innerHTML =
        '<div class="hotel-info">' +
        '<div class="hotel-title"></div>' +
        '<div class="hotel-distance"></div>' +
        "</div>" +
        '<button class="open-btn" type="button">Open in Maps</button>';

      item.querySelector(".hotel-title").textContent = hotel.name;
      item.querySelector(".hotel-distance").textContent =
        hotel.dist.toFixed(2) + " km away";

      item.querySelector(".open-btn").addEventListener("click", function () {
        const url =
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(hotel.lat + "," + hotel.lon);

        window.open(url, "_blank", "noopener,noreferrer");
      });

      hotelsListEl.appendChild(item);
    });
  }

  function distanceInKm(lat1, lon1, lat2, lon2) {
    function toRad(value) {
      return (value * Math.PI) / 180;
    }

    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
});