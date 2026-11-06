import test from 'node:test';
import assert from 'node:assert/strict';
import {PublicKey,Keypair} from '@solana/web3.js';
import BN from 'bn.js';
import {createStore} from '../server/store.js';
import {createPlatformSetup,requirePlatformOwner,verifyPlatformSettings,DEVNET_CP_CONFIG,CIRCLE_DEVNET_USDC} from '../server/platform.js';
import {DEVNET_GENESIS} from '../server/chain.js';
import {networkConfig,verifyGenesis,verifyPreparationNetwork,NETWORKS} from '../server/network.js';
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
test('setup requires RPC configuration and complete network/mint identifiers',async()=>{
 assert.equal(new PublicKey(DEVNET_GENESIS).toBytes().length,32);assert.equal(new PublicKey(CIRCLE_DEVNET_USDC).toBytes().length,32);
 const store=createStore(':memory:');try{const setup=createPlatformSetup(store,{SOLANA_NETWORK:'mainnet'});await assert.rejects(setup.inspect(),/HTTPS RPC required/);await assert.rejects(setup.prepare(owner.toBase58(),'https://example.com'),{status:403})}finally{store.close()}
});

test('network selection pins the mainnet mint, genesis and CPMM configuration',()=>{
 const n=networkConfig({SOLANA_NETWORK:'mainnet',USDC_QUOTE_MINT:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'});
 assert.equal(n.name,'mainnet');assert.equal(n.cpConfig,'627Jx6eN61TrdgMFSQt1QxvAmYWHXmzVA8M9FsKFtdkX');
 assert.throws(()=>networkConfig({SOLANA_NETWORK:'mainnet',USDC_QUOTE_MINT:NETWORKS.devnet.quoteMint}));
 assert.throws(()=>networkConfig({SOLANA_NETWORK:'testnet'}));
 verifyGenesis(n.genesis,n);assert.throws(()=>verifyGenesis(DEVNET_GENESIS,n));
 assert.throws(()=>verifyPreparationNetwork({network:'devnet'},n));verifyPreparationNetwork({network:'mainnet'},n);
 verifyPlatformSettings({...settings(),cpConfigId:new PublicKey(n.cpConfig)},owner.toBase58(),fee.toBase58(),n.cpConfig);
 assert.throws(()=>verifyPlatformSettings(settings(),owner.toBase58(),fee.toBase58(),n.cpConfig));
});
test('legacy platform preparations retain devnet identity after mainnet migration',()=>{
 const store=createStore(':memory:');try{
 store.db.exec("CREATE TABLE platform_preparations(id TEXT PRIMARY KEY,wallet TEXT,serialized_tx TEXT,message TEXT,block_height INTEGER,created_at INTEGER,signature TEXT,status TEXT); INSERT INTO platform_preparations VALUES('legacy','owner','','',1,1,NULL,'prepared');");
 createPlatformSetup(store,{SOLANA_NETWORK:'mainnet'});
 const row=store.db.prepare("SELECT * FROM platform_preparations WHERE id='legacy'").get();assert.equal(row.network,'devnet');assert.throws(()=>verifyPreparationNetwork(row,NETWORKS.mainnet));
 }finally{store.close()}
});
