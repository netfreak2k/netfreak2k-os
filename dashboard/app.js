const dashboard=document.getElementById('dashboard');
let dragged=null;

function cards(){
  return [...dashboard.querySelectorAll('.card')];
}

function saveOrder(){
  localStorage.setItem(
    'n2k-dashboard-order',
    cards().map(x=>x.querySelector('h2')?.textContent||'').join('|')
  );
}

function restoreOrder(){
  const saved=(localStorage.getItem('n2k-dashboard-order')||'').split('|').filter(Boolean);
  if(!saved.length) return;
  const byTitle=new Map(cards().map(c=>[c.querySelector('h2')?.textContent||'',c]));
  saved.forEach(title=>{
    const card=byTitle.get(title);
    if(card) dashboard.appendChild(card);
  });
}

restoreOrder();

cards().forEach(card=>{
  card.addEventListener('dragstart',()=>{dragged=card;card.classList.add('dragging')});
  card.addEventListener('dragend',()=>{card.classList.remove('dragging');dragged=null;saveOrder()});
  card.addEventListener('dragover',e=>{
    e.preventDefault();
    if(dragged && dragged!==card) card.parentNode.insertBefore(dragged,card);
  });
});

document.querySelectorAll('[data-url]').forEach(btn=>{
  btn.addEventListener('click',()=>window.open(btn.dataset.url,'_blank','noopener'));
});

document.getElementById('customize')?.addEventListener('click',()=>{
  document.body.classList.toggle('customizing');
  alert('Drag dashboard cards to rearrange them. The layout is stored locally in this browser.');
});
