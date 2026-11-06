import { createHash } from 'node:crypto';
import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import { Raydium, DEVNET_PROGRAM_ID, PlatformConfig, LaunchpadConfig, LaunchpadPool, TxVersion, getPdaLaunchpadPoolId, getPdaPlatformId } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { assert, AppError } from './domain.js';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const TOKEN_PROGRAM=new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const discriminator=name=>createHash('sha256').update('account:'+name).digest().subarray(0,8);
export function decodeAccount(info,layout,name,owner){assert(info&&info.owner.equals(owner),`${name} account missing or wrong program`,503);assert(info.data.length>=layout.span&&info.data.subarray(0,8).equals(discriminator(name)),`Invalid ${name} account`,503);return layout.decode(info.data)}
export function verifyPolicy(platform,config,expected){
 assert(platform.feeRate.toString()==='12500','Platform fee must be 1.25% (12500 / 1000000)',503);
 assert(platform.creatorFeeRate.isZero(),'Additional creator fee must be zero',503);
 assert(platform.platformClaimFeeWallet.toBase58()===expected.feeWallet,'Unexpected fee collection wallet',503);
 assert(config.mintB.toBase58()===expected.quoteMint,'Global config does not use the configured USDC mint',503);
 assert(config.curveType===0,'Only constant-product launch curves supported',503);
 assert(!platform.restrictCurveParam&&!platform.restrictGlobalConfig,'Restricted platform rules require a dedicated builder',503);
}
export function validateRelay(serialized,expectedMessage,wallet){
 assert(typeof serialized==='string'&&serialized.length<10000,'Invalid signed transaction');
 let tx;try{tx=VersionedTransaction.deserialize(Buffer.from(serialized,'base64'))}catch{throw new AppError(400,'Invalid signed transaction')}
 assert(Buffer.from(tx.message.serialize()).toString('base64')===expectedMessage,'Transaction differs from reviewed preparation',400);
 assert(tx.message.staticAccountKeys[0].toBase58()===wallet,'Wrong transaction payer',403);
 assert(tx.signatures.every(s=>s.some(b=>b!==0)),'Transaction signatures are missing');return tx;
}
export function createChain(store,env=process.env){
 const required=['SOLANA_RPC_URL','RAYDIUM_PLATFORM_ID','PLATFORM_OWNER_WALLET','RAYDIUM_GLOBAL_CONFIG_ID','PLATFORM_FEE_WALLET','DEVNET_USDC_MINT','LAUNCH_RAISE_USDC_UNITS'];
 const missing=required.filter(k=>!env[k]);let connection;
 function conn(){if(!connection){assert(/^https:\/\//.test(env.SOLANA_RPC_URL||''),'HTTPS RPC required',503);connection=new Connection(env.SOLANA_RPC_URL,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(12000)})})}return connection}
 store.db.exec(`CREATE TABLE IF NOT EXISTS chain_launches(launch_id TEXT PRIMARY KEY REFERENCES launches(id),mint TEXT UNIQUE NOT NULL,pool TEXT NOT NULL,serialized_tx TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,signature TEXT,created_at TEXT NOT NULL);`);
 const program=DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM;
 async function verify(){
  assert((env.SOLANA_NETWORK||'devnet')==='devnet','Mainnet execution is not enabled by this release',503);
  assert(!missing.length,'Missing deployment configuration: '+missing.join(', '),503);
  assert(env.DEVNET_USDC_MINT==='4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU','Only Circle-issued devnet USDC is allowed',503);
  const rpc=conn();assert(await rpc.getGenesisHash()===DEVNET_GENESIS,'RPC is not Solana devnet',503);
  const platformId=new PublicKey(env.RAYDIUM_PLATFORM_ID),configId=new PublicKey(env.RAYDIUM_GLOBAL_CONFIG_ID),quote=new PublicKey(env.DEVNET_USDC_MINT);
  assert(getPdaPlatformId(program,new PublicKey(env.PLATFORM_OWNER_WALLET)).publicKey.equals(platformId),'Platform does not belong to the configured owner',503);
  const [p,c,m]=await rpc.getMultipleAccountsInfo([platformId,configId,quote]);
  const platform=decodeAccount(p,PlatformConfig,'PlatformConfig',program),config=decodeAccount(c,LaunchpadConfig,'GlobalConfig',program);
  verifyPolicy(platform,config,{feeWallet:env.PLATFORM_FEE_WALLET,quoteMint:quote.toBase58()});
  assert(m&&m.owner.equals(TOKEN_PROGRAM)&&m.data.length===82&&m.data[44]===6&&m.data[45]===1,'Quote must be an initialized six-decimal SPL mint',503);
  return {rpc,platform,config,platformId,configId,quote};
 }
 const publicRow=row=>row?{mint:row.mint,pool:row.pool,status:row.status,signature:row.signature,expires:row.expires,network:'devnet'}:null;
 return {
 async status(){let issue;try{await verify()}catch(e){issue=e.status?e.message:'RPC/config verification unavailable'}return {network:env.SOLANA_NETWORK||'devnet',platformFeeConnected:!issue,feeRateBps:125,splitEnforcedOnchain:false,postGraduationFeeConnected:false,mintPreparationReady:!issue&&env.ENABLE_DEVNET_MINTING==='true',executionMode:'devnet_wallet_signed',platformOwner:env.PLATFORM_OWNER_WALLET||null,feeWallet:env.PLATFORM_FEE_WALLET||null,platformId:env.RAYDIUM_PLATFORM_ID||null,missing,issue:issue||null,automationEnabled:false,liveTrading:false}},
 get:id=>publicRow(store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(id)),
 async prepare(item,origin){
  assert(env.ENABLE_DEVNET_MINTING==='true','Devnet mint preparation is not enabled',503);
  const old=store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(item.id);
  if(old){assert(old.status==='prepared'&&old.expires>Date.now(),'This launch already has a preparation; confirm it before retrying. Expired preparations require reconciliation.',409);return {...publicRow(old),transaction:old.serialized_tx}}
  const {rpc,platformId,configId,config,quote}=await verify();
  assert(/^\d{1,18}$/.test(env.LAUNCH_RAISE_USDC_UNITS),'Invalid fundraising target',503);
  const target=new BN(env.LAUNCH_RAISE_USDC_UNITS);assert(target.gte(config.minFundRaisingB)&&target.gt(new BN(0)),'Fundraising target below protocol minimum',503);
  const supply=new BN(item.supplyUnits),sell=supply.muln(80).divn(100);
  assert(supply.gte(config.minSupplyA),'Supply below protocol minimum');
  const owner=new PublicKey(item.owner),mint=Keypair.generate();
  const sdk=await Raydium.load({connection:rpc,owner,cluster:'devnet',disableLoadToken:true,disableFeatureCheck:true,blockhashCommitment:'confirmed'});
  const built=await sdk.launchpad.createLaunchpad({programId:program,mintA:mint.publicKey,name:item.name,symbol:item.ticker,uri:`${origin}/api/launches/${item.id}/metadata`,decimals:6,mintBDecimals:6,mintBProgram:TOKEN_PROGRAM,platformId,configId,configInfo:config,migrateType:'cpmm',txVersion:TxVersion.V0,buyAmount:new BN(0),createOnly:true,extraSigners:[mint],supply,totalSellA:sell,totalFundRaisingB:target,totalLockedAmount:new BN(0),cliffPeriod:new BN(0),unlockPeriod:new BN(0),token2022:false});
  assert(built.transactions.length===1,'Builder requires multiple transactions; sequential execution not enabled',503);
  const transaction=built.transactions[0];transaction.sign([mint]);
  const simulation=await rpc.simulateTransaction(transaction,{sigVerify:false,commitment:'confirmed'});
  assert(!simulation.value.err,'Launch simulation failed; check devnet SOL and launch configuration',422);
  const serialized=Buffer.from(transaction.serialize()).toString('base64'),message=Buffer.from(transaction.message.serialize()).toString('base64');
  const pool=getPdaLaunchpadPoolId(program,mint.publicKey,quote).publicKey.toBase58();
  const expires=Date.now()+60000;
  store.db.prepare('INSERT INTO chain_launches VALUES(?,?,?,?,?,?,?,?,?)').run(item.id,mint.publicKey.toBase58(),pool,serialized,message,expires,'prepared',null,new Date().toISOString());
  return {network:'devnet',mint:mint.publicKey.toBase58(),pool,transaction:serialized,expires,status:'prepared',initialBuyUnits:'0',seedTransferred:false};
 },
 async submit(item,serialized){
  assert(env.ENABLE_DEVNET_MINTING==='true','Devnet minting disabled',503);await verify();
  const row=store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(item.id);assert(row,'Prepare this launch first',409);
  if(row.signature)return {...publicRow(row)};
  assert(row.expires>Date.now(),'Prepared transaction expired; reconcile before retrying',409);
  const tx=validateRelay(serialized,row.message,item.owner);
  const simulation=await conn().simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});assert(!simulation.value.err,'Signed transaction simulation failed',422);
  const signature=await conn().sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});
  store.db.prepare("UPDATE chain_launches SET signature=?,status='submitted' WHERE launch_id=?").run(signature,item.id);
  return {...publicRow(row),signature,status:'submitted'};
 },
 async confirm(item){
  await verify();const row=store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(item.id);assert(row,'No prepared launch',409);
  const info=await conn().getAccountInfo(new PublicKey(row.pool),'finalized');assert(info,'Pool not finalized yet',409);
  const p=decodeAccount(info,LaunchpadPool,'PoolState',program);
  assert(p.creator.toBase58()===item.owner&&p.mintA.toBase58()===row.mint&&p.mintB.toBase58()===env.DEVNET_USDC_MINT&&p.platformId.toBase58()===env.RAYDIUM_PLATFORM_ID&&p.configId.toBase58()===env.RAYDIUM_GLOBAL_CONFIG_ID,'Pool identity mismatch',409);
  store.db.prepare("UPDATE chain_launches SET status='confirmed' WHERE launch_id=?").run(item.id);
  return {...publicRow(row),status:'confirmed'};
 }
 };
}
