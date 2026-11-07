# Memebase

A retro Solana launchpad for **Pump coins paired with COINx**.

New launches use Pump's Token-2022 `create_v2` flow. An optional COINx developer buy uses `buy_v3` in the same wallet-signed transaction. The launch wallet remains the coin creator. Memebase adds no separate trading fee; Pump's on-chain fee schedule applies.

COINx quote mint: `Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu` (Token-2022, eight decimals). COINx is a tokenized equity asset, not a dollar stablecoin.

## Run

Node 24.22.1 is pinned for deployment.

```sh
npm ci
npm run build
npm test
npm start
```

Environment files are not loaded automatically. Set `PUBLIC_URL` to the browser origin and `DATA_DIR` to persistent storage. The existing Render service serves the frontend and API from one origin.

New-launch settings:

- `SOLANA_NETWORK=mainnet`
- `SOLANA_RPC_URL`: an HTTPS Solana mainnet RPC, kept server-side
- `LAUNCH_MODE=pump`
- `ENABLE_PUMP_MINTING=true` to enable wallet-signed preparations

Never commit wallet keys or RPC credentials. New Pump launches need no Memebase program deployment or server-held signing key. Users need SOL for account creation and fees, and COINx for an optional buy.

## Features

- Wallet ownership sign-in, CSRF protection and idempotent immutable launch profiles.
- Native Pump creation with an optional atomic developer buy, simulation before signing and before submission, and finalized signature verification.
- Content-addressed, mint-bound token metadata. Preparation verifies embedded Token-2022 metadata and that its update authority is absent. The metadata is hosted by the application rather than permanent decentralized storage.
- Recovery that reconciles the old blockhash and finalized curve before replacing an expired preparation.
- Pump curve and canonical PumpSwap reserve readers, quote-aware token cards and one-minute charts. Curve-trade backfill is bounded and volume is marked partial. PumpSwap trade-volume backfill is not implemented.
- Memebase pixel branding, responsive retro cards, a simplified launch form, clean page URLs and rewritten product docs.
- Legacy BlueMint USDC markets and treasury claims remain accessible without changing their mints, pools, metadata or recipients.

## Fees and liquidity

Pump creator fees belong to the launch wallet. The site links to Pump's fee tools. There is no extra Memebase 1.25% trading fee, automatic COINx buyback or 50% developer-buy liquidity split. Pump manages its curve and migration to PumpSwap.

The former Raydium platform fee and USDC vault apply only to legacy BlueMint markets. Keep their existing treasury, Raydium and keeper settings to preserve old claims and approved allocations. The legacy keeper joins confirmed `chain_launches` records and does not execute on new `pump_launches` rows.

## Validation and deployment

`npm test` covers exact transaction relays, fee permissions, quote precision, protocol isolation and legacy-account preservation. `npm run check` and `npm run build` run syntax and production-build checks.

`node scripts/verify-pump-launch.mjs` performs a **read-only mainnet simulation**; it never broadcasts. `SIM_PAYER` selects a public funded simulation payer and `SIM_BUY_UNITS` selects COINx atomic units. A buy simulation also requires that payer's COINx balance. Both no-buy creation and atomic creation-plus-buy passed mainnet simulation during this migration. An actual launch still requires a user's wallet signature.

See [MIGRATION-MEMEBASE.md](MIGRATION-MEMEBASE.md) for storage separation, production flags and implementation limits. Product documentation is served at `/docs`; creator-fee guidance at `/fees`; existing USDC claims at `/fees/legacy`.

The deployment remains on `bluemint.fun` and the existing `bluemint-api` Render service until a new domain or infrastructure name is explicitly configured.
