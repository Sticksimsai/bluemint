import { randomBytes } from 'node:crypto';
import { Connection,PublicKey,TransactionMessage,VersionedTransaction } from '@solana/web3.js';
import { Raydium,DEVNET_PROGRAM_ID,TxVersion,PlatformConfig,LaunchpadConfig,CpmmConfigInfoLayout,getPdaPlatformId } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { assert } from './domain.js';
import { decodeAccount,validateRelay,DEVNET_GENESIS } from './chain.js';
export const CIRCLE_DEVNET_USDC='4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const DEVNET_CP_CONFIG='7K5fZrc5LPZjDSvQZ1LmWJJoas86PX55YWBDuFqsP4qN';
export function requirePlatformOwner(wallet,env){assert(wallet&&wallet===env.PLATFORM_OWNER_WALLET,'Only the configured platform owner can perform setup',403)}
export function verifyPlatformSettings(p,owner,feeWallet){
 assert(p.feeRate.toString()==='12500'&&p.creatorFeeRate.isZero(),'Unexpected curve fees',409);
 assert(p.platformClaimFeeWallet.toBase58()===feeWallet&&p.platformLockNftWallet.toBase58()===owner,'Unexpected platform recipients',409);
 assert(p.cpConfigId.toBase58()===DEVNET_CP_CONFIG&&p.platformCpCreator.toBase58()===feeWallet,'Unexpected CPMM fee configuration',409);
 assert(p.platformScale.toString()==='1000000'&&p.creatorScale.isZero()&&p.burnScale.isZero(),'Unexpected LP migration policy',409);
 assert(p.platformVestingScale.isZero()&&p.platformVestingWallet.equals(PublicKey.default)&&p.transferFeeExtensionAuth.equals(PublicKey.default),'Unexpected vesting or transfer-fee authority',409);
 assert(!p.restrictCurveParam&&!p.restrictGlobalConfig,'Unsupported platform restrictions',409);
}
export function createPlatformSetup(store,env=process.env){
 store.db.exec(`CREATE TABLE IF NOT EXISTS platform_preparations(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,serialized_tx TEXT NOT NULL,message TEXT NOT NULL,block_height INTEGER NOT NULL,created_at INTEGER NOT NULL,signature TEXT,status TEXT NOT NULL);`);
 let connection,cached;
 function rpc(){assert((env.SOLANA_NETWORK||'devnet')==='devnet','Only devnet setup is available',503);assert(/^https:\/\//.test(env.SOLANA_RPC_URL||''),'Devnet RPC required',503);return connection??=new Connection(env.SOLANA_RPC_URL,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(12000)})})}
 async function context(){
  const connection=rpc();assert(await connection.getGenesisHash()===DEVNET_GENESIS,'Setup RPC is not devnet',503);
  assert(env.PLATFORM_OWNER_WALLET&&env.PLATFORM_FEE_WALLET,'Platform wallets not configured',503);
  const owner=new PublicKey(env.PLATFORM_OWNER_WALLET),feeWallet=new PublicKey(env.PLATFORM_FEE_WALLET),program=DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM,platformId=getPdaPlatformId(program,owner).publicKey;
  assert(platformId.toBase58()===env.RAYDIUM_PLATFORM_ID,'Incorrect owner-derived platform address',503);
  const cp=await connection.getAccountInfo(new PublicKey(DEVNET_CP_CONFIG));const config=decodeAccount(cp,CpmmConfigInfoLayout,'AmmConfig',DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM);
  assert(!config.disableCreatePool&&config.tradeFeeRate.toString()==='2500'&&config.creatorFeeRate.toString()==='12500','CPMM fee configuration changed; review required',503);
  return {connection,owner,feeWallet,program,platformId};
 }
 async function inspect(force=false){
  if(!force&&cached&&cached.until>Date.now())return cached.value;
  const {connection,owner,feeWallet,program,platformId}=await context();
  const [account,balance,globalAccounts,rent]=await Promise.all([connection.getAccountInfo(platformId,'finalized'),connection.getBalance(owner),connection.getProgramAccounts(program,{filters:[{dataSize:LaunchpadConfig.span}]}),connection.getMinimumBalanceForRentExemption(PlatformConfig.span)]);
  let configured=false,configurationIssue=null;if(account){try{verifyPlatformSettings(decodeAccount(account,PlatformConfig,'PlatformConfig',program),owner.toBase58(),feeWallet.toBase58());configured=true}catch(e){configurationIssue=e.message}}
  const compatibleConfigs=globalAccounts.flatMap(a=>{const c=decodeAccount(a.account,LaunchpadConfig,'GlobalConfig',program);return c.mintB.toBase58()===CIRCLE_DEVNET_USDC&&c.curveType===0?[{id:a.pubkey.toBase58(),protocolFeeBps:Number(c.tradeFeeRate.toString())/100,minRaiseUnits:c.minFundRaisingB.toString()}]:[]});
  const value={network:'devnet',owner:owner.toBase58(),feeWallet:feeWallet.toBase58(),platformId:platformId.toBase58(),accountExists:!!account,configured,configurationIssue,balanceLamports:String(balance),rentLamports:String(rent),circleUsdcMint:CIRCLE_DEVNET_USDC,circleUsdcSupported:compatibleConfigs.length>0,compatibleConfigs,checkedAt:new Date().toISOString(),curvePlatformBps:125,curveCreatorBps:0,cpmmConfig:DEVNET_CP_CONFIG,cpmmProtocolTradeBps:25,cpmmCreatorBps:125,lpPolicy:'100% of graduated LP locked; Fee Key goes to platform owner',automatedSplit:false,launchesEnabled:false};cached={value,until:Date.now()+15000};return value;
 }
 async function prepare(wallet,origin){
  requirePlatformOwner(wallet,env);const status=await inspect(true);assert(!status.accountExists,'Platform already exists; use Verify setup',409);
  const {connection,owner,feeWallet,program}=await context();
  const sdk=await Raydium.load({connection,owner,cluster:'devnet',disableLoadToken:true,disableFeatureCheck:true});
  const created=await sdk.launchpad.createPlatformConfig({programId:program,platformAdmin:owner,platformClaimFeeWallet:feeWallet,platformLockNftWallet:owner,platformVestingWallet:PublicKey.default,cpConfigId:new PublicKey(DEVNET_CP_CONFIG),transferFeeExtensionAuth:PublicKey.default,creatorFeeRate:new BN(0),platformVestingScale:new BN(0),migrateCpLockNftScale:{platformScale:new BN(1000000),creatorScale:new BN(0),burnScale:new BN(0)},feeRate:new BN(12500),name:'BlueMint',web:origin,img:origin+'/assets/usdc-pixel.png',txVersion:TxVersion.LEGACY});
  const updated=await sdk.launchpad.updatePlatformConfig({programId:program,platformAdmin:owner,updateInfo:{type:'updatePlatformCpCreator',value:feeWallet},txVersion:TxVersion.LEGACY});
  const latest=await connection.getLatestBlockhash('confirmed');
  const message=new TransactionMessage({payerKey:owner,recentBlockhash:latest.blockhash,instructions:[...created.transaction.instructions,...updated.transaction.instructions]}).compileToV0Message();
  const tx=new VersionedTransaction(message);const sim=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[status.platformId]}});assert(!sim.value.err,'Platform setup simulation failed',422);
  const simulated=sim.value.accounts?.[0];assert(simulated,'RPC did not return the simulated platform account',503);verifyPlatformSettings(decodeAccount({owner:new PublicKey(simulated.owner),data:Buffer.from(simulated.data[0],'base64')},PlatformConfig,'PlatformConfig',program),owner.toBase58(),feeWallet.toBase58());
  const networkFee=(await connection.getFeeForMessage(message,'confirmed')).value;assert(networkFee!==null,'Could not estimate network fee',503);
  const payerCost=sim.value.preBalances[0]-sim.value.postBalances[0];assert(payerCost===Number(status.rentLamports)+networkFee,'Unexpected setup balance change; review required',422);
  const id=randomBytes(16).toString('hex'),serialized=Buffer.from(tx.serialize()).toString('base64');
  // Only one current preparation per owner; invalidate older unsigned requests.
  store.tx(()=>{store.db.prepare("UPDATE platform_preparations SET status='superseded' WHERE wallet=? AND status='prepared'").run(wallet);store.db.prepare('INSERT INTO platform_preparations VALUES(?,?,?,?,?,?,?,?)').run(id,wallet,serialized,Buffer.from(message.serialize()).toString('base64'),latest.lastValidBlockHeight,Date.now(),null,'prepared')});
  return {id,transaction:serialized,network:'devnet',lastValidBlockHeight:latest.lastValidBlockHeight,summary:{...status,networkFeeLamports:String(networkFee),estimatedTotalLamports:String(payerCost),simulationSucceeded:true}};
 }
 async function submit(wallet,input){
  requirePlatformOwner(wallet,env);assert(typeof input.id==='string','Preparation ID required');
  const row=store.db.prepare('SELECT * FROM platform_preparations WHERE id=? AND wallet=?').get(input.id,wallet);assert(row,'Unknown setup preparation',404);
  if(row.signature)return {signature:row.signature,status:row.status};
  assert(row.status==='prepared','Setup preparation has been superseded',409);
  const {connection,platformId}=await context();assert(await connection.getBlockHeight('confirmed')<=row.block_height,'Preparation expired. Review a fresh setup transaction.',409);
  assert(!(await connection.getAccountInfo(platformId,'confirmed')),'Platform already exists; use Verify setup',409);
  const tx=validateRelay(input.transaction,row.message,wallet);const sim=await connection.simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});assert(!sim.value.err,'Signed setup simulation failed',422);
  const signature=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});
  store.db.prepare("UPDATE platform_preparations SET signature=?,status='submitted' WHERE id=?").run(signature,row.id);cached=null;return {signature,status:'submitted',network:'devnet'};
 }
 async function confirm(wallet){requirePlatformOwner(wallet,env);const status=await inspect(true);assert(status.configured,status.configurationIssue||'Platform not finalized yet',409);store.db.prepare("UPDATE platform_preparations SET status='confirmed' WHERE wallet=? AND status='submitted'").run(wallet);return status}
 return {inspect,prepare,submit,confirm};
}
