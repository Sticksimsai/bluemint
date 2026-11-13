# Mainnet launch operations

> **Legacy BlueMint record.** This describes the retired Raydium/USDC vault design. Stabled launches run on Pump with USDC quotes; see the README and `MIGRATION-STABLED.md`. Kept for existing claims and allocations.


## Current state

The launch implementation uses direct Raydium CPMM pools, not LaunchLab bonding curves. The vault has passed local integration tests but is not deployed on mainnet. Render keeps `ENABLE_TOKEN_MINTING=false` and the keeper is disabled. No funds have moved.

## Launch flow

1. An authenticated owner saves a public immutable registry profile.
2. Owner reviews and signs a token-creation transaction. It creates a six-decimal standard SPL mint, mints the fixed supply to the owner, creates immutable Metaplex metadata pointing at the registry, and revokes mint authority. Freeze authority is absent. The off-chain metadata endpoint remains server-hosted; this is not content-addressed permanent storage.
3. Owner reviews and signs pool creation. Half the USDC budget and the full token supply seed the pool. The other half remains in that token's vault for the initial purchase. Pool creation/rent and transaction fees are paid separately in SOL.
4. Once Raydium opens the pool, owner signs the initial purchase. Tokens go to the launch owner. The program also permits a third-party fee payer to execute this fixed purchase. The minimum output is fixed by the creation instruction. The initial purchase may receive roughly half the supply; other traders can trade after the pool opens.
5. If the buy is not completed within 15 minutes, the owner can sign a refund of only the reserved buy USDC. The initial liquidity cannot be refunded by this instruction.
6. The server marks the launch live only after finalized state checks. It preserves signatures before broadcast and reconciles blockhash expiry before preparing replacements.

Each token has independent vault accounts. The contract exposes no arbitrary transfer, LP withdrawal or treasury-redirection instruction. An upgrade authority can change a program, so this is not an irrevocable liquidity-lock claim while upgrades remain possible.

## Fees and The Mint

CPMM config index 20 is required. Its expected rates are 0.25% trading plus 1.25% creator fees, denominated on the USDC side. Raydium's protocol share is deducted before receipt. The vault allocates actual receipts 40% to the fixed launchpad treasury and 60% to that token's pending liquidity budget.

Reinvestment buys tokens and deposits both assets into the same pool. LP tokens remain in the vault. A batch is capped at 0.1% of quote reserves; on-chain bounds require a fresh 15–30 minute observation window, spot within 3% of the observation price, and 0.5% swap slippage. Missing/stale history leaves funds pending rather than executing. The keeper can pay network fees but cannot redirect vault assets.

`npm run keeper` is a one-shot worker. It defaults to simulation. Live execution additionally requires `ENABLE_KEEPER=true`, a separate funded SOL fee payer at `KEEPER_KEYPAIR_PATH`, a persistent DATA_DIR shared with the API, and a scheduler. Do not use a treasury wallet key or publish any key file. The production keeper has not been configured or funded.

## Deployment gate

- Reproduce tests and inspect `contracts/release.json` against the compiled artifact. Rebuilds can differ; never replace its hash without re-running qualification.
- Deploy the compiled program at the exact declared program address with the chosen upgrade authority and a funded mainnet fee payer. Deployment requires wallet signatures. The generated deployment identity is private and intentionally excluded from the repository; the auto-generated underscore-named build key is not the declared program identity.
- Verify the deployed ProgramData bytes and owner/upgrade-authority policy. The API rejects a different binary.
- Fund a separate keeper fee payer, install its private file through the hosting provider's secret mechanism, and schedule the worker against the same persistent store.
- Enable launches only after `/api/chain/status` verifies the deployment. Perform a small owner-reviewed mainnet launch and verify all three finalized stages, fee collection and reinvestment before wider availability.

The backend never requests or stores a user's signing key. Mainnet funding and wallet signatures cannot be supplied by a code deployment. Terminal discovery is controlled by each terminal; standard Raydium pools do not guarantee immediate indexing everywhere.

## Market data

The token page samples finalized pool reserves into persisted one-minute OHLC observations. It identifies these as observations rather than individual swap candles. Missing intervals are not fabricated; 24-hour trade volume and trade-level history remain unindexed. The older operator ledger is explicitly separate from verified on-chain vault accounting.
