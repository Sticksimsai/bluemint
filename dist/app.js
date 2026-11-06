const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
let tokens=[];
let drafts=[],saved=read('bluemint-watch',[]),view='discover',filter='all',side='buy',selected=null;tokens=[...drafts,...tokens];const fmt=n=>n>=1e6?(n/1e6).toFixed(2)+'M':n>=1000?(n/1000).toFixed(1)+'K':n.toLocaleString();const money=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:2,minimumFractionDigits:2});
function render(){$('#grid').innerHTML='<div class="empty">Connecting to launch registry…</div>'}
const modal=$('#modal');function open(html){$('#modalContent').innerHTML=html;if(!modal.open)modal.showModal()}$('.close').onclick=()=>modal.close();modal.onclick=e=>{if(e.target===modal)modal.close()};function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');setTimeout(()=>$('#toast').classList.remove('visible'),3500)}
function liquidity(){location.href='docs.html#fees'}$('#engine').onclick=liquidity;$('#feesFooter').onclick=liquidity;$('#about').onclick=liquidity;
$$('.nav').forEach(b=>b.onclick=()=>{if(b.dataset.page==='liquidity'){liquidity();return}view=b.dataset.page;$$('.nav').forEach(x=>x.classList.toggle('active',x===b));filter='all';$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));render();$('#markets').scrollIntoView({behavior:'smooth'})});$$('.tab').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$$('.tab').forEach(x=>x.classList.toggle('active',x===b));render()});$('#search').oninput=render;$('#sort').onchange=render;$('#explore').onclick=()=>$('#markets').scrollIntoView({behavior:'smooth'});document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!modal.open){e.preventDefault();$('#search').focus()}});
$('#mintHeader').onclick=()=>{location.hash='create'};
function launch(){location.hash='create'}
$('#launch').onclick=launch;$('#launchBottom').onclick=launch;
render();
