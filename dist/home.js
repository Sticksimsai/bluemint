// A small code-native pixel animation: deterministic motion, no video download.
(()=>{
 const scene=document.getElementById('mintAnimation');if(!scene)return;
 scene.innerHTML=`<div class="mint-scene-top"><span><i></i> THE MEME MACHINE</span><span>8 SECOND LOOP</span></div>
 <svg viewBox="0 0 560 276" role="img" aria-labelledby="mintLoopTitle mintLoopDesc" shape-rendering="crispEdges">
 <title id="mintLoopTitle">A meme coin being minted</title><desc id="mintLoopDesc">A blank blue coin travels along a conveyor, is stamped by the Memebase press and emerges as a pixel dog coin. The sequence repeats.</desc>
 <defs>
 <pattern id="mintGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#142239" stroke-width="1"/></pattern>
 <clipPath id="mintBeltClip"><rect x="28" y="212" width="504" height="20"/></clipPath>
 <g id="mintBlank"><path d="M-12-30H12V-26H22V-20H28V-10H32V10H28V20H22V26H12V30H-12V26H-22V20H-28V10H-32V-10H-28V-20H-22V-26H-12Z" fill="#06112a"/><path d="M-10-26H10V-22H20V-16H24V-8H28V8H24V16H20V22H10V26H-10V22H-20V16H-24V8H-28V-8H-24V-16H-20V-22H-10Z" fill="#3678ff"/><path d="M-16-18H-8V-22H8V-18H-8V-12H-16Z" fill="#a4dcff"/><path d="M18-10H22V10H18V18H10V22H-6V18H10V14H18Z" fill="#1746b8"/></g>
 <g id="mintDog"><use href="#mintBlank"/><path d="M-17-14H-9V-8H9V-14H17V8H13V16H-13V8H-17Z" fill="#dbeaff"/><path d="M-13-10H-9V-3H-13ZM9-10H13V-3H9Z" fill="#79a9ff"/><path d="M-13 1H-7V5H-13ZM7 1H13V5H7Z" fill="#07132b"/><path d="M-5 7H5V11H1V15H-1V11H-5Z" fill="#123b80"/><path d="M-7 13H-3V17H3V13H7V19H-7Z" fill="#79a9ff"/></g>
 </defs>
 <rect width="560" height="276" fill="#09111f"/><rect width="560" height="276" fill="url(#mintGrid)"/>
 <path d="M26 244H534" stroke="#233a5c" stroke-width="2"/>
 <g fill="#1a2a44"><rect x="55" y="232" width="12" height="12"/><rect x="196" y="232" width="12" height="12"/><rect x="352" y="232" width="12" height="12"/><rect x="493" y="232" width="12" height="12"/></g>
 <path d="M28 208H532V232H28Z" fill="#132947" stroke="#577fae" stroke-width="2"/>
 <g clip-path="url(#mintBeltClip)"><g class="mint-treads" fill="#4a709e">${Array.from({length:35},(_,i)=>`<rect x="${i*16-16}" y="214" width="4" height="14"/>`).join('')}</g></g>
 <path d="M28 208H532" stroke="#8bb9f7" stroke-width="4"/>
 <g class="mint-incoming"><use href="#mintBlank"/><path d="M-9-10H9V-6H13V6H9V10H-9V6H-13V-6H-9Z" fill="none" stroke="#b7d6ff" stroke-width="3"/><path d="M-4 0H4" stroke="#dbeaff" stroke-width="3"/></g>
 <g class="mint-under-press"><use href="#mintBlank"/></g>
 <g class="mint-outgoing"><use href="#mintDog"/></g>
 <g class="mint-press">
 <path d="M213 64H347V204H329V91H231V204H213Z" fill="#143363" stroke="#4e86d1" stroke-width="2"/>
 <path d="M205 54H355V94H205Z" fill="#255cb2" stroke="#88b8ff" stroke-width="2"/>
 <path d="M213 54V46H347V54" fill="#163569" stroke="#4e86d1" stroke-width="2"/>
 <path d="M224 60H336V85H224Z" fill="#09172e"/>
 <text x="280" y="77" text-anchor="middle" class="mint-press-type">MEMEBASE</text>
 <rect x="223" y="102" width="6" height="90" fill="#a0c6f9"/><rect x="331" y="102" width="6" height="90" fill="#618dd2"/>
 <g class="mint-stamp"><path d="M267 94H293V119H267Z" fill="#315f9f"/><path d="M245 117H315V130H245Z" fill="#80b7ff"/><path d="M239 130H321V143H239Z" fill="#245cbb" stroke="#b1d5ff" stroke-width="2"/><path d="M251 144H309V149H251Z" fill="#07162b"/></g>
 <path d="M201 196H359V208H201Z" fill="#1f4c8a" stroke="#7ba5df" stroke-width="2"/>
 <path d="M207 200H219M227 200H239M247 200H259M267 200H279M287 200H299M307 200H319M327 200H339M347 200H353" stroke="#b1d5ff" stroke-width="3"/>
 <rect class="mint-light" x="342" y="67" width="6" height="6" fill="#97c5ff"/>
 </g>
 <g class="mint-sparks" fill="#cae5ff"><rect x="198" y="156" width="5" height="5"/><rect x="357" y="149" width="5" height="5"/><rect x="350" y="180" width="4" height="4"/><rect x="207" y="184" width="4" height="4"/><rect x="280" y="26" width="4" height="4"/></g>
 <g class="mint-status" text-anchor="middle"><text class="mint-caption mint-caption-a" x="280" y="265">YOUR MEME ENTERS THE PRESS</text><text class="mint-caption mint-caption-b" x="280" y="265">ONE FRESH COIN, COMING UP</text><text class="mint-caption mint-caption-c" x="280" y="265">MINTED. PAIRED WITH COINx.</text></g>
 </svg><div class="mint-scene-steps"><span><b>01</b> MEME IN</span><span><b>02</b> STAMP IT</span><span><b>03</b> COIN OUT</span></div>`;
 const crown='<svg viewBox="0 0 32 28" aria-hidden="true"><path d="M2 5H7V10H12V2H20V10H25V5H30V21H2ZM4 24H28V28H4Z" fill="currentColor"/></svg>';
 const box=document.getElementById('kingContent');
 async function refreshKing(){
  if(document.hidden||document.getElementById('tokenPage')&&!document.getElementById('tokenPage').hidden)return;
  try {
   const response=await fetch('/api/king',{credentials:'same-origin'});if(!response.ok)throw Error();const data=await response.json(),t=data.leader;
   if(!t){box.innerHTML='<div class="king-empty-mark">'+crown+'</div><div><h3>The throne is open.</h3><p>The COINx coin with the most indexed volume in the last 5 minutes takes the crown.</p></div><a class="king-launch" href="/launch">Launch a contender ↗</a>';return}
   const units=BigInt(t.volume5mUnits),fraction=(units%100000000n).toString().padStart(8,'0').replace(/0+$/,'');const volume=(units/100000000n).toLocaleString()+(fraction?'.'+fraction:'');
   box.innerHTML=`<a class="king-token" href="/token/${esc(t.mint)}"><img src="${esc(t.pfp)}" alt="${esc(t.name)}"><div><span class="king-tag">REIGNING MEME</span><h3>${esc(t.name)}</h3><p>${esc(t.ticker)} / COINx</p></div></a><div class="king-volume"><span>5 MIN VOLUME · INDEXED</span><strong>${volume} <small>COINx</small></strong></div><a class="king-launch" href="/token/${esc(t.mint)}">View coin ↗</a>`;
  }catch{box.innerHTML='<div class="king-empty-mark">'+crown+'</div><div><h3>Checking the throne…</h3><p>Rolling volume is temporarily unavailable. Retrying shortly.</p></div>'}
 }
 refreshKing();setInterval(refreshKing,15000);window.addEventListener('bluemint:refresh',refreshKing);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshKing()});
})();
