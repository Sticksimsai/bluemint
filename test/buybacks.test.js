import test from 'node:test';
import assert from 'node:assert/strict';
import bs58 from 'bs58';
import {Keypair} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {getPdaLaunchpadPoolId,getPdaLaunchpadVaultId} from '@raydium-io/raydium-sdk-v2';
import {USDC,TREASURY,ata,discriminator} from '../server/vault-abi.js';
import {PROGRAM,PLATFORM,SHARED,sharedDeposit,finalizedAllocation} from '../server/launchlab-receipts.js';
const key=()=>Keypair.generate().publicKey;
const mint=key(),curve=getPdaLaunchpadPoolId(PROGRAM,mint,USDC).publicKey;
const signature=bs58.encode(Buffer.alloc(64,9)),dest=ata(USDC,TREASURY);
const tagged=(name,accounts)=>({programId:PROGRAM,accounts,data:bs58.encode(discriminator('global:'+name))});
const transfer=(src,dst,n,stackHeight=2)=>({programId:TOKEN_PROGRAM_ID,stackHeight,parsed:{type:'transferChecked',info:{source:String(src),destination:String(dst),tokenAmount:{amount:String(n)}}}});
const balances=n=>n.map((v,accountIndex)=>({accountIndex,mint:String(USDC),uiTokenAmount:{amount:String(v)}}));
function tx(keys,ix,inner,pre,post){return {transaction:{message:{accountKeys:keys.map(pubkey=>({pubkey})),instructions:[ix]}},meta:{err:null,innerInstructions:[{index:0,instructions:inner}],preTokenBalances:balances(pre),postTokenBalances:balances(post)}}}
function deposit(pool,n){
  const accounts=Array(11).fill(PROGRAM);accounts[3]=PLATFORM;accounts[4]=pool;accounts[10]=USDC;
 const outer={programId:key()},swap={...tagged('buy_exact_in',accounts),stackHeight:2};
  return tx([SHARED],outer,[swap,transfer(key(),SHARED,n,3)],[0],[n]);
}
test('nested terminal swaps are attributed to their own curve and reconcile to the vault delta',()=>{
  assert.deepEqual(sharedDeposit(deposit(curve,70),curve),{total:70n,attributed:70n});
  assert.equal(sharedDeposit(deposit(key(),30),curve).attributed,0n);
  const appended=deposit(key(),70);appended.meta.innerInstructions[0].instructions[0].accounts.push(curve);assert.equal(sharedDeposit(appended,curve).attributed,0n);
 const spoof=deposit(curve,70);spoof.meta.innerInstructions[0].instructions[0].programId=key();assert.throws(()=>sharedDeposit(spoof,curve));
  const mismatch=deposit(curve,70);mismatch.meta.postTokenBalances=balances([71]);assert.throws(()=>sharedDeposit(mismatch,curve));
});
test('shared claim assigns only this mint’s deposits; unavailable history fails closed',async()=>{
  const claim=tx([SHARED,dest],tagged('claim_platform_fee_from_vault',[TREASURY,PLATFORM]),[transfer(SHARED,dest,100)],[100,0],[0,100]);
  const rpc={getParsedTransaction:async s=>s===signature?claim:s==='a'?deposit(curve,70):deposit(key(),30),getSignaturesForAddress:async()=>[{signature:'a'},{signature:'b'}]};
  assert.equal((await finalizedAllocation(rpc,mint,signature)).gross,70n);
  rpc.getSignaturesForAddress=async()=>[];await assert.rejects(finalizedAllocation(rpc,mint,signature),/Incomplete/);
});
test('pool-specific claims require the exact curve USDC vault and finalized treasury credit',async()=>{
  const vault=getPdaLaunchpadVaultId(PROGRAM,curve,USDC).publicKey;
  const claim=tx([vault,dest],tagged('claim_platform_fee',[TREASURY,key(),curve,PLATFORM]),[transfer(vault,dest,500)],[600,2],[100,502]);
  const rpc={getParsedTransaction:async()=>claim};
  assert.equal((await finalizedAllocation(rpc,mint,signature)).gross,500n);
  await assert.rejects(finalizedAllocation(rpc,key(),signature));
  claim.meta.err={InstructionError:0};await assert.rejects(finalizedAllocation(rpc,mint,signature));
});
