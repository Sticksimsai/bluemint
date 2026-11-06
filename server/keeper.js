// Optional fee-only keeper. Asset custody stays with each program-derived vault.
// Dry-run is the default. Never put a wallet key in git or application responses.
import {readFileSync} from 'node:fs';
import {Connection,Keypair,TransactionMessage,VersionedTransaction,ComputeBudgetProgram} from '@solana/web3.js';
import {createStore} from './store.js';
import {createVaultChain} from './vault-chain.js';
import {vaultAddresses,vaultInstruction,decodeVault} from './vault-abi.js';
import {assert} from './domain.js';
const env=process.env,store=createStore(env.DATA_DIR||'./data');
const rpc=new Connection(env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com','confirmed');
const chain=createVaultChain(store,env);
store.db.exec('CREATE TABLE IF NOT EXISTS keeper_transactions(id INTEGER PRIMARY KEY,launch_id TEXT NOT NULL,action TEXT NOT NULL,signature TEXT,transaction_bytes TEXT NOT NULL,last_height INTEGER NOT NULL,status TEXT NOT NULL)');
const dryRun=env.ENABLE_KEEPER!=='true';
async function run(){
 const status=await chain.status();assert(!status.issue,status.issue||'Vault not ready',503);
 assert(env.KEEPER_KEYPAIR_PATH,'Configure a separate fee-payer key file. Do not use the treasury wallet.',503);
 const payer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(env.KEEPER_KEYPAIR_PATH,'utf8'))));
 const pending=store.db.prepare("SELECT * FROM keeper_transactions WHERE status='submitted'").all();
 for(const p of pending){const {value:[s]}=await rpc.getSignatureStatuses([p.signature],{searchTransactionHistory:true});if(s?.confirmationStatus==='finalized'||s?.err)store.db.prepare('UPDATE keeper_transactions SET status=? WHERE id=?').run(s.err?'failed':'finalized',p.id);else if(!s&&await rpc.getBlockHeight('finalized')>p.last_height)store.db.prepare("UPDATE keeper_transactions SET status='expired' WHERE id=?").run(p.id)}
 for(const launch of store.list(1000,0).filter(l=>l.status==='live')){
  if(store.db.prepare("SELECT 1 FROM keeper_transactions WHERE launch_id=? AND status='submitted'").get(launch.id))continue;
  const a=vaultAddresses(launch.mint,launch.owner);const info=await rpc.getAccountInfo(a.launch);const state=decodeVault(info,a);
  if(!state.ready)continue;
  // Alternate collection with reinvestment; unavailable oracle history leaves fees in vault.
  for(const action of (BigInt(state.pendingQuote)>=100n?['reinvest','collect_fees']:['collect_fees'])){
  const block=await rpc.getLatestBlockhash();const tx=new VersionedTransaction(new TransactionMessage({payerKey:payer.publicKey,recentBlockhash:block.blockhash,instructions:[ComputeBudgetProgram.setComputeUnitLimit({units:700000}),vaultInstruction(action,a,{payer:payer.publicKey})]}).compileToV0Message());tx.sign([payer]);
  const simulation=await rpc.simulateTransaction(tx,{sigVerify:true});
  if(simulation.value.err){console.log(JSON.stringify({launchId:launch.id,action,status:'skipped',reason:simulation.value.err}));continue}
  if(dryRun){console.log(JSON.stringify({launchId:launch.id,action,status:'simulation_passed',broadcast:false}));continue}
  // Base58 signature from the transaction, stored atomically before relay.
  const chars='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt('0x'+Buffer.from(tx.signatures[0]).toString('hex')),signature='';while(n){signature=chars[Number(n%58n)]+signature;n/=58n}for(const b of tx.signatures[0]){if(b)break;signature='1'+signature}
  const bytes=tx.serialize();store.db.prepare('INSERT INTO keeper_transactions(launch_id,action,signature,transaction_bytes,last_height,status) VALUES(?,?,?,?,?,?)').run(launch.id,action,signature,Buffer.from(bytes).toString('base64'),block.lastValidBlockHeight,'submitted');
  await rpc.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:2});console.log(JSON.stringify({launchId:launch.id,action,signature,status:'submitted'}));break;
  }
 }
}
try{await run()}catch(error){console.error(error.message);process.exitCode=1}finally{store.close()}
