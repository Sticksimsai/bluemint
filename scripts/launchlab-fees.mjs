// Run on the treasury operator's machine. Default operation is unsigned simulation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Connection,Keypair,PublicKey,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,createAssociatedTokenAccountIdempotentInstruction} from '@solana/spl-token';
import {claimPlatformFeeFromVault,getPdaPlatformFeeVaultAuth,claimPlatformFee,getPdaLaunchpadAuth,getPdaLaunchpadPoolId,getPdaLaunchpadVaultId} from '@raydium-io/raydium-sdk-v2';
import {PROGRAM,PLATFORM,SHARED,finalizedAllocation} from '../server/launchlab-receipts.js';
import {allocateIx,buildTx,verifyProgram} from '../server/launchlab-buybacks.js';
import {USDC,TREASURY,ata} from '../server/vault-abi.js';
import {NETWORKS,verifyGenesis} from '../server/network.js';

async function main(){
  const [action,...args]=process.argv.slice(2),broadcast=args.at(-1)==='--broadcast';
  if(broadcast)args.pop();
  assert((action==='claim-shared'&&args.length===0)||(action==='claim-pool'&&args.length===1)||(action==='allocate'&&args.length===2),'Usage: claim-shared | claim-pool MINT | allocate MINT FINALIZED_CLAIM_SIGNATURE [--broadcast]');
  const rpc=new Connection(process.env.BLUEMINT_RPC_URL,'confirmed');
  verifyGenesis(await rpc.getGenesisHash(),NETWORKS.mainnet);
  const treasuryAta=ata(USDC,TREASURY),mint=args.length?new PublicKey(args[0]):null;
  const instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:500000})];
  if(action==='allocate'){
    await verifyProgram(rpc);
    const receipt=await finalizedAllocation(rpc,mint,args[1]);
    console.log('Mint:',mint.toString(),'Gross USDC base units:',receipt.gross.toString(),'Retain:',String(receipt.gross*40n/100n),'Allocate:',String(receipt.gross-receipt.gross*40n/100n));
    instructions.push(allocateIx(mint,receipt));
  }else{
    instructions.push(createAssociatedTokenAccountIdempotentInstruction(TREASURY,treasuryAta,TREASURY,USDC));
    if(action==='claim-shared'){
      instructions.push(claimPlatformFeeFromVault(PROGRAM,PLATFORM,TREASURY,getPdaPlatformFeeVaultAuth(PROGRAM).publicKey,SHARED,treasuryAta,USDC,TOKEN_PROGRAM_ID));
    }else{
      const curve=getPdaLaunchpadPoolId(PROGRAM,mint,USDC).publicKey;
      instructions.push(claimPlatformFee(PROGRAM,TREASURY,getPdaLaunchpadAuth(PROGRAM).publicKey,curve,PLATFORM,getPdaLaunchpadVaultId(PROGRAM,curve,USDC).publicKey,treasuryAta,USDC,TOKEN_PROGRAM_ID));
    }
  }
  const {tx,block}=await buildTx(rpc,TREASURY,instructions);
  if(broadcast){
    const key=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.env.LOCAL_TREASURY_KEYPAIR))));
    assert(key.publicKey.equals(TREASURY),'Expected platform claim authority');tx.sign([key]);
  }
  const sim=await rpc.simulateTransaction(tx,{sigVerify:broadcast});
  assert(!sim.value.err,'Simulation rejected: '+JSON.stringify(sim.value.err));
  if(!broadcast){console.log('Simulation passed. No transaction submitted.');return}
  const signature=await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});
  console.log('Submitted:',signature);
  const result=await rpc.confirmTransaction({signature,...block},'finalized');
  assert(!result.value.err,'Finalized execution failed');console.log('Finalized:',signature);
}
main().catch(e=>{console.error(String(e.message).replace(/https?:\/\/[^\s]+/g,'[endpoint]'));process.exitCode=1});
