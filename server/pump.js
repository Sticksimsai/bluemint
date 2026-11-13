import {unpack as unpackTokenMetadata} from '@solana/spl-token-metadata';
import {createHash} from 'node:crypto';
import {Connection,PublicKey,Keypair,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {unpackMint,unpackAccount,getAssociatedTokenAddressSync,getExtensionData,ExtensionType,TOKEN_2022_PROGRAM_ID,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {PUMP_SDK,OnlinePumpSdk,PUMP_PROGRAM_ID,bondingCurvePda,getBuyTokenAmountFromSolAmount,newBondingCurve} from '@pump-fun/pump-sdk';
import BN from 'bn.js';
import {assert} from './domain.js';
import {validateRelay} from './chain.js';
// Stabled quotes every new Pump launch in Circle USDC. COINx remains in the
// registry only so coins launched under the earlier Stabled configuration
// keep reading their own curve, pool and decimals; it is never offered again.
export const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS=6;
export const COINX='Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu';
export const PUMP_QUOTES=Object.freeze({
 [USDC]:Object.freeze({mint:USDC,symbol:'USDC',decimals:6,tokenProgram:TOKEN_PROGRAM_ID,launchable:true}),
 [COINX]:Object.freeze({mint:COINX,symbol:'COINx',decimals:8,tokenProgram:TOKEN_2022_PROGRAM_ID,launchable:false})
});
// Profiles are immutable, so a coin's quote is whatever its profile recorded.
export function pumpQuote(item){const quote=PUMP_QUOTES[item?.quoteMint];assert(quote,'Unsupported Pump quote asset',409);return quote}
export function usdcUnits(value){assert(typeof value==='string'&&/^\d{1,11}(\.\d{1,6})?$/.test(value),'USDC amount must have at most six decimals');const [a,b='']=value.split('.');return (BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'))).toString()}
export function verifyPumpCurve(curve,mint,owner,quoteMint=USDC){assert(curve.quoteMint.toBase58()===quoteMint&&curve.creator.toBase58()===owner&&!curve.isMayhemMode&&!curve.isHolderReward,'Pump curve identity mismatch',409);assert(curve.tokenTotalSupply.gt(new BN(0)),'Invalid Pump supply',409)}
export function createPumpChain(store,env=process.env){
 const rpc=new Connection(env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(18000)})});
 const online=new OnlinePumpSdk(rpc),quoteMint=new PublicKey(USDC);
 store.db.exec(`CREATE TABLE IF NOT EXISTS pump_launches(launch_id TEXT PRIMARY KEY REFERENCES launches(id),mint TEXT UNIQUE NOT NULL,pool TEXT NOT NULL,serialized_tx TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,signature TEXT,created_slot INTEGER NOT NULL,last_valid_block_height INTEGER NOT NULL)`);
 const row=id=>store.db.prepare('SELECT * FROM pump_launches WHERE launch_id=?').get(id);
 const quoteMintOf=id=>store.get(id)?.quoteMint||USDC;
 const publicRow=r=>r?{protocol:'pump',quoteMint:quoteMintOf(r.launch_id),mint:r.mint,pool:r.pool,status:r.status,signature:r.signature,expires:r.expires,network:'mainnet'}:null;
 async function verify(){assert(await rpc.getGenesisHash()==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','Pump RPC is not Solana mainnet',503);const [quote,global,quoteControl,feeConfig]=await Promise.all([online.resolveQuoteMint(quoteMint).catch(e=>{assert(e?.name!=='UnsupportedQuoteMintError','USDC is not an approved Pump quote',503);throw e}),online.fetchGlobal(),online.fetchQuoteControl(),online.fetchFeeConfig()]);assert(quote.decimals===USDC_DECIMALS&&quote.quoteTokenProgram.equals(TOKEN_PROGRAM_ID),'Unexpected USDC mint configuration',503);assert(quoteControl?.mints.some(m=>m.mint.equals(quoteMint))||global.whitelistedQuoteMints.some(m=>m.equals(quoteMint)),'USDC is not an approved Pump quote',503);return {quote,global,quoteControl,feeConfig}}
 return {rpc,online,get:id=>publicRow(row(id)),
 async status(){let issue=null;try{await verify()}catch(e){issue=e.status?e.message:'Pump RPC verification unavailable'}return {protocol:'pump',network:'mainnet',quoteMint:USDC,quoteSymbol:'USDC',quoteDecimals:6,mintPreparationReady:!issue&&env.ENABLE_PUMP_MINTING==='true',issue,automationEnabled:false,feePolicy:'pump_protocol_schedule',platformFeeBps:0}},
 async prepare(item,origin){
  assert(env.ENABLE_PUMP_MINTING==='true','Pump launches are disabled',503);assert(item.protocol==='pump'&&!item.mint,'Not an unminted Pump launch',409);assert(item.quoteMint===USDC,'Create a new USDC launch; this saved profile was bound to a retired quote asset',409);
  const {quote,global,quoteControl,feeConfig}=await verify();const old=row(item.id);
  if(old){if(old.expires>Date.now())return {...publicRow(old),transaction:old.serialized_tx};const oldTx=VersionedTransaction.deserialize(Buffer.from(old.serialized_tx,'base64'));const valid=await rpc.isBlockhashValid(oldTx.message.recentBlockhash,'finalized');const account=await rpc.getAccountInfo(new PublicKey(old.pool),{commitment:'finalized',minContextSlot:Math.max(old.created_slot,valid.context.slot)});assert(!account,'Mint exists; confirm the launch before retrying',409);assert(!valid.value,'Previous launch can still land. Wait before retrying.',409);store.db.prepare('DELETE FROM pump_launches WHERE launch_id=?').run(item.id)}
  const mint=Keypair.generate(),user=new PublicKey(item.owner),pool=bondingCurvePda(mint.publicKey);
  const tokenPage=origin+'/token/'+mint.publicKey;
  const metadata=JSON.stringify({name:item.name,symbol:item.ticker,description:item.desc,image:origin+'/api/launches/'+item.id+'/image',external_url:item.website||tokenPage,extensions:{twitter:item.twitter,website:item.website||tokenPage},properties:{mint:mint.publicKey.toBase58(),tokenPage,profileHash:item.profileHash,quoteMint:USDC,protocol:'pump'}});
  const digest=createHash('sha256').update(metadata).digest('base64url');
  const args={mint:mint.publicKey,name:item.name,symbol:item.ticker,uri:origin+'/m/'+digest,creator:user,user,mayhemMode:false,cashback:false,holderReward:false,quoteMint,quoteTokenProgram:quote.quoteTokenProgram};
  const budget=new BN(item.devBuyQuoteUnits||'0');let instructions;
  if(budget.isZero())instructions=[await PUMP_SDK.createV2Instruction(args)];
  else {const ata=getAssociatedTokenAddressSync(quoteMint,user,true,quote.quoteTokenProgram);const info=await rpc.getAccountInfo(ata);assert(info&&unpackAccount(ata,info,quote.quoteTokenProgram).amount>=BigInt(budget.toString()),'Add enough USDC to your launch wallet for the developer buy.',422);const amount=getBuyTokenAmountFromSolAmount({global,feeConfig,mintSupply:null,bondingCurve:null,amount:budget,quoteMint,quoteControl});assert(amount.gtn(0),'Developer buy is too small');const curve=newBondingCurve(global,quoteMint,quoteControl);curve.creator=user;instructions=[await PUMP_SDK.createV2Instruction(args),...await PUMP_SDK.buyV3Instructions({bondingCurve:curve,associatedUserAccountInfo:null,mint:mint.publicKey,user,amount,quoteAmount:budget,slippage:0,tokenProgram:TOKEN_2022_PROGRAM_ID,quoteTokenProgram:quote.quoteTokenProgram})]}
  // A create+buy contains four non-builtin instructions; Solana's default
  // budget already grants enough compute. Avoid an extra program key so
  // the atomic USDC transaction fits the 1232-byte packet limit.
  if(budget.isZero())instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:700000}));
  const recent=await rpc.getLatestBlockhashAndContext('confirmed');const tx=new VersionedTransaction(new TransactionMessage({payerKey:user,recentBlockhash:recent.value.blockhash,instructions}).compileToV0Message());const packetSize=tx.message.serialize().length+1+tx.signatures.length*64;assert(packetSize<=1232,'Pump launch exceeds transaction size limit ('+packetSize+' bytes). Shorten the token name or ticker.',422);tx.sign([mint]);assert(tx.serialize().length<=1232,'Pump launch exceeds transaction size limit',422);
  const sim=await rpc.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[pool.toBase58(),mint.publicKey.toBase58()]}});
  if(sim.value.err){console.error('pump_simulation_failed',JSON.stringify(sim.value.err),(sim.value.logs||[]).slice(-8));assert(false,'Pump launch simulation failed: '+JSON.stringify(sim.value.err)+'. Check SOL creation costs and USDC balance.',422);}
  const [c,m]=sim.value.accounts||[];assert(c?.owner===PUMP_PROGRAM_ID.toBase58()&&m?.owner===TOKEN_2022_PROGRAM_ID.toBase58(),'Unexpected simulated Pump accounts',422);
  const curve=PUMP_SDK.decodeBondingCurve({data:Buffer.from(c.data[0],'base64'),owner:PUMP_PROGRAM_ID});verifyPumpCurve(curve,mint.publicKey,item.owner,USDC);
  const minted=unpackMint(mint.publicKey,{...m,owner:TOKEN_2022_PROGRAM_ID,data:Buffer.from(m.data[0],'base64')},TOKEN_2022_PROGRAM_ID);assert(minted.decimals===6&&minted.freezeAuthority===null,'Unexpected token mint configuration',422);
  const metadataBytes=getExtensionData(ExtensionType.TokenMetadata,minted.tlvData);assert(metadataBytes,'Pump token metadata missing',422);const locked=unpackTokenMetadata(metadataBytes);assert(locked.mint.equals(mint.publicKey)&&locked.name===item.name&&locked.symbol===item.ticker&&locked.uri===origin+'/m/'+digest,'Pump metadata identity mismatch',422);assert(!locked.updateAuthority,'Pump mint metadata is still mutable',422);
  const serialized=Buffer.from(tx.serialize()).toString('base64'),message=Buffer.from(tx.message.serialize()).toString('base64'),expires=Date.now()+60000;
  store.tx(()=>{store.db.prepare('INSERT OR IGNORE INTO mint_metadata VALUES(?,?)').run(digest,metadata);store.db.prepare('INSERT INTO pump_launches VALUES(?,?,?,?,?,?,?,?,?,?)').run(item.id,mint.publicKey.toBase58(),pool.toBase58(),serialized,message,expires,'prepared',null,recent.context.slot,recent.value.lastValidBlockHeight)});
  return {...publicRow(row(item.id)),transaction:serialized,initialBuyUnits:budget.toString()};
 },
 async submit(item,serialized){assert(env.ENABLE_PUMP_MINTING==='true','Pump launches disabled',503);const r=row(item.id);assert(r,'Prepare this launch first',409);if(r.signature)return publicRow(r);assert(r.expires>Date.now(),'Launch expired. Prepare again after reconciliation.',409);const tx=validateRelay(serialized,r.message,item.owner);assert(await rpc.getGenesisHash()==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','RPC network changed',503);const sim=await rpc.simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});assert(!sim.value.err,'Signed Pump launch simulation failed',422);const {default:bs58}=await import('bs58');const signature=bs58.encode(tx.signatures[0]);store.db.prepare("UPDATE pump_launches SET signature=?,status='submitted' WHERE launch_id=?").run(signature,item.id);await rpc.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});return {...publicRow(r),signature,status:'submitted'}},
 async confirm(item){const r=row(item.id);assert(r,'No prepared Pump launch',409);assert(r.signature,'Launch has not been submitted',409);const statuses=await rpc.getSignatureStatuses([r.signature],{searchTransactionHistory:true}),status=statuses.value[0];assert(status?.confirmationStatus==='finalized'&&!status.err,'Pump launch is not finalized yet',409);const info=await rpc.getAccountInfo(new PublicKey(r.pool),'finalized');assert(info?.owner.equals(PUMP_PROGRAM_ID),'Pump curve not finalized',409);verifyPumpCurve(PUMP_SDK.decodeBondingCurve(info),new PublicKey(r.mint),item.owner,pumpQuote(item).mint);store.tx(()=>{store.db.prepare("UPDATE pump_launches SET status='confirmed' WHERE launch_id=?").run(item.id);store.db.prepare("UPDATE launches SET mint=?,status='live' WHERE id=?").run(r.mint,item.id)});return {...publicRow(r),status:'confirmed',nextStage:'live'}}
 };
}
