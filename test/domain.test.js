import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
import {createApp} from '../server/index.js';
import {createStore} from '../server/store.js';

test('new domain accepts wallet sign-in; old origin is refused and old metadata stays byte-identical',async()=>{
 const store=createStore(':memory:'),json=JSON.stringify({name:'Legacy coin',external_url:'https://bluemint.fun/token/legacy'}),digest=createHash('sha256').update(json).digest('base64url');
 store.db.prepare('INSERT INTO mint_metadata VALUES(?,?)').run(digest,json);
 const app=createApp({store,publicUrl:'https://memebase.fun',chainEnv:{LAUNCH_MODE:'pump',SOLANA_NETWORK:'mainnet',ENABLE_PUMP_MINTING:'false'}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try {
  const wallet=Keypair.generate().publicKey.toString(),options=origin=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({wallet})});
  const ok=await fetch(base+'/api/auth/challenge',options('https://memebase.fun'));assert.equal(ok.status,200);assert.match((await ok.json()).message,/memebase\.fun requests wallet ownership/);
  assert.equal((await fetch(base+'/api/auth/challenge',options('https://bluemint.fun'))).status,403);
  assert.equal(await (await fetch(base+'/m/'+digest)).text(),json);
  const retired=await fetch(base+'/mint',{redirect:'manual'});assert.equal(retired.status,308);assert.equal(retired.headers.get('location'),'/');
  const king=await (await fetch(base+'/api/king')).json();assert.equal(king.leader,null);assert.equal(king.windowSeconds,300);
 } finally {await new Promise(r=>app.server.close(r))}
});
