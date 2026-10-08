/* Hermes local-only browser client. Session-authenticated API. */
(()=>{"use strict";
const $=id=>document.getElementById(id);
async function check(){
 const status=$("n2k-hermes-status"),note=$("n2k-hermes-note");
 if(!status)return;
 status.textContent="Prüfe …";
 try{
  const r=await fetch("/api/hermes/status",{credentials:"same-origin",cache:"no-store"});
  if(!r.ok)throw Error("HTTP "+r.status);
  const d=await r.json();
  status.textContent=d.configured?"Lokal installiert":"Nicht eingerichtet";
  note.textContent=d.configured?"Hermes lokal erkannt. Modell und Konfiguration mit einer Testnachricht prüfen.":"Hermes und Ollama müssen auf diesem Server installiert werden (Anleitung unten).";
 }catch(e){status.textContent="Statusfehler";note.textContent=e.message}
}
async function send(){
 const input=$("n2k-hermes-prompt"),output=$("n2k-hermes-response"),button=$("n2k-hermes-send");
 const prompt=input?.value.trim();if(!prompt||!button)return;
 button.disabled=true;output.textContent="Hermes verarbeitet die Anfrage lokal …";
 try{
  const session=await fetch("/api/session",{credentials:"same-origin"}).then(r=>r.json());
  if(!session.authenticated||!session.csrf)throw Error("Nicht angemeldet");
  const controller=new AbortController();
  const r=await fetch("/api/hermes/chat",{method:"POST",credentials:"same-origin",signal:controller.signal,
   headers:{"Content-Type":"application/json","X-CSRF-Token":session.csrf},body:JSON.stringify({prompt})});
  const d=await r.json();
  if(!r.ok||d.error)throw Error(d.error||"HTTP "+r.status);
  output.textContent=d.reply||"Hermes hat keine Antwort geliefert.";
 }catch(e){output.textContent="Hermes: "+e.message}
 finally{button.disabled=false}
}
function init(){
 $("n2k-hermes-refresh")?.addEventListener("click",check);
 $("n2k-hermes-send")?.addEventListener("click",send);
 document.querySelector('[data-target="ai-panel"]')?.addEventListener("click",check);
 check();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();