/* N2K live hardware tiles. Read-only, no simulated data. */
(function(){
"use strict";
const names={cpu:"CPU Load",ram:"Memory Usage",storage:"Storage Usage",uptime:"Uptime",temperature:"Temperature",fan:"Fan Speed"};
const history={};
const valid=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x));
const val=x=>valid(x)?Number(x):null;
const esc=s=>String(s??"–").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function makeCard(type,id,caption){
const b=document.createElement("button");b.type="button";b.className="mini-metric n2k-monitor-card";b.dataset.metric=type;b.dataset.view="system";
b.innerHTML='<div class="n2k-monitor-title"><span>'+names[type]+'</span><span class="n2k-health"><i></i><span id="n2k-'+type+'-status">Warte auf Daten</span></span></div><div class="n2k-monitor-body"><div class="metric-ring"><span id="'+id+'">–</span></div><div class="n2k-monitor-copy"><small>'+caption+'</small><strong id="n2k-'+type+'-info">Nicht verfügbar</strong><span id="n2k-'+type+'-detail">Hardware-Sensor wird geprüft</span></div></div><canvas class="n2k-monitor-spark" data-spark="'+type+'" aria-label="'+names[type]+' Verlauf"></canvas>';
return b;
}
function decorate(card,type){
card.classList.add("n2k-monitor-card");card.dataset.metric=type;
const ring=card.querySelector(".metric-ring");if(!ring)return;
const other=Array.from(card.children).filter(x=>x!==ring);
const title=document.createElement("div");title.className="n2k-monitor-title";title.innerHTML='<span>'+names[type]+'</span><span class="n2k-health"><i></i><span id="n2k-'+type+'-status">Warte auf Daten</span></span>';
const body=document.createElement("div");body.className="n2k-monitor-body";
const copy=document.createElement("div");copy.className="n2k-monitor-copy";other.forEach(x=>copy.appendChild(x));body.append(ring,copy);
const spark=document.createElement("canvas");spark.className="n2k-monitor-spark";spark.dataset.spark=type;spark.setAttribute("aria-label",names[type]+" Verlauf");
card.replaceChildren(title,body,spark);
}
function setMetric(type,value,info,detail,max=100){
 const status=document.getElementById("n2k-"+type+"-status");
 const infoNode=document.getElementById("n2k-"+type+"-info");
 const detailNode=document.getElementById("n2k-"+type+"-detail");
 const card=document.querySelector('.n2k-monitor-card[data-metric="'+(type==="fan"?"uptime":type)+'"]');
 if(!card)return;
 if(type==="fan"){
   const fanNumber=card.querySelector("#n2k-combined-fan-value");
   const fanStatus=card.querySelector("#n2k-combined-fan-status");
   const ok=valid(value);
   if(fanNumber)fanNumber.textContent=ok?Math.round(Number(value)).toLocaleString("de-DE")+" RPM":"– RPM";
   if(fanStatus)fanStatus.textContent=ok?"RPM live":"RPM nicht verfügbar";
   if(ok){const data=history.fan||(history.fan=[]);data.push(Number(value));if(data.length>50)data.shift();}
   draw(card.querySelector("canvas.n2k-fan-curve"),history.fan||[],5000);
   card.classList.toggle("n2k-fan-available",ok);
   return;
 }
 if(!status)return;
 const ok=valid(value);
 status.textContent=ok?"Live":"Kein Sensor";
 status.classList.toggle("unavailable",!ok);
 if(infoNode&&info!==undefined)infoNode.textContent=info;
 if(detailNode&&detail!==undefined)detailNode.textContent=detail;
 const ring=card.querySelector(".metric-ring");
 if(ring){
   const display=ring.querySelector("span");
   let number="–",unit="";
   if(ok){
     if(type==="cpu"||type==="ram"||type==="storage"){number=Math.round(value)+"%";unit=""; }
     else if(type==="temperature"){number=Math.round(value)+"°";unit="CPU";}
     else if(type==="fan"){number=Math.round(value).toLocaleString("de-DE");unit="RPM";}
     else if(type==="uptime"){const days=Math.floor(Number(value)/86400),hours=Math.floor((Number(value)%86400)/3600),minutes=Math.floor((Number(value)%3600)/60);number=days>0?String(days):String(hours);unit=days>0?"TAGE":"STD";if(infoNode)infoNode.textContent=days>0?hours+" Std · "+minutes+" Min":minutes+" Min";if(detailNode)detailNode.textContent="Seit Neustart";}
   }
   if(display){
     display.replaceChildren();
     const n=document.createElement("strong");n.className="ring-value";n.textContent=number;
     const u=document.createElement("small");u.className="ring-unit";u.textContent=unit;
     display.append(n,u);
   }
   ring.style.setProperty("--n2k-fill",ok?(type==="uptime"?"100%":Math.min(100,Math.max(0,Number(value)/max*100))+"%"):"0%");
 }
 if(ok){const items=history[type]||(history[type]=[]);items.push(Math.max(0,Number(value)));if(items.length>50)items.shift();}
 if(type!=="uptime")draw(card.querySelector("canvas"),history[type]||[],max);
}
function draw(canvas,values,max){
 if(!canvas||!canvas.isConnected)return;
 const w=canvas.clientWidth||200,h=32,dpr=Math.min(window.devicePixelRatio||1,2);
 canvas.width=Math.round(w*dpr);canvas.height=h*dpr;
 const ctx=canvas.getContext("2d");if(!ctx)return;
 ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
 if(values.length<2){ctx.fillStyle="#8ba9c4";ctx.font="11px sans-serif";ctx.fillText("Verlauf wird erfasst …",8,34);return;}
 const color=getComputedStyle(canvas.parentElement).getPropertyValue("--n2k-accent").trim()||"#3af";
 const lo=Math.min(...values),hi=Math.max(...values);
 const minSpan=max===5000?120:8,span=Math.max(minSpan,hi-lo);
 const bottom=Math.max(0,lo-span*.2),top=Math.min(max,Math.max(hi+span*.2,bottom+span));
 const y=v=>h-8-(v-bottom)/Math.max(1,top-bottom)*(h-16);
 ctx.strokeStyle="rgba(120,170,215,.19)";ctx.lineWidth=1;
 for(let i=0;i<3;i++){const yy=8+i*(h-16)/2;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();}
 ctx.beginPath();values.forEach((v,i)=>{const x=i/(values.length-1)*w;i?ctx.lineTo(x,y(v)):ctx.moveTo(x,y(v));});
 ctx.lineWidth=2;ctx.strokeStyle=color;ctx.stroke();
 ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.globalAlpha=.12;ctx.fillStyle=color;ctx.fill();ctx.globalAlpha=1;
}
async function poll(){
if(document.getElementById("app-shell")?.classList.contains("hidden"))return;
try{
const res=await fetch("/api/overview",{credentials:"same-origin",cache:"no-store"});if(!res.ok)return;
const d=await res.json(),m=d.memory||{},s=d.storage||{},cpu=d.cpu||{};
setMetric("cpu",val(d.cpu_percent),cpu.logical_cores?cpu.logical_cores+" Threads":"CPU",cpu.physical_cores?cpu.physical_cores+" Kerne":"");
setMetric("ram",val(m.used_percent),valid(m.used_bytes)?(Number(m.used_bytes)/1073741824).toFixed(1)+" GB belegt":"RAM",valid(m.total_bytes)?(Number(m.total_bytes)/1073741824).toFixed(1)+" GB gesamt":"");
setMetric("storage",val(s.used_percent),valid(s.free_bytes)?(Number(s.free_bytes)/1073741824).toFixed(1)+" GB frei":"Datenträger",valid(s.total_bytes)?(Number(s.total_bytes)/1073741824).toFixed(1)+" GB gesamt":"");
const uptime=document.getElementById("overview-uptime")?.textContent||"–";setMetric("uptime",valid(d.uptime_seconds)?Number(d.uptime_seconds):null,uptime,"Seit letztem Neustart",Math.max(86400,Number(d.uptime_seconds)||86400));
}catch(e){console.debug("N2K tiles overview:",e.message)}
try{
const res=await fetch("/api/health?range=1h",{credentials:"same-origin",cache:"no-store"});if(!res.ok)return;
const d=await res.json(),c=d.current||{},t=c.cpu_temperature||{};
const temp=val(t.current_c)??val(t.max_c);
setMetric("temperature",temp,valid(t.max_c)?"Max "+Number(t.max_c).toFixed(0)+" °C":"CPU-Sensor",(t.sensors||[]).length+" Sensor(en)",100);
const fans=c.fans||c.fan_speeds||d.fans||[];
const numbers=Array.isArray(fans)?fans.map(f=>val(typeof f==="object"?(f.rpm??f.speed_rpm??f.current_rpm):f)).filter(v=>v!==null):[];
const rpm=numbers.length?numbers[0]:val(c.fan_rpm);
setMetric("fan",rpm,numbers.length?numbers.length+" Lüfter erkannt":"RPM-Sensor",rpm!==null?"Echter Tachometerwert":"Kein RPM-Sensor vom Host gemeldet",5000);
}catch(e){console.debug("N2K tiles sensors:",e.message)}
}
async function pollLocalAi(){
 const node=document.getElementById("n2k-combined-ai-status");
 const model=document.getElementById("n2k-combined-ai-model");
 const indicator=document.getElementById("n2k-combined-ai-dot");
 if(!node||!model||!indicator)return;
 try{
   const res=await fetch("/api/ollama/status",{credentials:"same-origin",cache:"no-store"});
   if(!res.ok)throw Error("HTTP "+res.status);
   const info=await res.json();
   const available=info.running===true;
   const ready=info.ready===true;
   node.textContent=ready?"KI bereit":available?"Modell fehlt":"KI offline";
   model.textContent=ready?(info.model||"Ollama"):available?"Ollama aktiv":"Ollama nicht erreichbar";
   indicator.dataset.state=ready?"ready":available?"warning":"offline";
 }catch(e){
   node.textContent="KI-Status unbekannt";
   model.textContent="Verbindung prüfen";
   indicator.dataset.state="offline";
 }
}
function wireUpdateShortcut(){
 const top=document.getElementById("top-update-status");
 if(!top||top.dataset.n2kShortcut)return;
 top.dataset.n2kShortcut="1";
 top.addEventListener("click",event=>{
   event.preventDefault();
   event.stopImmediatePropagation();
   if(typeof switchView==="function")switchView("updates-panel");
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
     const target=document.getElementById("install-update");
     if(!target)return;
     target.scrollIntoView({behavior:"smooth",block:"center"});
     target.focus({preventScroll:true});
   }));
 },true);
}
function start(){
wireUpdateShortcut();
const grid=document.querySelector("#dashboard-top .mini-metrics");if(!grid||grid.dataset.n2kReady)return;grid.dataset.n2kReady="1";
for(const [i,type] of ["cpu","ram","storage","uptime"].entries())if(grid.children[i])decorate(grid.children[i],type);
grid.append(makeCard("temperature","n2k-temperature","CPU"));
const combined=grid.querySelector('[data-metric="uptime"]');
if(combined){
 combined.classList.add("n2k-uptime-fan");
 const heading=combined.querySelector(".n2k-monitor-title > span");
 if(heading)heading.textContent="Uptime";
 combined.setAttribute("aria-label","Betriebsdauer");
}
poll();pollLocalAi();setInterval(poll,10000);setInterval(pollLocalAi,15000);window.addEventListener("resize",()=>document.querySelectorAll(".n2k-monitor-card canvas").forEach(c=>draw(c,history[c.dataset.spark]||[],c.dataset.spark==="fan"?5000:100)));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
