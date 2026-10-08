/* N2K Hermes panel: monitoring only, zero autonomous processes */
(()=>{"use strict";const $=id=>document.getElementById(id);
async function check(){
 const status=$("n2k-hermes-status"),note=$("n2k-hermes-note"),launch=$("n2k-hermes-launch"),refresh=$("n2k-hermes-refresh");if(!status)return;
 status.textContent="Prüfe …";refresh.disabled=true;
 try{
  const r=await fetch("/api/hermes/status",{credentials:"same-origin",cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const data=await r.json();status.textContent=data.available?"Erreichbar":data.configured?"Nicht erreichbar":"Nicht eingerichtet";
  note.textContent=data.configured?(data.available?"Hermes ist verbunden. Kein Modell wurde über Netfreak2k gestartet.":"Hermes-Endpunkt konfiguriert, aber derzeit nicht erreichbar."):"N2K_HERMES_URL am Backend konfigurieren, um den vorhandenen Hermes-Dienst zu verbinden.";
  if(data.launch_url&&/^https?:\/\//.test(data.launch_url)){launch.href=data.launch_url;launch.hidden=false}else{launch.removeAttribute("href");launch.hidden=true}
 }catch(e){status.textContent="Statusfehler";note.textContent="Verbindungsprüfung fehlgeschlagen: "+e.message;launch.hidden=true}
 finally{refresh.disabled=false}
}
function init(){$("n2k-hermes-refresh")?.addEventListener("click",check);document.querySelector('[data-target="ai-panel"]')?.addEventListener("click",check);check()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();