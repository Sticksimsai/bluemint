import {COINX} from './pump.js';

// Compare atomic units as bigint: neither rounding nor unlike quote assets can
// decide the crown. Window bounds are evaluated afresh on every request.
export function kingOfMemes(store, now=Math.floor(Date.now()/1000)) {
 const candidates=store.db.prepare("SELECT * FROM launches WHERE status='live' AND mint IS NOT NULL AND json_extract(profile,'$.protocol')='pump'").all();
 const eligible=candidates.filter(r=>JSON.parse(r.profile).quoteMint===COINX);
 const totals=new Map(eligible.map(r=>[r.id,{row:r,units:0n,lastTradeAt:0}]));
 for(const trade of store.db.prepare('SELECT launch_id,units,ts FROM pump_volume_trades WHERE ts>=? AND ts<=?').all(now-300,now)){
  const entry=totals.get(trade.launch_id);if(!entry||!/^\d+$/.test(trade.units))continue;
  entry.units+=BigInt(trade.units);entry.lastTradeAt=Math.max(entry.lastTradeAt,trade.ts);
 }
 const ranking=[...totals.values()].filter(r=>r.units>0n).sort((a,b)=>a.units===b.units?b.lastTradeAt-a.lastTradeAt||a.row.mint.localeCompare(b.row.mint):a.units>b.units?-1:1);
 const top=ranking[0],profile=top&&JSON.parse(top.row.profile);
 return {windowSeconds:300,windowFrom:now-300,windowTo:now,quoteMint:COINX,quoteSymbol:'COINx',source:'finalized_indexed_trades',partial:true,eligibleCoins:eligible.length,
  leader:top?{id:top.row.id,mint:top.row.mint,name:profile.name,ticker:profile.ticker,pfp:profile.pfp,volume5mUnits:top.units.toString(),volume5m:Number(top.units)/1e8,lastTradeAt:top.lastTradeAt}:null};
}
