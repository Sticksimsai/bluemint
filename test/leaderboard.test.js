import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey,Keypair,Connection} from '@solana/web3.js';
import BN from 'bn.js';
import {getPumpProgram,getPumpAmmProgram,PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID} from '@pump-fun/pump-sdk';
import {createStore} from '../server/store.js';
import {createPumpMarkets,pumpLogTrades} from '../server/pump-markets.js';
import {kingOfMemes} from '../server/leaderboard.js';
import {COINX} from '../server/pump.js';

test('king uses exact rolling COINx volume, both venues, and no drafts or USDC',()=>{
 const store=createStore(':memory:'),markets=createPumpMarkets(store),now=2000000000;
 const make=(name,protocol='pump',status='live')=>{const row=store.create(Keypair.generate().publicKey.toString(),{name,ticker:name,pfp:'',protocol,quoteMint:protocol==='pump'?COINX:'USDC'},name);store.db.prepare('UPDATE launches SET status=?,mint=? WHERE id=?').run(status,Keypair.generate().publicKey.toString(),row.id);return row};
 const a=make('AAA'),b=make('BBB'),old=make('OLD','launchlab'),draft=make('DRAFT','pump','draft');
 const put=(id,sig,ts,units,venue='curve')=>store.db.prepare('INSERT OR IGNORE INTO pump_volume_trades VALUES(?,?,?,?,?,?,?)').run(id,sig,0,1,ts,units,venue);
 try {
  put(a.id,'a',now-20,'9007199254740993');put(b.id,'b',now-10,'9007199254740992');
  put(b.id,'stale',now-301,'99999999999999999');put(b.id,'future',now+10000,'99999999999999999');
  put(old.id,'legacy',now,'99999999999999999');put(draft.id,'draft',now,'99999999999999999');
  let result=kingOfMemes(store,now);assert.equal(result.leader.id,a.id);assert.equal(result.leader.volume5mUnits,'9007199254740993');assert.equal(result.eligibleCoins,2);
  put(b.id,'pool',now-4,'2','pool');put(b.id,'pool',now-4,'2','pool');
  result=kingOfMemes(store,now);assert.equal(result.leader.id,b.id);assert.equal(result.leader.volume5mUnits,'9007199254740994');
  assert.equal(kingOfMemes(store,now+301).leader,null);assert.equal(result.quoteMint,COINX);assert.equal(result.partial,true);
 }finally{markets.close();store.close()}
});

const connection=new Connection('http://127.0.0.1:8899');
function event(program,name,values){
 const type=program.idl.types.find(t=>t.name===name),data={};
 for(const f of type.type.fields){const t=f.type;data[f.name]=t==='pubkey'?Keypair.generate().publicKey:t==='bool'?false:t==='string'?'buy_v3':typeof t==='string'?new BN(0):'vec' in t?[]:'option' in t?null:undefined}
 Object.assign(data,values);
 const discriminator=createHash('sha256').update('event:'+name[0].toUpperCase()+name.slice(1)).digest().subarray(0,8);
 return Buffer.concat([discriminator,program.coder.types.encode(name,data)]).toString('base64');
}
test('finalized log parser verifies the executing program, mint, quote and duplicates',()=>{
 const mint=Keypair.generate().publicKey,address=Keypair.generate().publicKey,item={mint:mint.toString()},program=PUMP_PROGRAM_ID.toString(),other=Keypair.generate().publicKey.toString();
 const make=(quote=COINX)=>event(getPumpProgram(connection),'tradeEvent',{mint,quoteMint:new PublicKey(quote),timestamp:new BN(2000000000),virtualTokenReserves:new BN(100000000),virtualQuoteReserves:new BN(100000000),quoteAmount:new BN(12345)});
 const raw=make(),log='Program data: '+raw;
 assert.equal(pumpLogTrades([log],item,address,'curve').length,0);
 assert.equal(pumpLogTrades([`Program ${other} invoke [1]`,log],item,address,'curve').length,0);
 const parsed=pumpLogTrades([`Program ${program} invoke [1]`,`Program ${other} invoke [2]`,log,`Program ${other} success`,log,log,`Program ${program} success`],item,address,'curve');
 assert.equal(parsed.length,1);assert.equal(parsed[0].units,'12345');assert.equal(parsed[0].price,.01);
 assert.equal(pumpLogTrades([`Program ${program} invoke [1]`,'Program data: '+make(Keypair.generate().publicKey.toString())],item,address,'curve').length,0);
 assert.equal(pumpLogTrades([`Program ${program} invoke [1]`,log],{mint:other},address,'curve').length,0);
});
test('PumpSwap buy and sell volume are accepted only for the verified canonical pool',()=>{
 const pool=Keypair.generate().publicKey,item={mint:Keypair.generate().publicKey.toString()},program=PUMP_AMM_PROGRAM_ID.toString(),coder=getPumpAmmProgram(connection);
 const buy=event(coder,'buyEvent',{pool,timestamp:new BN(2000000000),quoteAmountIn:new BN(15)});
 const sell=event(coder,'sellEvent',{pool,timestamp:new BN(2000000001),quoteAmountOut:new BN(17)});
 const logs=[`Program ${program} invoke [1]`,'Program data: '+buy,'Program data: '+sell,`Program ${program} success`];
 assert.deepEqual(pumpLogTrades(logs,item,pool,'pool').map(e=>e.units),['15','17']);
 assert.equal(pumpLogTrades(logs,item,Keypair.generate().publicKey,'pool').length,0);
});
