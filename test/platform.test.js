import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,Keypair} from '@solana/web3.js';
import BN from 'bn.js';
import {createStore} from '../server/store.js';
import {createPlatformSetup,requirePlatformOwner,verifyPlatformSettings,DEVNET_CP_CONFIG,CIRCLE_DEVNET_USDC} from '../server/platform.js';
import {DEVNET_GENESIS} from '../server/chain.js';
const owner=Keypair.generate().publicKey,fee=Keypair.generate().publicKey;
const settings=()=>({feeRate:new BN(12500),creatorFeeRate:new BN(0),platformClaimFeeWallet:fee,platformLockNftWallet:owner,cpConfigId:new PublicKey(DEVNET_CP_CONFIG),platformCpCreator:fee,platformScale:new BN(1000000),creatorScale:new BN(0),burnScale:new BN(0),platformVestingScale:new BN(0),platformVestingWallet:PublicKey.default,transferFeeExtensionAuth:PublicKey.default,restrictCurveParam:0,restrictGlobalConfig:0});
test('platform setup is restricted to the configured owner, not any signed-in wallet',()=>{
 requirePlatformOwner(owner.toBase58(),{PLATFORM_OWNER_WALLET:owner.toBase58()});
 assert.throws(()=>requirePlatformOwner(fee.toBase58(),{PLATFORM_OWNER_WALLET:owner.toBase58()}),{status:403});
 assert.throws(()=>requirePlatformOwner(null,{}),{status:403});
});
test('platform verification rejects mismatched fee rights, LP split and authorities',()=>{
 const verify=p=>verifyPlatformSettings(p,owner.toBase58(),fee.toBase58());verify(settings());
 for(const change of [{feeRate:new BN(10000)},{platformCpCreator:owner},{platformClaimFeeWallet:owner},{platformLockNftWallet:fee},{cpConfigId:owner},{platformScale:new BN(900000)},{creatorScale:new BN(1)},{transferFeeExtensionAuth:owner},{restrictGlobalConfig:1}])assert.throws(()=>verify({...settings(),...change}));
});
test('setup remains devnet-only and network/mint identifiers are complete public keys',async()=>{
 assert.equal(new PublicKey(DEVNET_GENESIS).toBytes().length,32);assert.equal(new PublicKey(CIRCLE_DEVNET_USDC).toBytes().length,32);
 const store=createStore(':memory:');try{const setup=createPlatformSetup(store,{SOLANA_NETWORK:'mainnet'});await assert.rejects(setup.inspect(),/Only devnet/);await assert.rejects(setup.prepare(owner.toBase58(),'https://example.com'),{status:403})}finally{store.close()}
});
