import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {ALL_PROGRAM_ID,getPdaPlatformVault,getPdaLaunchpadPoolId,getPdaLaunchpadVaultId} from '@raydium-io/raydium-sdk-v2';
import {TREASURY,USDC,ata,discriminator} from './vault-abi.js';

export const PROGRAM=ALL_PROGRAM_ID.LAUNCHPAD_PROGRAM;
export const PLATFORM=new PublicKey('GobSXmdvJMVk67KVwkyqGpoMEq6b6SoNrd7NwNW7iwM8');
export const SHARED=getPdaPlatformVault(PROGRAM,PLATFORM,USDC).publicKey;
const destination=ata(USDC,TREASURY);
const swapTags=new Set(['buy_exact_in','buy_exact_out','sell_exact_in','sell_exact_out'].map(name=>discriminator('global:'+name).toString('hex')));
const claimTag=shared=>discriminator('global:claim_platform_fee'+(shared?'_from_vault':'')).toString('hex');
const tag=ix=>Buffer.from(bs58.decode(ix.data)).subarray(0,8).toString('hex');
function delta(tx,account){
  const index=tx.transaction.message.accountKeys.findIndex(k=>k.pubkey.equals(account));
  const amount=balances=>{
    const row=balances?.find(b=>b.accountIndex===index);
    if(!row)return 0n;
    assert.equal(row.mint,USDC.toBase58(),'Receipt must be Circle USDC');
    return BigInt(row.uiTokenAmount.amount);
  };
  assert(tx.meta && !tx.meta.err,'Failed or unavailable transaction');
  return amount(tx.meta.postTokenBalances)-amount(tx.meta.preTokenBalances);
}
const rpcOptions={commitment:'finalized',maxSupportedTransactionVersion:0};
async function read(rpc,sig){
  const tx=await rpc.getParsedTransaction(sig,rpcOptions);
  assert(tx?.meta,'Finalized transaction history unavailable');
  return tx;
}
function transfers(tx,index){
  return (tx.meta.innerInstructions?.find(group=>group.index===index)?.instructions||[])
    .filter(ix=>ix.programId.equals(TOKEN_PROGRAM_ID) && ['transfer','transferChecked'].includes(ix.parsed?.type))
    .map(ix=>ix.parsed.info);
}
const units=t=>BigInt(t.amount??t.tokenAmount.amount);

// Accept deposits only when the entire shared-vault delta is explained by decoded swaps.
// Nonstandard instructions and ambiguous history stop allocation for the claim.
export function sharedDeposit(tx,curve){
  const increase=delta(tx,SHARED);
  assert(increase>=0n,'Unexpected earlier withdrawal in claim interval');
  if(increase===0n)return {total:0n,attributed:0n};
  let total=0n,attributed=0n;
  for(const [i,outer] of tx.transaction.message.instructions.entries()){
    const inner=tx.meta.innerInstructions?.find(g=>g.index===i)?.instructions||[];
    const stack=[outer];
    for(const ix of inner){
      const depth=ix.stackHeight;
      assert(Number.isInteger(depth)&&depth>=2,'RPC lacks CPI stack heights');
      stack.length=depth-1;
      const parent=stack[depth-2];
      if(ix.programId.equals(TOKEN_PROGRAM_ID)&&['transfer','transferChecked'].includes(ix.parsed?.type)&&ix.parsed.info.destination===SHARED.toBase58()){
        assert(parent?.programId.equals(PROGRAM)&&swapTags.has(tag(parent)),'Unattributed shared-vault transfer');
        assert(parent.accounts.some(a=>a.equals(PLATFORM)),'Wrong swap platform');
        const gross=units(ix.parsed.info);total+=gross;
        if(parent.accounts.some(a=>a.equals(curve)))attributed+=gross;
      }
      stack.push(ix);
    }
  }
  assert.equal(total,increase,'Deposits do not reconcile to shared-vault balance');
  return {total,attributed};
}
export async function finalizedAllocation(rpc,mint,signature){
  assert.equal(bs58.decode(signature).length,64,'Invalid claim signature');
  const curve=getPdaLaunchpadPoolId(PROGRAM,mint,USDC).publicKey;
  const curveVault=getPdaLaunchpadVaultId(PROGRAM,curve,USDC).publicKey;
  const tx=await read(rpc,signature);
  const claims=tx.transaction.message.instructions.map((ix,index)=>({ix,index})).filter(({ix})=>
    ix.programId.equals(PROGRAM)&&[claimTag(false),claimTag(true)].includes(tag(ix)));
  assert.equal(claims.length,1,'Expected one top-level Raydium platform claim');
  const {ix,index}=claims[0],shared=tag(ix)===claimTag(true),source=shared?SHARED:curveVault;
  assert(ix.accounts[0].equals(TREASURY)&&ix.accounts.some(a=>a.equals(PLATFORM)),'Unexpected claim authority or platform');
  if(!shared)assert(ix.accounts.some(a=>a.equals(curve)),'Claim belongs to another mint');
  const credits=transfers(tx,index).filter(t=>t.source===source.toBase58()&&t.destination===destination.toBase58());
  assert.equal(credits.length,1,'Missing exact USDC claim transfer');
  const received=units(credits[0]);
  assert(received>0n && delta(tx,destination)===received && delta(tx,source)===-received,'Claim balance mismatch');
  let gross=received;
  if(shared){
    const idx=tx.transaction.message.accountKeys.findIndex(k=>k.pubkey.equals(SHARED));
    assert(tx.meta.postTokenBalances.some(b=>b.accountIndex===idx&&b.uiTokenAmount.amount==='0'),'Partial shared withdrawal requires separate reconciliation');
    let before=signature,remaining=received;gross=0n;
    while(remaining>0n){
      const page=await rpc.getSignaturesForAddress(SHARED,{before,limit:100},'finalized');
      assert(page.length,'Incomplete shared-vault history');
      for(const row of page){
        before=row.signature;
        if(row.err)continue;
        const entry=sharedDeposit(await read(rpc,row.signature),curve);
        remaining-=entry.total;gross+=entry.attributed;
        assert(remaining>=0n,'Shared-vault history exceeds claim');
        if(remaining===0n)break;
      }
    }
  }
  assert(gross>=2n,'No attributable fee budget for this mint');
  return {gross,receipt:createHash('sha256').update(bs58.decode(signature)).digest(),curve};
}
