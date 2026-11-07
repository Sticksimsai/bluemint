// Read-only. Check the candidate and existing deployment accounts through one RPC.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Connection,PublicKey} from '@solana/web3.js';
import {NETWORKS,verifyGenesis} from '../server/network.js';
import {VAULT_PROGRAM} from '../server/vault-abi.js';
import {verifyProgram} from '../server/launchlab-buybacks.js';
async function main(){
  const url=process.env.BLUEMINT_RPC_URL||'https://api.mainnet-beta.solana.com';
  const rpc=new Connection(url,'finalized');
  const release=JSON.parse(readFileSync(new URL('../contracts/launchlab-buybacks.json',import.meta.url)));
  const binary=readFileSync(new URL('../releases/launchlab-buybacks/bluemint_vault.so',import.meta.url));
  assert(binary.length===release.bytes&&createHash('sha256').update(binary).digest('hex')===release.sha256,'Local release mismatch');
  verifyGenesis(await rpc.getGenesisHash(),NETWORKS.mainnet);
  const buffer=new PublicKey('Gu7pdjjfyCQkBTF2ztR5HKPD3K5zKVa5nivoDpPXMgnD');
  const deployer=new PublicKey('CQ23NqV5JmBrxu3R8jrzpNEa1xbbX9criJXFC93YwuMC');
  const keeper=new PublicKey('36Ywh2wwGjPnMe6RSErNF8wLoDuoUWX5j1op6UXShuMK');
  const {context,value:[program,upload,wallet,worker]}=await rpc.getMultipleAccountsInfoAndContext([VAULT_PROGRAM,buffer,deployer,keeper]);
  console.log('Finalized slot:',context.slot,'· candidate bytes:',binary.length);
  console.log('Program account visible:',!!program);
  if(program){await verifyProgram(rpc);console.log('Deployed buyback executable matches release.')}
  if(upload){
    const loader='BPFLoaderUpgradeab1e11111111111111111111111';
    assert(upload.owner.toString()===loader&&upload.data.length>=37&&upload.data.readUInt32LE()===1&&upload.data[4]===1&&upload.data.subarray(5,37).equals(deployer.toBuffer()),'Unexpected upload buffer or authority');
    console.log('Buffer capacity:',upload.data.length-37,'bytes · balance:',upload.lamports/1e9,'SOL · fits:',upload.data.length-37>=binary.length);
  }else console.log('Existing buffer is not visible through this endpoint.');
  const rent=await rpc.getMinimumBalanceForRentExemption(45+binary.length);
  console.log('Candidate ProgramData rent:',rent/1e9,'SOL (excluding fees).');
  console.log('Deployer:',(wallet?.lamports??0)/1e9,'SOL · keeper:',(worker?.lamports??0)/1e9,'SOL.');
}
main().catch(e=>{console.error(String(e.message).replace(/https?:\/\/[^\s]+/g,'[endpoint]'));process.exitCode=1});
