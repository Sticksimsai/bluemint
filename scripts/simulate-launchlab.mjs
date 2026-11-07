import assert from 'node:assert/strict';
import BN from 'bn.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { LaunchpadConfig, PlatformConfig, LaunchpadPool, Raydium, TxVersion, getPdaLaunchpadPoolId } from '@raydium-io/raydium-sdk-v2';
import { decodeAccount, verifyPolicy } from '../server/chain.js';
import { NETWORKS, verifyGenesis } from '../server/network.js';

async function simulate() {
  const endpoint = process.env.BLUEMINT_RPC_URL;
  assert(endpoint?.startsWith('https://'), 'Set BLUEMINT_RPC_URL to your mainnet HTTPS RPC.');
  const rpc = new Connection(endpoint, 'confirmed');
  const network = NETWORKS.mainnet;
  verifyGenesis(await rpc.getGenesisHash(), network);
  const program = network.programs.LAUNCHPAD_PROGRAM;
  const platformId = new PublicKey('GobSXmdvJMVk67KVwkyqGpoMEq6b6SoNrd7NwNW7iwM8');
  const configId = new PublicKey('8gj14w8vkNZjJTPak6e96Uf1sY438WKheH4s5dHyxiRw');
  const treasury = '85a8ERAhk1ZPYyGwj4zkjVKZdfqaEUcSpTt9GCz5xA7j';
  const payer = new PublicKey(process.env.SIMULATION_PAYER || treasury);
  const [p, c] = await rpc.getMultipleAccountsInfo([platformId, configId], 'finalized');
  const platform = decodeAccount(p, PlatformConfig, 'PlatformConfig', program);
  const config = decodeAccount(c, LaunchpadConfig, 'GlobalConfig', program);
  verifyPolicy(platform, config, { feeWallet: treasury, quoteMint: network.quoteMint });
  assert.equal(platform.platformLockNftWallet.toBase58(), treasury, 'LP NFT wallet mismatch');
  assert.equal(platform.platformScale.toString(), '1000000', 'Platform migration share mismatch');
  assert.equal(platform.platformVestingScale.toString(), '0', 'Unexpected platform vesting');
  console.log('Verified USDC quote, 1.25% platform fee, zero creator fee and treasury recipients.');

  const sdk = await Raydium.load({connection: rpc, owner: payer, cluster: 'mainnet', disableLoadToken: true, disableFeatureCheck: true});
  const mint = Keypair.generate().publicKey;
  const supply = new BN('1000000000000000');
  const target = BN.max(config.minFundRaisingB, new BN('10000000000'));
  console.log('Simulation inputs: 1 billion tokens, 80% on curve, zero initial buy, raise target', target.toString(), 'USDC base units.');
  const built = await sdk.launchpad.createLaunchpad({
    programId: program, platformId, configId, configInfo: config, mintA: mint,
    mintBDecimals: 6, mintBProgram: TOKEN_PROGRAM_ID, decimals: 6,
    name: 'Blue Mint', symbol: 'MINT', uri: 'https://example.invalid/simulation-only.json',
    supply, totalSellA: supply.muln(80).divn(100), totalFundRaisingB: target,
    buyAmount: new BN(0), createOnly: true, migrateType: 'cpmm', txVersion: TxVersion.V0
  });
  assert.equal(built.transactions.length, 1, 'Expected one creation transaction');
  const pool = getPdaLaunchpadPoolId(program, mint, config.mintB).publicKey;
  const result = await rpc.simulateTransaction(built.transactions[0], {
    commitment: 'confirmed', sigVerify: false, replaceRecentBlockhash: true,
    accounts: { encoding: 'base64', addresses: [pool.toBase58()] }
  });
  if (result.value.err) {
    console.error(result.value.logs?.join('\n'));
    throw new Error('Simulation failed: ' + JSON.stringify(result.value.err));
  }
  const account = result.value.accounts?.[0];
  assert(account, 'RPC did not return the simulated pool');
  const state = decodeAccount({owner: new PublicKey(account.owner), data: Buffer.from(account.data[0], 'base64')}, LaunchpadPool, 'PoolState', program);
  for (const [field, key] of Object.entries({creator:payer, mintA:mint, mintB:config.mintB, platformId, configId})) {
    assert(state[field].equals(key), 'Unexpected simulated pool field: ' + field);
  }
  console.log('PASS: simulated BlueMint MINT/USDC pool verified. No transaction broadcast.');
}
simulate().catch(error => {
  console.error(String(error.message).replace(/https?:\/\/[^\s]+/g, '[URL omitted]'));
  process.exitCode = 1;
});
