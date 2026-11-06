// Must run only against an isolated validator seeded by prepare-local-fixtures.mjs.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync}from'node:fs';
import {Connection,Keypair,SystemProgram,Transaction,sendAndConfirmTransaction,ComputeBudgetProgram}from'@solana/web3.js';
import {createMint,getOrCreateAssociatedTokenAccount,mintTo,setAuthority,AuthorityType,getAccount}from'@solana/spl-token';
import {vaultAddresses,vaultInstruction,decodeVault,USDC,TREASURY,CP_CONFIG,POOL_FEE}from'../../server/vault-abi.js';
const url=process.env.LOCAL_RPC_URL||'http://127.0.0.1:8899';assert.match(url,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const rpc=new Connection(url,'confirmed');const genesis=await rpc.getGenesisHash();assert.notEqual(genesis,'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');assert.notEqual(genesis,'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const owner=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('research/fixtures/local-payer.json'))));
const sig=await rpc.requestAirdrop(owner.publicKey,10e9);await rpc.confirmTransaction(sig);
const mint=await createMint(rpc,owner,owner.publicKey,null,6),a=vaultAddresses(mint,owner.publicKey);
const ownerToken=await getOrCreateAssociatedTokenAccount(rpc,owner,mint,owner.publicKey);
const ownerQuote=await getOrCreateAssociatedTokenAccount(rpc,owner,USDC,owner.publicKey);
await getOrCreateAssociatedTokenAccount(rpc,owner,USDC,TREASURY);
await mintTo(rpc,owner,mint,ownerToken.address,owner,1000000000000000n);
await mintTo(rpc,owner,USDC,ownerQuote.address,owner,1000000000n);
await setAuthority(rpc,owner,mint,owner,AuthorityType.MintTokens,null);
const send=ix=>sendAndConfirmTransaction(rpc,new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({units:1000000}),ix),[owner],{commitment:'confirmed'});
await send(vaultInstruction('create_launch',a,{budget:100000000n,solFunding:200000000n}));
let state=decodeVault(await rpc.getAccountInfo(a.launch),a);assert.equal(state.initialLiquidityQuote,'50000000');assert.equal(state.pendingBuy,'50000000');assert.equal((await getAccount(rpc,a.quoteVault)).amount,50000000n);assert.equal((await getAccount(rpc,a.ownerTokens)).amount,0n);
await new Promise(r=>setTimeout(r,1800));
await send(vaultInstruction('finish_buy',a));state=decodeVault(await rpc.getAccountInfo(a.launch),a);assert.equal(state.ready,true);assert.equal(state.pendingBuy,'0');assert.ok((await getAccount(rpc,a.ownerTokens)).amount>0n);assert.ok((await getAccount(rpc,a.lpVault)).amount>0n);
await assert.rejects(send(vaultInstruction('finish_buy',a)));
const wrongTreasury=vaultInstruction('collect_fees',a);wrongTreasury.keys[10].pubkey=a.ownerQuote;
await assert.rejects(send(wrongTreasury),e=>String(e).includes('ConstraintTokenOwner'));
const wrongPool=vaultInstruction('collect_fees',a);wrongPool.keys[17].pubkey=mint;await assert.rejects(send(wrongPool));
await assert.rejects(send(vaultInstruction('refund_expired_buy',a)));
await send(vaultInstruction('collect_fees',a));state=decodeVault(await rpc.getAccountInfo(a.launch),a);assert.ok(BigInt(state.netFees)>0n);assert.equal(BigInt(state.treasuryPaid),BigInt(state.netFees)*40n/100n);assert.equal(BigInt(state.pendingQuote)+BigInt(state.treasuryPaid),BigInt(state.netFees));
await assert.rejects(send(vaultInstruction('reinvest',a))); // no 15-minute oracle history yet
console.log(JSON.stringify({result:'passed',checks:['pool creation','50/50 allocation','initial buy','duplicate buy rejected','LP custody','fee conservation','premature reinvestment rejected','treasury substitution rejected','pool substitution rejected','early refund rejected'],mint:mint.toBase58(),pool:a.pool.toBase58()}));

// Snapshot the verified pool into a second isolated genesis to exercise a mature
// oracle window and an expired buy without waiting 15 wall-clock minutes.
const mint2=await createMint(rpc,owner,owner.publicKey,null,6),b=vaultAddresses(mint2,owner.publicKey);
await getOrCreateAssociatedTokenAccount(rpc,owner,mint2,owner.publicKey);await mintTo(rpc,owner,mint2,b.ownerTokens,owner,1000000000000000n);await setAuthority(rpc,owner,mint2,owner,AuthorityType.MintTokens,null);
await send(vaultInstruction('create_launch',b,{budget:100000000n,solFunding:200000000n}));
const unique=[...new Map([...Object.values(a),...Object.values(b),USDC,CP_CONFIG,POOL_FEE].filter(k=>k?.toBase58).map(k=>[k.toBase58(),k])).values()];
const accounts=await rpc.getMultipleAccountsInfo(unique);const now=Math.floor(Date.now()/1000);const pool=accounts[unique.findIndex(k=>k.equals(a.pool))].data;
const v0=await getAccount(rpc,a.vault0),v1=await getAccount(rpc,a.vault1);
const net=(n,offsets)=>offsets.reduce((v,o)=>v-pool.readBigUInt64LE(o),n);const r0=net(v0.amount,[341,357,397]),r1=net(v1.amount,[349,365,405]);
const dir='research/mature-fixtures';mkdirSync(dir,{recursive:true});
for(let i=0;i<unique.length;i++){const account=accounts[i];if(!account||account.executable)continue;const key=unique[i],data=Buffer.from(account.data);
 if(key.equals(a.observation)){data.fill(0,43,4043);data[8]=1;data.writeUInt16LE(1,9);data.writeBigUInt64LE(BigInt(now-900),43);data.writeBigUInt64LE(BigInt(now),83);const write128=(n,o)=>{data.writeBigUInt64LE(n&((1n<<64n)-1n),o);data.writeBigUInt64LE(n>>64n,o+8)};write128(((r1<<32n)/r0)*900n,91);write128(((r0<<32n)/r1)*900n,107);data.writeBigUInt64LE(BigInt(now),4043)}
 if(key.equals(b.launch))data.writeBigInt64LE(BigInt(now-1),123);
 writeFileSync(dir+'/'+key.toBase58()+'.json',JSON.stringify({pubkey:key.toBase58(),account:{lamports:account.lamports,data:[data.toString('base64'),'base64'],owner:account.owner.toBase58(),executable:false,rentEpoch:0}}));
}
writeFileSync('research/mature-manifest.json',JSON.stringify({mint:mint.toBase58(),refundMint:mint2.toBase58()}));
