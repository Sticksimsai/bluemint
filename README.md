# Stabled

A retro Solana launchpad for **Pump coins paired with USDC**.

New launches use Pump's Token-2022 `create_v2` flow with Circle USDC as the quote asset. An optional USDC developer buy uses `buy_v3` in the same wallet-signed transaction. The launch wallet remains the coin creator. Stabled adds no separate trading fee; Pump's on-chain fee schedule applies.

USDC quote mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (classic SPL Token program, six decimals). A USDC pair means prices read in dollars. It does not make the launched coin stable.

## Run

Node 24.22.1 is pinned for deployment.

```sh
npm ci
npm run build
npm test
npm start
```

Environment files are not loaded automatically. Set `PUBLIC_URL` to the browser origin and `DATA_DIR` to persistent storage. The existing Render service (`bluemint-api`) serves the frontend and API from one origin.

Launch settings:

- `SOLANA_NETWORK=mainnet`
- `SOLANA_RPC_URL`: an HTTPS Solana mainnet RPC, kept server-side
- `LAUNCH_MODE=pump`
- `ENABLE_PUMP_MINTING=true` to enable wallet-signed preparations

Never commit wallet keys or RPC credentials. Pump launches need no Stabled program deployment or server-held signing key. Users need SOL for account creation and fees, and USDC for an optional buy.

## Features

- Wallet ownership sign-in, CSRF protection and idempotent immutable launch profiles.
- Native Pump creation with an optional atomic USDC developer buy, simulation before signing and before submission, and finalized signature verification.
- A launch is prepared only while USDC is an approved Pump quote (`/api/chain/status` reports the reason when it is not).
- Content-addressed, mint-bound token metadata. Preparation verifies embedded Token-2022 metadata and that its update authority is absent. The metadata is hosted by the application rather than permanent decentralized storage.
- Recovery that reconciles the old blockhash and finalized curve before replacing an expired preparation.
- Pump curve and canonical PumpSwap reserve readers, one-minute charts and a rolling five-minute leaderboard, all in USDC. Curve-trade backfill is bounded and volume is marked partial.
- Stabled pixel branding, a 30-second illustrated walkthrough in the hero, looping pixel cards, a simplified launch form, clean page URLs and product docs at `/docs`.

## Earlier coins

Every quote is recorded in a coin's immutable profile, so older coins keep reading their own market:

- **COINx coins** from the Memebase configuration keep their on-chain COINx pair. Their token pages still open from a direct link with COINx prices and eight-decimal precision. They are left out of discovery, the mint feed and the leaderboard, and unminted COINx drafts can no longer be launched.
- **Legacy BlueMint (Raydium LaunchLab, USDC) launches** stay delisted. Their metadata, images, accounting records and treasury claims remain intact at `/fees/legacy`.

Totals in unlike quote assets are never summed.

## Fees and liquidity

Pump creator fees belong to the launch wallet. The site links to Pump's fee tools. There is no extra Stabled trading fee, automatic buyback or developer-buy liquidity split. Pump manages its curve and migration to PumpSwap.

The former Raydium platform fee and USDC vault apply only to legacy BlueMint markets. Keep their existing treasury, Raydium and keeper settings to preserve old claims and approved allocations. The legacy keeper joins confirmed `chain_launches` records and does not execute on `pump_launches` rows.

## Validation and deployment

`npm test` covers exact transaction relays, fee permissions, quote precision, quote isolation and legacy-account preservation. `npm run check` and `npm run build` run syntax and production-build checks.

`node scripts/verify-pump-launch.mjs` performs a **read-only mainnet simulation**; it never broadcasts. `SIM_PAYER` selects a public funded simulation payer and `SIM_BUY_UNITS` selects USDC atomic units (1 USDC = 1000000). A buy simulation also requires that payer's USDC balance. Run it against mainnet before enabling launches after any quote change; this USDC configuration has unit coverage but has not been simulated from this repository's CI.

See [MIGRATION-STABLED.md](MIGRATION-STABLED.md) for storage separation, production flags and limits. Product documentation is served at `/docs`; creator-fee guidance at `/fees`; legacy claims at `/fees/legacy`.

`PUBLIC_URL` in `render.yaml` still points at `https://memebase.fun`. Change it, and the custom domain on the Render service, when the Stabled domain is ready; wallet sign-in and metadata URLs follow that value. Keep the old origin reachable so metadata URLs of already-minted coins keep resolving.

## Brand assets

`scripts/brand/render-logo.py` draws the pixel coin mark and `scripts/brand/render-walkthrough.py` renders the 30-second hero video (Pillow and ffmpeg). Both write to a directory passed on the command line; the committed copies live in `dist/assets/`.
