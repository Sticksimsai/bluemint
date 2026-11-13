async function showPlatformSetup(){homeMain.hidden=true;detailMain.hidden=false;document.title='Launch readiness — Stabled';if(chartObserver){chartObserver.disconnect();chartObserver=null}detailMain.innerHTML='<div class="token-breadcrumb"><a href="/launch">Back to launch</a><span>/ Launch readiness</span></div><h1>Launch readiness.</h1><p>Stabled verifies the active launch configuration on Solana mainnet.</p><section id="chainStatus" class="integration-status">Checking deployment…</section>';await showChainStatus()}

const previousPlatformSetup=showPlatformSetup;
showPlatformSetup=async function(){
 if(window.BlueMintBackend?.config?.mode!=='pump')return previousPlatformSetup();
 homeMain.hidden=true;detailMain.hidden=false;document.title='Launch readiness — Stabled';
 detailMain.innerHTML='<div class="quick-launch"><a href="/">← Discover</a><h1>Launch readiness</h1><section class="create-form"><p>Solana mainnet · Pump · USDC quote</p><code style="overflow-wrap:anywhere">EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code><p role="status" id="pumpReadiness">Checking mainnet configuration…</p><p>SOL pays creation costs. An optional developer buy spends USDC. Pump creator fees belong to your launch wallet.</p><a class="pixel-mint-button" href="/launch">Launch a coin</a></section></div>';
 try{const r=await api('/chain/status');const el=document.querySelector('#pumpReadiness');if(el)el.textContent=r.issue||(r.mintPreparationReady?'Ready for wallet-signed USDC launches.':'Launch preparation is disabled.')}catch(e){const el=document.querySelector('#pumpReadiness');if(el)el.textContent=e.message}
};
