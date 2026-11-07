import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import {PROGRAM} from './launchlab-receipts.js';
import {discriminator} from './vault-abi.js';

const eventAuthority=PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],PROGRAM)[0];
const header=Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),discriminator('event:TradeEvent')]);
function curveTrades(tx,pool){
  const prices=[];
  if(!tx?.meta || tx.meta.err || !tx.blockTime)return prices;
  for(const group of tx.meta.innerInstructions||[])for(const ix of group.instructions){
    if(String(ix.programId)!==PROGRAM.toBase58()||String(ix.accounts?.[0])!==eventAuthority.toBase58()||!ix.data)continue;
    const d=Buffer.from(bs58.decode(ix.data));
    if(d.length<153||!d.subarray(0,16).equals(header)||!d.subarray(16,48).equals(pool.toBuffer()))continue;
    const base=d.readBigUInt64LE(56)-d.readBigUInt64LE(88);
    const quote=d.readBigUInt64LE(64)+d.readBigUInt64LE(96);
    const direction=d[152]; // 13 u64 fields follow the pool key.
    if(base>0n&&quote>0n&&direction<=1)prices.push({price:Number(quote)/Number(base),quoteUnits:d.readBigUInt64LE(direction===0?104:112)});
  }
  return prices;
}

export function curveTradePrices(tx,pool){return curveTrades(tx,pool).map(t=>t.price)}

export function createCurveHistory(db,rpc){
  db.exec(`CREATE TABLE IF NOT EXISTS curve_history_tx(launch_id TEXT,signature TEXT,slot INTEGER,ts INTEGER,PRIMARY KEY(launch_id,signature));
    CREATE TABLE IF NOT EXISTS curve_trade_prices(launch_id TEXT,signature TEXT,sequence INTEGER,slot INTEGER,ts INTEGER,price REAL,PRIMARY KEY(launch_id,signature,sequence));
    CREATE TABLE IF NOT EXISTS curve_volumes(launch_id TEXT,signature TEXT,ts INTEGER,units TEXT,PRIMARY KEY(launch_id,signature));
    CREATE TABLE IF NOT EXISTS curve_coverage(launch_id TEXT PRIMARY KEY,checked_at INTEGER,complete INTEGER);
    CREATE INDEX IF NOT EXISTS curve_prices_by_time ON curve_trade_prices(launch_id,ts);`);
  const active=new Set(),next=new Map();
  async function backfill(id,pool){
    const cutoff=Math.floor(Date.now()/1000)-86400;
    db.prepare('DELETE FROM curve_history_tx WHERE ts<?').run(cutoff);
    db.prepare('DELETE FROM curve_trade_prices WHERE ts<?').run(cutoff);
    db.prepare('DELETE FROM curve_volumes WHERE ts<?').run(cutoff);
    const creation=db.prepare('SELECT signature FROM chain_launches WHERE launch_id=?').get(id)?.signature;
    let before,remaining=6,complete=false,foundCreation=false;
    // Each cycle revisits the newest signatures and progresses into old pages.
    // Bound RPC work; disclose partial coverage on active markets.
    for(let page=0;page<12 && remaining>0;page++){
     const recent=await rpc.getSignaturesForAddress(pool,{limit:64,before},'finalized');
     for(const row of recent){
      if(row.signature===creation)foundCreation=true;
      if(row.blockTime && row.blockTime<cutoff){complete=true;break}
      if(row.err || db.prepare('SELECT 1 FROM curve_volumes WHERE launch_id=? AND signature=?').get(id,row.signature))continue;
      if(!remaining)break;
      remaining--;
      // This installed web3.js validates only legacy/v0 responses. Read parsed v1
      // instructions through JSON-RPC as well, including swaps from terminals.
      const response=await fetch(rpc.rpcEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),
        body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[row.signature,{commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:1}]})});
      if(!response.ok)return;
      const {result:tx,error}=await response.json();if(error)return;
      if(!tx?.blockTime)return;
      const trades=curveTrades(tx,pool);
      db.exec('BEGIN IMMEDIATE');
      try{
        for(const [i,{price}] of trades.entries())db.prepare('INSERT OR IGNORE INTO curve_trade_prices VALUES(?,?,?,?,?,?)').run(id,row.signature,i,tx.slot,tx.blockTime,price);
        db.prepare('INSERT OR IGNORE INTO curve_volumes VALUES(?,?,?,?)').run(id,row.signature,tx.blockTime,trades.reduce((sum,t)=>sum+t.quoteUnits,0n).toString());
        db.prepare('INSERT OR IGNORE INTO curve_history_tx VALUES(?,?,?,?)').run(id,row.signature,tx.slot,tx.blockTime);db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e}
    }
     if(complete)break;
     if(recent.length<64){complete=remaining>0&&foundCreation;break}
     before=recent.at(-1)?.signature;
    }
    db.prepare('INSERT OR REPLACE INTO curve_coverage VALUES(?,?,?)').run(id,Math.floor(Date.now()/1000),Number(complete));
  }
  return (id,pool)=>{
    if(active.has(id)||(next.get(id)||0)>Date.now())return;
    active.add(id);next.set(id,Date.now()+30000);
    backfill(id,pool).catch(()=>{}).finally(()=>active.delete(id));
  };
}
