import { createHash } from 'node:crypto';
import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } from '@solana/web3.js';
import { initializeV2, Curve, getPdaLaunchpadAuth, getPdaLaunchpadVaultId, getPdaMetadataKey, buyExactInInstruction, getPdaCreatorVault, getPdaPlatformVault, CpmmCreatorFeeOn, PlatformConfig, LaunchpadConfig, LaunchpadPool, getPdaLaunchpadPoolId, getPdaPlatformId } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import {Metadata} from '@metaplex-foundation/mpl-token-metadata';
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction} from '@solana/spl-token';
import { assert, AppError } from './domain.js';
import {networkConfig,verifyGenesis,verifyPreparationNetwork} from './network.js';
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
 const required=['SOLANA_RPC_URL','RAYDIUM_PLATFORM_ID','RAYDIUM_GLOBAL_CONFIG_ID','PLATFORM_FEE_WALLET','LAUNCH_RAISE_USDC_UNITS'];
 const network=networkConfig(env);const enabled=()=>env.ENABLE_TOKEN_MINTING==='true';
 const missing=required.filter(k=>!env[k]);let connection;
 function conn(){if(!connection){assert(/^https:\/\//.test(env.SOLANA_RPC_URL||''),'HTTPS RPC required',503);connection=new Connection(env.SOLANA_RPC_URL,{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(12000)})})}return connection}
 store.db.exec(`CREATE TABLE IF NOT EXISTS chain_launches(launch_id TEXT PRIMARY KEY REFERENCES launches(id),mint TEXT UNIQUE NOT NULL,pool TEXT NOT NULL,serialized_tx TEXT NOT NULL,message TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,signature TEXT,created_at TEXT NOT NULL);`);
 if(!store.db.prepare('PRAGMA table_info(chain_launches)').all().some(c=>c.name==='network'))store.db.exec("ALTER TABLE chain_launches ADD COLUMN network TEXT NOT NULL DEFAULT 'devnet'");
 if(!store.db.prepare('PRAGMA table_info(chain_launches)').all().some(c=>c.name==='created_slot'))store.db.exec('ALTER TABLE chain_launches ADD COLUMN created_slot INTEGER');
 store.db.exec(`CREATE TABLE IF NOT EXISTS mint_metadata(digest TEXT PRIMARY KEY,json TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS mint_metadata_no_update BEFORE UPDATE ON mint_metadata BEGIN SELECT RAISE(ABORT,'Immutable mint metadata'); END;
 CREATE TRIGGER IF NOT EXISTS mint_metadata_no_delete BEFORE DELETE ON mint_metadata BEGIN SELECT RAISE(ABORT,'Immutable mint metadata'); END;`);
 const program=network.programs.LAUNCHPAD_PROGRAM;
 async function verify(){
  assert(!missing.length,'Missing deployment configuration: '+missing.join(', '),503);
  const rpc=conn();verifyGenesis(await rpc.getGenesisHash(),network);
  const platformId=new PublicKey(env.RAYDIUM_PLATFORM_ID),configId=new PublicKey(env.RAYDIUM_GLOBAL_CONFIG_ID),quote=new PublicKey(network.quoteMint);
  if(network.name==='mainnet'){assert(platformId.toBase58()==='GobSXmdvJMVk67KVwkyqGpoMEq6b6SoNrd7NwNW7iwM8' && configId.toBase58()==='8gj14w8vkNZjJTPak6e96Uf1sY438WKheH4s5dHyxiRw','Unexpected mainnet LaunchLab accounts',503)}else assert(getPdaPlatformId(program,new PublicKey(env.PLATFORM_OWNER_WALLET)).publicKey.equals(platformId),'Unexpected platform owner',503);
  const [p,c,m]=await rpc.getMultipleAccountsInfo([platformId,configId,quote]);
  const platform=decodeAccount(p,PlatformConfig,'PlatformConfig',program),config=decodeAccount(c,LaunchpadConfig,'GlobalConfig',program);
  if(network.name==='mainnet')assert(env.PLATFORM_FEE_WALLET==='85a8ERAhk1ZPYyGwj4zkjVKZdfqaEUcSpTt9GCz5xA7j' && platform.platformLockNftWallet.toBase58()===env.PLATFORM_FEE_WALLET && platform.platformScale.toString()==='1000000' && platform.platformVestingScale.isZero(),'Unexpected migration recipients',503);
  verifyPolicy(platform,config,{feeWallet:env.PLATFORM_FEE_WALLET,quoteMint:quote.toBase58()});
  assert(m&&m.owner.equals(TOKEN_PROGRAM)&&m.data.length===82&&m.data[44]===6&&m.data[45]===1,'Quote must be an initialized six-decimal SPL mint',503);
  return {rpc,platform,config,platformId,configId,quote};
 }
 const publicRow=row=>row?{mint:row.mint,pool:row.pool,status:row.status,signature:row.signature,expires:row.expires,network:row.network}:null;
 return {
 async status(){let issue;try{await verify()}catch(e){issue=e.status?e.message:'RPC/config verification unavailable'}return {network:env.SOLANA_NETWORK||'devnet',platformFeeConnected:!issue,feeRateBps:125,splitEnforcedOnchain:false,postGraduationFeeConnected:false,mintPreparationReady:!issue&&enabled(),executionMode:network.name+'_wallet_signed',platformOwner:env.PLATFORM_OWNER_WALLET||null,feeWallet:env.PLATFORM_FEE_WALLET||null,platformId:env.RAYDIUM_PLATFORM_ID||null,missing,issue:issue||null,automationEnabled:false,liveTrading:false}},
 get:id=>publicRow(store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(id)),
 async prepare(item,origin){
  assert(enabled(),'Token mint preparation is not enabled',503);
  const old=store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(item.id);
  assert(!item.mint,'This launch already has a finalized mint',409);
  if(old && old.expires<=Date.now()){
    verifyPreparationNetwork(old,network);
    const previous=VersionedTransaction.deserialize(Buffer.from(old.serialized_tx,'base64'));
    const valid=await conn().isBlockhashValid(previous.message.recentBlockhash,'finalized');
    const account=await conn().getAccountInfo(new PublicKey(old.pool),{commitment:'finalized',minContextSlot:valid.context.slot});
    assert(!account,'Pool already exists. Confirm this launch.',409);
    assert(!valid.value,'Previous transaction may still land. Retry after expiry.',409);
    // An absent hash can also be newer than the finalized bank. Wait for its creation slot.
    assert(old.created_slot && valid.context.slot>=old.created_slot,'Awaiting finalized preparation slot',409);
    store.db.prepare('DELETE FROM chain_launches WHERE launch_id=? AND mint=? AND expires=?').run(item.id,old.mint,old.expires);
  }else if(old){verifyPreparationNetwork(old,network);assert(old.status==='prepared'&&old.expires>Date.now(),'This launch already has a preparation; confirm it before retrying. Expired preparations require reconciliation.',409);return {...publicRow(old),transaction:old.serialized_tx}}
  const {rpc,platform,platformId,configId,config,quote}=await verify();
  assert(/^\d{1,18}$/.test(env.LAUNCH_RAISE_USDC_UNITS),'Invalid fundraising target',503);
  const target=new BN(env.LAUNCH_RAISE_USDC_UNITS);assert(target.gte(config.minFundRaisingB)&&target.gt(new BN(0)),'Fundraising target below protocol minimum',503);
  const supply=new BN(item.supplyUnits),sell=supply.muln(80).divn(100);
  assert(supply.gte(config.minSupplyA),'Supply below protocol minimum');
  const owner=new PublicKey(item.owner),mint=Keypair.generate();
  const buy=new BN(item.devBuyUnits||'0');
  const tokenPage=origin+'/token/'+mint.publicKey.toBase58();
  const metadata=JSON.stringify({name:item.name,symbol:item.ticker,description:item.desc,image:origin+'/api/launches/'+item.id+'/image',external_url:item.website||tokenPage,extensions:{website:item.website||tokenPage,twitter:item.twitter},properties:{mint:mint.publicKey.toBase58(),tokenPage,profileHash:item.profileHash,quoteMint:quote.toBase58()}});
  const digest=createHash('sha256').update(metadata).digest('base64url');
  const poolKey=getPdaLaunchpadPoolId(program,mint.publicKey,quote).publicKey;
  const auth=getPdaLaunchpadAuth(program).publicKey;
  const vaultA=getPdaLaunchpadVaultId(program,poolKey,mint.publicKey).publicKey;
  const vaultB=getPdaLaunchpadVaultId(program,poolKey,quote).publicKey;
  const zero=new BN(0);
  const instructions=[initializeV2(program,owner,owner,configId,platformId,auth,poolKey,mint.publicKey,quote,vaultA,vaultB,
    getPdaMetadataKey(mint.publicKey).publicKey,TOKEN_PROGRAM,6,item.name,item.ticker,origin+'/m/'+digest,
    {type:'ConstantCurve',totalSellA:sell,migrateType:'cpmm',supply,totalFundRaisingB:target},zero,zero,zero,CpmmCreatorFeeOn.OnlyTokenB)];
  const recent=await rpc.getLatestBlockhashAndContext('confirmed');
  const compile=()=>new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:recent.value.blockhash,instructions}).compileToV0Message());
  let transaction=compile();
  if(!buy.isZero()){
    const ownerQuote=getAssociatedTokenAddressSync(quote,owner),ownerTokens=getAssociatedTokenAddressSync(mint.publicKey,owner);
    const balance=await rpc.getAccountInfo(ownerQuote);
    assert(balance?.owner.equals(TOKEN_PROGRAM)&&balance.data.length>=72&&balance.data.readBigUInt64LE(64)>=BigInt(buy.toString()),'Insufficient Circle USDC for the developer buy',422);
    const init=await rpc.simulateTransaction(transaction,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[poolKey.toBase58()]}});
    const account=init.value.accounts?.[0];
    assert(!init.value.err&&account,'Launch simulation failed; check SOL for creation costs',422);
    const poolInfo=decodeAccount({owner:new PublicKey(account.owner),data:Buffer.from(account.data[0],'base64')},LaunchpadPool,'PoolState',program);
    const out=Curve.buyExactIn({poolInfo,amountB:buy,protocolFeeRate:config.tradeFeeRate,platformFeeRate:platform.feeRate,curveType:config.curveType,shareFeeRate:zero,creatorFeeRate:platform.creatorFeeRate,slot:init.context.slot});
    assert(out.amountB.eq(buy),'Developer buy exceeds the available launch curve',422);
    const minimum=out.amountA.amount.muln(9950).divn(10000);
    assert(minimum.gtn(0),'Developer buy too small',422);
    instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({units:650000}));
    instructions.push(createAssociatedTokenAccountIdempotentInstruction(owner,ownerTokens,owner,mint.publicKey),
      buyExactInInstruction(program,owner,auth,configId,platformId,poolKey,ownerTokens,ownerQuote,vaultA,vaultB,mint.publicKey,quote,TOKEN_PROGRAM,TOKEN_PROGRAM,
        getPdaPlatformVault(program,platformId,quote).publicKey,getPdaCreatorVault(program,owner,quote).publicKey,buy,minimum,zero));
    transaction=compile();
  }
  transaction.sign([mint]);
  assert(transaction.serialize().length<=1232,'Launch transaction exceeds the network size limit',422);
  const simulation=await rpc.simulateTransaction(transaction,{sigVerify:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:[getPdaMetadataKey(mint.publicKey).publicKey.toBase58()]}});
  assert(!simulation.value.err,'Launch simulation failed; check SOL balance and launch configuration',422);
  const meta=simulation.value.accounts?.[0];
  assert(meta?.owner==='metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s','Simulated metadata account mismatch',422);
  const [locked]=Metadata.deserialize(Buffer.from(meta.data[0],'base64'));
  assert(!locked.isMutable&&locked.mint.equals(mint.publicKey)&&locked.data.uri.replace(/\0+$/,'')===origin+'/m/'+digest,'Immutable metadata verification failed',422);
  const serialized=Buffer.from(transaction.serialize()).toString('base64'),message=Buffer.from(transaction.message.serialize()).toString('base64');
  const pool=getPdaLaunchpadPoolId(program,mint.publicKey,quote).publicKey.toBase58();
  const expires=Date.now()+60000;
  store.db.prepare('INSERT OR IGNORE INTO mint_metadata VALUES(?,?)').run(digest,metadata);
  store.db.prepare('INSERT INTO chain_launches(launch_id,mint,pool,serialized_tx,message,expires,status,signature,created_at,network,created_slot) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(item.id,mint.publicKey.toBase58(),pool,serialized,message,expires,'prepared',null,new Date().toISOString(),network.name,recent.context.slot);
  return {network:network.name,mint:mint.publicKey.toBase58(),pool,transaction:serialized,expires,status:'prepared',initialBuyUnits:buy.toString(),seedTransferred:false};
 },
 async submit(item,serialized){
  assert(enabled(),'Token minting disabled',503);await verify();
  const row=store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(item.id);assert(row,'Prepare this launch first',409);
  verifyPreparationNetwork(row,network);if(row.signature)return {...publicRow(row)};
  assert(row.expires>Date.now(),'Prepared transaction expired; reconcile before retrying',409);
  const tx=validateRelay(serialized,row.message,item.owner);
  const simulation=await conn().simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});assert(!simulation.value.err,'Signed transaction simulation failed',422);
  const {default:bs58}=await import('bs58');
  const signature=bs58.encode(tx.signatures[0]);
  store.db.prepare("UPDATE chain_launches SET signature=?,status='submitted' WHERE launch_id=?").run(signature,item.id);
  await conn().sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});
  return {...publicRow(row),signature,status:'submitted'};
 },
 async confirm(item){
  await verify();const row=store.db.prepare('SELECT * FROM chain_launches WHERE launch_id=?').get(item.id);assert(row,'No prepared launch',409);verifyPreparationNetwork(row,network);
  const info=await conn().getAccountInfo(new PublicKey(row.pool),'finalized');assert(info,'Pool not finalized yet',409);
  const p=decodeAccount(info,LaunchpadPool,'PoolState',program);
  assert(p.creator.toBase58()===item.owner&&p.mintA.toBase58()===row.mint&&p.mintB.toBase58()===network.quoteMint&&p.platformId.toBase58()===env.RAYDIUM_PLATFORM_ID&&p.configId.toBase58()===env.RAYDIUM_GLOBAL_CONFIG_ID,'Pool identity mismatch',409);
  store.db.prepare("UPDATE chain_launches SET status='confirmed' WHERE launch_id=?").run(item.id);
  store.db.prepare("UPDATE launches SET mint=?,status='live' WHERE id=?").run(row.mint,item.id);
  return {...publicRow(row),status:'confirmed',nextStage:'live'};
 }
 };
}
