// Run from the repo. Write only to the existing, verified upgradeable-loader buffer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {Connection,PublicKey,Keypair,VersionedTransaction,Transaction,TransactionInstruction,ComputeBudgetProgram} from '@solana/web3.js';

const loader=new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const buffer=new PublicKey('Hi96Cjh1CUZfYTtuaTDcyzuy7BTPJEXVBxTyQjSup3iv');
const authority=new PublicKey('CQ23NqV5JmBrxu3R8jrzpNEa1xbbX9criJXFC93YwuMC');
const program=new PublicKey('9YKKi1RQgT8uco9Cecj849btWboxQ2qxYA4GXmYGHLkE');
const hash=data=>createHash('sha256').update(data).digest('hex');
async function main(){
 const write=process.argv[2]==='--write';
 assert(process.argv.length===(write?3:2),'Usage: node scripts/resume-buyback-upload.mjs [--write]');
 const rpc=new Connection(process.env.BLUEMINT_RPC_URL||'https://api.mainnet-beta.solana.com','confirmed');
 const target=readFileSync(new URL('../releases/launchlab-buybacks/bluemint_vault.so',import.meta.url));
 assert.equal(hash(target),'4a4087abd8b0a0af188fd8737374b8e2a1e9e95f9af97901093a1353d2fce645');
 assert.equal(await rpc.getGenesisHash(),'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
 async function payload(minContextSlot=0){
  const {value:[b,p]}=await rpc.getMultipleAccountsInfoAndContext([buffer,program],{commitment:'finalized',minContextSlot});
  assert(!p,'Program already exists; inspect deployment');
  assert(b?.owner.equals(loader)&&!b.executable&&b.data.length===37+target.length,'Expected funded buffer missing or wrong size on this RPC');
  assert(b.data.readUInt32LE()===1 && b.data[4]===1 && b.data.subarray(5,37).equals(authority.toBuffer()),'Buffer authority mismatch');
  return b.data.subarray(37);
 }
 const existing=await payload(), offsets=[];
 for(let i=0;i<target.length;i+=900)if(!existing.subarray(i,i+900).equals(target.subarray(i,i+900)))offsets.push(i);
 console.log(offsets.length,'chunks need writing.');
 if(!offsets.length){console.log('Finalized buffer matches release.');return}
 async function prepare(offset){
  const bytes=target.subarray(offset,offset+900),header=Buffer.alloc(16);
  header.writeUInt32LE(1);header.writeUInt32LE(offset,4);header.writeBigUInt64LE(BigInt(bytes.length),8);
  const ix=new TransactionInstruction({programId:loader,keys:[{pubkey:buffer,isSigner:false,isWritable:true},{pubkey:authority,isSigner:true,isWritable:false}],data:Buffer.concat([header,bytes])});
  const block=await rpc.getLatestBlockhash('confirmed');
  const tx=new Transaction({feePayer:authority,blockhash:block.blockhash,lastValidBlockHeight:block.lastValidBlockHeight}).add(ComputeBudgetProgram.setComputeUnitLimit({units:10000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:10000}),ix);
  return {tx,block};
 }
 const first=await prepare(offsets[0]);
 const simulation=await rpc.simulateTransaction(new VersionedTransaction(first.tx.compileMessage()),{sigVerify:false,commitment:'confirmed'});
 assert(!simulation.value.err,'Write simulation failed: '+JSON.stringify(simulation.value.err));
 console.log('First remaining write simulated successfully.');
 if(!write)return;
 const key=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(join(homedir(),'Downloads/bluemint-mainnet-setup/private/deployer.json')))));
 assert(key.publicKey.equals(authority),'Local signer mismatch');
 let slot=0;
 for(const [index,offset] of offsets.entries()){
  const {tx,block}=await prepare(offset);
  tx.sign(key);const sig=await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,preflightCommitment:'confirmed',maxRetries:4});
  for(;;){
   const {value:[status]}=await rpc.getSignatureStatuses([sig],{searchTransactionHistory:true});
   assert(!status?.err,'Write failed: '+JSON.stringify(status?.err));
   if(['confirmed','finalized'].includes(status?.confirmationStatus)){slot=status.slot;break}
   if(await rpc.getBlockHeight('confirmed')>block.lastValidBlockHeight)throw Error('Write expired. Rerun against the same buffer.');
   await new Promise(r=>setTimeout(r,900));
  }
  if(index===0||(index+1)%10===0)console.log(index+1,'/',offsets.length,'confirmed');
 }
 // Final comparison must observe the last confirmed write at finality.
 for(let i=0;i<90 && await rpc.getSlot('finalized')<slot;i++)await new Promise(r=>setTimeout(r,1000));
 assert((await payload(slot)).equals(target),'Finalized buffer differs; rerun to reconcile');
 console.log('Finalized buffer matches release. Upload complete; program deployment is a separate step.');
}
main().catch(e=>{console.error(String(e.message).replace(/https?:\/\/[^\s]+/g,'[RPC]'));process.exitCode=1});
