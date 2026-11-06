# BlueMint

USDC-first launchpad frontend and persistent backend preview. **The Render deployment targets mainnet and native Circle USDC. Owner-signed platform setup is implemented; token minting, swaps, live charts, fee collection and liquidity execution remain disabled or unimplemented.**

## Run
Requires Node 24.15+ (24.22.1 pinned for deployment).

```sh
npm ci
npm run build
npm test
npm start
```

Open http://localhost:3000. Set PUBLIC_URL to the exact browser origin when using a custom domain. DATA_DIR holds SQLite data and must survive restarts. Configuration is documented in .env.example; environment files are not loaded automatically.

## Implemented
- Solana Ed25519 wallet challenge sign-in, single-use nonces, HttpOnly sessions and CSRF protection.
- Persistent launch registry, validated profile images and HTTPS links, immutable saved profiles, idempotent creation and owner checks.
- Persistent watchlists and server-sent refresh events.
- Integer-only tokenomics: 125 basis points additional to Raydium fees, with 40% of collected launchpad fees allocated to the platform and 60% to that token’s liquidity budget. This corresponds to 0.50% and 0.75% of trade notional only if the full 1.25% reaches the collector. Mainnet CPMM currently deducts a default 5% protocol share from accrued creator fees at collection, so those gross allocations are not guaranteed. No holder rewards.
- Append-only, per-token accounting with duplicate-reference and overspend checks. Ledger entries are explicitly operator reports, not verified blockchain receipts.
- Constant-product buy-and-pair budget estimator. It is not an executable quote.
- Same-origin frontend integration. Server-backed launches display no invented prices, liquidity or candles. The static Sites version remains a separate demo.

## API
Public GET routes: /api/health, /api/config, /api/launches, /api/launches/:id, /api/launches/:id/metadata, /api/launches/:id/image, /api/launches/:id/candles, /api/launches/:id/ledger, /api/mint, /api/events.

Authentication: POST /api/auth/challenge and /api/auth/verify; GET /api/auth/me; POST /api/auth/logout. Mutation requests require the exact Origin. Authenticated mutations also require x-csrf-token returned by authentication.

Signed-in routes: POST /api/launches (Idempotency-Key required), GET/POST /api/watchlist, POST /api/tokenomics/quote and /api/tokenomics/plan. POST /api/launches/:id/prepare returns 503 while ENABLE_TOKEN_MINTING is false or required configuration is missing. POST /api/admin/events requires an ADMIN_WALLETS allowlisted signer. Leave that setting empty to disable operator reporting.

Amounts use integer atomic-unit strings: Circle USDC has six decimals. Client token names/tickers never determine the trusted quote mint. The proposed supply defaults to one billion tokens at six decimals; this is a draft parameter, not minted supply.

## Render
render.yaml defines one Node web service and a 1 GB persistent disk. The starter service and disk are paid resources. Connect the GitHub repository and review Blueprint charges before applying it. The build runs npm ci and npm test; health checks use /api/health. RENDER_EXTERNAL_URL is used automatically for the expected origin. Set PUBLIC_URL if attaching a custom domain.

This SQLite configuration supports one service instance, not horizontal scaling. Back up the database using SQLite online backup or a consistent stopped-service copy; test restoration before production use. Disk services have deployment availability tradeoffs. The coarse in-memory IP limiter may group requests behind a proxy and resets on restart. Use a trusted proxy-aware distributed limiter before significant public traffic.

## Required before real financial activity
1. Implement and verify LaunchLab platform configuration and separate post-graduation CPMM fee rights; do not assume fees survive graduation or apply on every terminal or alternate pool.
2. Build wallet-signed transaction preparation, simulation, slippage/expiry controls, confirmations, USDC mint validation and indexer reconciliation.
3. Implement the 50% developer-buy liquidity allocation, define ownership/refunds, acquire both pool assets, and verify LP custody/locking. A buy is not automatically liquidity and funds must not be sent to a mint address.
4. Implement idempotent on-chain fee collection and buy/pair/add liquidity execution with inventory, minimum batch and price-impact limits. Use verified receipts, not operator reports, for production accounting.
5. Add live candles and test each target terminal. Conduct independent contract/security review and devnet end-to-end tests before mainnet activation.

The reserved SOLANA_RPC_URL, RAYDIUM_PLATFORM_ID and TREASURY_WALLET settings do not activate these missing components. No private wallet keys are stored or requested.

## Validation
npm test covers fee conservation, liquidity budget constraints, input rejection, database persistence/immutability, idempotency, wallet signatures, nonce replay, origin/CSRF checks, ownership and disabled financial execution. npm run check validates server/bridge syntax. The owner setup and launch-wallet navigation were checked in the deployed browser. Frontend design history is in FRONTEND-HISTORY.md.

## Mainnet deployment and owner setup

The Blueprint is the deployment source of truth. It selects mainnet, the mainnet RPC, and native Circle USDC. Code pins the genesis hash, program IDs, quote mint and CPMM policy per network; supplying a mismatched quote or RPC fails closed. Persisted preparations carry a network identifier, and legacy preparations migrate as devnet so they cannot be relayed on mainnet. The old ENABLE_DEVNET_MINTING flag no longer enables execution.

Verified by read-only mainnet RPC on 2026-11-06:

| Setting | Value |
| --- | --- |
| Owner / fee collector | `85a8ERAhk1ZPYyGwj4zkjVKZdfqaEUcSpTt9GCz5xA7j` |
| Owner-derived platform PDA | `3bucQpVsuemJMHNcMCdSGDzvnorZXYowNFQbBch6gLhz` |
| Circle USDC quote | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Compatible GlobalConfig | `8gj14w8vkNZjJTPak6e96Uf1sY438WKheH4s5dHyxiRw` |
| Selected CPMM config | `627Jx6eN61TrdgMFSQt1QxvAmYWHXmzVA8M9FsKFtdkX` |

The global config uses a constant-product curve and a 0.25% protocol fee. Proposed platform fee is 1.25%, with zero extra curve creator fee. CPMM config has a separate 1.25% creator fee plus 0.25% trading fee. Its default creator-fee protocol share is 5% at collection, subject to per-creator overrides; this is not an extra 5% of trade volume. The 0.50% / 0.75% tokenomics are not enforced by platform setup. Automatic collection, net-receipt allocation and reinvestment need separate implementation.

Connect the configured wallet on `#create`, then follow **Platform setup** (`#setup`). Public GET `/api/platform` checks genesis, owner balance, platform account, CPMM rates and compatible Circle USDC configs. Owner-authenticated POST `/api/platform/prepare`, `/submit` and `/confirm` prepare, relay and verify creation. Existing session, Origin and CSRF controls apply.

The two-instruction setup creates the platform and assigns CPMM creator rights to the fee wallet. Proposed migrated LP policy is 100% locked, 0% burned, with the Fee Key assigned to the owner. No vesting or token transfer-fee authority is configured. The UI discloses the network, recipients, fee rates, collection share, LP rights and real SOL cost before wallet signing.

Preparation validates a successful simulation and its resulting account and checks payer debit against rent plus network fee. Relay accepts only the exact reviewed message, a current blockhash and valid wallet signatures. No server-side wallet key exists. Creating this account does not create a pool, launch a token or enable trading.

At the last check the owner had 0 mainnet SOL and the platform account did not exist. Account rent was 0.00544576 SOL, excluding network fee. Mainnet preparation correctly stopped for insufficient funds. No funded mainnet simulation, signature or broadcast has been performed. Devnet simulation results do not establish mainnet execution success.

## Token mint builder (disabled)

The network-aware builder uses the selected LaunchLab program and official quote mint. It validates platform fee/recipient, global quote configuration and SPL mint state; it prepares one V0 create-only transaction with 80% of draft supply for curve sale, no vesting, no initial buy, and an explicitly configured USDC fundraising target. The mint keypair is ephemeral; only its partial transaction signature is persisted. The wallet signs the exact message, relay simulates signatures before broadcasting, and confirmation checks canonical pool identity.

`ENABLE_TOKEN_MINTING=false` remains explicit in the Blueprint. `LAUNCH_RAISE_USDC_UNITS` is intentionally unset pending launch-parameter selection. An old devnet flag cannot activate mainnet minting. Draft profiles remain registry drafts; live indexer integration is absent. Expired launch preparations require reconciliation and are not silently replaced. Platform creation alone is insufficient to turn this into a functioning launchpad.

Remaining: funded wallet-reviewed platform creation, launch economics and lifecycle reconciliation, immutable metadata policy, mint execution verification, swaps, live candles, terminal compatibility tests, verified fee receipts, split accounting against net receipts, buy/pair/add execution and LP lock verification.

References: https://developers.circle.com/stablecoins/usdc-contract-addresses and https://github.com/raydium-io/raydium-docs-v1/tree/main/products/launchlab. SDK pinned to 0.2.84-alpha.

## Developer-buy liquidity policy

The separate seed commitment input and review amount have been removed. The requested policy allocates 50% of the developer’s USDC buy amount to that token’s liquidity, separate from ongoing trading fees. `/api/config` publishes `developerBuyLiquidityBps: 5000` and `developerBuyLiquidityEnforced: false`. Developer buys and the allocation are not executable yet; create-only minting stays disabled and makes no initial buy. Historical `seedUnits` are retained as legacy draft data, not treated as deposits or developer buys. New UI drafts omit that field and default to zero in storage.
