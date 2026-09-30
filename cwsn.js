window.addEventListener("DOMContentLoaded",function(){
 const body=document.body,theme=document.getElementById("themeToggle"),contrast=document.getElementById("contrastToggle");
 const status=document.getElementById("status"),find=document.getElementById("findBtn"),list=document.getElementById("hotelsList");
 let map=null,userMarker=null,currentTiles=null,hotelMarkers=[];
 const LIGHT="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",DARK="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
 const get=(k)=>{try{return localStorage.getItem(k)}catch(e){return null}},set=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
 function updateTheme(){
  const dark=body.classList.contains("dark"),hc=body.classList.contains("high-contrast");
  theme.textContent=dark?"Light":"Dark";theme.setAttribute("aria-pressed",String(dark));
  contrast.setAttribute("aria-pressed",String(hc));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",dark?"#070b12":"#0b1220");
  updateTiles();
 }
 function updateTiles(){
  if(!map||typeof L==="undefined")return;
  const url=body.classList.contains("dark")&&!body.classList.contains("high-contrast")?DARK:LIGHT;
  if(!currentTiles||currentTiles._url!==url){if(currentTiles)map.removeLayer(currentTiles);currentTiles=L.tileLayer(url,{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map)}
  setTimeout(()=>map.invalidateSize(true),80);
 }
 body.classList.toggle("dark",get("cwsn-theme")==="dark");
 body.classList.toggle("high-contrast",get("cwsn-contrast")==="on");
 updateTheme();
 theme.addEventListener("click",()=>{body.classList.toggle("dark");body.classList.remove("hc-inverted");set("cwsn-theme",body.classList.contains("dark")?"dark":"light");updateTheme()});
 contrast.addEventListener("click",()=>{const on=body.classList.toggle("high-contrast");if(on){body.classList.remove("dark");set("cwsn-theme","light")}set("cwsn-contrast",on?"on":"off");updateTheme()});
 function announce(t){status.textContent=t}
 function initMap(){
  if(typeof L==="undefined"){announce("Map library could not load. Refresh once and try again.");return}
  map=L.map("map",{zoomControl:true}).setView([20,0],2);updateTiles();setTimeout(()=>map.invalidateSize(true),100);
 }
 initMap();
 function locate(cb){
  if(!navigator.geolocation){announce("Geolocation is not supported on this device.");cb?.(null);return}
  navigator.geolocation.getCurrentPosition(p=>{const lat=p.coords.latitude,lon=p.coords.longitude;if(map){map.setView([lat,lon],15);if(userMarker)userMarker.setLatLng([lat,lon]);else userMarker=L.marker([lat,lon]).addTo(map).bindPopup("You are here")}cb?.({lat,lon})},()=>{announce("Could not get your location. Please allow location access.");cb?.(null)},{enableHighAccuracy:true,timeout:12000,maximumAge:30000})
 }
 locate(l=>{if(l)announce("Location found. Tap Find Nearby Hotels to search.")});
 find.addEventListener("click",()=>locate(l=>{if(l)search(l.lat,l.lon)}));
 function search(lat,lon){
  announce("Searching for nearby hotels…");
  const q='[out:json][timeout:15];(node["tourism"="hotel"](around:3000,'+lat+','+lon+');way["tourism"="hotel"](around:3000,'+lat+','+lon+'););out center;';
  fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:q}).then(r=>r.json()).then(d=>render(lat,lon,d.elements||[])).catch(()=>announce("Could not load hotel data. Please try again."));
 }
 function render(lat,lon,elements){
  hotelMarkers.forEach(m=>map?.removeLayer(m));hotelMarkers=[];list.innerHTML="";
  const hotels=elements.filter(e=>e.tags?.tourism==="hotel").map(e=>({name:e.tags.name||"Unnamed Hotel",lat:(e.center&&e.center.lat)||e.lat,lon:(e.center&&e.center.lon)||e.lon})).filter(h=>Number.isFinite(h.lat)&&Number.isFinite(h.lon));
  if(!hotels.length){announce("No hotels found within 3 km.");return}
  const arr=hotels.map(h=>({...h,d:dist(lat,lon,h.lat,h.lon)})).sort((a,b)=>a.d-b.d).slice(0,5);
  if(map){const b=L.latLngBounds(arr.map(h=>[h.lat,h.lon]));if(userMarker)b.extend(userMarker.getLatLng());map.fitBounds(b.pad(.2),{maxZoom:16})}
  arr.forEach(h=>{
   const m=L.marker([h.lat,h.lon]).addTo(map).bindPopup(h.name);hotelMarkers.push(m);
   const item=document.createElement("div");item.className="hotel";item.setAttribute("role","listitem");
   const info=document.createElement("div");info.className="hotel-info";const title=document.createElement("div");title.className="hotel-title";title.textContent=h.name;
   const distance=document.createElement("div");distance.className="hotel-distance";distance.textContent=h.d.toFixed(2)+" km away";info.append(title,distance);
   const btn=document.createElement("button");btn.className="open-btn";btn.textContent="Open in Maps";btn.type="button";btn.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(h.lat+","+h.lon),"_blank");
   item.append(info,btn);list.appendChild(item);
  });
  announce("Found "+hotels.length+" hotels, showing the closest "+arr.length+".");
 }
 function dist(a,b,c,d){const r=Math.PI/180,R=6371,dl=(c-a)*r,do_=(d-b)*r,x=Math.sin(dl/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(do_/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
});