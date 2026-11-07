import {createHash} from 'node:crypto';
import {PublicKey,SystemProgram,TransactionInstruction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {assert} from './domain.js';
export const VAULT_PROGRAM=new PublicKey('9YKKi1RQgT8uco9Cecj849btWboxQ2qxYA4GXmYGHLkE');
export const CPMM_PROGRAM=new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
export const CP_CONFIG=new PublicKey('627Jx6eN61TrdgMFSQt1QxvAmYWHXmzVA8M9FsKFtdkX');
export const USDC=new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const TREASURY=new PublicKey('85a8ERAhk1ZPYyGwj4zkjVKZdfqaEUcSpTt9GCz5xA7j');
export const POOL_FEE=new PublicKey('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8');
export const discriminator=name=>createHash('sha256').update(name).digest().subarray(0,8);
const derive=(program,...seeds)=>PublicKey.findProgramAddressSync(seeds.map(s=>typeof s==='string'?Buffer.from(s):s.toBuffer()),program)[0];
export const ata=(mint,owner)=>getAssociatedTokenAddressSync(mint,owner,true);
export function vaultAddresses(mint,owner,config=CP_CONFIG){mint=new PublicKey(mint);owner=new PublicKey(owner);
 const authority=derive(VAULT_PROGRAM,'authority',mint),launch=derive(VAULT_PROGRAM,'launch',mint);
 const [mint0,mint1]=Buffer.compare(mint.toBuffer(),USDC.toBuffer())<0?[mint,USDC]:[USDC,mint];
 const pool=derive(CPMM_PROGRAM,'pool',config,mint0,mint1),lpMint=derive(CPMM_PROGRAM,'pool_lp_mint',pool);
 const cpAuthority=derive(CPMM_PROGRAM,'vault_and_lp_mint_auth_seed');
 const vault0=derive(CPMM_PROGRAM,'pool_vault',pool,mint0),vault1=derive(CPMM_PROGRAM,'pool_vault',pool,mint1);
 const observation=derive(CPMM_PROGRAM,'observation',pool),feeShare=derive(CPMM_PROGRAM,'creator_fee_share',authority,config);
 return {config,mint,owner,authority,launch,mint0,mint1,pool,lpMint,cpAuthority,vault0,vault1,observation,feeShare,ownerTokens:ata(mint,owner),ownerQuote:ata(USDC,owner),tokenVault:ata(mint,authority),quoteVault:ata(USDC,authority),lpVault:ata(lpMint,authority),treasuryQuote:ata(USDC,TREASURY),quoteFirst:mint0.equals(USDC)};
}
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
function remaining(a){return [meta(a.config),meta(a.cpAuthority),meta(a.pool,true),meta(a.mint0),meta(a.mint1),meta(a.lpMint,true),meta(a.vault0,true),meta(a.vault1,true),meta(a.observation,true),meta(POOL_FEE,true),meta(TOKEN_2022_PROGRAM_ID),meta(a.feeShare)];}
export function vaultInstruction(action,a,{payer=a.owner,budget=0n,solFunding=0n}={}){
 assert(['create_launch','finish_buy','refund_expired_buy','collect_fees','reinvest'].includes(action),'Unknown vault instruction');
 const create=action==='create_launch';
 const keys=[meta(payer,true,true),meta(a.launch,true),meta(a.mint),meta(USDC),meta(a.authority,true),meta(a.ownerTokens,true),meta(a.ownerQuote,true),meta(a.tokenVault,true),meta(a.quoteVault,true),meta(a.lpVault,true),...(!create?[meta(a.treasuryQuote,true)]:[]),meta(CPMM_PROGRAM),meta(TOKEN_PROGRAM_ID),meta(ASSOCIATED_TOKEN_PROGRAM_ID),meta(SystemProgram.programId),...remaining(a)];
 const args=create?Buffer.alloc(16):Buffer.alloc(0);if(create){args.writeBigUInt64LE(BigInt(budget));args.writeBigUInt64LE(BigInt(solFunding),8)}
 return new TransactionInstruction({programId:VAULT_PROGRAM,keys,data:Buffer.concat([discriminator('global:'+action),args])});
}
export function decodeVault(info,expected){assert(info?.owner.equals(VAULT_PROGRAM)&&info.data.length===171&&info.data.subarray(0,8).equals(discriminator('account:LaunchVault')),'Invalid launch vault',503);
 const d=info.data,key=o=>new PublicKey(d.subarray(o,o+32)).toBase58();assert(key(8)===expected.owner.toBase58()&&key(40)===expected.mint.toBase58()&&key(72)===expected.pool.toBase58(),'Vault identity mismatch',503);
 return {owner:key(8),mint:key(40),pool:key(72),ready:d[105]===1,buyRefunded:d[106]===1,pendingBuy:d.readBigUInt64LE(107).toString(),minimumBuyOut:d.readBigUInt64LE(115).toString(),buyDeadline:Number(d.readBigInt64LE(123)),initialLiquidityQuote:d.readBigUInt64LE(131).toString(),pendingQuote:d.readBigUInt64LE(139).toString(),netFees:d.readBigUInt64LE(147).toString(),treasuryPaid:d.readBigUInt64LE(155).toString(),reinvestedQuote:d.readBigUInt64LE(163).toString()};
}
export function verifyCpConfig(info){assert(info?.owner.equals(CPMM_PROGRAM)&&info.data.length>=124&&info.data.subarray(0,8).equals(discriminator('account:AmmConfig')),'CPMM configuration missing',503);const d=info.data;assert(d[9]===0&&d.readBigUInt64LE(12)===2500n&&d.readBigUInt64LE(108)===12500n,'CPMM fee configuration changed',503);return {tradeFeeRate:'2500',creatorFeeRate:'12500',createPoolLamports:d.readBigUInt64LE(36).toString(),creatorFeeShareRate:d.readBigUInt64LE(116).toString()};}
