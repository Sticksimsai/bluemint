import {randomBytes} from 'node:crypto';
import {Connection,TransactionMessage,VersionedTransaction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction} from '@solana/spl-token';
import {PlatformConfig,claimPlatformFeeFromVault,getPdaPlatformFeeVaultAuth} from '@raydium-io/raydium-sdk-v2';
import bs58 from 'bs58';
import {validateClaimRelay,verifyClaimGuards} from './claim-relay.js';
import {decodeAccount} from './chain.js';
import {assert} from './domain.js';
import {NETWORKS,verifyGenesis} from './network.js';
import {PROGRAM,PLATFORM,SHARED} from './launchlab-receipts.js';
import {USDC,TREASURY,ata} from './vault-abi.js';

export function createPlatformFees(store,env,connection){
 const rpc=connection||new Connection(env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com','confirmed');
 const db=store.db;
 db.exec('CREATE TABLE IF NOT EXISTS platform_fee_claims(id TEXT PRIMARY KEY, message TEXT, transaction_bytes TEXT, signature TEXT, last_height INTEGER, status TEXT, created_at INTEGER)');
 const busy=new Set();
 async function inspect(){
  assert(env.SOLANA_NETWORK==='mainnet','Platform fee claims require mainnet',503);
  verifyGenesis(await rpc.getGenesisHash(),NETWORKS.mainnet);
  const {context,value:[platform,account]}=await rpc.getMultipleAccountsInfoAndContext([PLATFORM,SHARED],{commitment:'finalized'});
  const p=decodeAccount(platform,PlatformConfig,'PlatformConfig',PROGRAM);
  assert(p.platformClaimFeeWallet.equals(TREASURY),'Platform fee wallet changed',503);
  let units='0';
  if(account){
   assert(account.owner.equals(TOKEN_PROGRAM_ID)&&account.data.length===165,'Invalid fee vault',503);
   assert(account.data.subarray(0,32).equals(USDC.toBuffer())&&account.data.subarray(32,64).equals(getPdaPlatformFeeVaultAuth(PROGRAM).publicKey.toBuffer()),'Unexpected vault mint or authority',503);
   units=account.data.readBigUInt64LE(64).toString();
  }
  return {units,slot:context.slot,quoteMint:USDC.toString(),claimWallet:TREASURY.toString(),vault:SHARED.toString(),scope:'all_platform_tokens',creatorFeeBps:0};
 }
 async function current(){
  const row=db.prepare("SELECT * FROM platform_fee_claims WHERE status='submitted' ORDER BY created_at DESC LIMIT 1").get();
  if(!row)return null;
  const {value:[s]}=await rpc.getSignatureStatuses([row.signature],{searchTransactionHistory:true});
  if(s?.err)db.prepare("UPDATE platform_fee_claims SET status='failed' WHERE id=?").run(row.id);
  else if(s?.confirmationStatus==='finalized')db.prepare("UPDATE platform_fee_claims SET status='finalized' WHERE id=?").run(row.id);
  else if(!s&&await rpc.getBlockHeight('finalized')>row.last_height)db.prepare("UPDATE platform_fee_claims SET status='expired' WHERE id=?").run(row.id);
  return {id:row.id,signature:row.signature,status:db.prepare('SELECT status FROM platform_fee_claims WHERE id=?').get(row.id).status};
 }
 function owner(wallet){assert(wallet===TREASURY.toString(),'Connect the BlueMint fee wallet to claim',403)}
 return {
 async get(){return {...await inspect(),claim:await current()}},
 async prepare(wallet){
  owner(wallet);const state=await inspect(),pending=await current();
  assert(!pending||pending.status!=='submitted','A claim is awaiting finality',409);
  assert(BigInt(state.units)>0n,'No USDC platform fees available',409);
  const dest=ata(USDC,TREASURY),block=await rpc.getLatestBlockhash('confirmed');
  const tx=new VersionedTransaction(new TransactionMessage({payerKey:TREASURY,recentBlockhash:block.blockhash,instructions:[
   createAssociatedTokenAccountIdempotentInstruction(TREASURY,dest,TREASURY,USDC),
   claimPlatformFeeFromVault(PROGRAM,PLATFORM,TREASURY,getPdaPlatformFeeVaultAuth(PROGRAM).publicKey,SHARED,dest,USDC,TOKEN_PROGRAM_ID)
  ]}).compileToV0Message());
  const sim=await rpc.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed'});
  assert(!sim.value.err,'Claim simulation failed. Check the fee wallet’s SOL balance.',422);
  const id=randomBytes(20).toString('hex'),wire=Buffer.from(tx.serialize()).toString('base64');
  db.prepare('INSERT INTO platform_fee_claims VALUES(?,?,?,?,?,?,?)').run(id,Buffer.from(tx.message.serialize()).toString('base64'),wire,null,block.lastValidBlockHeight,'prepared',Date.now());
  return {id,transaction:wire,...state};
 },
 async submit(wallet,id,wire){
  owner(wallet);
  assert(!busy.has('treasury'),'Claim submission in progress',409);busy.add('treasury');
  try{
   const row=db.prepare('SELECT * FROM platform_fee_claims WHERE id=?').get(id);assert(row,'Claim preparation missing',404);
   if(row.signature)return {signature:row.signature,status:row.status};
   const pending=await current();assert(!pending||pending.status!=='submitted','A claim is awaiting finality',409);
   await inspect();assert(await rpc.getBlockHeight('confirmed')<=row.last_height,'Claim expired. Prepare again.',409);
   const tx=validateClaimRelay(wire,row.message,wallet);
   await verifyClaimGuards(rpc,tx);
   const sim=await rpc.simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});
   assert(!sim.value.err,'Signed claim simulation failed',422);
   const signature=bs58.encode(tx.signatures[0]);
   // Preserve signed bytes before relay so a timeout can be reconciled.
   db.prepare("UPDATE platform_fee_claims SET signature=?,transaction_bytes=?,status='submitted' WHERE id=?").run(signature,wire,id);
   await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
   return {signature,status:'submitted'};
  }finally{busy.delete('treasury')}
 }
 };
}
