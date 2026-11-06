import {readFileSync} from 'node:fs';
import {Connection,PublicKey,Keypair,SystemProgram,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,MINT_SIZE,AuthorityType,createInitializeMint2Instruction,createAssociatedTokenAccountIdempotentInstruction,createMintToInstruction,createSetAuthorityInstruction,unpackMint} from '@solana/spl-token';
import {createCreateMetadataAccountV3Instruction,Metadata,PROGRAM_ID as METADATA_PROGRAM} from '@metaplex-foundation/mpl-token-metadata';
import {assert,decimalUnits} from './domain.js';
import {validateRelay} from './chain.js';
import {NETWORKS,verifyGenesis} from './network.js';
import {VAULT_PROGRAM,CPMM_PROGRAM,CP_CONFIG,USDC,TREASURY,ata,vaultAddresses,vaultInstruction,decodeVault,verifyCpConfig} from './vault-abi.js';
const release=JSON.parse(readFileSync(new URL('../contracts/release.json',import.meta.url)));
const base58=bytes=>{let n=BigInt('0x'+Buffer.from(bytes).toString('hex')),s='';const chars='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(n){s=chars[Number(n%58n)]+s;n/=58n}for(const b of bytes){if(b)break;s='1'+s}return s};
export function createVaultChain(store,env=process.env){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS vault_launches(launch_id TEXT PRIMARY KEY REFERENCES launches(id),mint TEXT UNIQUE NOT NULL,budget TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS vault_transactions(launch_id TEXT PRIMARY KEY REFERENCES launches(id),stage TEXT NOT NULL,serialized TEXT NOT NULL,message TEXT NOT NULL,blockhash TEXT NOT NULL,last_height INTEGER NOT NULL,signature TEXT,signed_transaction TEXT,status TEXT NOT NULL);`);
 let rpc;const conn=()=>rpc??=new Connection(env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(15000)})});
 const row=id=>db.prepare('SELECT * FROM vault_launches WHERE launch_id=?').get(id);
 const txRow=id=>db.prepare('SELECT * FROM vault_transactions WHERE launch_id=?').get(id);
 const view=id=>{const l=row(id),t=txRow(id);return l?{mint:l.mint,pool:vaultAddresses(l.mint,store.get(id).owner).pool.toBase58(),budgetUnits:l.budget,stage:t?.stage,status:t?.status,signature:t?.signature,network:'mainnet'}:null};
 async function verify(){
  assert(env.SOLANA_NETWORK==='mainnet','Direct USDC vault launches require mainnet configuration',503);
  const c=conn();verifyGenesis(await c.getGenesisHash(),NETWORKS.mainnet);
  const [program,config,quote]=await c.getMultipleAccountsInfo([VAULT_PROGRAM,CP_CONFIG,USDC]);
  const fees=verifyCpConfig(config);assert(unpackMint(USDC,quote).decimals===6,'Unexpected USDC decimals',503);
  assert(release.qualified&&release.binarySha256&&Number.isInteger(release.binaryLength)&&release.binaryLength>0&&release.integrationReport,release.reason,503);
  assert(program?.executable,'BlueMint vault program is not deployed',503);
  // Upgradeable loader: verify exact qualified bytes at ProgramData, not only ID.
  const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
  assert(program.owner.equals(loader)&&program.data.length===36&&program.data.readUInt32LE(0)===2,'Unexpected vault program loader',503);
  const data=await c.getAccountInfo(new PublicKey(program.data.subarray(4,36)),'finalized');
  const {createHash}=await import('node:crypto');
  assert(data?.owner.equals(loader)&&data.data.readUInt32LE(0)===3&&data.data.length>=45+release.binaryLength&&createHash('sha256').update(data.data.subarray(45,45+release.binaryLength)).digest('hex')===release.binarySha256&&data.data.subarray(45+release.binaryLength).every(b=>b===0),'Deployed vault binary differs from qualified release',503);
  return {rpc:c,fees};
 }
 async function phase(item,l){
  const a=vaultAddresses(l.mint,item.owner);const [mint,state]=await conn().getMultipleAccountsInfo([a.mint,a.launch],'finalized');
  if(!mint)return {stage:'mint',a};
  const m=unpackMint(a.mint,mint);assert(m.decimals===6&&m.supply===BigInt(item.supplyUnits)&&m.mintAuthority===null&&m.freezeAuthority===null,'Mint authority or supply mismatch',409);
  const metadataAddress=PublicKey.findProgramAddressSync([Buffer.from('metadata'),METADATA_PROGRAM.toBuffer(),a.mint.toBuffer()],METADATA_PROGRAM)[0];
  const md=await conn().getAccountInfo(metadataAddress,'finalized');assert(md?.owner.equals(METADATA_PROGRAM),'Token metadata missing',409);
  const [metadata]=Metadata.deserialize(md.data);assert(metadata.mint.equals(a.mint)&&!metadata.isMutable&&metadata.data.name.replace(/\0/g,'')===item.name&&metadata.data.symbol.replace(/\0/g,'')===item.ticker,'Token metadata identity mismatch',409);
  if(!state)return {stage:'pool',a};
  const vault=decodeVault(state,a);assert(vault.initialLiquidityQuote===(BigInt(l.budget)/2n).toString(),'Seed allocation mismatch',409);
  return {stage:vault.ready?'live':'buy',a,vault};
 }
 async function reconcile(item){const t=txRow(item.id);if(!t?.signature)return;
  const {value:[s]}=await conn().getSignatureStatuses([t.signature],{searchTransactionHistory:true});
  if(s?.confirmationStatus==='finalized'){db.prepare('UPDATE vault_transactions SET status=? WHERE launch_id=?').run(s.err?'failed':'finalized',item.id);return}
  if(s?.err){db.prepare("UPDATE vault_transactions SET status='failed' WHERE launch_id=?").run(item.id);return}
  const height=await conn().getBlockHeight('finalized');
  if(!s&&height>t.last_height)db.prepare("UPDATE vault_transactions SET status='expired' WHERE launch_id=?").run(item.id);
 }
 return {
 get:view,
 async status(){let issue=null;try{await verify()}catch(e){issue=e.status?e.message:'Mainnet RPC verification unavailable'}return {network:'mainnet',launchMode:'direct_cpmm_vault',vaultProgram:VAULT_PROGRAM.toBase58(),platformFeeConnected:!issue,feeRateBps:125,splitEnforcedOnchain:!issue,mintPreparationReady:!issue&&env.ENABLE_TOKEN_MINTING==='true',automationEnabled:false,liveTrading:false,issue,developerLiquidityBps:5000,treasuryNetFeeShareBps:4000,liquidityNetFeeShareBps:6000}},
 async prepare(item,origin,input={}){
  const {fees}=await verify();
  await reconcile(item);let old=txRow(item.id),l=row(item.id),mintKey;
  if(old&&['prepared','submitted'].includes(old.status)){
   if(await conn().getBlockHeight('finalized')<=old.last_height)return {...view(item.id),transaction:old.serialized,lastValidBlockHeight:old.last_height};
   assert(!old.signature,'Pending transaction must reconcile before retrying',409);
  }
  if(!l){assert(env.ENABLE_TOKEN_MINTING==='true','Mainnet launches are not enabled',503);const budget=decimalUnits(input.devBuyUsdc||'0');assert(budget>=1000000n&&budget<=1000000000000n,'Developer budget must be 1–1,000,000 USDC');mintKey=Keypair.generate();l={mint:mintKey.publicKey.toBase58(),budget:budget.toString()};}
  let current=await phase(item,l);let {a,stage}=current;
  if(stage==='buy'&&input.action==='refund'){assert(current.vault.buyDeadline<Math.floor(Date.now()/1000),'Refund becomes available after the initial buy expires',409);stage='refund'}
  if(['mint','pool'].includes(stage))assert(env.ENABLE_TOKEN_MINTING==='true','Mainnet launches are not enabled',503);
  if(stage==='live')return {...view(item.id),stage:'live',status:'finalized'};
  if(stage==='mint'&&!mintKey){mintKey=Keypair.generate();l={...l,mint:mintKey.publicKey.toBase58()};a=vaultAddresses(l.mint,item.owner)}
  const instructions=[ComputeBudgetProgram.setComputeUnitLimit({units:700000})];
  let solFunding=0n;
  if(stage==='mint'){
   assert(Buffer.byteLength(item.name)<=32&&Buffer.byteLength(item.ticker)<=10,'Token name/ticker exceeds on-chain byte limit');
   const rent=await conn().getMinimumBalanceForRentExemption(MINT_SIZE);
   const metadata=PublicKey.findProgramAddressSync([Buffer.from('metadata'),METADATA_PROGRAM.toBuffer(),a.mint.toBuffer()],METADATA_PROGRAM)[0];
   instructions.push(SystemProgram.createAccount({fromPubkey:a.owner,newAccountPubkey:a.mint,space:MINT_SIZE,lamports:rent,programId:TOKEN_PROGRAM_ID}),createInitializeMint2Instruction(a.mint,6,a.owner,null),createAssociatedTokenAccountIdempotentInstruction(a.owner,a.ownerTokens,a.owner,a.mint),createMintToInstruction(a.mint,a.ownerTokens,a.owner,BigInt(item.supplyUnits)),createCreateMetadataAccountV3Instruction({metadata,mint:a.mint,mintAuthority:a.owner,payer:a.owner,updateAuthority:a.owner},{createMetadataAccountArgsV3:{data:{name:item.name,symbol:item.ticker,uri:`${origin}/api/launches/${item.id}/metadata`,sellerFeeBasisPoints:0,creators:null,collection:null,uses:null},isMutable:false,collectionDetails:null}}),createSetAuthorityInstruction(a.mint,a.owner,AuthorityType.MintTokens,null));
  }else if(stage==='pool'){
   const rent=await Promise.all([637,4075,82,165,165,165].map(n=>conn().getMinimumBalanceForRentExemption(n)));
   solFunding=BigInt(fees.createPoolLamports)+BigInt(rent.reduce((a,b)=>a+b,0))+1000000n;
   instructions.push(vaultInstruction('create_launch',a,{budget:BigInt(l.budget),solFunding}));
  }else{
   if(stage==='buy')assert(current.vault.buyDeadline>=Math.floor(Date.now()/1000),'Initial buy expired; use Refund unspent buy',409);
   instructions.push(createAssociatedTokenAccountIdempotentInstruction(a.owner,a.treasuryQuote,TREASURY,USDC),vaultInstruction(stage==='refund'?'refund_expired_buy':'finish_buy',a));
  }
  const block=await conn().getLatestBlockhash('confirmed');const tx=new VersionedTransaction(new TransactionMessage({payerKey:a.owner,recentBlockhash:block.blockhash,instructions}).compileToV0Message());if(mintKey)tx.sign([mintKey]);
  const bytes=tx.serialize();assert(bytes.length<=1232,'Launch step exceeds transaction packet limit',503);
  const simulated=await conn().simulateTransaction(tx,{sigVerify:false,commitment:'confirmed'});assert(!simulated.value.err,'Launch simulation failed; check wallet SOL/USDC balances and pool state',422);
  const serialized=Buffer.from(bytes).toString('base64'),message=Buffer.from(tx.message.serialize()).toString('base64');
  store.tx(()=>{db.prepare('INSERT INTO vault_launches VALUES(?,?,?,?) ON CONFLICT(launch_id) DO UPDATE SET mint=excluded.mint').run(item.id,l.mint,l.budget,new Date().toISOString());db.prepare('INSERT OR REPLACE INTO vault_transactions VALUES(?,?,?,?,?,?,NULL,NULL,?)').run(item.id,stage,serialized,message,block.blockhash,block.lastValidBlockHeight,'prepared')});
  return {...view(item.id),transaction:serialized,lastValidBlockHeight:block.lastValidBlockHeight,seedUsdcUnits:(BigInt(l.budget)/2n).toString(),buyUsdcUnits:(BigInt(l.budget)-BigInt(l.budget)/2n).toString(),poolFundingLamports:solFunding.toString()};
 },
 async submit(item,serialized){await verify();const t=txRow(item.id);assert(t,'Prepare a transaction first',409);if(['mint','pool'].includes(t.stage))assert(env.ENABLE_TOKEN_MINTING==='true','Mainnet launches are not enabled',503);
  const tx=validateRelay(serialized,t.message,item.owner);const signature=base58(tx.signatures[0]);
  if(t.signature){assert(t.signature===signature,'A different signed transaction is already recorded',409);if(t.status==='finalized')return view(item.id)}
  assert(await conn().getBlockHeight('confirmed')<=t.last_height,'Blockhash expired; reconcile before retrying',409);
  const simulation=await conn().simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});assert(!simulation.value.err,'Signed launch simulation failed',422);
  // Persist BEFORE broadcast. A timeout cannot lose the recovery signature.
  db.prepare("UPDATE vault_transactions SET signature=?,signed_transaction=?,status='submitted' WHERE launch_id=?").run(signature,serialized,item.id);
  const sent=await conn().sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});assert(sent===signature,'RPC returned an unexpected signature',503);return view(item.id);
 },
 async confirm(item){await verify();const l=row(item.id);assert(l,'No launch transaction prepared',409);await reconcile(item);const t=txRow(item.id);assert(t?.status==='finalized','Transaction is not finalized; retry confirmation',409);const state=await phase(item,l);
  if(state.stage==='live')db.prepare("UPDATE launches SET mint=?,status='live' WHERE id=?").run(l.mint,item.id);
  return {...view(item.id),nextStage:state.stage,vault:state.vault||null};
 }
 };
}
