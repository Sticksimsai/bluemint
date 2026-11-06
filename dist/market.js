// Deterministic illustrative OHLC fixtures. This module has no live-market connection.
(function(root){
 function series(id,minutes=15,count=90){let seed=(id%1000000)+minutes*7919;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};let p=.00002+(id%8)*.000011;const start=Date.UTC(2026,10,6,7,0)-count*minutes*60000;return Array.from({length:count},(_,i)=>{let o=p,c=o*(1+(rnd()-.46)*.09);p=c;return {time:start+i*minutes*60000,open:o,close:c,high:Math.max(o,c)*(1+rnd()*.035),low:Math.min(o,c)*(1-rnd()*.035),volume:100+rnd()*2000}})}
 root.MarketDemo={series};if(typeof module!=='undefined')module.exports=root.MarketDemo;
})(typeof window!=='undefined'?window:globalThis);
