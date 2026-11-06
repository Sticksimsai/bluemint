import {ALL_PROGRAM_ID,DEVNET_PROGRAM_ID} from '@raydium-io/raydium-sdk-v2';
import {assert} from './domain.js';
export const NETWORKS=Object.freeze({
 devnet:Object.freeze({name:'devnet',cluster:'devnet',genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',quoteMint:'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',programs:DEVNET_PROGRAM_ID,cpConfig:'7K5fZrc5LPZjDSvQZ1LmWJJoas86PX55YWBDuFqsP4qN',creatorFeeShareRate:'0'}),
 mainnet:Object.freeze({name:'mainnet',cluster:'mainnet',genesis:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',quoteMint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',programs:ALL_PROGRAM_ID,cpConfig:'627Jx6eN61TrdgMFSQt1QxvAmYWHXmzVA8M9FsKFtdkX',creatorFeeShareRate:'50000'})
});
export function networkConfig(env){const name=env.SOLANA_NETWORK||'devnet';assert(Object.hasOwn(NETWORKS,name),'Unsupported Solana network',503);const config=NETWORKS[name];if(env.USDC_QUOTE_MINT)assert(env.USDC_QUOTE_MINT===config.quoteMint,'USDC mint does not match the configured network',503);return config}
export function verifyGenesis(actual,network){assert(actual===network.genesis,'RPC does not match configured Solana network',503)}
export function verifyPreparationNetwork(row,network){assert(row.network===network.name,'Preparation belongs to a different network; prepare again',409)}
