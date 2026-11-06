# BlueMint

USDC-first launchpad frontend and persistent backend preview. **No on-chain minting, swaps, fee collection or liquidity execution is deployed.**

## Run
Requires Node 24.15+ (24.22.1 pinned for deployment).

```sh
npm ci
npm test
npm start
```

Open http://localhost:3000. Set PUBLIC_URL to the exact browser origin when using a custom domain. DATA_DIR holds SQLite data and must survive restarts. Configuration is documented in .env.example; environment files are not loaded automatically.

## Implemented
- Solana Ed25519 wallet challenge sign-in, single-use nonces, HttpOnly sessions and CSRF protection.
- Persistent launch registry, validated profile images and HTTPS links, immutable saved profiles, idempotent creation and owner checks.
- Persistent watchlists and server-sent refresh events.
- Integer-only tokenomics: 125 basis points additional to Raydium fees, with 40% of collected launchpad fees allocated to the platform and 60% to that token’s liquidity budget. This corresponds to 0.50% and 0.75% of trade notional before rounding. No holder rewards.
- Append-only, per-token accounting with duplicate-reference and overspend checks. Ledger entries are explicitly operator reports, not verified blockchain receipts.
- Constant-product buy-and-pair budget estimator. It is not an executable quote.
- Same-origin frontend integration. Server-backed launches display no invented prices, liquidity or candles. The static Sites version remains a separate demo.

## API
Public GET routes: /api/health, /api/config, /api/launches, /api/launches/:id, /api/launches/:id/metadata, /api/launches/:id/image, /api/launches/:id/candles, /api/launches/:id/ledger, /api/mint, /api/events.

Authentication: POST /api/auth/challenge and /api/auth/verify; GET /api/auth/me; POST /api/auth/logout. Mutation requests require the exact Origin. Authenticated mutations also require x-csrf-token returned by authentication.

Signed-in routes: POST /api/launches (Idempotency-Key required), GET/POST /api/watchlist, POST /api/tokenomics/quote and /api/tokenomics/plan. POST /api/launches/:id/prepare deliberately returns 503 until blockchain integration exists. POST /api/admin/events requires an ADMIN_WALLETS allowlisted signer. Leave that setting empty to disable operator reporting.

Amounts use integer atomic-unit strings: Circle USDC has six decimals. Client token names/tickers never determine the trusted quote mint. The proposed supply defaults to one billion tokens at six decimals; this is a draft parameter, not minted supply.

## Render
render.yaml defines one Node web service and a 1 GB persistent disk. The starter service and disk are paid resources. Connect the GitHub repository and review Blueprint charges before applying it. The build runs npm ci and npm test; health checks use /api/health. RENDER_EXTERNAL_URL is used automatically for the expected origin. Set PUBLIC_URL if attaching a custom domain.

This SQLite configuration supports one service instance, not horizontal scaling. Back up the database using SQLite online backup or a consistent stopped-service copy; test restoration before production use. Disk services have deployment availability tradeoffs. The coarse in-memory IP limiter may group requests behind a proxy and resets on restart. Use a trusted proxy-aware distributed limiter before significant public traffic.

## Required before real financial activity
1. Implement and verify LaunchLab platform configuration and separate post-graduation CPMM fee rights; do not assume fees survive graduation or apply on every terminal or alternate pool.
2. Build wallet-signed transaction preparation, simulation, slippage/expiry controls, confirmations, USDC mint validation and indexer reconciliation.
3. Define seed contribution ownership/refunds, acquire both pool assets, and verify LP custody/locking. A buy is not automatically liquidity and funds must not be sent to a mint address.
4. Implement idempotent on-chain fee collection and buy/pair/add liquidity execution with inventory, minimum batch and price-impact limits. Use verified receipts, not operator reports, for production accounting.
5. Add live candles and test each target terminal. Conduct independent contract/security review and devnet end-to-end tests before mainnet activation.

The reserved SOLANA_RPC_URL, RAYDIUM_PLATFORM_ID and TREASURY_WALLET settings do not activate these missing components. No private wallet keys are stored or requested.

## Validation
npm test covers fee conservation, liquidity budget constraints, input rejection, database persistence/immutability, idempotency, wallet signatures, nonce replay, origin/CSRF checks, ownership and disabled financial execution. npm run check validates server/bridge syntax. Browser visual QA remains unverified. Frontend design history is in FRONTEND-HISTORY.md.
