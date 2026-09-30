window.addEventListener("DOMContentLoaded", function () {
  const statusEl=document.getElementById("status"), hotelsListEl=document.getElementById("hotelsList");
  const findBtn=document.getElementById("findBtn"), locateBtn=document.getElementById("locateBtn"), themeToggle=document.getElementById("themeToggle");
  const themeLabel=themeToggle?.querySelector(".theme-label"), themeIcon=themeToggle?.querySelector(".theme-icon");
  let map=null,userMarker=null,hotelMarkers=[],latestLocation=null,currentTileLayer=null,locationWatchId=null;

  const OVERPASS_URL="https://overpass-api.de/api/interpreter";
  const HOTEL_RADIUS=3000;
  const MAP_TILES="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  function storageGet(key){try{return localStorage.getItem(key)}catch(e){return null}}
  function storageSet(key,val){try{localStorage.setItem(key,val)}catch(e){}}

  function applyTheme(){
    const dark=document.body.classList.contains("dark");
    document.documentElement.classList.toggle("dark-preload",dark);
    if(themeLabel) themeLabel.textContent=dark?"Light":"Dark";
    if(themeIcon) themeIcon.textContent=dark?"☀":"◐";
    themeToggle?.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute("content",dark?"#070b12":"#0b1220");
    updateMapTiles();
  }

  function initTheme(){
    const saved=storageGet("theme");
    document.body.classList.toggle("dark",saved==="dark");
    applyTheme();
  }

  function updateMapTiles(){
    if(!map || typeof L==="undefined") return;
    if(!currentTileLayer){
      currentTileLayer=L.tileLayer(MAP_TILES,{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);
    }
    map.getContainer().classList.toggle("map-dark",document.body.classList.contains("dark"));
    setTimeout(()=>map.invalidateSize(true),100);
  }

  function initMap(){
    if(typeof L==="undefined"){
      if(statusEl) statusEl.textContent="Map library could not load. Refresh once and try again.";
      return;
    }
    map=L.map("map",{zoomControl:true,attributionControl:true}).setView([20,0],2);
    updateMapTiles();
    setTimeout(()=>map.invalidateSize(true),150);
  }

  initTheme();
  themeToggle?.addEventListener("click",()=>{
    document.body.classList.toggle("dark");
    storageSet("theme",document.body.classList.contains("dark")?"dark":"light");
    applyTheme();
  });
  initMap();

  function updateUserMarker(lat,lon,center){
    latestLocation={lat,lon};
    if(!map)return;
    if(userMarker)userMarker.setLatLng([lat,lon]);
    else userMarker=L.marker([lat,lon]).addTo(map).bindPopup("You are here");
    if(center)map.setView([lat,lon],15,{animate:true});
  }

  function getCurrentLocation(center,onSuccess){
    if(!navigator.geolocation){statusEl.textContent="Geolocation is not supported on this device.";onSuccess?.(null);return}
    navigator.geolocation.getCurrentPosition(pos=>{
      const l={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
      updateUserMarker(l.lat,l.lon,center);onSuccess?.(l);
    },()=>{
      navigator.geolocation.getCurrentPosition(pos=>{
        const l={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy};
        updateUserMarker(l.lat,l.lon,center);onSuccess?.(l);
      },()=>{statusEl.textContent="Could not get your location. Please allow location access.";onSuccess?.(null)},
      {enableHighAccuracy:true,timeout:10000,maximumAge:5000});
    },{enableHighAccuracy:false,timeout:5000,maximumAge:60000});
  }

  function startLocationUpdates(){
    if(!navigator.geolocation||locationWatchId!==null)return;
    locationWatchId=navigator.geolocation.watchPosition(pos=>updateUserMarker(pos.coords.latitude,pos.coords.longitude,false),()=>{},
      {enableHighAccuracy:true,maximumAge:10000,timeout:10000});
  }

  function locateMe(){
    locateBtn.disabled=true;statusEl.textContent="Finding your location…";
    if(latestLocation&&map)map.setView([latestLocation.lat,latestLocation.lon],15,{animate:true});
    getCurrentLocation(true,l=>{
      locateBtn.disabled=false;
      if(l)statusEl.textContent="You're here • accuracy about "+Math.round(l.accuracy||0)+" m.";
    });
  }
  locateBtn?.addEventListener("click",locateMe);

  getCurrentLocation(false,l=>{if(l){statusEl.textContent="Location ready. Tap Find nearby hotels.";startLocationUpdates()}});

  findBtn?.addEventListener("click",()=>{
    findBtn.disabled=true;statusEl.textContent="Finding your location…";
    getCurrentLocation(true,l=>{if(!l){findBtn.disabled=false;return}fetchNearbyHotels(l.lat,l.lon)});
  });

  function fetchNearbyHotels(lat,lon){
    statusEl.textContent="Searching nearby hotels…";
    const query='[out:json][timeout:10];(node["tourism"="hotel"](around:'+HOTEL_RADIUS+','+lat+','+lon+');way["tourism"="hotel"](around:'+HOTEL_RADIUS+','+lat+','+lon+'););out center;';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
    fetch(OVERPASS_URL,{method:"POST",body:query,signal:controller.signal})
      .then(r=>{if(!r.ok)throw new Error("request");return r.json()})
      .then(data=>{
        const hotels=(data.elements||[]).filter(e=>e.tags?.tourism==="hotel").map(e=>({lat:(e.center&&e.center.lat)||e.lat,lon:(e.center&&e.center.lon)||e.lon,name:e.tags.name||"Unnamed Hotel"})).filter(h=>Number.isFinite(h.lat)&&Number.isFinite(h.lon));
        renderHotels(lat,lon,hotels);
      })
      .catch(e=>{statusEl.textContent=e.name==="AbortError"?"Hotel search took too long. Please try again.":"Could not load hotel data. Please try again."})
      .finally(()=>{clearTimeout(timer);findBtn.disabled=false});
  }

  function renderHotels(userLat,userLon,hotels){
    hotelMarkers.forEach(m=>map?.removeLayer(m));hotelMarkers=[];hotelsListEl.innerHTML="";
    if(!hotels.length){statusEl.textContent="No hotels found within 3 km. Try again in a busier area.";return}
    const visible=hotels.map(h=>({...h,dist:distanceInKm(userLat,userLon,h.lat,h.lon)})).sort((a,b)=>a.dist-b.dist).slice(0,5);
    if(map){
      const bounds=L.latLngBounds(visible.map(h=>[h.lat,h.lon]));
      if(userMarker)bounds.extend(userMarker.getLatLng());
      map.fitBounds(bounds.pad(.2),{maxZoom:16,animate:true});
    }
    const hotelIcon=L.icon({iconUrl:"images/hotel-icon.png",iconRetinaUrl:"images/hotel-icon.png",iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34]});
    visible.forEach(h=>{
      if(map)hotelMarkers.push(L.marker([h.lat,h.lon],{icon:hotelIcon}).addTo(map).bindPopup(h.name));
      const item=document.createElement("div");item.className="hotel";
      const info=document.createElement("div");info.className="hotel-info";
      const title=document.createElement("div");title.className="hotel-title";title.textContent=h.name;
      const distance=document.createElement("div");distance.className="hotel-distance";distance.textContent=h.dist.toFixed(2)+" km away";
      const btn=document.createElement("button");btn.className="open-btn";btn.type="button";btn.textContent="Open in Maps";
      btn.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(h.lat+","+h.lon),"_blank","noopener,noreferrer");
      info.append(title,distance);item.append(info,btn);hotelsListEl.appendChild(item);
    });
    statusEl.textContent="Found "+hotels.length+" hotels, showing the closest "+visible.length+".";
  }

  function distanceInKm(a,b,c,d){
    const r=Math.PI/180,R=6371,dl=(c-a)*r,do_=(d-b)*r,x=Math.sin(dl/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(do_/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  }
});