import test from 'node:test';import assert from 'node:assert/strict';
import {Keypair,PublicKey,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {CpmmConfigInfoLayout,CpmmPoolInfoLayout,getCpmmPdaAmmConfigId,getCreatePoolKeys} from '@raydium-io/raydium-sdk-v2';
import {vaultAddresses,vaultInstruction,decodeVault,verifyCpConfig,VAULT_PROGRAM,CPMM_PROGRAM,CP_CONFIG,USDC,discriminator} from '../server/vault-abi.js';
import {createVaultChain} from '../server/vault-chain.js';import {createStore} from '../server/store.js';
const owner=Keypair.generate().publicKey,mint=Keypair.generate().publicKey,a=vaultAddresses(mint,owner);
test('CPMM canonical accounts match pinned Raydium SDK',()=>{
 const keys=getCreatePoolKeys({programId:CPMM_PROGRAM,configId:CP_CONFIG,mintA:a.mint0,mintB:a.mint1});
 for(const [ours,theirs]of [['pool','poolId'],['lpMint','lpMint'],['vault0','vaultA'],['vault1','vaultB'],['observation','observationId'],['cpAuthority','authority']])assert.equal(a[ours].toBase58(),keys[theirs].toBase58());
 assert.equal(getCpmmPdaAmmConfigId(CPMM_PROGRAM,20).publicKey.toBase58(),CP_CONFIG.toBase58());
});
test('vault ABI account order, signer and budget are exact',()=>{
 const ix=vaultInstruction('create_launch',a,{budget:100000001n,solFunding:170000000n});
 assert.equal(ix.keys.length,26);assert.ok(ix.programId.equals(VAULT_PROGRAM));assert.ok(ix.keys[0].isSigner);assert.ok(ix.keys[0].pubkey.equals(owner));assert.ok(ix.keys[3].pubkey.equals(USDC));assert.equal(ix.data.readBigUInt64LE(8),100000001n);assert.equal(ix.data.readBigUInt64LE(16),170000000n);
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:PublicKey.default.toBase58(),instructions:[ix]}).compileToV0Message());assert.ok(tx.serialize().length<=1232);
 assert.throws(()=>vaultInstruction('withdraw',a));
});
test('vault decoder rejects wrong program, mint, pool and truncation',()=>{
 const d=Buffer.alloc(171);discriminator('account:LaunchVault').copy(d);owner.toBuffer().copy(d,8);mint.toBuffer().copy(d,40);a.pool.toBuffer().copy(d,72);d[105]=1;d.writeBigUInt64LE(50n,131);
 const info={owner:VAULT_PROGRAM,data:d};assert.equal(decodeVault(info,a).initialLiquidityQuote,'50');assert.equal(decodeVault(info,a).ready,true);
 assert.throws(()=>decodeVault({...info,owner:CPMM_PROGRAM},a));assert.throws(()=>decodeVault({...info,data:d.subarray(0,170)},a));assert.throws(()=>decodeVault(info,{...a,mint:USDC}));
});
test('fee config reads actual creation fee and rejects changed creator fees',()=>{
 const d=Buffer.alloc(CpmmConfigInfoLayout.span);discriminator('account:AmmConfig').copy(d);d.writeBigUInt64LE(2500n,12);d.writeBigUInt64LE(150000000n,36);d.writeBigUInt64LE(12500n,108);d.writeBigUInt64LE(50000n,116);
 const info={owner:CPMM_PROGRAM,data:d};assert.equal(verifyCpConfig(info).createPoolLamports,'150000000');assert.equal(verifyCpConfig(info).creatorFeeShareRate,'50000');d.writeBigUInt64LE(0n,108);assert.throws(()=>verifyCpConfig(info));assert.equal(CpmmPoolInfoLayout.span,637);
});
test('vault workflow cannot start on a wrong network even if flag is enabled',async()=>{const store=createStore(':memory:');try{const chain=createVaultChain(store,{SOLANA_NETWORK:'devnet',ENABLE_TOKEN_MINTING:'true'});const status=await chain.status();assert.equal(status.mintPreparationReady,false);assert.match(status.issue,/mainnet/);await assert.rejects(chain.prepare({id:'1'},'https://example.com',{devBuyUsdc:'100'}),/mainnet/)}finally{store.close()}});
