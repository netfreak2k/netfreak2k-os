const cards=[...document.querySelectorAll('.card')];
let dragged=null;

cards.forEach(card=>{
  card.addEventListener('dragstart',()=>{dragged=card;card.classList.add('dragging')});
  card.addEventListener('dragend',()=>{card.classList.remove('dragging');dragged=null;saveOrder()});
  card.addEventListener('dragover',e=>{
    e.preventDefault();
    if(dragged && dragged!==card) card.parentNode.insertBefore(dragged,card);
  });
});

function saveOrder(){
  localStorage.setItem('n2k-dashboard-order',[...document.querySelectorAll('.card')].map(x=>x.querySelector('h2')?.textContent||'').join('|'));
}

document.querySelectorAll('[data-url]').forEach(btn=>{
  btn.addEventListener('click',()=>window.open(btn.dataset.url,'_blank','noopener'));
});

document.getElementById('customize')?.addEventListener('click',()=>{
  document.body.classList.toggle('customizing');
  alert('Drag dashboard cards to rearrange them. Layout persistence is being expanded in 0.1.x.');
});
