import {Connection,PublicKey} from '@solana/web3.js';
import {unpackAccount,unpackMint,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {CPMM_PROGRAM,CP_CONFIG,USDC,discriminator,vaultAddresses} from './vault-abi.js';
import {LaunchpadPool,PlatformConfig,getPdaLaunchpadPoolId} from '@raydium-io/raydium-sdk-v2';
import {PROGRAM,PLATFORM} from './launchlab-receipts.js';
import {decodeAccount} from './chain.js';
import {createCurveHistory} from './curve-history.js';
import {assert} from './domain.js';
export function createMarkets(store,env=process.env){
 const rpc=new Connection(env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'finalized',fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(12000)})});
 store.db.exec('CREATE TABLE IF NOT EXISTS market_observations(launch_id TEXT NOT NULL REFERENCES launches(id),slot INTEGER NOT NULL,observed_at INTEGER NOT NULL,price REAL NOT NULL,quote_units TEXT NOT NULL,PRIMARY KEY(launch_id,slot))');
 const pending=new Map();
 const fillHistory=createCurveHistory(store.db,rpc);
 async function read(item){
  if(item.status!=='live'||!item.mint)return {live:false,items:[],reason:'No finalized market exists for this launch'};
  let config=CP_CONFIG, minContextSlot;
  if(env.LAUNCH_MODE==='launchlab'){
    const mintKey=new PublicKey(item.mint);
    const curve=getPdaLaunchpadPoolId(PROGRAM,mintKey,USDC).publicKey;
    const result=await rpc.getMultipleAccountsInfoAndContext([curve,mintKey,PLATFORM],{commitment:'finalized'});
    const pool=decodeAccount(result.value[0],LaunchpadPool,'PoolState',PROGRAM);
    assert(pool.platformId.equals(PLATFORM)&&pool.mintA.equals(mintKey)&&pool.mintB.equals(USDC)&&pool.creator.toBase58()===item.owner&&pool.configId.toBase58()===env.RAYDIUM_GLOBAL_CONFIG_ID,'Unexpected LaunchLab pool',503);
    const mint=unpackMint(mintKey,result.value[1],TOKEN_PROGRAM_ID);
    fillHistory(item.id,curve);
    if(pool.status!==2){
      const tokens=pool.virtualA.sub(pool.realA),quote=pool.virtualB.add(pool.realB);
      assert(tokens.gtn(0)&&quote.gtn(0)&&mint.decimals===6&&pool.mintDecimalsB===6,'Invalid curve reserves',503);
      return record(item,curve,result.context.slot,Number(quote.toString())/Number(tokens.toString()),BigInt(pool.realB.toString()),mint.supply,'LaunchLab curve');
    }
    config=decodeAccount(result.value[2],PlatformConfig,'PlatformConfig',PROGRAM).cpConfigId;
    minContextSlot=result.context.slot;
  }
  const a=vaultAddresses(item.mint,item.owner,config);
  const result=await rpc.getMultipleAccountsInfoAndContext([a.pool,a.vault0,a.vault1,a.mint],{commitment:'finalized',minContextSlot});
  const [pool,v0,v1,mint]=result.value,d=pool?.data;
  assert(pool?.owner.equals(CPMM_PROGRAM)&&d.length>=413&&d.subarray(0,8).equals(discriminator('account:PoolState')),'Unverified market account',503);
  for(const[o,key]of [[8,config],[40,a.authority],[72,a.vault0],[104,a.vault1],[168,a.mint0],[200,a.mint1]])assert(new PublicKey(d.subarray(o,o+32)).equals(key),'Market identity mismatch',503);
  const t0=unpackAccount(a.vault0,v0),t1=unpackAccount(a.vault1,v1),m=unpackMint(a.mint,mint);
  assert(t0.mint.equals(a.mint0)&&t1.mint.equals(a.mint1)&&m.decimals===6,'Market mint mismatch',503);
  const net=(amount,offsets)=>offsets.reduce((n,o)=>n-d.readBigUInt64LE(o),amount);
  const r0=net(t0.amount,[341,357,397]),r1=net(t1.amount,[349,365,405]);const[q,t]=a.quoteFirst?[r0,r1]:[r1,r0];
  assert(q>0n&&t>0n,'Pool reserves unavailable',503);
  const price=Number(q)/Number(t);assert(Number.isFinite(price)&&price>0,'Invalid market price',503);
  return record(item,a.pool,result.context.slot,price,q,m.supply,'Raydium CPMM');
 }
 function record(item,pool,slot,price,q,supply,market){
  const observedAt=Math.floor(Date.now()/1000);
  store.db.prepare('INSERT OR IGNORE INTO market_observations VALUES(?,?,?,?,?)').run(item.id,slot,observedAt,price,q.toString());
  const observations=store.db.prepare(`SELECT observed_at,price,slot,1 AS kind,0 AS sequence FROM market_observations WHERE launch_id=? AND observed_at>?
    UNION ALL SELECT ts AS observed_at,price,slot,0 AS kind,sequence FROM curve_trade_prices WHERE launch_id=? AND ts>? ORDER BY observed_at,slot,kind,sequence`).all(item.id,observedAt-86400,item.id,observedAt-86400);
  const candles=new Map();for(const o of observations){const time=Math.floor(o.observed_at/60)*60;const c=candles.get(time);if(c){c.high=Math.max(c.high,o.price);c.low=Math.min(c.low,o.price);c.close=o.price}else candles.set(time,{time,open:o.price,high:o.price,low:o.price,close:o.price})}
  return {live:true,source:'finalized_pool_reserve_observations',chartLabel:market+' · finalized observations · 1m',pool:pool.toBase58(),mint:item.mint,quoteMint:USDC.toBase58(),slot,observedAt,price,marketCapUsdc:price*Number(supply)/1e6,usdcLiquidity:Number(q)/1e6,volume24h:null,items:[...candles.values()]};
 }
 return {async get(item){const current=pending.get(item.id);if(current&&current.until>Date.now())return current.promise;const promise=read(item);pending.set(item.id,{until:Date.now()+15000,promise});try{return await promise}catch(e){pending.delete(item.id);throw e}}};
}
