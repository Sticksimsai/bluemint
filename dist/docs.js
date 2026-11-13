(()=>{
 const links=[...document.querySelectorAll('.docs-nav a')],sections=[...document.querySelectorAll('.docs-content section[id]')];
 function active(id){links.forEach(a=>{if(a.getAttribute('href')==='/docs/'+id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}
 function jump(id,smooth){const target=document.getElementById(id);if(!target)return;target.scrollIntoView({behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'auto'});active(id)}
 active(location.pathname.split('/')[2]||'overview');
 document.addEventListener('click',event=>{const link=event.target.closest('a[href^="/docs/"]');if(!link||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const id=link.getAttribute('href').split('/')[2];if(!sections.some(s=>s.id===id))return;event.preventDefault();history.pushState(null,'','/docs/'+id);jump(id,true)});
 window.addEventListener('popstate',()=>jump(location.pathname.split('/')[2]||'overview',false));
 // Observe every section, without changing the address bar while reading.
 if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{const hit=entries.find(e=>e.isIntersecting);if(hit)active(hit.target.id)},{rootMargin:'-95px 0px -55% 0px'});sections.forEach(s=>observer.observe(s))}
 const copy=document.querySelector('[data-copy-mint]');copy?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('quoteMint').textContent);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy mint',1800)}catch{copy.textContent='Select the mint above'}});
 const status=document.getElementById('docsReadiness');if(status)fetch('/api/chain/status').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{status.textContent=data.issue||(data.mintPreparationReady?'Pump / USDC connected. Ready for wallet approval.':'Launch preparation is currently disabled.')}).catch(()=>status.textContent='Connection status unavailable. The launch form checks again before signing.');
})();
