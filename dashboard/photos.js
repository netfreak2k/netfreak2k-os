/* Netfreak2k Fotogalery v0.6 — local, no AI */
(()=>{"use strict";
const $=id=>document.getElementById(id), imageExt=/\.(jpe?g|png|gif|webp|bmp|avif)$/i;
let items=[],shown=[],selected=new Set(),tab="timeline",year="all",album="",search="",cursor=0,active=null,rotation=0,image=null,slide=null;
let metadata={favorites:[],albums:{}},saveQueue=Promise.resolve();
const url=(item)=>"/api/workspace/file?"+new URLSearchParams({area:"media",path:item.path||"",name:item.name});
const key=i=>i.key||[i.path,i.name].filter(Boolean).join("/");
const time=i=>Number(i.taken_at)||Number(i.modified_at)||0;
const date=i=>time(i)?new Date(time(i)*1000):null;
const formatDate=i=>date(i)?.toLocaleDateString("de-DE",{day:"2-digit",month:"long",year:"numeric"})||"Ohne Datum";
const el=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n};
function notify(message){const n=$("n2k-photos-status");if(n)n.textContent=message;}
async function fetchMetadata(){try{const r=await fetch("/api/photos/metadata",{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);const m=await r.json();metadata={favorites:Array.isArray(m.favorites)?m.favorites:[],albums:m.albums&&typeof m.albums==="object"?m.albums:{}};}catch(e){notify("Alben derzeit nicht erreichbar: "+e.message)}}
function persist(){
 const snapshot=JSON.stringify(metadata);
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{const r=await fetch("/api/photos/metadata",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-CSRF-Token":typeof csrfToken!=="undefined"?csrfToken:""},body:snapshot});if(!r.ok)throw Error("HTTP "+r.status)});
 saveQueue.catch(e=>notify("Speichern fehlgeschlagen: "+e.message));
}
async function load(){
 notify("Fotomediathek wird geladen …");
 try{const r=await fetch("/api/photos/library",{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);
 const data=await r.json();items=Array.isArray(data.items)?data.items.filter(i=>imageExt.test(i.name)):[];items.sort((a,b)=>time(b)-time(a));
 if(data.truncated)notify("Hinweis: Bibliothek ist auf 12.000 Bilder begrenzt");else notify(items.length+" Fotos auf dem Server");
 render();
 }catch(e){notify("Fotomediathek konnte nicht geladen werden: "+e.message)}
}
function filters(){
 let results=items.filter(i=>(!search||[i.name,i.path].join(" ").toLocaleLowerCase("de").includes(search)));
 if(tab==="favorites")results=results.filter(i=>metadata.favorites.includes(key(i)));
 if(tab==="albums")results=results.filter(i=>(metadata.albums[album]||[]).includes(key(i)));
 if(tab==="timeline"&&year!=="all")results=results.filter(i=>String(date(i)?.getFullYear())===year);
 return results;
}
function render(){
 const grid=$("n2k-photos-grid");if(!grid)return;grid.replaceChildren();
 const years=[...new Set(items.map(i=>date(i)?.getFullYear()).filter(Boolean))].sort((a,b)=>b-a);
 const pick=$("n2k-photo-year");if(pick){pick.replaceChildren(new Option("Alle Jahre","all"),...years.map(y=>new Option(String(y),String(y))));pick.value=year;pick.hidden=tab!=="timeline";}
 document.querySelectorAll("[data-photo-view]").forEach(b=>b.classList.toggle("active",b.dataset.photoView===tab));
 const back=$("n2k-photos-back");if(back){back.disabled=!(tab==="albums"&&album);back.textContent=album?"← Alben":"← Zurück";}
 $("n2k-photos-path").textContent=album?"Album / "+album:"Alle Ordner · "+items.length+" Fotos";
 if(tab==="albums"&&!album){Object.keys(metadata.albums).sort().forEach(name=>{const b=el("button","n2k-photo-folder","▤ "+name+" · "+metadata.albums[name].length+" Fotos");b.type="button";b.onclick=()=>{album=name;render()};grid.append(b)});if(!grid.children.length)grid.append(el("p",null,"Noch keine Alben – lege eines an."));updateSelection();return;}
 shown=filters();cursor=0;addPage();
}
function addPage(){
 const grid=$("n2k-photos-grid");grid.querySelector("#n2k-photo-more")?.remove();
 const end=Math.min(shown.length,cursor+120);
 let previous=cursor?date(shown[cursor-1])?.toLocaleDateString("de-DE",{year:"numeric",month:"long"}):null;
 for(let i=cursor;i<end;i++){
  const item=shown[i],k=key(item);
  if(tab==="timeline"){const month=date(item)?.toLocaleDateString("de-DE",{year:"numeric",month:"long"})||"Ohne Datum";if(month!==previous){grid.append(el("h3","n2k-photo-month",month));previous=month;}}
  const tile=el("div","n2k-photo-cell"),photo=el("button","n2k-photo-item");photo.type="button";photo.title=item.name;
  const img=el("img");img.loading="lazy";img.alt=item.name;img.src="/api/photos/thumb?"+new URLSearchParams({key:key(item)});img.onerror=()=>{img.onerror=null;img.src=url(item)};
  photo.append(img,el("span",null,item.name));photo.onclick=()=>open(item);
  const actions=el("div","n2k-photo-item-actions");
  const check=el("button","n2k-photo-select",selected.has(k)?"✓ Ausgewählt":"○ Wählen");check.type="button";check.setAttribute("aria-pressed",String(selected.has(k)));check.onclick=()=>{if(selected.has(k))selected.delete(k);else selected.add(k);check.textContent=selected.has(k)?"✓ Ausgewählt":"○ Wählen";check.classList.toggle("active",selected.has(k));check.setAttribute("aria-pressed",String(selected.has(k)));updateSelection()};
  const fav=el("button",null,metadata.favorites.includes(k)?"♥":"♡");fav.title="Favorit";fav.type="button";fav.onclick=()=>{metadata.favorites=metadata.favorites.includes(k)?metadata.favorites.filter(x=>x!==k):[...metadata.favorites,k];persist();render()};
  actions.append(check,fav);tile.append(photo,actions);grid.append(tile);
 }
 cursor=end;
 if(cursor<shown.length){const more=el("button","n2k-photo-folder", "Weitere Fotos laden ("+(shown.length-cursor)+")");more.id="n2k-photo-more";more.onclick=addPage;grid.append(more);}
 if(!shown.length)grid.append(el("p",null,"Hier sind noch keine Fotos."));
 updateSelection();
}
function updateSelection(){
 const count=$("n2k-photo-selected");if(count)count.textContent=selected.size+" ausgewählt";
 for(const id of ["n2k-photo-bulk-fav","n2k-photo-bulk-album","n2k-photo-bulk-clear","n2k-photo-bulk-trash"])if($(id))$(id).disabled=!selected.size;
}
function open(item){active=item;const modal=$("n2k-photo-viewer");modal.hidden=false;show();}
function show(){if(!active)return;$("n2k-photo-full").src=url(active);$("n2k-photo-full").alt=active.name;$("n2k-photo-caption").textContent=active.name+" · "+formatDate(active)+(active.path?" · "+active.path:"");}
function navigate(delta){if(!active)return;const a=shown.length?shown:items;const i=a.findIndex(x=>key(x)===key(active));active=a[(i+delta+a.length)%a.length]||active;show()}
function close(){stopSlide();$("n2k-photo-viewer").hidden=true}
function stopSlide(){if(slide)clearInterval(slide);slide=null;const b=$("n2k-photo-slide");if(b)b.textContent="▶ Diashow"}
function toggleSlide(){if(slide){stopSlide();return}slide=setInterval(()=>navigate(1),3500);$("n2k-photo-slide").textContent="Ⅱ Pause"}
let editorImage=null;
function editorCanvas(full=false){
 if(!editorImage)return null;
 const crop=$("n2k-editor-crop").checked,sw=crop?Math.min(editorImage.naturalWidth,editorImage.naturalHeight):editorImage.naturalWidth,sh=crop?sw:editorImage.naturalHeight;
 const scale=Math.min(1,(full?4096:960)/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
 const c=document.createElement("canvas");c.width=rotation%180?h:w;c.height=rotation%180?w:h;
 const ctx=c.getContext("2d");ctx.filter="brightness("+$("n2k-editor-brightness").value+"%) contrast("+$("n2k-editor-contrast").value+"%)";
 ctx.translate(c.width/2,c.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(editorImage,(editorImage.naturalWidth-sw)/2,(editorImage.naturalHeight-sh)/2,sw,sh,-w/2,-h/2,w,h);
 return c;
}
function renderEdit(){const c=editorCanvas(),dest=$("n2k-editor-preview");if(!c||!dest)return;dest.width=c.width;dest.height=c.height;dest.getContext("2d").drawImage(c,0,0);}
function edit(){if(!active)return;const img=new Image();img.onload=()=>{editorImage=img;rotation=0;$("n2k-editor-brightness").value=100;$("n2k-editor-contrast").value=100;$("n2k-editor-crop").checked=false;$("n2k-photo-editor").hidden=false;stopSlide();renderEdit()};img.onerror=()=>notify("Originalbild konnte nicht geladen werden");img.src=url(active)}
async function uploadFile(file,where,replace=false){
 const q=new URLSearchParams({area:"media",path:where,name:file.name,replace:replace?"1":"0"});
 const r=await fetch("/api/workspace/upload?"+q,{method:"POST",credentials:"same-origin",headers:{"Content-Type":file.type||"application/octet-stream","X-CSRF-Token":typeof csrfToken!=="undefined"?csrfToken:""},body:file});
 const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||"HTTP "+r.status);e.code=d.error;throw e;}
}
async function saveEdited(){
 const canvas=editorCanvas(true);if(!canvas||!active)return;const b=$("n2k-editor-save");b.disabled=true;
 try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));if(!blob)throw Error("Bildexport nicht möglich");
 const file=new File([blob],active.name.replace(/\.[^.]+$/,"")+"-bearbeitet-"+Date.now()+".jpg",{type:"image/jpeg"});
 await uploadFile(file,active.path||"");$("n2k-photo-editor").hidden=true;close();await load();notify("Bearbeitete Kopie gespeichert – Original bleibt erhalten.");
 }catch(e){notify("Bild konnte nicht gespeichert werden: "+e.message)}finally{b.disabled=false}
}
async function importFiles(event){
 const files=[...(event.target.files||[])];event.target.value="";if(!files.length)return;
 const b=$("n2k-photos-import");b.disabled=true;let success=0;
 try{for(const file of files){if(!imageExt.test(file.name))continue;notify("Importiere "+file.name+" …");
 try{await uploadFile(file,"");success++}catch(e){if(e.code==="already_exists"&&confirm(file.name+" existiert. Mit Versionierung ersetzen?")){await uploadFile(file,"",true);success++}else if(e.code!=="already_exists")throw e;}}
 await load();notify(success+" Foto(s) importiert");
 }catch(e){notify("Importfehler: "+e.message)}finally{b.disabled=false}
}
function bulkFavorite(){metadata.favorites=[...new Set([...metadata.favorites,...selected])];persist();render();notify(selected.size+" Favoriten gespeichert")}
function bulkAlbum(){const names=Object.keys(metadata.albums);if(!names.length){notify("Zuerst Album mit + Album anlegen");return}const name=prompt("Albumname:\n"+names.join(" · "),album||names[0]);if(!name)return;if(!Object.prototype.hasOwnProperty.call(metadata.albums,name)){notify("Album nicht gefunden");return}metadata.albums[name]=[...new Set([...metadata.albums[name],...selected])];persist();render();notify(selected.size+" Fotos zum Album hinzugefügt")}

async function scanDuplicates(){
 const button=$("n2k-photo-duplicates");button.disabled=true;notify("Suche identische Dateien über SHA-256 …");
 try{const r=await fetch("/api/photos/duplicates",{credentials:"same-origin",cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);
 const data=await r.json(),groups=Array.isArray(data.groups)?data.groups:[];
 selected.clear();for(const group of groups)for(const entry of group)selected.add(entry);
 render();notify(groups.length+" Duplikatgruppen erkannt; "+selected.size+" Dateien markiert. Bitte vor dem Löschen prüfen."+(data.partial?" Scan nur teilweise.":""));
 }catch(e){notify("Duplikatsuche fehlgeschlagen: "+e.message)}finally{button.disabled=false}
}
async function trashSelected(){
 const targets=items.filter(item=>selected.has(key(item)));
 if(!targets.length)return;
 if(!confirm(targets.length+" ausgewählte Foto(s) in den Papierkorb verschieben? Sie bleiben wiederherstellbar."))return;
 const b=$("n2k-photo-bulk-trash");b.disabled=true;
 let moved=0;
 try{for(const item of targets){
 const r=await fetch("/api/workspace/delete",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-CSRF-Token":typeof csrfToken!=="undefined"?csrfToken:""},body:JSON.stringify({area:"media",path:item.path||"",name:item.name})});
 if(!r.ok){const data=await r.json().catch(()=>({}));throw Error(data.error||"HTTP "+r.status)}
 selected.delete(key(item));moved++;
 }
 await load();notify(moved+" Foto(s) in den Papierkorb verschoben.");
 }catch(e){notify("Nach "+moved+" Dateien abgebrochen: "+e.message)}finally{b.disabled=false}
}
function init(){
 $("n2k-photos-refresh")?.addEventListener("click",load);
 $("n2k-photos-search")?.addEventListener("input",e=>{search=e.target.value.toLocaleLowerCase("de");render()});
 $("n2k-photo-year")?.addEventListener("change",e=>{year=e.target.value;render()});
 document.querySelectorAll("[data-photo-view]").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.photoView;album="";render()}));
 $("n2k-photo-new-album")?.addEventListener("click",()=>{const name=prompt("Name des neuen Albums:")?.trim();if(!name)return;if(Object.prototype.hasOwnProperty.call(metadata.albums,name)){notify("Album existiert bereits");return}metadata.albums[name]=[];persist();tab="albums";album=name;render()});
 $("n2k-photos-back")?.addEventListener("click",()=>{album="";render()});
 $("n2k-photos-import")?.addEventListener("click",()=>$("n2k-photos-files").click());
 $("n2k-photos-files")?.addEventListener("change",importFiles);
 $("n2k-photo-duplicates")?.addEventListener("click",scanDuplicates);
 $("n2k-photo-bulk-trash")?.addEventListener("click",trashSelected);
 $("n2k-photo-bulk-fav")?.addEventListener("click",bulkFavorite);
 $("n2k-photo-bulk-album")?.addEventListener("click",bulkAlbum);
 $("n2k-photo-bulk-clear")?.addEventListener("click",()=>{selected.clear();render()});
 $("n2k-photo-close")?.addEventListener("click",close);
 $("n2k-photo-prev")?.addEventListener("click",()=>navigate(-1));
 $("n2k-photo-next")?.addEventListener("click",()=>navigate(1));
 $("n2k-photo-slide")?.addEventListener("click",toggleSlide);
 $("n2k-photo-viewer")?.addEventListener("click",e=>{if(e.target===$("n2k-photo-viewer"))close()});
 $("n2k-photo-edit")?.addEventListener("click",edit);
 $("n2k-editor-cancel")?.addEventListener("click",()=>$("n2k-photo-editor").hidden=true);
 $("n2k-editor-rotate")?.addEventListener("click",()=>{rotation=(rotation+90)%360;renderEdit()});
 ["brightness","contrast","crop"].forEach(k=>$("n2k-editor-"+k)?.addEventListener("input",renderEdit));
 $("n2k-editor-save")?.addEventListener("click",saveEdited);
 document.addEventListener("keydown",e=>{if($("n2k-photo-editor")?.hidden===false){if(e.key==="Escape")$("n2k-photo-editor").hidden=true;return}if($("n2k-photo-viewer")?.hidden!==false)return;if(e.key==="Escape")close();else if(e.key==="ArrowLeft")navigate(-1);else if(e.key==="ArrowRight")navigate(1)});
 document.querySelector('[data-target="photos-panel"]')?.addEventListener("click",load);
 fetchMetadata().then(load);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();