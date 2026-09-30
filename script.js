// NearbyHotels — client-side map and hotel discovery
window.addEventListener("load", function () {
  const statusEl = document.getElementById("status");
  const hotelsListEl = document.getElementById("hotelsList");
  const findBtn = document.getElementById("findBtn");
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = themeToggle.querySelector(".theme-label");

  let map;
  let userMarker;
  let hotelMarkers = [];

  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

  /* ---------- THEME ---------- */

  function setThemeLabel() {
    const isDark = document.body.classList.contains("dark");
    themeLabel.textContent = isDark ? "Light" : "Dark";
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  function initTheme() {
    const saved = localStorage.getItem("theme");

    if (saved === "dark") {
      document.body.classList.add("dark");
    } else if (saved === "light") {
      document.body.classList.remove("dark");
    }

    setThemeLabel();
  }

  initTheme();

  themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");

    localStorage.setItem("theme", isDark ? "dark" : "light");
    setThemeLabel();

    if (map) {
      setTimeout(() => map.invalidateSize(true), 200);
    }
  });

  /* ---------- MAP INIT ---------- */

  function initMap() {
    if (typeof L === "undefined") {
      console.error("Leaflet (L) is not loaded");
      statusEl.textContent = "Map library failed to load. Check your internet.";
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

  /* ---------- LOCATION ---------- */

  function updateUserLocation(pos) {
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

    return { lat, lon };
  }

  function handleLocationError(err) {
    console.error(err);
    statusEl.textContent =
      "Could not get your location. Please allow location access.";
  }

  function getLiveLocationOnLoad() {
    if (!navigator.geolocation) {
      statusEl.textContent = "Geolocation is not supported on this device.";
      return;
    }

    statusEl.textContent = "Getting your live location…";

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        updateUserLocation(pos);
        statusEl.textContent = "Live location ready. Find hotels whenever you're ready.";
      },
      handleLocationError,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  getLiveLocationOnLoad();

  /* ---------- FIND HOTELS ---------- */

  findBtn.addEventListener("click", function () {
    if (!navigator.geolocation) {
      statusEl.textContent = "Geolocation is not supported on this device.";
      return;
    }

    findBtn.disabled = true;
    findBtn.setAttribute("aria-busy", "true");
    statusEl.textContent = "Searching for real nearby hotels…";

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const location = updateUserLocation(pos);
        fetchNearbyHotels(location.lat, location.lon);
      },
      function (err) {
        handleLocationError(err);
        findBtn.disabled = false;
        findBtn.removeAttribute("aria-busy");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  /* ---------- FETCH HOTELS ---------- */

  function fetchNearbyHotels(lat, lon) {
    const radius = 5000;

    const query =
      '[out:json][timeout:25];(' +
      'node["tourism"="hotel"](around:' + radius + "," + lat + "," + lon + ");" +
      'way["tourism"="hotel"](around:' + radius + "," + lat + "," + lon + ");" +
      'relation["tourism"="hotel"](around:' + radius + "," + lat + "," + lon + ");" +
      ");out center;";

    fetch(OVERPASS_URL, {
      method: "POST",
      body: query
    })
      .then((res) => {
        if (!res.ok) throw new Error("Hotel data request failed");
        return res.text();
      })
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
          elements
            .map((el) => {
              const centerLat = (el.center && el.center.lat) || el.lat;
              const centerLon = (el.center && el.center.lon) || el.lon;

              return {
                lat: centerLat,
                lon: centerLon,
                name: el.tags.name || "Unnamed Hotel"
              };
            })
            .filter((hotel) => Number.isFinite(hotel.lat) && Number.isFinite(hotel.lon))
        );
      })
      .catch((err) => {
        console.error(err);
        statusEl.textContent = "Could not load hotel data. Please try again.";
      })
      .finally(() => {
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
        "No hotels found nearby. Try searching again in a busier area.";
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

    if (map && withDistance.length) {
      const hotelLatLngs = withDistance.map((hotel) => [
        hotel.lat,
        hotel.lon
      ]);
      const bounds = L.latLngBounds(hotelLatLngs);

      if (userMarker) {
        bounds.extend(userMarker.getLatLng());
      }

      map.fitBounds(bounds.pad(0.2));
    }

    withDistance.slice(0, maxToShow).forEach((hotel) => {
      if (map) {
        const marker = L.marker([hotel.lat, hotel.lon], { icon: hotelIcon })
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

  /* ---------- DISTANCE ---------- */

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