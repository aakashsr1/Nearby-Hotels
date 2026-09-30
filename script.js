import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";

window.addEventListener("DOMContentLoaded",function(){
 const statusEl=document.getElementById("status"), hotelsListEl=document.getElementById("hotelsList");
 const findBtn=document.getElementById("findBtn"), locateBtn=document.getElementById("locateBtn"), themeToggle=document.getElementById("themeToggle");
 const themeLabel=themeToggle?.querySelector(".theme-label"), themeIcon=themeToggle?.querySelector(".theme-icon");
 let map=null,userMarker=null,hotelMarkers=[],latestLocation=null,locationWatchId=null,currentStyle="";

 const HOTEL_RADIUS=3000;
 const LIGHT_STYLE="https://tiles.openfreemap.org/styles/liberty";
 const DARK_STYLE="https://tiles.openfreemap.org/styles/dark";
 const OVERPASS_ENDPOINTS=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];

 const storageGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
 const storageSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};

 function isDark(){return document.body.classList.contains("dark")}
 function mapStyle(){return isDark()?DARK_STYLE:LIGHT_STYLE}

 function applyTheme(){
  const dark=isDark();
  document.documentElement.classList.toggle("dark-preload",dark);
  if(themeLabel)themeLabel.textContent=dark?"Light":"Dark";
  if(themeIcon)themeIcon.textContent=dark?"☀":"◐";
  themeToggle?.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",dark?"#070b12":"#0b1220");
  if(map&&currentStyle!==mapStyle()){
   currentStyle=mapStyle();
   map.setStyle(currentStyle);
  }
  setTimeout(()=>map?.resize(),150);
 }

 function initTheme(){
  document.body.classList.toggle("dark",storageGet("theme")==="dark");
  applyTheme();
 }

 function markerElement(type){
  const el=document.createElement("div");
  el.className=type==="user"?"user-marker":"hotel-marker";
  el.setAttribute("aria-hidden","true");
  if(type!=="user")el.style.backgroundImage='url("images/hotel-icon.png")';
  return el;
 }

 function initMap(){
  try{
   map=new maplibregl.Map({
    container:"map",style:mapStyle(),center:[0,20],zoom:2,
    attributionControl:{compact:true}
   });
   currentStyle=mapStyle();
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-left");
   map.on("load",()=>{map.resize()});
   map.on("error",e=>console.warn("MapLibre map error:",e?.error||e));
  }catch(error){
   console.error("Map initialization failed:",error);
   statusEl.textContent="Map could not load. Please refresh once and try again.";
  }
 }

 initTheme();
 themeToggle?.addEventListener("click",()=>{
  document.body.classList.toggle("dark");
  storageSet("theme",isDark()?"dark":"light");
  applyTheme();
 });
 initMap();

 function updateUserMarker(lat,lon,center){
  latestLocation={lat,lon};
  if(!map)return;
  const position=[lon,lat];
  if(userMarker)userMarker.setLngLat(position);
  else userMarker=new maplibregl.Marker({element:markerElement("user"),anchor:"center"}).setLngLat(position).setPopup(new maplibregl.Popup({offset:18}).setText("You are here")).addTo(map);
  if(center)map.flyTo({center:position,zoom:15,duration:700});
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
   },()=>{
    statusEl.textContent="Could not get your location. Please allow location access.";onSuccess?.(null);
   },{enableHighAccuracy:true,timeout:10000,maximumAge:5000});
  },{enableHighAccuracy:false,timeout:5000,maximumAge:60000});
 }

 function startLocationUpdates(){
  if(!navigator.geolocation||locationWatchId!==null)return;
  locationWatchId=navigator.geolocation.watchPosition(pos=>{
   updateUserMarker(pos.coords.latitude,pos.coords.longitude,false);
  },()=>{},{enableHighAccuracy:true,maximumAge:10000,timeout:10000});
 }

 function locateMe(){
  if(locateBtn)locateBtn.disabled=true;
  statusEl.textContent="Finding your location…";
  getCurrentLocation(true,l=>{
   if(l)statusEl.textContent="You're here • accuracy about "+Math.round(l.accuracy||0)+" m.";
   if(locateBtn)locateBtn.disabled=false;
  });
 }
 locateBtn?.addEventListener("click",locateMe);

 getCurrentLocation(true,l=>{
  if(l){statusEl.textContent="Location ready. Tap Find nearby hotels.";startLocationUpdates()}
 });

 findBtn?.addEventListener("click",()=>{
  findBtn.disabled=true;statusEl.textContent="Finding your location…";
  getCurrentLocation(true,l=>{if(!l){findBtn.disabled=false;return}fetchNearbyHotels(l.lat,l.lon)});
 });

 async function fetchOverpass(query){
  let lastError=null;
  for(const endpoint of OVERPASS_ENDPOINTS){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{
    const response=await fetch(endpoint+"?data="+encodeURIComponent(query),{method:"GET",signal:controller.signal,headers:{Accept:"application/json"}});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();clearTimeout(timer);return data;
   }catch(error){clearTimeout(timer);lastError=error}
  }
  throw lastError||new Error("No Overpass endpoint available");
 }

 async function fetchNearbyHotels(lat,lon){
  statusEl.textContent="Searching nearby hotels…";
  const query='[out:json][timeout:15];(node["tourism"="hotel"](around:'+HOTEL_RADIUS+','+lat+','+lon+');way["tourism"="hotel"](around:'+HOTEL_RADIUS+','+lat+','+lon+'););out center;';
  try{
   const data=await fetchOverpass(query);
   const hotels=(data.elements||[]).filter(e=>e.tags?.tourism==="hotel")
    .map(e=>({lat:(e.center&&e.center.lat)||e.lat,lon:(e.center&&e.center.lon)||e.lon,name:e.tags.name||"Unnamed Hotel"}))
    .filter(h=>Number.isFinite(h.lat)&&Number.isFinite(h.lon));
   renderHotels(lat,lon,hotels);
  }catch(error){console.error("Hotel search failed:",error);statusEl.textContent="Hotel search is temporarily unavailable. Please try again."}
  finally{findBtn.disabled=false}
 }

 function clearHotelMarkers(){hotelMarkers.forEach(m=>m.remove());hotelMarkers=[]}

 function renderHotels(userLat,userLon,hotels){
  clearHotelMarkers();hotelsListEl.innerHTML="";
  if(!hotels.length){statusEl.textContent="No hotels found within 3 km. Try again in a busier area.";return}
  const visible=hotels.map(h=>({...h,dist:distanceInKm(userLat,userLon,h.lat,h.lon)})).sort((a,b)=>a.dist-b.dist).slice(0,5);

  if(map){
   const bounds=new maplibregl.LngLatBounds([userLon,userLat],[userLon,userLat]);
   visible.forEach(h=>bounds.extend([h.lon,h.lat]));
   map.fitBounds(bounds,{padding:55,maxZoom:16,duration:700});
  }

  visible.forEach(h=>{
   if(map){
    const el=markerElement("hotel");
    el.title=h.name;
    hotelMarkers.push(new maplibregl.Marker({element:el,anchor:"bottom"}).setLngLat([h.lon,h.lat]).setPopup(new maplibregl.Popup({offset:28}).setText(h.name)).addTo(map));
   }
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
  const r=Math.PI/180,R=6371,dl=(c-a)*r,do_=(d-b)*r;
  const x=Math.sin(dl/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(do_/2)**2;
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
 }
});