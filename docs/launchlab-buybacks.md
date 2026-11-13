# LaunchLab buybacks

> **Legacy BlueMint record.** This describes the retired Raydium/USDC vault design. Stabled launches run on Pump with USDC quotes; see the README and `MIGRATION-STABLED.md`. Kept for existing claims and allocations.


BlueMint stages a treasury-approved allocation of finalized USDC receipts, then a separate keeper can reinvest it after graduation. There is no initial developer buy in this flow. The treasury retains 40% (rounded down to the nearest USDC base unit). The remaining units go to the earning mint's vault. LP tokens stay in its program-owned associated token account.

## Release and deployment

The candidate executable is `releases/launchlab-buybacks/bluemint_vault.so`. Verify its length and SHA-256 against `contracts/launchlab-buybacks.json` before deploying to the declared program ID. The older setup ZIP, binary hash, rent estimate, and previously funded upload buffer were for a smaller executable. Check the current buffer and program state, authority, capacity and mainnet rent before resuming a deployment. The direct-pool release manifest remains bound to its original executable. This worker independently verifies the finalized upgradeable-loader executable bytes.

Claims use Raydium's configured treasury signer. Keep this key on the operator's machine. From the repository with Node 24 dependencies installed and BLUEMINT_RPC_URL set, preview the appropriate claim:

```sh
node scripts/launchlab-fees.mjs claim-shared
node scripts/launchlab-fees.mjs claim-pool TOKEN_MINT
```

Use the appropriate claim source once. For local signing, set LOCAL_TREASURY_KEYPAIR to a local signer file and append --broadcast. After finality, preview the allocation for each earning mint:

```sh
node scripts/launchlab-fees.mjs allocate TOKEN_MINT FINALIZED_CLAIM_SIGNATURE
```

The receipt verifier checks actual treasury USDC credits. For shared claims it walks finalized vault history and attributes SPL transfers to the immediate LaunchLab swap invocation. It stops on unavailable history, partial withdrawals, unsupported instructions or unreconciled balances. It accepts a single top-level platform claim to the canonical treasury ATA. Fee Key earnings after graduation are a different source and aren't imported by this command. Historical activity requires an RPC that serves finalized transactions with CPI stack heights. When previewed amounts are correct, append --broadcast to allocate. The program trusts the treasury's signed attribution and rejects duplicate receipt IDs per mint. It does not inspect historical transactions itself.

## Start the keeper

After verifying deployment, fund the separate keeper public key 36Ywh2wwGjPnMe6RSErNF8wLoDuoUWX5j1op6UXShuMK with SOL for fees and initial token-account rent. Install only its key as a private Render secret file. Set KEEPER_KEYPAIR_PATH to the mounted file path, and ENABLE_LAUNCHLAB_BUYBACKS=true on the API service with LAUNCH_MODE=launchlab and a mainnet SOLANA_RPC_URL.

The worker runs every minute in the API process against its persistent SQLite disk. The keeper signs a swap and liquidity deposit in one atomic transaction. Failed simulation, missing graduation, a noncanonical pool, or insufficient price history leaves the funds pending. The worker requires a simulated spend of at least 5 USDC. The program limits a batch to 0.1% of pool quote reserves, checks spot against a 15–30 minute average and sets a minimum swap output. LP shares are minted to the mint-specific vault. The worker persists signed bytes before relay and resends only the same transaction while its status is unresolved. Set ENABLE_LAUNCHLAB_BUYBACKS=false to stop new keeper submissions.

## Validation

Run npm test and cargo test --locked -p bluemint-vault. For the local SBF integration, prepare the mature CPMM fixtures using the existing contract integration flow, then run:

```sh
VAULT_BINARY=releases/launchlab-buybacks/bluemint_vault.so node tests/contract/launchlab-buybacks.mjs
```

The integration uses synthetic LaunchLab platform, graduated curve and oracle history over a real Raydium CPMM program and pool snapshot. It simulates treasury approval locally. This does not exercise a real mainnet claim, Raydium graduation, or signing with a production wallet.
