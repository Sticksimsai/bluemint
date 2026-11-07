// Same-origin mainnet API. Unavailable services never fall back to simulated markets.
window.BlueMintBackend={enabled:false,session:null,config:null};
const apiState=window.BlueMintBackend;
async function api(path,options={}){const response=await fetch('/api'+path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...(apiState.session?.csrf?{'X-CSRF-Token':apiState.session.csrf}:{}),...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data}
const normalizeLaunch=t=>({...t,id:Number(t.id)});
apiState.saveLaunch=async values=>{if(!apiState.session?.wallet)throw new Error('Connect and sign in with your wallet before saving a launch.');return normalizeLaunch(await api('/launches',{method:'POST',headers:{'Idempotency-Key':values.requestKey},body:JSON.stringify(values)}))};
async function walletLogin(){const provider=window.phantom?.solana||window.solana||window.solflare;if(!provider?.connect||!provider?.signMessage){open('<h2>Open your Solana wallet.</h2><p class="modal-sub">Use a browser with Phantom or Solflare installed. Memebase verifies a signed message; it never requests your private key.</p>');return}try{const connected=await provider.connect(),wallet=(connected.publicKey||provider.publicKey).toString();const challenge=await api('/auth/challenge',{method:'POST',body:JSON.stringify({wallet})});const signed=await provider.signMessage(new TextEncoder().encode(challenge.message),'utf8'),bytes=signed.signature||signed;const signature=btoa(String.fromCharCode(...new Uint8Array(bytes)));apiState.session=await api('/auth/verify',{method:'POST',body:JSON.stringify({id:challenge.id,signature})});walletLabel();await loadWatchlist();toast('Wallet verified. No transaction authorized.')}catch(error){toast(error.message)}}
function walletLabel(){document.querySelectorAll('[data-wallet-connect]').forEach(b=>{b.textContent=apiState.session?.wallet?apiState.session.wallet.slice(0,4)+'…'+apiState.session.wallet.slice(-4)+' · Sign out':'Connect wallet';b.onclick=walletAction});document.querySelectorAll('[data-platform-setup]').forEach(a=>a.hidden=false)}
function walletAction(){if(!apiState.session?.wallet)return walletLogin();open(`<h2>Wallet connected</h2><p class="modal-sub">${esc(apiState.session.wallet)}</p><button class="primary full" id="disconnectWallet">Sign out</button>`);$('#disconnectWallet').onclick=async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'});apiState.session=null;walletLabel();modal.close();toast('Signed out')}catch(e){toast(e.message)}}}

async function loadWatchlist(){if(!apiState.session?.wallet)return;const data=await api('/watchlist');saved=data.ids.map(Number);render()}
function updateDiscoveryTotals(){
  const metrics=$$('.metrics>div'),live=tokens.filter(t=>t.status==='live'&&t.protocol==='pump'),priced=live.filter(t=>t.marketDataAvailable);
  const indexed=priced.filter(t=>t.volume!=null),partial=indexed.length!==live.length||indexed.some(t=>t.volumePartial);
  const volume=indexed.length?(partial?'≥ ':'')+cardUnits(indexed.reduce((n,t)=>n+t.volume,0)):'—';
  const reserves=priced.length?cardUnits(priced.reduce((n,t)=>n+(t.quoteLiquidity||0),0)):'—';
  const values=[['COINx 24h volume',volume,'COINx',partial?'Indexed curve trades':'Verified curve trades'],['COINx reserves',reserves,'COINx',priced.length+' of '+live.length+' listed markets observed'],['Launch profiles',String(tokens.length),'PROFILES','Wallet-authenticated profiles']];
  values.forEach(([label,value,unit,note],i)=>{if(metrics[i])metrics[i].innerHTML=`<span>${label}</span><strong>${value} <small>${unit}</small></strong><label>${note}</label>`});
}
async function loadLaunches(){const data=await api('/launches?limit=100');tokens=data.items.map(normalizeLaunch);drafts=[];render();const newCount=$('[data-filter="new"] span');if(newCount)newCount.textContent=String(tokens.filter(t=>t.status==='new').length);updateDiscoveryTotals();$('.featured-section').hidden=true;$('.market-strip').hidden=true;const title=$('.market-foot');if(title)title.innerHTML='<span>Mainnet markets · quote asset shown per token</span>';}
const originalMintPage=showMint;showMint=function(){if(!apiState.enabled){homeMain.hidden=true;detailMain.hidden=false;detailMain.innerHTML='<div class="empty">Connecting to The Mint…</div>';return}showServerMint()};
async function showServerMint(){homeMain.hidden=true;detailMain.hidden=false;if(chartObserver){chartObserver.disconnect();chartObserver=null}document.title='The Mint — Memebase';detailMain.innerHTML='<div class="empty">Loading The Mint ledger…</div>';try{const data=await api('/mint');if(location.pathname!=='/mint')return;const fmtU=v=>money(Number(BigInt(v))/1e6);detailMain.innerHTML=`<div class="token-breadcrumb"><a href="/">← Discovery</a><span>/ The Mint</span></div><div class="mint-section-heading"><div><span class="eyebrow blue">PERSISTENT ACCOUNTING</span><h1>The Mint.</h1><a class="text-btn" href="/fees">View & claim platform fees</a><p class="modal-sub">Operator-reported entries. Not independently verified on-chain.</p></div></div><div class="mint-stats"><div><span>Reported fees collected</span><strong>${fmtU(data.totals.collectedUnits)} <small>USDC</small></strong></div><div><span>Reported liquidity allocation</span><strong>${fmtU(data.totals.liquidityAllocatedUnits)} <small>USDC</small></strong></div><div><span>Reported deployed capital</span><strong>${fmtU(data.totals.liquidityDeployedUnits)} <small>USDC</small></strong></div><div><span>Reported pending allocation</span><strong>${fmtU(data.totals.liquidityPendingUnits)} <small>USDC</small></strong></div></div><section class="mint-report-grid"><div class="mint-growth"><div class="mint-panel-heading"><h3>Built coin by coin.</h3><span>CONCEPT ANIMATION</span></div><div class="mint-growing-art"><picture><source media="(prefers-reduced-motion: reduce)" srcset="assets/how-growing.png"><img src="assets/how-growing.gif" alt="Illustrative USDC chip stack animation"></picture></div></div><div class="mint-split-panel"><h3>One fee. Two destinations.</h3><div class="split"><span>Launchpad treasury</span><b>0.50%</b></div><div class="split"><span>Token liquidity</span><b>0.75%</b></div><p>1.25% launchpad fee plus Raydium fees. Allocation splits recorded collected fees 40% / 60%. This server does not collect fees or execute buybacks.</p></div></section><section class="mint-ledger"><div class="mint-panel-heading"><h3>Append-only operator ledger</h3></div><div class="table-scroll"><table><thead><tr><th>Date</th><th>Launch</th><th>Event</th><th>USDC</th><th>Source</th></tr></thead><tbody>${data.events.length?data.events.map(e=>`<tr><td>${esc(e.created_at)}</td><td><a href="/token/${e.launch_id}">${esc(e.launch_id)}</a></td><td>${esc(e.kind)}</td><td>${fmtU(e.units)}</td><td>OPERATOR REPORT</td></tr>`).join(''):'<tr><td colspan="5">No ledger entries. No fees or liquidity executions have been recorded.</td></tr>'}</tbody></table></div></section><div class="mint-disclosure"><p>Financial amounts are accounting records, not balances guaranteed by a smart contract. Mainnet launches, live charts and liquidity execution are unavailable until the chain integrations are complete.</p></div>`}catch(e){detailMain.innerHTML=`<div class="empty">Unable to load ledger: ${esc(e.message)}</div>`}}
const originalCreatePage=showCreate;showCreate=function(){originalCreatePage();const walletPanel=document.createElement('section');walletPanel.className='launch-wallet-panel';walletPanel.innerHTML='<div><span class="eyebrow blue">YOUR LAUNCH WALLET</span><h3>Connect to save your launch.</h3><p>Sign-in proves ownership. Transactions require a separate wallet approval.</p></div><button type="button" class="pixel-mint-button" data-wallet-connect>Connect wallet</button>';$('#createForm').prepend(walletPanel);walletLabel();if(!apiState.enabled)return;$('.identity-lock span').textContent='Profile is immutable in this registry; on-chain metadata lock is not deployed.';const box=document.createElement('div');box.className='info-box';box.textContent='Connected backend: sign in with your Solana wallet to save. Launch identity, PFP and social links become publicly available in this registry.';$('#createForm').prepend(box)};
(async()=>{try{const response=await fetch('/api/config');if(!response.ok)throw Error('Launch service unavailable');const config=await response.json();if(config.apiVersion!==1)throw Error('Launch service unavailable');apiState.enabled=true;apiState.config=config;apiState.session=await api('/auth/me');walletLabel();$('.notice').innerHTML=`<span>SOLANA MAINNET</span> COINx launches on Pump · Wallet approvals required`;await loadLaunches();await loadWatchlist();route();const stream=new EventSource('/api/events');stream.addEventListener('refresh',async()=>{window.dispatchEvent(new Event('bluemint:refresh'));try{await loadLaunches();if(location.pathname==='/mint')showServerMint()}catch{}});document.addEventListener('click',e=>{const star=e.target.closest('[data-save]');if(star&&apiState.session?.wallet){const id=Number(star.dataset.save);setTimeout(()=>api('/watchlist',{method:'POST',body:JSON.stringify({launchId:String(id),saved:saved.includes(id)})}).catch(err=>toast(err.message)),0)}})}catch(e){if(apiState.enabled){$('.notice').textContent='Backend unavailable: '+e.message;tokens=[];render()}else {$('.notice').textContent='Launch service unavailable. Please retry shortly.';tokens=[];render()}}})();

function isPump(){return apiState.config?.mode==='pump'}
function isLaunchLab(){return ['launchlab','pump'].includes(apiState.config?.mode)}
async function signLaunchLab(profile, message) {
  const post = (action, body = {}) => api('/launches/' + profile.id + '/' + action,
    {method:'POST', body:JSON.stringify(body)});
  message('Preparing your launch…');
  const prepared = await post('prepare');
  const provider = window.phantom?.solana || window.solana || window.solflare;
  if (!provider?.publicKey) await provider?.connect();
  message('Approve the launch in your wallet.');
  const signed = await BlueMintWallet.signPrepared(prepared.transaction, profile.owner);
  message('Submitting your transaction…');
  return post('submit', {transaction:signed});
}

function showLaunchLabForm() {
  if (chartObserver) { chartObserver.disconnect(); chartObserver = null; }
  homeMain.hidden = true;
  detailMain.hidden = false;
  document.title = 'Launch a token — Memebase';
  detailMain.innerHTML = `<div class="quick-launch">
    <a class="token-breadcrumb" href="/">← Discover</a>
    <div class="create-heading"><h1>Launch a token</h1></div>
    <form class="create-form" id="createForm">
      <fieldset><label class="pfp-upload" for="quickPfp"><span id="pfpPreview">＋</span>
        <span><b>Token image</b><small>PNG, JPG or WebP · 256 KB max</small></span>
        <input type="file" id="quickPfp" name="image" accept="image/png,image/jpeg,image/webp" required></label>
      <div class="form-grid"><label class="field">Name<input name="name" maxlength="32" required></label>
        <label class="field">Ticker<input name="ticker" maxlength="10" pattern="[A-Za-z0-9]{2,10}" required></label></div>
      <label class="field">Description<textarea name="desc" maxlength="160" required></textarea></label>
      <label class="field">Developer buy · ${isPump()?'COINx':'USDC'} (optional)<input name="devBuyQuote" inputmode="decimal" placeholder="0" pattern="[0-9]{1,9}([.][0-9]{1,8})?"></label>
      <p class="form-help">Buy from the launch curve with your wallet. Leave blank to launch without buying.</p>
      <details><summary>Add links (optional)</summary>
        <label class="field">X / Twitter<input type="url" name="twitter" placeholder="https://x.com/"></label>
        <label class="field">Website<input type="url" name="website" placeholder="https://"></label></details>
      </fieldset>
      <p class="form-help">${isPump()?'COINx pair on Pump · Pump trading fees apply. SOL covers creation costs.':'USDC pair · Raydium fees apply.'}</p>
      <p class="form-help">Your image, website and social links are pinned to this mint. No additional Memebase trading fee.</p>
      <button class="pixel-mint-button primary full" type="submit">Launch token</button>
      <p role="status" aria-live="polite"></p><a class="quick-resume" hidden>Open saved token</a>
    </form></div>`;
  const form = document.querySelector('#createForm');
  const fieldset = form.querySelector('fieldset'), button = form.querySelector('button');
  const status = form.querySelector('[role=status]'), resume = form.querySelector('.quick-resume');
  const message = text => { status.textContent = text; };
  const input = form.elements.image, preview = form.querySelector('#pfpPreview');
  let imageRead, busy = false, saved, lastFingerprint, requestKey;
  input.onchange = () => {
    const file = input.files[0];
    input.setCustomValidity(''); preview.textContent = '＋'; imageRead = null;
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 256*1024) {
      input.setCustomValidity('Choose a PNG, JPG or WebP up to 256 KB.'); input.reportValidity(); return;
    }
    imageRead = new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        if (input.files[0] === file) {
          const img = new Image(); img.alt = ''; img.src = reader.result; preview.replaceChildren(img);
        }
        resolve(reader.result);
      };
      reader.onerror = () => resolve(null); reader.readAsDataURL(file);
    });
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true; button.disabled = true;
    const data = new FormData(form);
    fieldset.disabled = true;
    try {
      if (!apiState.session?.wallet) {
        message('Connect your wallet and sign in to continue.');
        await walletLogin();
        if (!apiState.session?.wallet) throw Error('Connect a wallet to launch.');
      }
      const owner = apiState.session.wallet;
      const values = Object.fromEntries(['name','ticker','desc','twitter','website','devBuyQuote'].map(k=>[k,String(data.get(k)||'').trim()]));if(!isPump())values.devBuyUsdc=values.devBuyQuote;
      values.ticker = values.ticker.toUpperCase(); values.pfp = await imageRead;
      if (!values.pfp) throw Error('Choose your token image again.');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([owner,values])));
      const fingerprint = Array.from(new Uint8Array(digest), n=>n.toString(16).padStart(2,'0')).join('');
      if (lastFingerprint !== fingerprint) {
        lastFingerprint = fingerprint; saved = null; resume.hidden = true;
        const key = 'bm.launch.' + fingerprint;
        requestKey = sessionStorage.getItem(key) || crypto.randomUUID(); sessionStorage.setItem(key,requestKey);
      }
      message('Preparing your launch…');
      saved ??= await apiState.saveLaunch({...values,requestKey});
      resume.href = tokenPath(saved.id);
      const row = (await api('/launches/'+saved.id+'/chain')).launch;
      if (!row || !['submitted','confirmed'].includes(row.status)) {
        await signLaunchLab(saved,message);
      }
      if (!tokens.some(t=>t.id===saved.id)) tokens.unshift(saved);
      message('Checking transaction confirmation…'); navigate(tokenPath(saved.id));
    } catch (e) {
      message(e.message || 'Launch interrupted. Try again.');
      if (saved) {
        if (!tokens.some(t=>t.id===saved.id)) tokens.unshift(saved);
        resume.hidden = false;
      }
    } finally {
      busy = false; button.disabled = false; fieldset.disabled = false;
    }
  };
}
function launchLabPanel(t,panel){
  if(isPump()&&t.protocol!=='pump'){panel.innerHTML=t.status==='live'?'<h3>Legacy USDC market</h3><p>This token keeps its original Raydium LaunchLab pool and fee rules. Its mint and metadata are unchanged.</p><a href="/fees/legacy">Legacy USDC claims</a>':'<h3>Legacy saved profile</h3><p>New launches now use COINx on Pump.</p><a class="pixel-mint-button" href="/launch">Create a COINx launch</a>';return}
  const target=Number(apiState.config.raiseUnits)/1e6;
  panel.innerHTML='<h3>Launch on Raydium</h3><p>Circle USDC · 80% of supply on the curve · '+esc(target.toLocaleString())+' USDC graduation target. Developer buy: '+esc(String(Number(t.devBuyUnits||0)/1e6))+' USDC. The curve platform fee is 1.25% plus Raydium fees. '+(apiState.config.autoBuybacks?'Reinvestment requires graduation and an approved fee allocation.':'Automatic reinvestment is pending.')+'</p><button class="pixel-mint-button">Review launch in wallet</button><p role="status"></p>';
  if(t.protocol==='pump')panel.innerHTML='<h3>Launch on Pump</h3><p>COINx quote · optional developer buy '+esc(String(Number(t.devBuyQuoteUnits||0)/1e8))+' COINx. Pump fees apply. Creator fees belong to your launch wallet.</p><button class="pixel-mint-button">Launch token</button><p role="status"></p>';
  const button=panel.querySelector('button'),status=panel.querySelector('[role=status]');
  const post=(action,data={})=>api('/launches/'+t.id+'/'+action,{method:'POST',body:JSON.stringify(data)});
  async function confirm(){
    const result=await post('confirm');
    status.textContent='Finalized mint: '+result.mint;
    button.hidden=true;
    await loadLaunches();
    if(currentToken(t.id))route();
  }
  async function wait(){
    for(let i=0;i<35 && panel.isConnected;i++){
      try{await confirm();return}catch{await new Promise(done=>setTimeout(done,2500))}
    }
    if(panel.isConnected){status.textContent='Finality pending. Check again before retrying.';button.disabled=false}
  }
  if(t.status==='live'){button.hidden=true;status.textContent='Finalized mint: '+t.mint;return}
  button.onclick=async()=>{
    button.disabled=true;
    try{
      if(apiState.session?.wallet!==t.owner)throw Error('Connect the wallet that saved this profile on the launch page.');
      const row=(await api('/launches/'+t.id+'/chain')).launch;
      if(row){try{await confirm();return}catch{/* Prepare reconciles expired submissions. */}}
      const result=await signLaunchLab(t,text=>{status.textContent=text});
      status.textContent='Awaiting finality: '+result.signature;
      await wait();
    }catch(error){status.textContent=error.message;button.disabled=false}
  };
  if(t.owner===apiState.session?.wallet)api('/launches/'+t.id+'/chain').then(r=>{
    if(r.launch?.status==='submitted' && panel.isConnected){button.disabled=true;status.textContent='Checking submitted transaction…';wait()}
  }).catch(()=>{});
}
async function showChainStatus(){const box=$('#chainStatus');if(!box)return;try{const s=await api('/chain/status');if(!box.isConnected)return;if(isPump()){box.textContent=s.issue||(s.mintPreparationReady?'Pump · COINx launches enabled':'Pump launches disabled');return}if(isLaunchLab()){box.textContent=s.issue||(s.mintPreparationReady?"Raydium LaunchLab · USDC launches enabled":"LaunchLab configured · wallet launches disabled");return}box.innerHTML=`<b>Direct USDC pool · The Mint vault</b><div>Solana mainnet · 50% developer budget seeds liquidity</div><div>1.25% creator fee + Raydium trading fee · net receipts split 40% / 60%</div><p>${esc(s.issue|| (s.mintPreparationReady?'Launch transactions enabled.':'Launch transactions disabled.'))}</p>`}catch{box.textContent='Unable to verify launch readiness.'}}
const createWithWallet=showCreate;showCreate=function(){if(!apiState.config){homeMain.hidden=true;detailMain.hidden=false;detailMain.innerHTML='<div class="empty">Connecting to launch service…</div>';return}if(isLaunchLab())return showLaunchLabForm();createWithWallet();const status=document.createElement('div');status.id='chainStatus';status.className='integration-status';status.textContent='Checking vault deployment…';$('#createForm').append(status);if(apiState.enabled)showChainStatus();else status.textContent='Connecting to launch service…'};
const renderWithProfile=renderPage;renderPage=function(t){renderWithProfile(t);if(!apiState.enabled)return;const panel=document.createElement('section');panel.className='chain-actions';if(isLaunchLab()){detailMain.append(panel);launchLabPanel(t,panel);return}panel.innerHTML=`<span class="eyebrow blue">USDC LAUNCH</span><h3>Create your token’s market.</h3><p>Three wallet steps: mint your token, seed its Raydium pool, complete your developer buy. Half your USDC budget seeds liquidity; half buys tokens. SOL covers rent and network costs.</p><label class="field">Developer budget · USDC<input id="devBuyBudget" inputmode="decimal" placeholder="Enter USDC amount" autocomplete="off"></label><p>Liquidity is held by The Mint’s program. Raydium deducts its protocol share from creator fees before the 40% treasury / 60% liquidity split. No holder rewards.</p><button class="pixel-mint-button" id="prepareChain">Review next launch step</button><button class="text-btn" id="refundBuy">Refund unspent buy</button><p id="chainResult" role="status"></p>`;detailMain.append(panel);const output=panel.querySelector('#chainResult'),budget=panel.querySelector('#devBuyBudget');
 const prepareStep=async(action)=>{try{
  if(!apiState.session?.wallet){navigate('/launch');toast('Connect your wallet on the launch page first.');return}
  output.textContent='Checking mainnet readiness and simulating…';
  const p=await api(`/launches/${t.id}/prepare`,{method:'POST',body:JSON.stringify({devBuyUsdc:budget.value.trim(),action})});
  if(p.stage==='live'){output.textContent='Launch finalized. Mint: '+p.mint;return}
  const usdc=v=>(Number(BigInt(v||'0'))/1e6).toLocaleString(undefined,{maximumFractionDigits:6});
  open(`<div class="eyebrow blue">MAINNET TRANSACTION REVIEW</div><h2>${esc({mint:'Create token',pool:'Seed USDC liquidity',buy:'Complete developer buy',refund:'Refund unspent buy'}[p.stage]||p.stage)}</h2><p class="modal-sub">Token: ${esc(t.ticker)}<br>Mint: ${esc(p.mint)}</p><div class="split"><span>Total developer budget</span><b>${usdc(p.budgetUnits)} USDC</b></div><div class="split"><span>Pool seed</span><b>${usdc(p.seedUsdcUnits||String(BigInt(p.budgetUnits)/2n))} USDC</b></div><div class="split"><span>Developer purchase</span><b>${usdc(p.buyUsdcUnits||String(BigInt(p.budgetUnits)-BigInt(p.budgetUnits)/2n))} USDC</b></div><p>${p.stage==='mint'?'This step creates the full token supply in your wallet and removes mint/freeze authority. USDC moves in the pool step.':p.stage==='pool'?'This step transfers your full USDC budget and token supply to The Mint. Half the USDC seeds the pool; the other half remains for your initial buy.':p.stage==='refund'?'This step returns only the unspent developer-buy USDC to your wallet. Pool liquidity remains in the vault.':'This step spends the reserved USDC and sends the purchased tokens to your wallet.'}</p><p>The initial buy must complete within 15 minutes of pool creation. If it expires, the unspent buy portion can be refunded; seeded liquidity stays in the pool. The first buyer may receive close to half the token supply. Other traders may trade once the pool opens.</p><p>Separate SOL rent and transaction fees apply. ${p.poolFundingLamports&&p.poolFundingLamports!=='0'?'Pool funding: '+(Number(p.poolFundingLamports)/1e9).toFixed(6)+' SOL.':''}</p><button class="pixel-mint-button" id="signMint">Review in wallet</button>`);
  $('#signMint').onclick=async()=>{try{$('#signMint').disabled=true;const signed=await BlueMintWallet.signPrepared(p.transaction,apiState.session.wallet);const result=await api(`/launches/${t.id}/submit`,{method:'POST',body:JSON.stringify({transaction:signed})});modal.close();output.textContent='Submitted: '+result.signature+'. Awaiting finality…';watchConfirmation()}catch(e){const b=$('#signMint');if(b)b.disabled=false;toast(e.message)}};
 }catch(e){output.textContent=e.message}};
 panel.querySelector('#prepareChain').onclick=()=>prepareStep();panel.querySelector('#refundBuy').onclick=()=>prepareStep('refund');
 let confirming=false;
 async function watchConfirmation(){if(confirming)return;confirming=true;let attempts=0;
  const poll=async()=>{if(!output.isConnected){confirming=false;return}try{const r=await api(`/launches/${t.id}/confirm`,{method:'POST',body:'{}'});output.textContent=r.nextStage==='live'?'Launch finalized. Mint: '+r.mint:'Step finalized. Next: '+r.nextStage+'. Select Review next launch step.';confirming=false;if(r.nextStage==='live'){await loadLaunches();route()}return}catch(e){output.textContent='Awaiting confirmation: '+e.message}if(++attempts<40)setTimeout(poll,3000);else{confirming=false;output.textContent='Confirmation is taking longer than expected. Reopen this token page to resume checking. Do not repeat the transaction.'}};poll();
 }
 api(`/launches/${t.id}/chain`).then(r=>{if(output.isConnected&&r.launch){output.textContent=r.launch.status+' · '+r.launch.stage+' · mint '+r.launch.mint;budget.value=String(Number(BigInt(r.launch.budgetUnits))/1e6);budget.readOnly=true;if(r.launch.status==='submitted'&&apiState.session?.wallet)watchConfirmation()}}).catch(()=>{});
};

// Server-backed profiles never inherit synthetic prices, trades or candles.
candlePreview=function(t){
  const bars=t.candles||[];
  if(!bars.length)return '<div class="draft-chart">'+(t.status==='live'?'Loading pool observations…':'No market yet')+'</div>';
  const low=Math.min(...bars.map(c=>c.low)),high=Math.max(...bars.map(c=>c.high));
  const pad=Math.max((high-low)*.1,high*.0001),y=v=>64-(v-low+pad)/(high-low+2*pad)*58;
  const last=bars.at(-1).time,first=Math.min(bars[0].time,last-9*60),x=v=>4+(v-first)/(last-first)*230,w=Math.min(5,13800/(last-first)*.7);
  return `<svg viewBox="0 0 240 72" width="100%" height="80" role="img" aria-label="Verified one-minute ${quoteOf(t)} candlesticks"><path d="M0 19H240M0 38H240M0 57H240" stroke="#1b2d45"/>${bars.map(c=>{const cx=x(c.time),color=c.close>=c.open?'#78adff':'#dd8da7';return `<path d="M${cx} ${y(c.high)}V${y(c.low)}" stroke="${color}"/><rect x="${cx-w/2}" y="${Math.min(y(c.open),y(c.close))}" width="${w}" height="${Math.max(2,Math.abs(y(c.close)-y(c.open)))}" fill="${color}"/>`}).join('')}</svg>`;
};
async function refreshMarketCards(){
  if(document.hidden||!apiState.enabled||!tokens.some(t=>t.status==='live'))return;
  try{
    const data=await api('/market-cards'),byId=new Map(data.items.map(c=>[String(c.id),c]));
    for(const t of tokens){const card=byId.get(String(t.id));if(card)Object.assign(t,card,{id:t.id})}
    updateDiscoveryTotals();if(!homeMain.hidden)render();
  }catch{/* Keep the last finalized observation during transient network errors. */}
}
setInterval(refreshMarketCards,30000);
const profileActivity=activity;activity=function(tab){if(!apiState.enabled)return profileActivity(tab);const el=$('#activityContent');if(!el)return;if(tab==='about'){el.innerHTML=`<p>${esc(selected.desc)}</p><p>${selected.mint?'Mint: '+esc(selected.mint):'Profile saved. Token not minted.'}</p>`;return}el.innerHTML=tab==='trades'?'<div class="empty">Individual swap history is not indexed. Pool price observations appear above.</div>':(selected.protocol==='pump'?'<div class="empty">Pump manages this coin’s curve and PumpSwap liquidity. <a href="/docs/liquidity">Read docs</a></div>':'<div class="empty">Legacy USDC liquidity rules apply. <a href="/fees/legacy">Legacy claims</a></div>')};
const launchWithTransactions=renderPage;let marketTimer;
renderPage=function(t){clearTimeout(marketTimer);launchWithTransactions(t);if(!apiState.enabled)return;if(chartObserver){chartObserver.disconnect();chartObserver=null}
 $('.status-chip').textContent=t.status==='live'?quoteOf(t)+' POOL':'LAUNCH DRAFT';$('.token-stat-row').innerHTML='<div><span>POOL PRICE · '+quoteOf(t)+'</span><strong id="pagePrice">—</strong></div><div><span>MARKET CAP · '+quoteOf(t)+'</span><strong id="liveCap">—</strong></div><div><span>'+quoteOf(t)+' RESERVE</span><strong id="liveLiquidity">—</strong></div><div><span>24H VOLUME</span><strong id="liveVolume">—</strong></div>';
 $('.trade-panel').innerHTML=`<h2>${t.status==='live'?quoteOf(t)+' market':'Awaiting launch'}</h2><p>${t.status==='live'?'This token has a finalized market. Terminal support depends on the terminal and quote asset.':'Complete the launch steps below to create a market.'}</p>${t.protocol==='pump'&&t.mint?`<p><a class="pixel-mint-button" href="https://pump.fun/coin/${esc(t.mint)}" target="_blank" rel="noopener noreferrer">Trade on Pump ↗</a></p>`:''}${t.mint?`<p>Mint</p><code style="overflow-wrap:anywhere">${esc(t.mint)}</code><p><a href="https://solscan.io/token/${esc(t.mint)}" target="_blank" rel="noopener noreferrer">View on Solscan</a></p>`:''}`;
 $('.liquidity-widget').innerHTML='<h3>The Mint</h3><p>Half the developer budget seeds liquidity. Trading fees received by the vault are split 40% to the launchpad and 60% to token liquidity.</p><a href="/mint">View The Mint</a>';
 $('.chart-panel').innerHTML='<div class="empty">'+(t.status==='live'?'Loading finalized pool observations…':'Market observations appear after the USDC pool is finalized.')+'</div>';activity('trades');
 if(t.protocol!=='pump'&&isLaunchLab()){
   $('.liquidity-widget').textContent=apiState.config.autoBuybacks?'1.25% curve platform fee. Approved USDC allocations can be reinvested after graduation.':'1.25% curve platform fee. Automated reinvestment is pending.';

 }
 if(t.protocol!=='pump')$('.liquidity-widget').textContent='Legacy USDC LaunchLab market · original fee and liquidity rules apply.';
 if(t.protocol==='pump')$('.liquidity-widget').innerHTML='<h3>Pump → PumpSwap</h3><p>Pump manages curve liquidity and graduation. No Memebase buyback or developer-buy liquidity split is applied.</p><a href="/docs/liquidity">How liquidity works</a>';
 if(t.status!=='live')return;
 const update=async()=>{if(!currentToken(t.id))return;try{const m=await api(`/launches/${t.id}/candles`);if(!currentToken(t.id))return;if(!m.live)throw Error(m.reason);if($('#liveVolume'))$('#liveVolume').textContent=m.volume24h==null?'Indexing':(m.volumePartial?'≥ ':'')+cardUnits(m.volume24h);$('#pagePrice').textContent=m.price.toPrecision(6);$('#liveCap').textContent=fmt(m.marketCapQuote??m.marketCapUsdc);$('#liveLiquidity').textContent=cardUnits(m.quoteLiquidity??m.usdcLiquidity);
 const candles=m.items.slice(-80),lo=Math.min(...candles.map(c=>c.low)),hi=Math.max(...candles.map(c=>c.high));
 const pad=Math.max((hi-lo)*.12,hi*.0005),bottom=lo-pad,top=hi+pad,y=p=>166-(p-bottom)/(top-bottom)*146;
 const end=candles.at(-1).time,start=Math.min(candles[0].time,end-9*60),x=time=>16+(time-start)/(end-start)*486;
 const width=Math.min(7,486*60/(end-start)*.68),clock=time=>new Date(time*1000).toISOString().slice(11,16);
 $('.chart-panel').innerHTML=`<div class="chart-top"><span class="chart-brand">MEMEBASE CHARTS</span><span class="chart-badge">${quoteOf(t)} · 1m</span></div><svg viewBox="0 0 620 200" role="img" aria-label="One-minute ${quoteOf(t)} candles from finalized pool observations">
 ${[top,(top+bottom)/2,bottom].map(p=>`<path d="M12 ${y(p)}H516" stroke="#243851"/><text x="526" y="${y(p)+3}" fill="#a5bddb" font-size="10">${p.toPrecision(5)}</text>`).join('')}
 <path d="M12 ${y(m.price)}H516" stroke="#5073a0" stroke-dasharray="3 5"/>
 ${candles.map(c=>{const cx=x(c.time),color=c.close>=c.open?'#78adff':'#dd8da7';return `<g><title>${clock(c.time)} UTC · O ${c.open.toPrecision(5)} · H ${c.high.toPrecision(5)} · L ${c.low.toPrecision(5)} · C ${c.close.toPrecision(5)}</title><path d="M${cx} ${y(c.high)}V${y(c.low)}" stroke="${color}"/><rect x="${cx-width/2}" y="${Math.min(y(c.open),y(c.close))}" width="${width}" height="${Math.max(2,Math.abs(y(c.open)-y(c.close)))}" fill="${color}"/></g>`}).join('')}
 <g fill="#93abc9" font-size="10"><text x="12" y="190">${clock(start)}</text><text x="470" y="190">${clock(end)} UTC</text></g></svg><div class="chart-caption"><span>${esc(m.chartLabel)}</span><span>Slot ${m.slot}</span></div>`;
 }catch(e){if(currentToken(t.id))$('.chart-panel').innerHTML=`<div class="empty">Live data unavailable: ${esc(e.message)}</div>`}if(currentToken(t.id))marketTimer=setTimeout(update,15000)};update();
};

async function showLegacyFees(){
  homeMain.hidden=true;detailMain.hidden=false;document.title='Platform fees — Memebase';
  detailMain.innerHTML='<div class="quick-launch"><a href="/">← Discover</a><h1>Platform fees</h1><section class="create-form"><p>Claimable USDC</p><h2 id="claimAmount">Loading…</h2><p>Legacy BlueMint LaunchLab fees only · USDC. Pump / COINx creator fees are separate.</p><p class="form-help">Legacy claims go to the existing BlueMint treasury wallet. Fee allocation to each token’s buyback vault requires a separate treasury approval.</p><button class="pixel-mint-button primary full" id="claimFees" disabled>Claim USDC</button><p role="status" id="claimStatus"></p><a id="claimExplorer" hidden target="_blank" rel="noopener noreferrer">View claim transaction</a></section></div>';
  const button=$('#claimFees'),status=$('#claimStatus'),amount=$('#claimAmount'),link=$('#claimExplorer');
  let timer;
  async function refresh(){
    const data=await api('/platform-fees');if(!amount.isConnected)return;
    amount.textContent=(Number(data.units)/1e6).toLocaleString(undefined,{maximumFractionDigits:6})+' USDC';
    const pending=data.claim?.status==='submitted';
    button.disabled=pending||data.units==='0';
    if(data.claim){link.href='https://solscan.io/tx/'+data.claim.signature;link.hidden=false;status.textContent=data.claim.status==='finalized'?'Claim finalized. USDC received by treasury.':data.claim.status==='submitted'?'Claim submitted. Awaiting finality…':'Previous claim '+data.claim.status+'.'}
    if(pending)timer=setTimeout(()=>refresh().catch(e=>{if(status.isConnected)status.textContent=e.message}),4000);
    return data;
  }
  try{await refresh()}catch(e){status.textContent=e.message}
  button.onclick=async()=>{
    button.disabled=true;clearTimeout(timer);
    try{
      if(!apiState.session?.wallet)await walletLogin();
      if(!apiState.session?.wallet)throw Error('Connect the BlueMint treasury wallet.');
      status.textContent='Preparing claim…';
      const prepared=await api('/platform-fees/prepare',{method:'POST',body:'{}'});
      status.textContent='Approve the USDC claim in your wallet.';
      const provider=window.phantom?.solana||window.solana||window.solflare;
      if(!provider?.publicKey)await provider?.connect();
      const signed=await BlueMintWallet.signPrepared(prepared.transaction,apiState.session.wallet);
      await api('/platform-fees/submit',{method:'POST',body:JSON.stringify({id:prepared.id,transaction:signed})});
      await refresh();
    }catch(e){status.textContent=e.message;button.disabled=false}
  };
}

async function showFees(){
 if(!isPump()||location.pathname==='/fees/legacy')return showLegacyFees();
 homeMain.hidden=true;detailMain.hidden=false;document.title='Fees — Memebase';
 detailMain.innerHTML='<div class="quick-launch"><a href="/">← Discover</a><h1>Fees</h1><section class="create-form"><h2>Pump creator fees</h2><p>Pump applies its on-chain trading fee schedule. Your launch wallet is the coin creator and receives any creator fees. Memebase adds no separate trading fee.</p><a class="pixel-mint-button" href="https://fees.pump.fun/" target="_blank" rel="noopener noreferrer">Open Pump fees ↗</a><p>Connect the wallet used to launch your coin. COINx receipts are separate from USDC and SOL.</p><a href="/docs/fees">Read the fee docs</a></section><section class="create-form"><h3>Legacy USDC fees</h3><p>Existing BlueMint LaunchLab markets keep their original fee recipients and rules.</p><a class="pixel-mint-button" href="/fees/legacy">Legacy USDC claims</a></section></div>';
}
const legacyMintLedger=showServerMint;showServerMint=async function(){if(!isPump())return legacyMintLedger();homeMain.hidden=true;detailMain.hidden=false;document.title='The Mint — Memebase';detailMain.innerHTML='<div class="quick-launch"><a href="/">← Discover</a><h1>The Mint</h1><section class="create-form"><h2>Memes in. COINx pairs out.</h2><p>New coins launch on Pump with COINx as their quote. Pump controls curve reserves and migration to PumpSwap.</p><p>The former USDC buyback engine does not apply to COINx launches. There is no automatic Memebase fee reinvestment or 50% developer-buy liquidity split.</p><a class="pixel-mint-button" href="/launch">Launch a coin</a><p><a href="/docs/liquidity">Read how liquidity works</a> · <a href="/fees/legacy">Legacy USDC claims</a></p></section></div>'};
