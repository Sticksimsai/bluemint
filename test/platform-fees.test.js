import test from 'node:test';
import assert from 'node:assert/strict';
import {VersionedTransaction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {PlatformConfig,getPdaPlatformFeeVaultAuth} from '@raydium-io/raydium-sdk-v2';
import {createStore} from '../server/store.js';
import {createPlatformFees} from '../server/platform-fees.js';
import {PROGRAM} from '../server/launchlab-receipts.js';
import {TREASURY,USDC,discriminator} from '../server/vault-abi.js';
test('fee claim persists a wallet-reviewed transaction and only permits the treasury',async()=>{
 const store=createStore(':memory:'),p=Buffer.alloc(PlatformConfig.span),v=Buffer.alloc(165);
 discriminator('account:PlatformConfig').copy(p);TREASURY.toBuffer().copy(p,16);
 USDC.toBuffer().copy(v);getPdaPlatformFeeVaultAuth(PROGRAM).publicKey.toBuffer().copy(v,32);v.writeBigUInt64LE(551891875n,64);
 const rpc={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
 getMultipleAccountsInfoAndContext:async()=>({context:{slot:12},value:[{owner:PROGRAM,data:p},{owner:TOKEN_PROGRAM_ID,data:v}]}),
 getLatestBlockhash:async()=>({blockhash:USDC.toString(),lastValidBlockHeight:100}),
 simulateTransaction:async()=>({value:{err:null}})};
 const fees=createPlatformFees(store,{SOLANA_NETWORK:'mainnet'},rpc);
 try{
  await assert.rejects(fees.prepare('other'),e=>e.status===403);
  const prepared=await fees.prepare(TREASURY.toString());
  assert.equal(prepared.units,'551891875');assert.equal(prepared.scope,'all_platform_tokens');
  const tx=VersionedTransaction.deserialize(Buffer.from(prepared.transaction,'base64'));
  assert(tx.message.staticAccountKeys[0].equals(TREASURY));
  const row=store.db.prepare('SELECT * FROM platform_fee_claims WHERE id=?').get(prepared.id);
  assert.equal(row.status,'prepared');assert.equal(row.signature,null);
  assert.equal(row.message,Buffer.from(tx.message.serialize()).toString('base64'));
  assert(tx.message.staticAccountKeys.some(k=>k.equals(PROGRAM)));
 }finally{store.close()}
});
