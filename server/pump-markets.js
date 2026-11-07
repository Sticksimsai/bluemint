import {Connection,PublicKey} from '@solana/web3.js';
import {unpackMint,unpackAccount,TOKEN_2022_PROGRAM_ID} from '@solana/spl-token';
import {PUMP_SDK,PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,bondingCurvePda,canonicalPumpPoolPdaWithQuote} from '@pump-fun/pump-sdk';
import {PUMP_AMM_SDK} from '@pump-fun/pump-swap-sdk';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {COINX,verifyPumpCurve} from './pump.js';
import {assert} from './domain.js';
const quoteKey=new PublicKey(COINX);
const eventDisc=name=>createHash('sha256').update('event:'+name).digest().subarray(0,8);
const curveDisc=eventDisc('TradeEvent'),buyDisc=eventDisc('BuyEvent'),sellDisc=eventDisc('SellEvent');
function decodeTrade(data,item,address,venue) {
 let e,units,price=null;
 if(venue==='curve'&&data.subarray(0,8).equals(curveDisc)) {
  e=PUMP_SDK.decodeTradeEventBc(data.subarray(8));
  if(e.mint.toBase58()!==item.mint||!e.quoteMint.equals(quoteKey)||e.virtualTokenReserves.isZero())return null;
  units=e.quoteAmount.toString();price=Number(e.virtualQuoteReserves.toString())/Number(e.virtualTokenReserves.toString())*.01;
 }else if(venue==='pool') {
  const buy=data.subarray(0,8).equals(buyDisc),sell=data.subarray(0,8).equals(sellDisc);if(!buy&&!sell)return null;
  e=buy?PUMP_SDK.decodeBuyEventAmm(data.subarray(8)):PUMP_SDK.decodeSellEventAmm(data.subarray(8));
  if(!e.pool.equals(address))return null;units=(buy?e.quoteAmountIn:e.quoteAmountOut).toString();
 }else return null;
 const ts=Number(e.timestamp.toString());
 if(!Number.isSafeInteger(ts)||ts<=0||BigInt(units)<=0n)return null;
 return {units,price,ts};
}
// Only decode a Program data log while the genuine Pump program is executing.
// A nested unrelated program cannot spoof its identity with a log message.
export function pumpLogTrades(logs,item,address,venue) {
 const expected=(venue==='curve'?PUMP_PROGRAM_ID:PUMP_AMM_PROGRAM_ID).toBase58(),stack=[],seen=new Set(),events=[];
 for(const line of logs) {
  const invoke=/^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[\d+\]$/.exec(line);
  if(invoke){stack.push(invoke[1]);continue}
  const ended=/^Program ([1-9A-HJ-NP-Za-km-z]+) (?:success|failed:)/.exec(line);
  if(ended){if(stack.at(-1)===ended[1])stack.pop();continue}
  if(stack.at(-1)!==expected||!line.startsWith('Program data: '))continue;
  const raw=line.slice(14);if(seen.has(raw))continue;seen.add(raw);
  try{const event=decodeTrade(Buffer.from(raw,'base64'),item,address,venue);if(event)events.push(event)}catch{}
 }
 return events;
}
export function createPumpMarkets(store,env=process.env){
 const rpc=new Connection(env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(15000)})});
 const quote=quoteKey,pending=new Map(),filling=new Set(),subscriptions=new Map();let closed=false;
 store.db.exec(`CREATE TABLE IF NOT EXISTS pump_observations(launch_id TEXT,slot INTEGER,ts INTEGER,price REAL,PRIMARY KEY(launch_id,slot));CREATE TABLE IF NOT EXISTS pump_cards(launch_id TEXT PRIMARY KEY,snapshot TEXT);CREATE TABLE IF NOT EXISTS pump_trades(launch_id TEXT,signature TEXT,sequence INTEGER,slot INTEGER,ts INTEGER,price REAL,units TEXT,PRIMARY KEY(launch_id,signature,sequence));CREATE TABLE IF NOT EXISTS pump_history_seen(launch_id TEXT,signature TEXT,PRIMARY KEY(launch_id,signature));`);
 store.db.exec(`CREATE TABLE IF NOT EXISTS pump_volume_trades(launch_id TEXT,signature TEXT,sequence INTEGER,slot INTEGER,ts INTEGER,units TEXT,venue TEXT,PRIMARY KEY(launch_id,signature,sequence,venue));
 CREATE TABLE IF NOT EXISTS pump_history_seen_v2(launch_id TEXT,venue TEXT,signature TEXT,PRIMARY KEY(launch_id,venue,signature));`);
 function saveTrade(item,signature,sequence,slot,event,venue) {
  if(closed)return;
  store.db.prepare('INSERT OR IGNORE INTO pump_volume_trades VALUES(?,?,?,?,?,?,?)').run(item.id,signature,sequence,slot,event.ts,event.units,venue);
  if(venue==='curve')store.db.prepare('INSERT OR IGNORE INTO pump_trades VALUES(?,?,?,?,?,?,?,?)').run(item.id,signature,sequence,slot,event.ts,event.price,event.units);
 }
 function watch(item,address,venue) {
  const key=item.id+':'+venue;if(closed||subscriptions.has(key))return;
  try {
   const id=rpc.onLogs(address,(result,context)=>{
    if(closed||result.err)return;
    try{pumpLogTrades(result.logs,item,address,venue).forEach((event,i)=>saveTrade(item,result.signature,i,context.slot,event,venue))}catch{}
   },'finalized');subscriptions.set(key,id);
  }catch{/* Bounded HTTP backfill still works when WebSocket access is unavailable. */}
 }
 async function history(item,address,venue='curve') {
  const key=item.id+':'+venue;if(filling.has(key))return;filling.add(key);
  try {
   // Newest trades take priority. Older pages are bounded; partial coverage
   // is explicit in both the market API and the rolling-volume leaderboard.
   let before,budget=6;
   for(let page=0;page<4&&budget>0;page++) {
    const sigs=await rpc.getSignaturesForAddress(address,{limit:32,before},'finalized');if(!sigs.length)break;
    for(const sig of sigs) {
     if(sig.blockTime&&sig.blockTime<Date.now()/1000-86400){budget=0;break}
     if(sig.err||!sig.blockTime||store.db.prepare('SELECT 1 FROM pump_history_seen_v2 WHERE launch_id=? AND venue=? AND signature=?').get(item.id,venue,sig.signature))continue;
     if(!budget--)break;
     const response=await rpc._rpcRequest('getTransaction',[sig.signature,{encoding:'jsonParsed',commitment:'finalized',maxSupportedTransactionVersion:1}]);
     const tx=response.result;if(!tx?.meta||tx.meta.err)continue;
     let sequence=0;const seen=new Set();
     for(const group of tx.meta.innerInstructions||[])for(const ix of group.instructions) {
      const program=venue==='curve'?PUMP_PROGRAM_ID:PUMP_AMM_PROGRAM_ID;
      if(ix.programId!==program.toBase58()||!ix.data)continue;
      const d=Buffer.from(bs58.decode(ix.data));
      if(d.length<16||!d.subarray(0,8).equals(Buffer.from('e445a52e51cb9a1d','hex')))continue;
      const raw=d.subarray(8).toString('base64');if(seen.has(raw))continue;seen.add(raw);
      try{const event=decodeTrade(d.subarray(8),item,address,venue);if(event)saveTrade(item,sig.signature,sequence++,tx.slot,event,venue)}catch{}
     }
     store.db.prepare('INSERT OR IGNORE INTO pump_history_seen_v2 VALUES(?,?,?)').run(item.id,venue,sig.signature);
    }
    before=sigs.at(-1).signature;
   }
  } catch {/* Retry next sample; never fabricate missing volume. */} finally {filling.delete(key)}
 }
 async function read(item){
  if(item.status!=='live'||!item.mint)return {live:false,items:[],reason:'Token has not finalized'};
  const mint=new PublicKey(item.mint),curveKey=bondingCurvePda(mint);const response=await rpc.getMultipleAccountsInfoAndContext([curveKey,mint],{commitment:'finalized'});const [c,m]=response.value;
  assert(c?.owner.equals(PUMP_PROGRAM_ID),'Pump curve not found',503);const curve=PUMP_SDK.decodeBondingCurve(c);verifyPumpCurve(curve,mint,item.owner);const token=unpackMint(mint,m,TOKEN_2022_PROGRAM_ID);
  let price,q,pool=curveKey,slot=response.context.slot,market='Pump curve';
  if(!curve.complete){assert(curve.virtualTokenReserves.gtn(0),'Pump reserves unavailable',503);price=Number(curve.virtualQuoteReserves.toString())/Number(curve.virtualTokenReserves.toString())*.01;q=BigInt(curve.realQuoteReserves.toString());watch(item,curveKey,'curve');history(item,curveKey)}
  else {pool=canonicalPumpPoolPdaWithQuote(mint,quote);const p=await rpc.getAccountInfo(pool,'finalized');assert(p?.owner.equals(PUMP_AMM_PROGRAM_ID),'PumpSwap migration pending',503);const state=PUMP_AMM_SDK.decodePool(p);assert(state.baseMint.equals(mint)&&state.quoteMint.equals(quote)&&state.coinCreator.toBase58()===item.owner,'Unexpected PumpSwap pool identity',503);const vaults=await rpc.getMultipleAccountsInfoAndContext([state.poolBaseTokenAccount,state.poolQuoteTokenAccount],{commitment:'finalized',minContextSlot:slot});const base=unpackAccount(state.poolBaseTokenAccount,vaults.value[0],TOKEN_2022_PROGRAM_ID),quoted=unpackAccount(state.poolQuoteTokenAccount,vaults.value[1],TOKEN_2022_PROGRAM_ID);assert(base.mint.equals(mint)&&quoted.mint.equals(quote)&&base.owner.equals(pool)&&quoted.owner.equals(pool)&&base.amount>0n,'Unexpected PumpSwap vaults',503);q=quoted.amount-BigInt(state.protocolFees.toString())-BigInt(state.creatorFees.toString());price=Number(quoted.amount+BigInt(state.virtualQuoteReserves.toString()))/Number(base.amount)*.01;slot=vaults.context.slot;market='PumpSwap';watch(item,pool,'pool');history(item,pool,'pool');watch(item,curveKey,'curve');history(item,curveKey)}
  assert(Number.isFinite(price)&&price>0&&q>=0n,'Invalid Pump price',503);const observedAt=Math.floor(Date.now()/1000);store.db.prepare('INSERT OR IGNORE INTO pump_observations VALUES(?,?,?,?)').run(item.id,slot,observedAt,price);
  const rows=store.db.prepare('SELECT ts,price,slot,1 AS sequence FROM pump_observations WHERE launch_id=? AND ts>? UNION ALL SELECT ts,price,slot,sequence FROM pump_trades WHERE launch_id=? AND ts>? ORDER BY ts,slot,sequence').all(item.id,observedAt-86400,item.id,observedAt-86400);const bars=new Map();for(const r of rows){const time=Math.floor(r.ts/60)*60,c=bars.get(time);if(c){c.high=Math.max(c.high,r.price);c.low=Math.min(c.low,r.price);c.close=r.price}else bars.set(time,{time,open:r.price,high:r.price,low:r.price,close:r.price})}
  const trades=store.db.prepare('SELECT units FROM pump_volume_trades WHERE launch_id=? AND ts>?').all(item.id,observedAt-86400),volume24h=trades.length?Number(trades.reduce((n,r)=>n+BigInt(r.units),0n))/1e8:null;
  const result={live:true,quoteMint:COINX,quoteSymbol:'COINx',quoteDecimals:8,pool:pool.toBase58(),mint:item.mint,slot,observedAt,price,marketCapQuote:price*Number(token.supply)/1e6,quoteLiquidity:Number(q)/1e8,volume24h,volumePartial:true,chartLabel:market+' · finalized observations · 1m',items:[...bars.values()]};
  const card={id:item.id,quoteSymbol:'COINx',quoteMint:COINX,marketDataAvailable:true,cap:result.marketCapQuote,quoteLiquidity:result.quoteLiquidity,volume:volume24h,volumePartial:true,observedAt,candles:result.items.slice(-40)};store.db.prepare('INSERT OR REPLACE INTO pump_cards VALUES(?,?)').run(item.id,JSON.stringify(card));return result;
 }
 return {track(item){if(item?.protocol==='pump'&&item.status==='live'&&item.mint){const mint=new PublicKey(item.mint);watch(item,bondingCurvePda(mint),'curve');watch(item,canonicalPumpPoolPdaWithQuote(mint,quote),'pool')}},start(){const exists=store.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pump_launches'").get();if(!exists)return;for(const row of store.db.prepare("SELECT l.id FROM launches l JOIN pump_launches p ON p.launch_id=l.id AND p.mint=l.mint WHERE l.status='live' AND p.status='confirmed'").all())this.track(store.get(row.id))},close(){closed=true;for(const id of subscriptions.values())rpc.removeOnLogsListener(id).catch(()=>{});subscriptions.clear()},cards:items=>items.flatMap(item=>{const row=store.db.prepare('SELECT snapshot FROM pump_cards WHERE launch_id=?').get(item.id);return row?[{...JSON.parse(row.snapshot),mintedAt:store.db.prepare('SELECT confirmed_at FROM confirmed_mints WHERE launch_id=?').get(item.id)?.confirmed_at}]:[]}),async get(item){const old=pending.get(item.id);if(old&&old.until>Date.now())return old.promise;const promise=read(item);pending.set(item.id,{promise,until:Date.now()+15000});try{return await promise}catch(e){pending.delete(item.id);throw e}}};
}
