import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey} from '@solana/web3.js';
import BN from 'bn.js';
import {usdcUnits,USDC,COINX,PUMP_QUOTES,pumpQuote,verifyPumpCurve} from '../server/pump.js';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {hash} from '../server/domain.js';

test('USDC inputs retain all six decimals without floating point',()=>{
 assert.equal(usdcUnits('1.000001'),'1000001');
 assert.equal(usdcUnits('0.000001'),'1');
 assert.equal(usdcUnits('99999999999.999999'),'99999999999999999');
 for(const value of ['1.0000001','-1','1e2','NaN','Infinity','1.2x',''])assert.throws(()=>usdcUnits(value));
});
test('only USDC is launchable; earlier COINx coins keep their own quote settings',()=>{
 assert.deepEqual(Object.values(PUMP_QUOTES).filter(q=>q.launchable).map(q=>q.symbol),['USDC']);
 assert.equal(pumpQuote({quoteMint:USDC}).decimals,6);assert.equal(pumpQuote({quoteMint:COINX}).decimals,8);
 assert.throws(()=>pumpQuote({quoteMint:'fake'}));assert.throws(()=>pumpQuote({}));
});
test('confirmation refuses another quote curve, redirected creator or special launch mode',()=>{
 const creator=Keypair.generate().publicKey,mint=Keypair.generate().publicKey;
 assert.throws(()=>verifyPumpCurve({quoteMint:new PublicKey(COINX),creator,isMayhemMode:false,isHolderReward:false,tokenTotalSupply:new BN('1000000000000000')},mint,creator.toBase58()));
 const curve={quoteMint:new PublicKey(USDC),creator,isMayhemMode:false,isHolderReward:false,tokenTotalSupply:new BN('1000000000000000')};
 assert.doesNotThrow(()=>verifyPumpCurve(curve,mint,creator.toBase58()));
 for(const patch of [{quoteMint:Keypair.generate().publicKey},{creator:mint},{isMayhemMode:true},{isHolderReward:true},{tokenTotalSupply:new BN(0)}])assert.throws(()=>verifyPumpCurve({...curve,...patch},mint,creator.toBase58()));
});
test('Pump mode binds new profiles to USDC, preserves legacy profiles and rejects old draft preparation',async()=>{
 const store=createStore(':memory:'),wallet=Keypair.generate().publicKey.toBase58();
 const old=store.create(wallet,{name:'Legacy',ticker:'OLD',desc:'Original USDC market',pfp:'',website:'',twitter:''},'old-profile');
 const retired=store.create(wallet,{name:'Retired',ticker:'CNX',desc:'Earlier COINx draft',pfp:'',website:'',twitter:'',protocol:'pump',quoteMint:COINX},'coinx-profile');
 const raw='a'.repeat(64),csrf='test-csrf';store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(raw),wallet,csrf,Date.now()+60000);
 const app=createApp({store,publicUrl:'http://localhost:3000',chainEnv:{LAUNCH_MODE:'pump',SOLANA_NETWORK:'mainnet',ENABLE_PUMP_MINTING:'false'}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 const headers={'Content-Type':'application/json',Origin:'http://localhost:3000',Cookie:'bm_session='+raw,'X-CSRF-Token':csrf,'Idempotency-Key':'pump-test-profile'};
 try{
  const config=await (await fetch(base+'/api/config')).json();assert.equal(config.mode,'pump');assert.equal(config.quoteMint,USDC);assert.equal(config.quoteSymbol,'USDC');assert.equal(config.quoteDecimals,6);assert.equal(config.brand,'Stabled');assert.equal(config.autoBuybacks,false);
  const response=await fetch(base+'/api/launches',{method:'POST',headers,body:JSON.stringify({name:'Test',ticker:'TEST',desc:'Test USDC launch',pfp:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',devBuyQuote:'0.000001',quoteMint:'fake',protocol:'launchlab',supplyUnits:'25'})});
  assert.equal(response.status,201);const row=await response.json();assert.equal(row.protocol,'pump');assert.equal(row.quoteMint,USDC);assert.equal(row.quoteDecimals,6);assert.equal(row.devBuyQuoteUnits,'1');assert.equal(row.supplyUnits,'1000000000000000');
  assert.equal(store.get(old.id).protocol,undefined);
  const legacy=await (await fetch(base+'/api/launches/'+old.id+'/metadata')).json();assert.equal(legacy.properties.quoteMint,'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const metadata=await (await fetch(base+'/api/launches/'+row.id+'/metadata')).json();assert.equal(metadata.properties.quoteMint,USDC);
  const kept=await (await fetch(base+'/api/launches/'+retired.id+'/metadata')).json();assert.equal(kept.properties.quoteMint,COINX);
  const listed=await (await fetch(base+'/api/launches')).json();assert.deepEqual(listed.items.map(t=>t.id),[row.id]);
  assert.equal((await fetch(base+'/api/launches/'+retired.id)).status,200);
  const blocked=await fetch(base+'/api/launches/'+old.id+'/prepare',{method:'POST',headers,body:'{}'});assert.equal(blocked.status,409);
  const disabled=await fetch(base+'/api/launches/'+row.id+'/prepare',{method:'POST',headers,body:'{}'});assert.equal(disabled.status,503);
 }finally{await new Promise(resolve=>app.server.close(resolve))}
});
