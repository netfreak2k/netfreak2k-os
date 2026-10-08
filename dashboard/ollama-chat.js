(()=>{"use strict";
const $=id=>document.getElementById(id);let messages=[],busy=false;
const history=$("n2k-ollama-history"),input=$("n2k-ollama-input"),sendButton=$("n2k-ollama-send");
if(!history||!input||!sendButton)return;
function render(){
 history.replaceChildren();
 if(!messages.length){const p=document.createElement("p");p.className="n2k-ollama-empty";p.textContent="N2K LOCAL INTELLIGENCE  /  Bereit für Eingaben. Starte einen Systemcheck oder stelle eine Frage.";history.append(p);}
 for(const m of messages){const item=document.createElement("div");item.className="n2k-ollama-message "+m.role;const title=document.createElement("strong");title.textContent=m.role==="user"?"USER":"N2K AI";const body=document.createElement("p");body.textContent=m.content;item.append(title,body);history.append(item);}
 history.scrollTop=history.scrollHeight;
}
async function status(){
 try{const r=await fetch("/api/ollama/status",{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);const d=await r.json();$("n2k-ai-status-led")?.classList.toggle("ready",Boolean(d.ready));$("n2k-ollama-state").textContent=d.ready?"Bereit":d.running?"Modell fehlt":"Offline";$("n2k-ollama-note").textContent=d.ready?"Lokales Modell Qwen2.5 0.5B bereit · RAM-Limit 1,5 GB.":d.setup?.message||"Ollama oder Modell noch nicht bereit. Installation wird beim Server-OS-Update erneut geprüft.";}
 catch(e){$("n2k-ai-status-led")?.classList.remove("ready");$("n2k-ollama-state").textContent="Status unbekannt";}
}
async function send(){
 if(busy)return;const value=input.value.trim();if(!value)return;
 messages.push({role:"user",content:value});messages=messages.slice(-12);input.value="";render();busy=true;sendButton.disabled=true;
 $("n2k-ollama-note").textContent="Ollama antwortet lokal …";
 try{
  const session=await fetch("/api/session",{credentials:"same-origin"}).then(r=>r.json());
  if(!session.authenticated||!session.csrf)throw Error("Bitte erneut anmelden");
  const r=await fetch("/api/ollama/chat",{method:"POST",credentials:"same-origin",
   headers:{"Content-Type":"application/json","X-CSRF-Token":session.csrf},
   body:JSON.stringify({messages,system_context:true})});
  const d=await r.json();if(!r.ok||d.error)throw Error(d.error||"HTTP "+r.status);
  messages.push({role:"assistant",content:d.reply||"Keine Antwort erhalten"});render();
  $("n2k-ollama-note").textContent="Antwort abgeschlossen · Ollama bleibt lokal";
 }catch(e){$("n2k-ollama-note").textContent="Anfrage fehlgeschlagen: "+e.message;}
 finally{busy=false;sendButton.disabled=false;}
}
sendButton.addEventListener("click",send);
document.querySelectorAll("[data-n2k-ai-prompt]").forEach(button=>{
 button.addEventListener("click",()=>{
   if(busy)return;
   input.value=button.dataset.n2kAiPrompt||"";
   send();
 });
});
$("n2k-ollama-new")?.addEventListener("click",()=>{messages=[];render();});
$("n2k-ollama-refresh")?.addEventListener("click",status);
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();send();}});
render();status();
})();