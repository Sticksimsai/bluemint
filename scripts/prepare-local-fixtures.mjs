// Public mainnet account cloning only. Never signs or submits a mainnet transaction.
import {Connection,Keypair,PublicKey} from '@solana/web3.js';
import {MintLayout,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {mkdirSync,writeFileSync} from 'node:fs';
import {CPMM_PROGRAM,CP_CONFIG,POOL_FEE,USDC} from '../server/vault-abi.js';
const dir=process.env.FIXTURE_DIR||'research/fixtures';mkdirSync(dir,{recursive:true});
const rpc=new Connection(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com','finalized');
const save=(name,key,a)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify({pubkey:key.toBase58(),account:{lamports:a.lamports,data:[a.data.toString('base64'),'base64'],owner:a.owner.toBase58(),executable:a.executable,rentEpoch:0}}));
for(const[name,key]of [['config',CP_CONFIG],['pool-fee',POOL_FEE]]){const a=await rpc.getAccountInfo(key);if(!a)throw Error(name+' missing');save(name,key,a)}
const program=await rpc.getAccountInfo(CPMM_PROGRAM),data=await rpc.getAccountInfo(new PublicKey(program.data.subarray(4,36)));writeFileSync(`${dir}/cpmm.so`,data.data.subarray(45));
const payer=Keypair.generate();writeFileSync(`${dir}/local-payer.json`,JSON.stringify([...payer.secretKey]),{mode:0o600});
const mint=Buffer.alloc(MintLayout.span);MintLayout.encode({mintAuthorityOption:1,mintAuthority:payer.publicKey,supply:0n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mint);
save('local-usdc',USDC,{lamports:1461600,data:mint,owner:TOKEN_PROGRAM_ID,executable:false});
console.log('Fixtures prepared for a LOCAL validator. USDC fixture is synthetic and must never be used on mainnet.');
