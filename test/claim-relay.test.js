import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,SystemProgram,ComputeBudgetProgram,TransactionMessage,VersionedTransaction,Transaction} from '@solana/web3.js';
import {validateClaimRelay} from '../server/claim-relay.js';
test('claim relay accepts bounded wallet fee estimation and rejects changes to intent',()=>{
 const payer=Keypair.generate(),recipient=Keypair.generate().publicKey,blockhash=Keypair.generate().publicKey.toString();
 const transfer=SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:recipient,lamports:1});
 const build=(ix,hash=blockhash)=>{const m=new TransactionMessage({payerKey:payer.publicKey,recentBlockhash:hash,instructions:ix}).compileToV0Message();const t=new VersionedTransaction(m);t.sign([payer]);return t};
 const expected=Buffer.from(build([transfer]).message.serialize()).toString('base64');
 const check=t=>validateClaimRelay(Buffer.from(t.serialize()).toString('base64'),expected,payer.publicKey.toString());
 assert(check(build([transfer])));
 assert(check(build([ComputeBudgetProgram.setComputeUnitLimit({units:300000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),transfer])));
 const legacy=new Transaction({feePayer:payer.publicKey,recentBlockhash:blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:300000}),transfer);legacy.sign(payer);assert(check(legacy));
 assert.throws(()=>check(build([transfer,SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:recipient,lamports:2})])));
 assert.throws(()=>check(build([SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:Keypair.generate().publicKey,lamports:1})])));
 assert.throws(()=>check(build([transfer],Keypair.generate().publicKey.toString())));
 assert.throws(()=>check(build([ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000000000}),transfer])));
 assert.throws(()=>check(build([transfer,ComputeBudgetProgram.setComputeUnitLimit({units:10000}),ComputeBudgetProgram.setComputeUnitLimit({units:10000})])));
});
