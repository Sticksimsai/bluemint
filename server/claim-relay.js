import {VersionedMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {assert,AppError} from './domain.js';

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
 const budget=ComputeBudgetProgram.programId.toString();
 const keys=m=>m.staticAccountKeys.map((k,i)=>({key:k.toString(),signer:m.isAccountSigner(i),writable:m.isAccountWritable(i)})).filter(k=>k.key!==budget).sort((a,b)=>a.key.localeCompare(b.key));
 assert(JSON.stringify(keys(message))===JSON.stringify(keys(expected)),'Wallet changed claim accounts or permissions');
 function core(m,checkBudget){
  let limit=200000,price=0n;const seen=new Set(),instructions=[];
  for(const ix of m.compiledInstructions){
   const program=m.staticAccountKeys[ix.programIdIndex].toString(),data=Buffer.from(ix.data);
   if(program===budget){
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
