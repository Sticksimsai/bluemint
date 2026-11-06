import test from 'node:test';
import assert from 'node:assert/strict';
import BN from 'bn.js';
import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { verifyPolicy,validateRelay,createChain } from '../server/chain.js';
import { createStore } from '../server/store.js';
const feeWallet=Keypair.generate().publicKey,quote=Keypair.generate().publicKey;
const platform=()=>({feeRate:new BN(12500),creatorFeeRate:new BN(0),platformClaimFeeWallet:feeWallet,restrictCurveParam:0,restrictGlobalConfig:0});
const config=()=>({mintB:quote,curveType:0});
const expected={feeWallet:feeWallet.toBase58(),quoteMint:quote.toBase58()};
test('Raydium fee denomination and recipient are checked independently of advertised UI policy',()=>{
 verifyPolicy(platform(),config(),expected);
 for(const value of [125,1250,25000])assert.throws(()=>verifyPolicy({...platform(),feeRate:new BN(value)},config(),expected));
 assert.throws(()=>verifyPolicy({...platform(),creatorFeeRate:new BN(1)},config(),expected));
 assert.throws(()=>verifyPolicy(platform(),config(),{...expected,feeWallet:quote.toBase58()}));
 assert.throws(()=>verifyPolicy(platform(),{...config(),mintB:feeWallet},expected));
 assert.throws(()=>verifyPolicy({...platform(),restrictCurveParam:1},config(),expected));
});
test('relay rejects changed instructions, mismatched payer, and missing signatures',()=>{
 const payer=Keypair.generate(),recipient=Keypair.generate().publicKey;
 const message=new TransactionMessage({payerKey:payer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:recipient,lamports:1})]}).compileToV0Message();
 const tx=new VersionedTransaction(message),expectedMessage=Buffer.from(message.serialize()).toString('base64');
 const serialize=()=>Buffer.from(tx.serialize()).toString('base64');
 assert.throws(()=>validateRelay(serialize(),expectedMessage,payer.publicKey.toBase58()));
 tx.sign([payer]);assert.ok(validateRelay(serialize(),expectedMessage,payer.publicKey.toBase58()));
 assert.throws(()=>validateRelay(serialize(),'changed',payer.publicKey.toBase58()));
 assert.throws(()=>validateRelay(serialize(),expectedMessage,recipient.toBase58()));
});
test('chain status fails closed without configuration and a devnet flag cannot enable mainnet',async()=>{
 const store=createStore(':memory:');try{
 const chain=createChain(store,{}),status=await chain.status();assert.equal(status.mintPreparationReady,false);assert.equal(status.platformFeeConnected,false);assert.equal(status.automationEnabled,false);assert.ok(status.missing.includes('RAYDIUM_PLATFORM_ID'));
 await assert.rejects(chain.prepare({},'https://example.com'),/not enabled/);
 const mainnet=createChain(store,{SOLANA_NETWORK:'mainnet',ENABLE_DEVNET_MINTING:'true'});assert.equal((await mainnet.status()).mintPreparationReady,false);await assert.rejects(mainnet.prepare({},'https://example.com'),/not enabled/);
 }finally{store.close()}
});
