const homeMain=$('main');const detailMain=document.createElement('main');detailMain.id='tokenPage';detailMain.hidden=true;homeMain.after(detailMain);let chartInterval=15,chartStyle='candles',chartMetric='price',chartPoints=70,chartData=[],chartObserver=null,chartHover=-1;
const feature=document.createElement('section');feature.className='featured-section';feature.hidden=true;$('#markets').before(feature);
const strip=document.createElement('div');strip.className='market-strip';strip.hidden=true;homeMain.prepend(strip);
function goHome(){if(chartObserver){chartObserver.disconnect();chartObserver=null}homeMain.hidden=false;detailMain.hidden=true;document.title='BlueMint — A new wave of launches'}
function route(){
 const path=location.pathname;
 if(path==='/setup'){if(typeof showPlatformSetup==='function')showPlatformSetup();return}
 if(path==='/launch'){showCreate();return}
 if(path==='/mint'){showMint();return}
 const match=path.match(/^\/token\/([a-zA-Z0-9]+)$/);
 if(!match){
   goHome();view=path==='/watchlist'?'watchlist':'discover';
   $$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===view));render();return;
 }
 const key=match[1],t=tokens.find(row=>String(row.id)===key||row.mint===key);
 if(!t){
   homeMain.hidden=true;detailMain.hidden=false;detailMain.innerHTML='<div class="empty">Loading token…</div>';
   if(window.BlueMintBackend?.enabled){
     fetch((key.length>20?'/api/token-by-mint/':'/api/launches/')+key).then(r=>{if(!r.ok)throw Error();return r.json()}).then(row=>{
       if(location.pathname!==path)return;
       if(!tokens.some(t=>String(t.id)===String(row.id)))tokens.push({...row,id:Number(row.id)});
       route();
     }).catch(()=>{if(location.pathname===path)detailMain.innerHTML='<div class="empty">Token unavailable. <a href="/">Back to discovery</a></div>'});
   }
   return;
 }
 if(t.mint&&key!==t.mint)history.replaceState(null,'',tokenPath(t.id));
 selected=t;side='buy';chartInterval=15;chartStyle='candles';chartMetric='price';chartPoints=70;chartHover=-1;
 homeMain.hidden=true;detailMain.hidden=false;window.scrollTo(0,0);document.title=t.name+' / USDC — BlueMint';renderPage(t);
}
window.addEventListener('popstate',()=>{migrateBookmark();route()});
window.addEventListener('hashchange',()=>{migrateBookmark();route()});
$$('.nav').forEach(b=>b.onclick=()=>{if(b.dataset.page==='liquidity'){navigate('/mint');return}
 filter='all';$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));navigate(b.dataset.page==='watchlist'?'/watchlist':'/');$('#markets').scrollIntoView({behavior:'smooth'})});
function renderPage(t){detailMain.innerHTML=`<div class="token-breadcrumb"><a href="/">← All tokens</a><span>${esc(t.ticker)} / USDC</span></div><section class="token-heading"><div class="token-identity"><div class="avatar large" style="--art:${t.art}">${esc(t.symbol)}</div><div><h1>${esc(t.name)}</h1><span class="status-chip">${t.status==='live'?'USDC POOL':'PRE-LAUNCH'}</span></div></div></section><div class="token-stat-row"><div><span>PRICE · USDC</span><strong id="pagePrice">—</strong></div></div><div class="terminal-layout"><div class="terminal-main"><section class="chart-panel"><div class="empty">Loading market data…</div></section><section class="activity-panel"><div class="activity-tabs"><button data-activity="trades">Transactions</button><button data-activity="liquidity">The Mint</button><button data-activity="about">About token</button></div><div id="activityContent"></div></section></div><aside><section class="trade-panel"></section><section class="liquidity-widget"></section></aside></div>`;$$('[data-activity]').forEach(b=>b.onclick=()=>activity(b.dataset.activity));}
function detail(id){navigate(tokenPath(id))}
function activity(){const el=$('#activityContent');if(el)el.innerHTML='<div class="empty">Connecting to registry…</div>'}
