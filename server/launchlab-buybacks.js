import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Connection,PublicKey,Keypair,VersionedTransaction,TransactionMessage,TransactionInstruction,SystemProgram,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction as createAta} from '@solana/spl-token';
import {getPdaLaunchpadPoolId,PlatformConfig} from '@raydium-io/raydium-sdk-v2';
import bs58 from 'bs58';
import {VAULT_PROGRAM,USDC,TREASURY,ata,discriminator,vaultAddresses,vaultInstruction} from './vault-abi.js';
import {decodeAccount} from './chain.js';
import {verifyGenesis,NETWORKS} from './network.js';
import {PLATFORM,PROGRAM} from './launchlab-receipts.js';

const keeperKey=new PublicKey('36Ywh2wwGjPnMe6RSErNF8wLoDuoUWX5j1op6UXShuMK');
const release=JSON.parse(readFileSync(new URL('../contracts/launchlab-buybacks.json',import.meta.url)));
const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
export async function verifyProgram(rpc){
  verifyGenesis(await rpc.getGenesisHash(),NETWORKS.mainnet);
  const [dataKey]=PublicKey.findProgramAddressSync([VAULT_PROGRAM.toBuffer()],loader);
  const [program,data]=await rpc.getMultipleAccountsInfo([VAULT_PROGRAM,dataKey],'finalized');
  assert(program?.executable && program.owner.equals(loader) && program.data.readUInt32LE()===2 && program.data.subarray(4,36).equals(dataKey.toBuffer()),'Buyback program deployment missing');
  assert(data?.owner.equals(loader)&&data.data.readUInt32LE()===3,'Unexpected ProgramData');
  const bytes=data.data.subarray(45,45+release.bytes);
  assert(bytes.length===release.bytes&&createHash('sha256').update(bytes).digest('hex')===release.sha256&&data.data.subarray(45+bytes.length).every(b=>b===0),'Buyback executable does not match tested build');
}
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
export function allocateIx(mint,{gross,curve,receipt}){
  const a=vaultAddresses(mint,TREASURY);
  const [used]=PublicKey.findProgramAddressSync([Buffer.from('fee_receipt'),mint.toBuffer(),receipt],VAULT_PROGRAM);
  const data=Buffer.alloc(48);
  discriminator('global:allocate_launchlab_fees').copy(data);receipt.copy(data,8);data.writeBigUInt64LE(gross,40);
  return new TransactionInstruction({programId:VAULT_PROGRAM,data,keys:[
    meta(TREASURY,true,true),meta(mint),meta(USDC),meta(curve),meta(PLATFORM),meta(used,true),meta(a.launch,true),meta(a.authority),
    meta(a.treasuryQuote,true),meta(a.quoteVault,true),meta(TOKEN_PROGRAM_ID),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId)]});
}
export function reinvestInstructions(mint,config,payer){
  const a=vaultAddresses(mint,TREASURY,config),curve=getPdaLaunchpadPoolId(PROGRAM,mint,USDC).publicKey;
  const ix=vaultInstruction('reinvest',a,{payer});ix.keys.push(meta(curve),meta(PLATFORM));
  return [ComputeBudgetProgram.setComputeUnitLimit({units:700000}),
    createAta(payer,a.ownerTokens,TREASURY,mint),
    createAta(payer,a.tokenVault,a.authority,mint),
    createAta(payer,a.lpVault,a.authority,a.lpMint),ix];
}
export async function buildTx(rpc,payer,instructions){
  const block=await rpc.getLatestBlockhash('confirmed');
  const tx=new VersionedTransaction(new TransactionMessage({payerKey:payer,recentBlockhash:block.blockhash,instructions}).compileToV0Message());
  return {tx,block};
}
export function startBuybacks(store,env){
  if(env.LAUNCH_MODE!=='launchlab'||env.ENABLE_LAUNCHLAB_BUYBACKS!=='true')return;
  const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(env.KEEPER_KEYPAIR_PATH))));
  assert(payer.publicKey.equals(keeperKey),'Expected the separate BlueMint keeper');
  const rpc=new Connection(env.SOLANA_RPC_URL,{commitment:'confirmed',disableRetryOnRateLimit:true});
  const db=store.db;
  db.exec('CREATE TABLE IF NOT EXISTS buyback_submissions(mint TEXT PRIMARY KEY, signature TEXT NOT NULL, wire TEXT NOT NULL, last_height INTEGER NOT NULL)');
  async function tick(){
    await verifyProgram(rpc);
    for(const row of db.prepare('SELECT * FROM buyback_submissions').all()){
      const {value:[status]}=await rpc.getSignatureStatuses([row.signature],{searchTransactionHistory:true});
      if(status?.confirmationStatus==='finalized'||(!status&&await rpc.getBlockHeight('finalized')>row.last_height)){
        db.prepare('DELETE FROM buyback_submissions WHERE signature=?').run(row.signature);
      }else if(!status && await rpc.getBlockHeight('confirmed')<=row.last_height){
        await rpc.sendRawTransaction(Buffer.from(row.wire,'base64'),{skipPreflight:false,maxRetries:2});
      }
    }
    const platform=decodeAccount(await rpc.getAccountInfo(PLATFORM,'finalized'),PlatformConfig,'PlatformConfig',PROGRAM);
    const rows=db.prepare("SELECT l.mint FROM launches l JOIN chain_launches c ON c.launch_id=l.id AND c.mint=l.mint WHERE l.status='live' AND c.network='mainnet' AND c.status='confirmed' AND NOT EXISTS(SELECT 1 FROM buyback_submissions b WHERE b.mint=l.mint)").all();
    for(const row of rows){
      try{
        const mint=new PublicKey(row.mint),a=vaultAddresses(mint,TREASURY,platform.cpConfigId);
        const state=await rpc.getAccountInfo(a.launch,'finalized');
        if(!state?.owner.equals(VAULT_PROGRAM)||state.data.length!==171||state.data.readBigUInt64LE(139)<5000000n)continue;
        const {tx,block}=await buildTx(rpc,payer.publicKey,reinvestInstructions(mint,platform.cpConfigId,payer.publicKey));
        tx.sign([payer]);
        const sim=await rpc.simulateTransaction(tx,{sigVerify:true,commitment:'confirmed',accounts:{encoding:'base64',addresses:[a.launch.toString()]}});
        const result=sim.value.accounts?.[0];
        if(sim.value.err || !result)continue;
        const after=Buffer.from(result.data[0],'base64');
        if(after.readBigUInt64LE(163)-state.data.readBigUInt64LE(163)<5000000n)continue;
        const wire=tx.serialize(),sig=bs58.encode(tx.signatures[0]);
        const inserted=db.prepare('INSERT OR IGNORE INTO buyback_submissions VALUES(?,?,?,?)').run(row.mint,sig,Buffer.from(wire).toString('base64'),block.lastValidBlockHeight);
        if(inserted.changes)await rpc.sendRawTransaction(wire,{skipPreflight:false,maxRetries:2});
      }catch{console.error('Buyback deferred for mint',row.mint)}
    }
  }
  let active=false;
  const status={lastCheck:null,lastSuccessfulCheck:null};
  const run=async()=>{if(active)return;active=true;try{status.lastCheck=new Date().toISOString();await tick();status.lastSuccessfulCheck=status.lastCheck}catch{console.error('Buyback cycle deferred: verify deployment, RPC and keeper funding')}finally{active=false}};
  const timer=setInterval(run,60000);timer.unref();run();
  const stop=()=>clearInterval(timer);stop.status=status;return stop;
}
