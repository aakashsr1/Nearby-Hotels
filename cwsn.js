import * as maplibregl from "https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.mjs";

window.addEventListener("DOMContentLoaded",function(){
 const body=document.body,theme=document.getElementById("themeToggle"),contrast=document.getElementById("contrastToggle"),status=document.getElementById("status"),find=document.getElementById("findBtn"),list=document.getElementById("hotelsList");
 let map=null,userMarker=null,hotelMarkers=[],currentStyle="";
 const LIGHT_STYLE="https://tiles.openfreemap.org/styles/liberty",DARK_STYLE="https://tiles.openfreemap.org/styles/dark";
 const get=k=>{try{return localStorage.getItem(k)}catch(e){return null}},set=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
 const styleFor=()=>body.classList.contains("dark")||body.classList.contains("high-contrast")?DARK_STYLE:LIGHT_STYLE;

 function updateTheme(){
  const dark=body.classList.contains("dark"),hc=body.classList.contains("high-contrast");
  theme.textContent=dark?"Light":"Dark";theme.setAttribute("aria-pressed",String(dark));contrast.setAttribute("aria-pressed",String(hc));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",dark||hc?"#070b12":"#0b1220");
  if(map&&currentStyle!==styleFor()){currentStyle=styleFor();map.setStyle(currentStyle)}
  setTimeout(()=>map?.resize(),150);
 }

 function markerElement(type){
  const el=document.createElement("div");el.className=type==="user"?"user-marker":"hotel-marker";el.setAttribute("aria-hidden","true");
  if(type!=="user")el.style.backgroundImage='url("images/hotel-icon.png")';
  return el;
 }

 function initMap(){
  try{
   map=new maplibregl.Map({container:"map",style:styleFor(),center:[0,20],zoom:2,attributionControl:{compact:true}});
   currentStyle=styleFor();
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-left");
   map.on("load",()=>map.resize());
   map.on("error",e=>console.warn("MapLibre map error:",e?.error||e));
  }catch(e){status.textContent="Map could not load. Please refresh once and try again."}
 }

 body.classList.toggle("dark",get("cwsn-theme")==="dark");
 body.classList.toggle("high-contrast",get("cwsn-contrast")==="on");
 initMap();updateTheme();

 theme.addEventListener("click",()=>{
  body.classList.remove("high-contrast");
  const dark=body.classList.toggle("dark");
  set("cwsn-theme",dark?"dark":"light");set("cwsn-contrast","off");updateTheme();
 });
 contrast.addEventListener("click",()=>{
  const on=body.classList.toggle("high-contrast");
  body.classList.remove("dark");
  set("cwsn-theme","light");set("cwsn-contrast",on?"on":"off");updateTheme();
 });

 function announce(t){status.textContent=t}
 function locate(cb){
  if(!navigator.geolocation){announce("Geolocation is not supported on this device.");cb?.(null);return}
  announce("Finding your location…");

  const handleSuccess=p=>{
   const lat=p.coords.latitude,lon=p.coords.longitude,accuracy=p.coords.accuracy;
   if(map){
    const pos=[lon,lat];
    if(userMarker)userMarker.setLngLat(pos);
    else userMarker=new maplibregl.Marker({element:markerElement("user"),anchor:"center"}).setLngLat(pos).setPopup(new maplibregl.Popup({offset:18}).setText("You are here")).addTo(map);
    map.flyTo({center:pos,zoom:15,duration:700});
   }
   cb?.({lat,lon,accuracy});
  };

  const fallback=()=>navigator.geolocation.getCurrentPosition(handleSuccess,()=>{
   announce("Could not get your location. Please check that this site is allowed to use your location in Chrome.");
   cb?.(null);
  },{enableHighAccuracy:true,timeout:10000,maximumAge:5000});

  navigator.geolocation.getCurrentPosition(handleSuccess,fallback,{
   enableHighAccuracy:false,
   timeout:5000,
   maximumAge:60000
  });
 }
 locate(l=>{if(l)announce("Location found. Tap Find Nearby Hotels to search.")});
 find.addEventListener("click",()=>locate(l=>{if(l)search(l.lat,l.lon)}));

 async function fetchOverpass(query){
  for(const endpoint of ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{
    const r=await fetch(endpoint+"?data="+encodeURIComponent(query),{method:"GET",signal:controller.signal,headers:{Accept:"application/json"}});
    if(!r.ok)throw new Error("HTTP "+r.status);
    const d=await r.json();clearTimeout(timer);return d;
   }catch(e){clearTimeout(timer)}
  }
  throw new Error("No Overpass endpoint available");
 }

 async function search(lat,lon){
  announce("Searching nearby hotels…");
  const q='[out:json][timeout:15];(node["tourism"="hotel"](around:3000,'+lat+','+lon+');way["tourism"="hotel"](around:3000,'+lat+','+lon+'););out center;';
  try{
   const d=await fetchOverpass(q);
   const hotels=(d.elements||[]).filter(e=>e.tags?.tourism==="hotel").map(e=>({name:e.tags.name||"Unnamed Hotel",lat:(e.center&&e.center.lat)||e.lat,lon:(e.center&&e.center.lon)||e.lon})).filter(h=>Number.isFinite(h.lat)&&Number.isFinite(h.lon));
   render(lat,lon,hotels);
  }catch(e){announce("Hotel search is temporarily unavailable. Please try again.")}
 }

 function render(lat,lon,elements){
  hotelMarkers.forEach(m=>m.remove());hotelMarkers=[];list.innerHTML="";
  const hotels=elements.map(h=>({...h,d:dist(lat,lon,h.lat,h.lon)})).sort((a,b)=>a.d-b.d).slice(0,5);
  if(!hotels.length){announce("No hotels found within 3 km.");return}
  if(map){
   const b=new maplibregl.LngLatBounds([lon,lat],[lon,lat]);hotels.forEach(h=>b.extend([h.lon,h.lat]));
   map.fitBounds(b,{padding:55,maxZoom:16,duration:700});
  }
  hotels.forEach(h=>{
   if(map)hotelMarkers.push(new maplibregl.Marker({element:markerElement("hotel"),anchor:"bottom"}).setLngLat([h.lon,h.lat]).setPopup(new maplibregl.Popup({offset:28}).setText(h.name)).addTo(map));
   const item=document.createElement("div");item.className="hotel";item.setAttribute("role","listitem");
   const info=document.createElement("div");info.className="hotel-info";const title=document.createElement("div");title.className="hotel-title";title.textContent=h.name;const distance=document.createElement("div");distance.className="hotel-distance";distance.textContent=h.d.toFixed(2)+" km away";info.append(title,distance);
   const btn=document.createElement("button");btn.className="open-btn";btn.textContent="Open in Maps";btn.type="button";btn.onclick=()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(h.lat+","+h.lon),"_blank","noopener,noreferrer");
   item.append(info,btn);list.appendChild(item);
  });
  announce("Found "+elements.length+" hotels, showing the closest "+hotels.length+".");
 }
 function dist(a,b,c,d){const r=Math.PI/180,R=6371,dl=(c-a)*r,do_=(d-b)*r,x=Math.sin(dl/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(do_/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
});