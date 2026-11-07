function enterMint(){modal.close();navigate('/mint')}
function showMint(){homeMain.hidden=true;detailMain.hidden=false;detailMain.innerHTML='<div class="empty">Connecting to The Mint…</div>'}
$('#engine').onclick=enterMint;$$('.nav').filter(b=>b.dataset.page==='liquidity').forEach(b=>b.onclick=enterMint);
