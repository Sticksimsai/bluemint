function enterMint(){modal.close();location.hash='mint';if(location.hash==='#mint')showMint()}
function showMint(){homeMain.hidden=true;detailMain.hidden=false;detailMain.innerHTML='<div class="empty">Connecting to The Mint…</div>'}
$('#engine').onclick=enterMint;$$('.nav').filter(b=>b.dataset.page==='liquidity').forEach(b=>b.onclick=enterMint);
