/* N2K Fotos v0.1 — local photo gallery over existing authenticated workspace API */
(function(){
"use strict";
let path="",photos=[],index=0,view="timeline",activeAlbum="",yearFilter="all";
const stateKey="n2k-fotogalery-v03";
function readState(){try{const x=JSON.parse(localStorage.getItem(stateKey)||"{}");return {favorites:Array.isArray(x.favorites)?x.favorites:[],albums:x.albums&&typeof x.albums==="object"?x.albums:{}}}catch{return {favorites:[],albums:{}}}}
let photoState=readState();
let serverMetaReady=false;
async function fetchState(){
 try{
  const r=await fetch("/api/photos/metadata",{credentials:"same-origin",cache:"no-store"});
  if(!r.ok)throw Error("Metadata API: "+r.status);
  const d=await r.json();
  photoState={favorites:Array.isArray(d.favorites)?d.favorites:[],albums:d.albums&&typeof d.albums==="object"?d.albums:{}};
  serverMetaReady=true;
 }catch(e){console.warn("Fotogalery metadata:",e);serverMetaReady=false;}
}
function saveState(){
 localStorage.setItem(stateKey,JSON.stringify(photoState));
 if(serverMetaReady)fetch("/api/photos/metadata",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-CSRF-Token":typeof csrfToken!=="undefined"?csrfToken:""},body:JSON.stringify(photoState)}).then(r=>{if(!r.ok)throw Error("HTTP "+r.status)}).catch(e=>console.error("Fotogalery speichern:",e));
}
function photoKey(item){return [path,item.name].filter(Boolean).join("/")}
function stamp(item){const n=Number(item.modified_at);return Number.isFinite(n)&&n>0?(n>1e12?n:n*1000):0}

const $=id=>document.getElementById(id);
const supported=/\.(jpe?g|png|gif|webp|bmp|avif)$/i;
const query=extra=>new URLSearchParams({area:"media",path,...extra}).toString();
const source=name=>"/api/workspace/file?"+query({name});
const fmt=d=>{const n=Number(d);return Number.isFinite(n)&&n>0?new Date(n*1000).toLocaleDateString("de-DE"):"";};
async function load(){
 const grid=$("n2k-photos-grid"),status=$("n2k-photos-status");if(!grid)return;
 grid.replaceChildren();status.textContent="Fotos werden geladen …";
 try{
  const response=await fetch("/api/workspace?"+query(),{credentials:"same-origin",cache:"no-store"});
  if(!response.ok)throw new Error("HTTP "+response.status);
  const data=await response.json();
  const items=Array.isArray(data.items)?data.items:[];
  photos=items.filter(item=>item.type==="file"&&supported.test(item.name));
  const folders=items.filter(item=>item.type==="folder");
  const term=($("n2k-photos-search")?.value||"").toLocaleLowerCase("de");
  let visible=photos.filter(item=>item.name.toLocaleLowerCase("de").includes(term));
  if(view==="favorites")visible=visible.filter(item=>photoState.favorites.includes(photoKey(item)));
  if(view==="albums"&&activeAlbum)visible=visible.filter(item=>(photoState.albums[activeAlbum]||[]).includes(photoKey(item)));
  if(view==="timeline"){visible.sort((a,b)=>stamp(b)-stamp(a));if(yearFilter!=="all")visible=visible.filter(item=>String(new Date(stamp(item)).getFullYear())===yearFilter);}
  const years=[...new Set(photos.map(item=>stamp(item)?new Date(stamp(item)).getFullYear():null).filter(Boolean))].sort((a,b)=>b-a);
  const yearSelect=$("n2k-photo-year");if(yearSelect){yearSelect.replaceChildren(new Option("Alle Jahre","all"),...years.map(y=>new Option(String(y),String(y))));yearSelect.value=yearFilter;yearSelect.hidden=view!=="timeline";}
  const back=$("n2k-photos-back");if(back)back.disabled=!path;
  $("n2k-photos-path").textContent=path?"Mediathek / "+path:"Mediathek";
  status.textContent=visible.length+" Fotos · "+folders.length+" Ordner"+(activeAlbum?" · Album: "+activeAlbum:"");
  document.querySelectorAll("[data-photo-view]").forEach(b=>b.classList.toggle("active",b.dataset.photoView===view));
  function tile(item){
    const wrapper=document.createElement("div");wrapper.className="n2k-photo-cell";
    const b=document.createElement("button");b.className="n2k-photo-item";b.title=item.name;
    const img=document.createElement("img");img.loading="lazy";img.alt=item.name;img.src=source(item.name);
    const label=document.createElement("span");label.textContent=item.name;
    b.append(img,label);b.onclick=()=>openPhoto(photos.findIndex(x=>x.name===item.name));
    const actions=document.createElement("div");actions.className="n2k-photo-item-actions";
    const fav=document.createElement("button");fav.type="button";fav.textContent=photoState.favorites.includes(photoKey(item))?"♥ Favorit":"♡ Favorit";
    fav.onclick=()=>{const k=photoKey(item);photoState.favorites=photoState.favorites.includes(k)?photoState.favorites.filter(x=>x!==k):[...photoState.favorites,k];saveState();load()};
    const album=document.createElement("button");album.type="button";album.textContent="+ Album";
    album.onclick=()=>{const names=Object.keys(photoState.albums);if(!names.length){alert("Bitte zuerst ein Album anlegen.");return}
      const name=prompt("Zu welchem Album hinzufügen?\n"+names.join(" · "),activeAlbum||names[0]);
      if(name===null)return;if(!Object.prototype.hasOwnProperty.call(photoState.albums,name)){alert("Album nicht vorhanden");return}
      const k=photoKey(item);if(!photoState.albums[name].includes(k))photoState.albums[name].push(k);saveState();load()};
    actions.append(fav,album);wrapper.append(b,actions);return wrapper;
  }
  if(view==="albums"&&!activeAlbum){
    Object.keys(photoState.albums).sort().forEach(name=>{const b=document.createElement("button");b.className="n2k-photo-folder";b.textContent="▤ "+name+" ("+photoState.albums[name].length+")";b.onclick=()=>{activeAlbum=name;load()};grid.appendChild(b)});
  }else{
    if(!term&&view!=="favorites"&&!activeAlbum)folders.forEach(item=>{const b=document.createElement("button");b.className="n2k-photo-folder";b.textContent="▤  "+item.name;b.onclick=()=>{path=path?path+"/"+item.name:item.name;load()};grid.appendChild(b)});
    if(view==="timeline"){
      let last="";
      visible.forEach(item=>{const key=stamp(item)?new Date(stamp(item)).toLocaleDateString("de-DE",{year:"numeric",month:"long"}):"Ohne Datum";if(key!==last){const heading=document.createElement("h3");heading.className="n2k-photo-month";heading.textContent=key;grid.appendChild(heading);last=key;}grid.appendChild(tile(item))});
    }else visible.forEach(item=>grid.appendChild(tile(item)));
  }
  if(!grid.children.length){const message=document.createElement("p");message.textContent="Hier sind noch keine Fotos.";grid.appendChild(message)}
 }catch(e){status.textContent="Galerie nicht verfügbar: "+e.message;}
}
function openPhoto(i){if(i<0||!photos[i])return;index=i;const modal=$("n2k-photo-viewer");modal.hidden=false;showPhoto();}
function showPhoto(){const photo=photos[index];if(!photo)return;$("n2k-photo-full").src=source(photo.name);$("n2k-photo-full").alt=photo.name;$("n2k-photo-caption").textContent=photo.name+(fmt(photo.modified_at)?" · "+fmt(photo.modified_at):"");}
let editorImage=null,rotation=0;
function openEditor(){
 const photo=photos[index];if(!photo)return;
 const image=new Image();image.onload=()=>{editorImage=image;rotation=0;$("n2k-editor-brightness").value=100;$("n2k-editor-contrast").value=100;$("n2k-editor-crop").checked=false;$("n2k-photo-editor").hidden=false;renderEditor()};image.onerror=()=>alert("Bild konnte nicht geladen werden.");image.src=source(photo.name);
}
function editedCanvas(full=false){
 if(!editorImage)return null;
 const square=$("n2k-editor-crop").checked;
 const sourceSize=square?Math.min(editorImage.naturalWidth,editorImage.naturalHeight):0;
 const sw=square?sourceSize:editorImage.naturalWidth,sh=square?sourceSize:editorImage.naturalHeight;
 const limit=full?4096:900,scale=Math.min(1,limit/Math.max(sw,sh));
 const w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
 const canvas=document.createElement("canvas");canvas.width=rotation%180?h:w;canvas.height=rotation%180?w:h;
 const ctx=canvas.getContext("2d");ctx.filter="brightness("+Number($("n2k-editor-brightness").value)+"%) contrast("+Number($("n2k-editor-contrast").value)+"%)";
 ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);
 const sx=square?(editorImage.naturalWidth-sw)/2:0,sy=square?(editorImage.naturalHeight-sh)/2:0;
 ctx.drawImage(editorImage,sx,sy,sw,sh,-w/2,-h/2,w,h);return canvas;
}
function renderEditor(){
 const canvas=$("n2k-editor-preview"),src=editedCanvas();if(!canvas||!src)return;
 canvas.width=src.width;canvas.height=src.height;canvas.getContext("2d").drawImage(src,0,0);
}
async function saveEdited(){
 const photo=photos[index],canvas=editedCanvas(true);if(!photo||!canvas)return;
 const btn=$("n2k-editor-save");btn.disabled=true;
 try{
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));if(!blob)throw Error("Bildexport fehlgeschlagen");
  const name=photo.name.replace(/\.[^.]+$/,"")+"-bearbeitet-"+Date.now()+".jpg";
  const res=await fetch("/api/workspace/upload?"+query({name,replace:"0"}),{method:"POST",credentials:"same-origin",headers:{"Content-Type":"image/jpeg","X-CSRF-Token":typeof csrfToken!=="undefined"?csrfToken:""},body:blob});
  if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.error||"HTTP "+res.status)}
  $("n2k-photo-editor").hidden=true;$("n2k-photo-viewer").hidden=true;await load();
 }catch(e){alert("Speichern fehlgeschlagen: "+e.message)}finally{btn.disabled=false}
}
async function init(){
 await fetchState();
 $("n2k-photos-refresh")?.addEventListener("click",load);
 $("n2k-photo-year")?.addEventListener("change",e=>{yearFilter=e.target.value;load()});
 document.querySelectorAll("[data-photo-view]").forEach(b=>b.addEventListener("click",()=>{view=b.dataset.photoView;activeAlbum="";load()}));
 $("n2k-photo-new-album")?.addEventListener("click",()=>{const name=prompt("Neues Album:");if(!name||!name.trim())return;const clean=name.trim();if(!Object.prototype.hasOwnProperty.call(photoState.albums,clean))photoState.albums[clean]=[];saveState();view="albums";activeAlbum=clean;load()});
 $("n2k-photos-search")?.addEventListener("input",load);
 $("n2k-photos-back")?.addEventListener("click",()=>{path=path.split("/").slice(0,-1).join("/");load()});
 $("n2k-photos-import")?.addEventListener("click",()=>$("n2k-photos-files")?.click());
 $("n2k-photos-files")?.addEventListener("change",async event=>{
   const files=Array.from(event.target.files||[]);event.target.value="";
   if(!files.length)return;
   const status=$("n2k-photos-status"),button=$("n2k-photos-import");
   button.disabled=true;
   try{
     for(let i=0;i<files.length;i++){
       const file=files[i];
       if(!supported.test(file.name)){status.textContent="Übersprungen: "+file.name+" (kein unterstütztes Bildformat)";continue;}
       status.textContent="Import "+(i+1)+" / "+files.length+": "+file.name;
       async function send(replace){
         const url="/api/workspace/upload?"+query({name:file.name,replace:replace?"1":"0"});
         const response=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/octet-stream","X-CSRF-Token":typeof csrfToken!=="undefined"?csrfToken:""},body:file});
         const data=await response.json().catch(()=>({}));
         if(!response.ok){const e=new Error(data.error||"HTTP "+response.status);e.code=data.error;throw e;}
       }
       try{await send(false);}
       catch(e){
         if(e.code==="already_exists"&&confirm(file.name+" ist vorhanden. Bestehendes Foto versioniert ersetzen?"))await send(true);
         else if(e.code!=="already_exists")throw e;
       }
     }
     await load();
   }catch(e){status.textContent="Fotoimport fehlgeschlagen: "+e.message;}
   finally{button.disabled=false;}
 });
 $("n2k-photo-edit")?.addEventListener("click",openEditor);
 $("n2k-editor-cancel")?.addEventListener("click",()=>{$("n2k-photo-editor").hidden=true});
 $("n2k-editor-rotate")?.addEventListener("click",()=>{rotation=(rotation+90)%360;renderEditor()});
 ["brightness","contrast","crop"].forEach(name=>$("n2k-editor-"+name)?.addEventListener("input",renderEditor));
 $("n2k-editor-save")?.addEventListener("click",saveEdited);
 $("n2k-photo-close")?.addEventListener("click",()=>{$("n2k-photo-viewer").hidden=true});
 $("n2k-photo-prev")?.addEventListener("click",()=>{index=(index-1+photos.length)%photos.length;showPhoto()});
 $("n2k-photo-next")?.addEventListener("click",()=>{index=(index+1)%photos.length;showPhoto()});
 $("n2k-photo-viewer")?.addEventListener("click",e=>{if(e.target.id==="n2k-photo-viewer")e.currentTarget.hidden=true});
 document.addEventListener("keydown",e=>{if($("n2k-photo-viewer")?.hidden!==false)return;if(e.key==="Escape")$("n2k-photo-viewer").hidden=true;else if(e.key==="ArrowRight")$("n2k-photo-next").click();else if(e.key==="ArrowLeft")$("n2k-photo-prev").click()});
 document.querySelector('[data-target="photos-panel"]')?.addEventListener("click",()=>setTimeout(load,0));
 load();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();