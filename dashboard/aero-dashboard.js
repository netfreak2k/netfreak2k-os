/* Small mobile navigation adapter; existing N2K navigation remains authoritative. */
(() => {
  const button = document.getElementById("n2k-aero-mobile-menu");
  const shell = document.getElementById("app-shell");
  if (!button || !shell) return;
  const close = () => {
    shell.classList.remove("n2k-mobile-menu-open");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Navigationsmenü öffnen");
  };
  button.addEventListener("click", () => {
    const open = shell.classList.toggle("n2k-mobile-menu-open");
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Navigationsmenü schließen" : "Navigationsmenü öffnen");
  });
  shell.querySelector(".side-nav")?.addEventListener("click", event => {
    if (event.target.closest("[data-target]")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") close();
  });
  window.matchMedia("(min-width: 751px)").addEventListener("change", event => {
    if (event.matches) close();
  });
})();

/* Secondary overview cards are accessible on demand; core services always visible. */
(() => {
 const grid = document.querySelector("#dashboard-top .n2k-aero-applications .widget-grid");
 const button = document.querySelector("#dashboard-top .n2k-aero-more");
 if(!grid || !button) return;
 grid.id = "n2k-aero-extra-widgets";
 grid.classList.add("n2k-aero-compact");
 button.addEventListener("click", () => {
   const expanded = grid.classList.toggle("n2k-aero-expanded");
   button.setAttribute("aria-expanded", String(expanded));
   button.textContent = expanded ? "Weniger anzeigen" : "Weitere Widgets";
 });
})();

/* Live, non-invasive AI health: Ollama's local status API only. */
(() => {
 const status=document.getElementById("n2k-ai-local-status");
 const dot=document.getElementById("n2k-ai-local-dot");
 const models=document.getElementById("n2k-ai-models");
 const latency=document.getElementById("n2k-ai-latency");
 const bar=document.getElementById("n2k-ai-meter-fill");
 if(!status || !dot || !models || !latency || !bar) return;
 let busy=false;
 async function refresh(){
   if(busy || document.hidden) return;
   busy=true;
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),7000);
   try{
     const response=await fetch("/api/ollama/status",{credentials:"same-origin",cache:"no-store",signal:controller.signal});
     if(!response.ok) throw Error("unavailable");
     const data=await response.json();
     const online=data.available!==false && data.running===true;
     const count=Array.isArray(data.models)?data.models.length:null;
     const ms=typeof data.latency_ms==="number" && Number.isFinite(data.latency_ms)?data.latency_ms:null;
     status.textContent=online?(data.ready?"Bereit":"Online"):"Offline";
     dot.classList.toggle("is-online",online);
     models.textContent="Modell: "+(online ? (data.ready ? (data.model || data.models?.[0] || "Bereit") : (data.models?.[0] || "Kein Modell bereit")) : "–");
     latency.textContent=online && ms!==null?"API: "+Math.round(ms)+" ms":"API: –";
     bar.style.width=online?"100%":"0%";
     bar.title=online?"Ollama-API erreichbar":"Ollama nicht erreichbar";
   }catch(_){
     status.textContent="Nicht erreichbar";
     dot.classList.remove("is-online");
     models.textContent="Modell: –";
     latency.textContent="API: –";
     bar.style.width="0%";
   }finally{clearTimeout(timeout);busy=false}
 }
 refresh();
 setInterval(refresh,30000);
})();
