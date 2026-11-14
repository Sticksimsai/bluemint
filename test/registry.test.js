import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair} from '@solana/web3.js';
import {createStore} from '../server/store.js';
import {createApp} from '../server/index.js';
import {createMintFeed} from '../server/mint-feed.js';
import {hash} from '../server/domain.js';
import {USDC} from '../server/pump.js';

test('retired launches disappear from every public listing without deleting metadata or claim records',async()=>{
 const store=createStore(':memory:'),wallet=Keypair.generate().publicKey.toString(),pfp='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 function make(name,protocol){const row=store.create(wallet,{name,ticker:name,desc:'Test',pfp,website:'',twitter:'',...(protocol?{protocol,quoteMint:USDC}:{})},name);store.db.prepare("UPDATE launches SET status='live',mint=? WHERE id=?").run(Keypair.generate().publicKey.toString(),row.id);return store.get(row.id)}
 const active=make('NEW','pump'),old=Array.from({length:4},(_,i)=>make('OLD'+i));
 store.db.prepare("UPDATE launches SET created_at='2020-01-01' WHERE id=?").run(active.id);
 const feed=createMintFeed(store);for(const row of [active,...old])feed.record(row.id,row.mint);
 store.record(wallet,{launchId:old[0].id,kind:'fee_collected',units:'1000000',reference:'legacy-receipt-123'});
 const csrf='csrf',cookie='b'.repeat(64);store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(cookie),wallet,csrf,Date.now()+60000);
 for(const row of [active,...old])store.db.prepare('INSERT INTO watchlists VALUES(?,?)').run(wallet,row.id);
 const app=createApp({store,publicUrl:'http://localhost:3000',chainEnv:{LAUNCH_MODE:'pump',SOLANA_NETWORK:'mainnet',SOLANA_RPC_URL:'http://127.0.0.1:9'}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try {
  const registry=await (await fetch(base+'/api/launches?limit=1')).json();assert.deepEqual(registry.items.map(r=>r.id),[active.id]);
  assert.deepEqual((await (await fetch(base+'/api/launches?limit=1&offset=1')).json()).items,[]);
  const mints=await (await fetch(base+'/api/mints')).json();assert.equal(mints.total,1);assert.equal(mints.items[0].id,active.id);
  assert.equal((await fetch(base+'/api/launches/'+old[0].id)).status,410);
  assert.equal((await fetch(base+'/api/token-by-mint/'+old[0].mint)).status,410);
  const metadata=await (await fetch(base+'/api/launches/'+old[0].id+'/metadata')).json();assert.equal(metadata.name,old[0].name);assert.equal(metadata.properties.quoteMint,'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  assert.equal((await fetch(base+'/api/launches/'+old[0].id+'/image')).status,200);
  const saved=await (await fetch(base+'/api/watchlist',{headers:{Cookie:'bm_session='+cookie}})).json();assert.deepEqual(saved.ids,[active.id]);
  assert.equal((await (await fetch(base+'/api/market-cards')).json()).items.some(r=>old.some(t=>t.id===r.id)),false);
  assert.equal(store.list().length,5);assert.equal(store.ledger(old[0].id).length,1);assert.equal(feed.list().total,5);
 }finally{await new Promise(r=>app.server.close(r))}
});

test('operator purge removes only abandoned, never-minted drafts',()=>{
 const store=createStore(':memory:'),wallet=Keypair.generate().publicKey.toString();
 const make=name=>store.create(wallet,{name,ticker:name,desc:'Test',pfp:'',website:'',twitter:'',protocol:'pump',quoteMint:USDC},name);
 store.db.exec('CREATE TABLE pump_launches(launch_id TEXT PRIMARY KEY REFERENCES launches(id),expires INTEGER NOT NULL)');
 const draft=make('DRAFT'),live=make('LIVE'),pending=make('PEND'),stale=make('STALE'),now=Date.now();
 store.db.prepare("UPDATE launches SET status='live',mint=? WHERE id=?").run(Keypair.generate().publicKey.toString(),live.id);
 store.db.prepare('INSERT INTO pump_launches VALUES(?,?)').run(pending.id,now+60000);
 store.db.prepare('INSERT INTO pump_launches VALUES(?,?)').run(stale.id,now-3600000);
 store.db.prepare('INSERT INTO watchlists VALUES(?,?)').run(wallet,draft.id);
 assert.equal(store.purgeDraft('404'),'missing');
 assert.equal(store.purgeDraft(live.id),'minted');assert.ok(store.get(live.id));
 assert.equal(store.purgeDraft(pending.id),'pending');assert.ok(store.get(pending.id));
 assert.equal(store.purgeDraft(draft.id),'removed');assert.equal(store.get(draft.id),null);
 assert.equal(store.purgeDraft(stale.id),'removed');assert.equal(store.db.prepare('SELECT COUNT(*) n FROM pump_launches WHERE launch_id=?').get(stale.id).n,0);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM watchlists').get().n,0);
 // The same name can be registered again once its draft is gone.
 assert.ok(make('DRAFT').id);
});
