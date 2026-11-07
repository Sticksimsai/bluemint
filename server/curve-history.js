import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import {PROGRAM} from './launchlab-receipts.js';
import {discriminator} from './vault-abi.js';

const eventAuthority=PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],PROGRAM)[0];
const header=Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),discriminator('event:TradeEvent')]);
export function curveTradePrices(tx,pool){
  const prices=[];
  if(!tx?.meta || tx.meta.err || !tx.blockTime)return prices;
  for(const group of tx.meta.innerInstructions||[])for(const ix of group.instructions){
    if(!ix.programId.equals(PROGRAM)||!ix.accounts?.[0]?.equals(eventAuthority)||!ix.data)continue;
    const d=Buffer.from(bs58.decode(ix.data));
    if(d.length<104||!d.subarray(0,16).equals(header)||!d.subarray(16,48).equals(pool.toBuffer()))continue;
    const base=d.readBigUInt64LE(56)-d.readBigUInt64LE(88);
    const quote=d.readBigUInt64LE(64)+d.readBigUInt64LE(96);
    if(base>0n&&quote>0n)prices.push(Number(quote)/Number(base));
  }
  return prices;
}

export function createCurveHistory(db,rpc){
  db.exec(`CREATE TABLE IF NOT EXISTS curve_history_tx(launch_id TEXT,signature TEXT,slot INTEGER,ts INTEGER,PRIMARY KEY(launch_id,signature));
    CREATE TABLE IF NOT EXISTS curve_trade_prices(launch_id TEXT,signature TEXT,sequence INTEGER,slot INTEGER,ts INTEGER,price REAL,PRIMARY KEY(launch_id,signature,sequence));
    CREATE INDEX IF NOT EXISTS curve_prices_by_time ON curve_trade_prices(launch_id,ts);`);
  const active=new Set(),next=new Map();
  async function backfill(id,pool){
    const cutoff=Math.floor(Date.now()/1000)-86400;
    db.prepare('DELETE FROM curve_history_tx WHERE ts<?').run(cutoff);
    db.prepare('DELETE FROM curve_trade_prices WHERE ts<?').run(cutoff);
    const recent=await rpc.getSignaturesForAddress(pool,{limit:64},'finalized');
    const unknown=recent.filter(r=>!r.err&&r.blockTime>=cutoff&&!db.prepare('SELECT 1 FROM curve_history_tx WHERE launch_id=? AND signature=?').get(id,r.signature)).slice(0,4);
    for(const row of unknown){
      const tx=await rpc.getParsedTransaction(row.signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
      if(!tx?.blockTime)continue;
      const prices=curveTradePrices(tx,pool);
      db.exec('BEGIN IMMEDIATE');
      try{
        for(const [i,price] of prices.entries())db.prepare('INSERT OR IGNORE INTO curve_trade_prices VALUES(?,?,?,?,?,?)').run(id,row.signature,i,tx.slot,tx.blockTime,price);
        db.prepare('INSERT OR IGNORE INTO curve_history_tx VALUES(?,?,?,?)').run(id,row.signature,tx.slot,tx.blockTime);db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e}
    }
  }
  return (id,pool)=>{
    if(active.has(id)||(next.get(id)||0)>Date.now())return;
    active.add(id);next.set(id,Date.now()+30000);
    backfill(id,pool).catch(()=>{}).finally(()=>active.delete(id));
  };
}
