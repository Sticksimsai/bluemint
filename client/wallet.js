import { VersionedTransaction } from '@solana/web3.js';
export async function signPrepared(base64,wallet){
 const provider=window.phantom?.solana||window.solana||window.solflare;
 if(!provider?.signTransaction)throw Error('A Solana wallet with transaction signing is required.');
 if(provider.publicKey?.toString()!==wallet)throw Error('The active wallet differs from your signed-in launch wallet.');
 const tx=VersionedTransaction.deserialize(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)));
 if(tx.message.staticAccountKeys[0].toString()!==wallet)throw Error('Transaction payer does not match your wallet.');
 const signed=await provider.signTransaction(tx);
 return btoa(String.fromCharCode(...signed.serialize()));
}
