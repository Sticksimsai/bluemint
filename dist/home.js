// A small code-native pixel animation: deterministic motion, no video download.
(()=>{
 const video=document.getElementById('heroVideo');
 if(video){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const sync=()=>{if(reduced.matches||document.hidden){video.pause();video.closest('figure').classList.toggle('reduced-motion',reduced.matches)}else{video.closest('figure').classList.remove('reduced-motion');video.play().catch(()=>{})}};
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);sync();
 }
 const crown='<svg viewBox="0 0 32 28" aria-hidden="true"><path d="M2 5H7V10H12V2H20V10H25V5H30V21H2ZM4 24H28V28H4Z" fill="currentColor"/></svg>';
 const box=document.getElementById('kingContent');
 async function refreshKing(){
  if(document.hidden||document.getElementById('tokenPage')&&!document.getElementById('tokenPage').hidden)return;
  try {
   const response=await fetch('/api/king',{credentials:'same-origin'});if(!response.ok)throw Error();const data=await response.json(),t=data.leader;
   if(!t){box.innerHTML='<div class="king-empty-mark">'+crown+'</div><div><h3>The throne is open.</h3><p>The COINx coin with the most indexed volume in the last 5 minutes takes the crown.</p></div><a class="king-launch" href="/launch">Launch a contender</a>';return}
   const units=BigInt(t.volume5mUnits),fraction=(units%100000000n).toString().padStart(8,'0').replace(/0+$/,'');const volume=(units/100000000n).toLocaleString()+(fraction?'.'+fraction:'');
   box.innerHTML=`<a class="king-token" href="/token/${esc(t.mint)}"><img src="${esc(t.pfp)}" alt="${esc(t.name)}"><div><span class="king-tag">REIGNING MEME</span><h3>${esc(t.name)}</h3><p>${esc(t.ticker)} / COINx</p></div></a><div class="king-volume"><span>5 MIN VOLUME · INDEXED</span><strong>${volume} <small>COINx</small></strong></div><a class="king-launch" href="/token/${esc(t.mint)}">View coin</a>`;
  }catch{box.innerHTML='<div class="king-empty-mark">'+crown+'</div><div><h3>Checking the throne…</h3><p>Rolling volume is temporarily unavailable. Retrying shortly.</p></div>'}
 }
 refreshKing();setInterval(refreshKing,15000);window.addEventListener('bluemint:refresh',refreshKing);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshKing()});
})();
