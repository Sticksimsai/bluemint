// Local-validator integration over the mature CPMM fixture from test:integration.
import assert from 'node:assert/strict';
import {cpSync,mkdirSync,readFileSync,writeFileSync,rmSync,createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {Connection,Keypair,SystemProgram,PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {LaunchpadPool,PlatformConfig,getPdaLaunchpadPoolId} from '@raydium-io/raydium-sdk-v2';
import {PROGRAM,PLATFORM} from '../../server/launchlab-receipts.js';
import {buildTx,allocateIx,reinvestInstructions} from '../../server/launchlab-buybacks.js';
import {VAULT_PROGRAM,CPMM_PROGRAM,CP_CONFIG,USDC,TREASURY,discriminator,vaultAddresses} from '../../server/vault-abi.js';

const dir='research/buyback-test-'+Date.now(),fixtures=dir+'/accounts';
mkdirSync(dir,{recursive:true});cpSync('research/mature-fixtures',fixtures,{recursive:true});
const load=key=>JSON.parse(readFileSync(fixtures+'/'+key+'.json'));
const bytes=k=>Buffer.from(load(k).account.data[0],'base64');
const save=(key,data,owner,lamports=100000000)=>writeFileSync(fixtures+'/'+key+'.json',JSON.stringify({pubkey:key.toString(),account:{data:[data.toString('base64'),'base64'],executable:false,owner:owner.toString(),lamports,rentEpoch:0}}));
const config=new PublicKey('8gj14w8vkNZjJTPak6e96Uf1sY438WKheH4s5dHyxiRw');
const owner=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync('research/fixtures/local-payer.json'))));
const manifest=JSON.parse(readFileSync('research/mature-manifest.json')),a=vaultAddresses(manifest.mint,TREASURY),b=vaultAddresses(manifest.refundMint,TREASURY);
const curve=m=>getPdaLaunchpadPoolId(PROGRAM,m,USDC).publicKey;
const set=(data,offset,key)=>key.toBuffer().copy(data,offset);
function makeCurve(m,graduated){
 const d=Buffer.alloc(LaunchpadPool.span);discriminator('account:PoolState').copy(d);
 for(const [field,key] of Object.entries({mintA:m,mintB:USDC,configId:config,platformId:PLATFORM}))set(d,LaunchpadPool.offsetOf(field),key);
 d[17]=graduated?2:0;d[20]=1;save(curve(m),d,PROGRAM);
}
makeCurve(a.mint,true);makeCurve(b.mint,false);
const platform=Buffer.alloc(PlatformConfig.span);discriminator('account:PlatformConfig').copy(platform);set(platform,688,CP_CONFIG);save(PLATFORM,platform,PROGRAM);
save(TREASURY,Buffer.alloc(0),SystemProgram.programId,10e9);
function treasuryAta(target,source,amount){
 const d=bytes(source);set(d,32,TREASURY);d.writeBigUInt64LE(amount,64);save(target,d,TOKEN_PROGRAM_ID);
}
treasuryAta(a.treasuryQuote,vaultAddresses(a.mint,owner.publicKey).ownerQuote,100000000n);
treasuryAta(a.ownerTokens,vaultAddresses(a.mint,owner.publicKey).ownerTokens,0n);
const state=bytes(a.launch);set(state,8,TREASURY);state.writeBigUInt64LE(0n,131);save(a.launch,state,VAULT_PROGRAM);
rmSync(fixtures+'/'+b.launch+'.json');
const oracle=bytes(a.observation),now=BigInt(Math.floor(Date.now()/1000));oracle.writeBigUInt64LE(now-900n,43);oracle.writeBigUInt64LE(now,83);oracle.writeBigUInt64LE(now,4043);save(a.observation,oracle,CPMM_PROGRAM);
const validator=spawn(process.env.SOLANA_VALIDATOR_PATH||'solana-test-validator',['--mint',owner.publicKey.toString(),'--ledger',dir+'/ledger','--rpc-port','18899','--bind-address','127.0.0.1','--quiet','--bpf-program',VAULT_PROGRAM.toString(),process.env.VAULT_BINARY||'deploy/bluemint_vault.so','--bpf-program',CPMM_PROGRAM.toString(),'research/fixtures/cpmm.so','--account-dir',fixtures],{stdio:['ignore','pipe','pipe']});
const log=createWriteStream(dir+'/validator.log');validator.stdout.pipe(log);validator.stderr.pipe(log);let spawnError;validator.on('error',e=>spawnError=e);
try{
 const rpc=new Connection('http://127.0.0.1:18899','confirmed');
 let ready=false;
 for(let n=0;n<40;n++){if(spawnError)throw spawnError;if(validator.exitCode!==null)throw Error('Validator exited; see '+dir);try{await rpc.getVersion();ready=true;break}catch{await new Promise(r=>setTimeout(r,800))}}
 assert(ready);assert.notEqual(await rpc.getGenesisHash(),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
 const sim=async(payer,ix,accounts=[])=>{
   const {tx}=await buildTx(rpc,owner.publicKey,ix);tx.sign([owner]);
   const first=await rpc.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed'});if(first.value.err) return first.value;
   return (await rpc.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:accounts.map(String)}})).value;
 };
 assert((await rpc.getBalance(TREASURY))>0,'Treasury fixture missing');
 while(await rpc.getSlot('confirmed')<5)await new Promise(r=>setTimeout(r,400));
 const fund=allocateIx(b.mint,{gross:10000000n,receipt:Buffer.alloc(32,7),curve:curve(b.mint)});
 const funding=await sim(TREASURY,[fund],[b.launch,b.treasuryQuote]);assert.equal(funding.err,null,JSON.stringify(funding.logs));
 const read=(s,i,o)=>Buffer.from(s.accounts[i].data[0],'base64').readBigUInt64LE(o);
 assert.equal(read(funding,0,139),6000000n);assert.equal(read(funding,0,155),4000000n);assert.equal(read(funding,1,64),94000000n);
 assert((await sim(TREASURY,[fund,fund])).err,'Duplicate receipt must roll back');
 const ix=reinvestInstructions(a.mint,CP_CONFIG,owner.publicKey);
 const after=await sim(owner.publicKey,ix,[a.launch,a.lpVault]);assert.equal(after.err,null,JSON.stringify(after.logs));
 assert(read(after,0,139)<state.readBigUInt64LE(139));assert(read(after,1,64)>bytes(a.lpVault).readBigUInt64LE(64));
 ix.at(-1).keys.at(-2).pubkey=curve(b.mint);assert((await sim(owner.publicKey,ix)).err,'Substituted curve must fail');
 console.log('PASS: 40/60 funding, duplicate rollback, atomic swap and LP mint, pending budget reduced, substituted curve rejected.');
}finally{validator.kill('SIGTERM');setTimeout(()=>validator.kill('SIGKILL'),3000).unref()}
