import {VersionedMessage,VersionedTransaction,ComputeBudgetProgram,PublicKey} from '@solana/web3.js';
import {assert,AppError} from './domain.js';

export const LIGHTHOUSE=new PublicKey('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');
const LOADER=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
export async function verifyClaimGuards(rpc,tx){
 if(!tx.message.compiledInstructions.some(ix=>tx.message.staticAccountKeys[ix.programIdIndex].equals(LIGHTHOUSE)))return;
 const [dataKey]=PublicKey.findProgramAddressSync([LIGHTHOUSE.toBuffer()],LOADER);
 const [program,data]=await rpc.getMultipleAccountsInfo([LIGHTHOUSE,dataKey],'finalized');
 assert(program?.executable&&program.owner.equals(LOADER)&&program.data.readUInt32LE(0)===2&&program.data.subarray(4,36).equals(dataKey.toBuffer()),'Unexpected wallet guard program');
 assert(data?.owner.equals(LOADER)&&data.data.length>45&&data.data.readUInt32LE(0)===3&&data.data[12]===0,'Wallet guard must be immutable');
}

// A wallet may add bounded compute-budget instructions when estimating a claim.
// Every claim account, privilege, instruction and blockhash must still match.
export function validateClaimRelay(wire,expectedBase64,wallet){
 let tx,expected;
 try{
  assert(typeof wire==='string'&&wire.length<10000,'Invalid signed transaction');
  tx=VersionedTransaction.deserialize(Buffer.from(wire,'base64'));
  expected=VersionedMessage.deserialize(Buffer.from(expectedBase64,'base64'));
 }catch{throw new AppError(400,'Invalid claim transaction')}
 const message=tx.message;
 assert(message.staticAccountKeys[0].toString()===wallet&&expected.staticAccountKeys[0].toString()===wallet,'Wrong claim payer',403);
 assert(!message.addressTableLookups?.length&&!expected.addressTableLookups?.length,'Unexpected claim lookup tables');
 assert(message.recentBlockhash===expected.recentBlockhash,'Wallet changed the claim blockhash. Prepare the claim again.');
 const budget=ComputeBudgetProgram.programId.toString(),guard=LIGHTHOUSE.toString();
 const guardIndex=message.staticAccountKeys.findIndex(k=>k.equals(LIGHTHOUSE));
 if(guardIndex>=0)assert(!message.isAccountSigner(guardIndex)&&!message.isAccountWritable(guardIndex),'Wallet guard program must be read-only');
 const keys=m=>m.staticAccountKeys.map((k,i)=>({key:k.toString(),signer:m.isAccountSigner(i),writable:m.isAccountWritable(i)})).filter(k=>k.key!==budget&&k.key!==guard).sort((a,b)=>a.key.localeCompare(b.key));
 const actualKeys=keys(message),expectedKeys=keys(expected);
 const added=actualKeys.filter(k=>!expectedKeys.some(e=>e.key===k.key));
 const removed=expectedKeys.filter(k=>!actualKeys.some(e=>e.key===k.key));
 const changed=actualKeys.filter(k=>{const e=expectedKeys.find(e=>e.key===k.key);return e&&(e.signer!==k.signer||e.writable!==k.writable)});
 if(added.length||removed.length||changed.length){
  const diff={added,removed,changed:changed.map(k=>({key:k.key,before:expectedKeys.find(e=>e.key===k.key),after:k})),
    programs:message.compiledInstructions.map(ix=>message.staticAccountKeys[ix.programIdIndex].toString())};
  console.warn('claim_wallet_message_difference',JSON.stringify(diff));
  const describe=k=>k.key+' ('+(k.signer?'signer':'non-signer')+', '+(k.writable?'writable':'read-only')+')';
  throw new AppError(400,'Claim blocked. '+[
    added.length?'Added: '+added.map(describe).join(', '):'',
    removed.length?'Removed: '+removed.map(describe).join(', '):'',
    changed.length?'Changed: '+changed.map(describe).join(', '):''
  ].filter(Boolean).join(' · '));
 }
 function core(m,checkBudget){
  let limit=1400000,price=0n,guards=0;const seen=new Set(),instructions=[];
  for(const ix of m.compiledInstructions){
   const program=m.staticAccountKeys[ix.programIdIndex].toString(),data=Buffer.from(ix.data);
   if(program===guard){
    assert(checkBudget&&++guards<=8,'Unexpected wallet guard');
    // Lighthouse Borsh enum 0/1 write or close memory. Permit only the
    // account/clock assertions from the upstream instruction enum (2..16).
    // Merkle CPI assertions and future unknown variants stay blocked.
    assert(data.length>=2&&data[0]>=2&&data[0]<=16,'Unsupported Lighthouse instruction');
   }else if(program===budget){
    assert(ix.accountKeyIndexes.length===0&&checkBudget,'Unexpected compute instruction');
    const kind=data[0];assert(!seen.has(kind),'Duplicate compute instruction');seen.add(kind);
    if(kind===2&&data.length===5){limit=data.readUInt32LE(1);assert(limit>0&&limit<=1400000,'Invalid compute limit')}
    else if(kind===3&&data.length===9){price=data.readBigUInt64LE(1)}
    else throw new AppError(400,'Unsupported wallet compute instruction');
   }else instructions.push({program,accounts:Array.from(ix.accountKeyIndexes,i=>m.staticAccountKeys[i].toString()),data:data.toString('base64')});
  }
  assert((BigInt(limit)*price+999999n)/1000000n<=1000000n,'Wallet priority fee exceeds 0.001 SOL');
  return instructions;
 }
 assert(JSON.stringify(core(message,true))===JSON.stringify(core(expected,false)),'Wallet changed the reviewed claim instructions');
 assert(tx.signatures.every(s=>s.some(b=>b!==0)),'Claim signatures are missing');
 assert(tx.serialize().length<=1232,'Claim transaction too large');
 return tx;
}
