/* N2K Fotos v0.1 — local photo gallery over existing authenticated workspace API */
(function(){
"use strict";
let path="",photos=[],index=0;
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
  const visible=photos.filter(item=>item.name.toLocaleLowerCase("de").includes(term));
  const back=$("n2k-photos-back");if(back)back.disabled=!path;
  $("n2k-photos-path").textContent=path?"Mediathek / "+path:"Mediathek";
  status.textContent=visible.length+" Fotos · "+folders.length+" Ordner";
  if(!term)folders.forEach(item=>{const b=document.createElement("button");b.className="n2k-photo-folder";b.textContent="▤  "+item.name;b.onclick=()=>{path=path?path+"/"+item.name:item.name;load()};grid.appendChild(b)});
  visible.forEach(item=>{
   const b=document.createElement("button");b.className="n2k-photo-item";b.title=item.name;
   const img=document.createElement("img");img.loading="lazy";img.alt=item.name;img.src=source(item.name);
   const label=document.createElement("span");label.textContent=item.name;
   b.append(img,label);b.onclick=()=>openPhoto(photos.findIndex(x=>x.name===item.name));grid.appendChild(b);
  });
  if(!grid.children.length){const p=document.createElement("p");p.textContent="Noch keine Fotos in diesem Ordner.";grid.appendChild(p)}
 }catch(e){status.textContent="Galerie nicht verfügbar: "+e.message;}
}
function openPhoto(i){if(i<0||!photos[i])return;index=i;const modal=$("n2k-photo-viewer");modal.hidden=false;showPhoto();}
function showPhoto(){const photo=photos[index];if(!photo)return;$("n2k-photo-full").src=source(photo.name);$("n2k-photo-full").alt=photo.name;$("n2k-photo-caption").textContent=photo.name+(fmt(photo.modified_at)?" · "+fmt(photo.modified_at):"");}
function init(){
 $("n2k-photos-refresh")?.addEventListener("click",load);
 $("n2k-photos-search")?.addEventListener("input",load);
 $("n2k-photos-back")?.addEventListener("click",()=>{path=path.split("/").slice(0,-1).join("/");load()});
 $("n2k-photos-import")?.addEventListener("click",()=>{if(typeof switchView==="function")switchView("workspace-panel");if(typeof workspaceArea!=="undefined"){workspaceArea="media";workspacePath=path;}document.querySelector('.drive-area[data-area="media"]')?.click();});
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