// FINAL cwsn.js - stable; supports Dark, High-Contrast, HC-inverted; tile switching; no speech; custom marker separation
window.addEventListener("load", function () {
  const statusEl = document.getElementById("status");
  const hotelsListEl = document.getElementById("hotelsList");
  const findBtn = document.getElementById("findBtn");
  const themeToggle = document.getElementById("themeToggle");
  const contrastToggle = document.getElementById("contrastToggle");
  const OVERPASS = "https://overpass-api.de/api/interpreter";

  let map = null, userMarker = null, hotelMarkers = [], currentTileLayer = null;

  function announce(text) { if (!statusEl) return; statusEl.textContent = text; try { statusEl.focus(); } catch(e){} }

  // tile urls
  const LIGHT_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const DARK_TILES  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";

  function initMap() {
    if (typeof L === "undefined") { announce("Map library failed to load."); return; }
    map = L.map("map", { zoomControl: true }).setView([20,0],2);
    // choose initial tile by saved or class
    const useDark = document.body.classList.contains("dark") && !document.body.classList.contains("high-contrast");
    const initUrl = useDark ? DARK_TILES : LIGHT_TILES;
    currentTileLayer = L.tileLayer(initUrl, { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
  }
  initMap();

  function updateTiles() {
    if (!map) return;
    const isHC = document.body.classList.contains("high-contrast");
    const isInverted = document.body.classList.contains("hc-inverted");
    const isDark = document.body.classList.contains("dark");
    const tileUrl = (isHC && isInverted) ? LIGHT_TILES : (isDark ? DARK_TILES : LIGHT_TILES);
    try { if (currentTileLayer && currentTileLayer._url !== tileUrl) { map.removeLayer(currentTileLayer); currentTileLayer = L.tileLayer(tileUrl, { maxZoom:19, attribution: "© OpenStreetMap contributors" }).addTo(map); } } catch(e){}
    try { map.invalidateSize(true); if (currentTileLayer && currentTileLayer.redraw) currentTileLayer.redraw(); } catch(e){}
  }

  function updateToggleLabels() {
    const isHC = document.body.classList.contains("high-contrast");
    const isInverted = document.body.classList.contains("hc-inverted");
    const isDark = document.body.classList.contains("dark");
    // themeToggle shows the next action name
    if (isHC) {
      // when HC on, toggling theme flips inverted state — label should be "Dark" (user can press to get inverted HC)
      themeToggle.textContent = "Dark";
    } else {
      themeToggle.textContent = isDark ? "Light" : "Dark";
    }
    themeToggle.setAttribute("aria-pressed", String(isDark));
    if (contrastToggle) contrastToggle.setAttribute("aria-pressed", String(isHC));
  }

  // Restore saved theme/contrast
  (function restore() {
    if (localStorage.getItem("cwsn-theme") === "dark") document.body.classList.add("dark");
    if (localStorage.getItem("cwsn-contrast") === "on") document.body.classList.add("high-contrast");
    updateToggleLabels();
    updateTiles();
  })();

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      const isHC = document.body.classList.contains("high-contrast");
      if (isHC) {
        // flip inverted HC
        document.body.classList.toggle("hc-inverted");
        // keep hc authoritative: remove dark
        document.body.classList.remove("dark");
      } else {
        const nowDark = document.body.classList.toggle("dark");
        localStorage.setItem("cwsn-theme", nowDark ? "dark" : "light");
        document.body.classList.remove("hc-inverted");
      }
      updateToggleLabels();
      updateTiles();
    });
  }

  if (contrastToggle) {
    contrastToggle.addEventListener("click", function () {
      const on = document.body.classList.toggle("high-contrast");
      localStorage.setItem("cwsn-contrast", on ? "on" : "off");
      // when enabling HC, clear normal dark to avoid conflicts
      if (on) { document.body.classList.remove("dark"); document.body.classList.remove("hc-inverted"); }
      else { document.body.classList.remove("hc-inverted"); }
      updateToggleLabels();
      updateTiles();
    });
  }

  // sanitize button text (fix stray control char)
  function safeText(s){ return String(s).replace(/[\x00-\x1F\x7F]/g,"").trim(); }
  if (findBtn) {
    const txt = safeText(findBtn.textContent);
    findBtn.textContent = txt.length ? txt : "📍 Find Nearby Hotels";
  }

  // initial geolocation (non-blocking)
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos){
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      announce("Location found. Tap Find Nearby Hotels to search.");
      if (map) {
        map.setView([lat,lon],15);
        if (!userMarker) userMarker = L.marker([lat,lon]).addTo(map).bindPopup("You are here");
        else userMarker.setLatLng([lat,lon]);
      }
    }, function(){ announce("We could not get your location. Please allow location access."); }, { enableHighAccuracy:true, timeout:12000 });
  } else announce("Geolocation not supported.");

  if (findBtn) {
    findBtn.addEventListener("click", function () {
      if (!navigator.geolocation) { announce("Geolocation not supported."); return; }
      announce("Requesting location...");
      navigator.geolocation.getCurrentPosition(function(pos){
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        if (map) { map.setView([lat,lon],15); if (userMarker) userMarker.setLatLng([lat,lon]); else userMarker = L.marker([lat,lon]).addTo(map).bindPopup("You are here"); }
        fetchNearbyHotels(lat, lon);
      }, function(){ announce("Could not get your location. Please allow location access."); }, { enableHighAccuracy:true, timeout:15000 });
    });
  }

  function fetchNearbyHotels(lat, lon) {
    announce("Searching for nearby hotels...");
    const radius = 5000;
    const query = '[out:json][timeout:25];(' +
      'node["tourism"="hotel"](around:' + radius + ',' + lat + ',' + lon + ');' +
      'way["tourism"="hotel"](around:' + radius + ',' + lat + ',' + lon + ');' +
      'relation["tourism"="hotel"](around:' + radius + ',' + lat + ',' + lon + ');' +
      ');out center;';
    fetch(OVERPASS, { method: "POST", body: query })
      .then(r => r.text())
      .then(text => { let data; try { data = JSON.parse(text); } catch (e) { announce("Hotel data service busy."); return; }
        const elements = (data.elements||[]).filter(el=>el.tags && el.tags.tourism === "hotel");
        const hotels = elements.map(el=>{ const latc = (el.center&&el.center.lat)||el.lat; const lonc = (el.center&&el.center.lon)||el.lon; return { name: (el.tags&&el.tags.name)||"Unnamed Hotel", lat: latc, lon: lonc }; });
        renderHotels(lat, lon, hotels);
      }).catch(()=>announce("Could not load hotel data. Try again."));
  }

  /* ---------- RENDER HOTELS ---------- */
  function renderHotels(userLat, userLon, hotels) {
    hotelMarkers.forEach(m=>{ if (map && m) map.removeLayer(m); }); hotelMarkers = []; hotelsListEl.innerHTML = "";
    if (!hotels || hotels.length===0) { announce("No hotels found."); return; }
    
    // DEFINED CUSTOM HOTEL ICON
    const hotelIcon = L.icon({
      iconUrl: 'images/hotel-icon.png',       
      iconRetinaUrl: 'images/hotel-icon.png', 
      iconSize: [25, 41],                    
      iconAnchor: [12, 41],                  
      popupAnchor: [1, -34],                 
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      shadowSize: [41, 41]
    });

    const withDist = hotels.map(h=>Object.assign({}, h, { dist: distanceInKm(userLat,userLon,h.lat,h.lon) })).sort((a,b)=>a.dist-b.dist);
    const maxShow = Math.min(7, withDist.length);
    announce("Found " + withDist.length + ", showing closest " + maxShow + ".");
    if (map && withDist.length) {
      const latlngs = withDist.slice(0,maxShow).map(h=>[h.lat,h.lon]);
      if (userMarker && userMarker.getLatLng) latlngs.push([userMarker.getLatLng().lat, userMarker.getLatLng().lng]);
      try { map.fitBounds(latlngs, { padding: [40,40] }); } catch(e){}
    }
    withDist.slice(0,maxShow).forEach((hotel, idx)=> {
      if (map) { 
        try { 
          // MAP ATTACHES hotelIcon OBJECT TO UNIQUE HOTEL ITEMS HERE
          const m = L.marker([hotel.lat, hotel.lon], { icon: hotelIcon }).addTo(map).bindPopup(hotel.name); 
          hotelMarkers.push(m); 
        } catch(e){} 
      }
      const item = document.createElement("div"); item.className = "hotel"; item.setAttribute("role","listitem"); item.tabIndex = 0;
      const left = document.createElement("div"); left.innerHTML = `<div class="hotel-title">${escapeHtml(hotel.name)}</div><div class="hotel-distance">${hotel.dist.toFixed(2)} km away</div>`;
      const btn = document.createElement("button"); btn.className="open-btn"; btn.type="button"; btn.innerText="Open in Maps";
      
      // FIXED TYPO ROUTING ENVELOPE HERE
      btn.addEventListener("click", function (e) { 
        e.stopPropagation(); 
        announce("Opening " + hotel.name + " in Google Maps."); 
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.lat + "," + hotel.lon)}`, "_blank"); 
      });
      
      item.appendChild(left); item.appendChild(btn);
      item.addEventListener("keydown", function(e){ if (e.key === "Enter") btn.click(); else if (e.key === " ") { e.preventDefault(); if (hotelMarkers[idx] && hotelMarkers[idx].openPopup) { hotelMarkers[idx].openPopup(); if (map) map.panTo([hotel.lat, hotel.lon]); } } });
      hotelsListEl.appendChild(item);
      if (idx === 0) setTimeout(()=>{ try{ item.focus(); } catch(e){} },120);
    });
  }

  function distanceInKm(lat1,lon1,lat2,lon2){ const toRad = v=> (v*Math.PI)/180; const R=6371; const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1); const a = Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) * Math.sin(dLon/2)*Math.sin(dLon/2); const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); return R*c; }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

});
