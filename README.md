# BlueMint

USDC-first launchpad frontend and persistent backend preview. **Mainnet minting, swaps, fee collection and liquidity execution are not deployed. A disabled-by-default devnet mint preparation flow is implemented.**

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

## Devnet mint integration (disabled by default)

The launch page now owns wallet connection; the header is a pixel-style Mint a token action. Decorative northeast-arrow glyphs were removed.

`GET /api/chain/status` checks the configured RPC genesis, LaunchLab program ownership and account discriminators, platform fee (12500 / 1000000), zero creator fee, expected fee-collection wallet, and quote mint. It rejects unsupported restricted-rule platforms. This checks configured accounts; it does not deploy a fee splitter.

Owner-authenticated POST `/api/launches/:id/prepare` constructs and simulates a single SDK V0 create-only transaction. It creates the constant-product curve with 80% of draft supply for curve sale, no vesting, and an explicitly configured USDC fundraising target. It makes **no initial buy or seed deposit**. Multi-transaction results are rejected. The mint keypair exists only during preparation; no private keys are stored. The persisted partial transaction contains a mint signature, not its private key.

The browser asks the wallet to review/sign; POST `.../submit` rejects any change to the prepared message or payer, verifies signatures through RPC simulation, and broadcasts the signed transaction. POST `.../confirm` verifies the finalized canonical pool identity. GET `.../chain` reports preparation state. Draft profiles remain drafts in discovery until a full live-market/indexer integration exists; confirmed devnet state is shown separately.

Preparation is idempotent per launch and expires after 60 seconds. Expired or uncertain preparations deliberately block replacement to prevent duplicate mints; reconciliation/recovery tooling is not implemented yet. Chain confirmation can recover a submitted transaction whose HTTP response was lost by checking the canonical pool. This is not production-ready lifecycle management.

Required operator settings are in `.env.example`: HTTPS RPC, platform ID, global config ID, fee wallet, devnet USDC mint, and fundraising target in atomic units. Enable only with `SOLANA_NETWORK=devnet` and `ENABLE_DEVNET_MINTING=true`. Mainnet RPCs and mainnet mode are rejected. Devnet test funds are required in the signing wallet. The test quote mint must be verified separately; an arbitrary six-decimal mint is not proof of Circle issuance.

Tests cover fee-unit mismatch, unexpected fee recipient/quote mint, restricted config rejection, altered transaction rejection, unsigned transactions, and fail-closed configuration. No funded devnet end-to-end transaction has been run. The current deployed settings leave this feature disabled.

Still required: signed platform setup, independently verified USDC global config, devnet integration tests, immutable metadata hosting/lock policy, mainnet transaction lifecycle, swap builder/indexer and live trade candles, per-token receipt-backed fee collection/splitting, buy/pair/add executor and LP lock verification. LaunchLab curve platform fees do not automatically enforce a 40/60 split or preserve 1.25% after graduation.

## Configured platform identity

Platform owner and fee-collection wallet: `85a8ERAhk1ZPYyGwj4zkjVKZdfqaEUcSpTt9GCz5xA7j`. The devnet platform PDA derived from that owner is `Cg4vFQ1kyiNzCXWiiydiXJRB6B4GSnDEhoHVFkrtiiTV`. These public identifiers are maintained in the Render Blueprint. A derived address is not evidence that the platform account has been created. The backend verifies its owner-derived PDA before accepting configuration. This does not grant ledger-operator privileges or authorize any wallet transaction.

## Owner setup and Circle-only testing

The user selected **Circle USDC only**, including on devnet. The canonical test mint is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Circle official address registry). The backend now rejects a substitute quote mint. On 2026-11-06, RPC enumeration of the five deployed LaunchLab GlobalConfig accounts found no config for this mint. Do not enable minting with Raydium’s separately named test USDC or wrapped SOL. Global configs require protocol-admin management.

`#setup` is an owner setup page. Connect the configured wallet on `#create`, then follow **Platform setup**. Public GET `/api/platform` checks devnet genesis, owner balance, canonical platform PDA, configured CPMM account and compatible Circle-USDC global configs. Owner-authenticated POST `/api/platform/prepare`, `/submit` and `/confirm` prepare, relay and verify platform creation. Existing session, Origin and CSRF controls apply.

The setup transaction atomically creates the platform (12500 / 1000000 platform fee, zero extra curve creator fee, no vesting or transfer-fee authority) and assigns the post-graduation CPMM creator to the fee wallet. Proposed migrated LP policy is 100% locked, 0% burned; the platform owner receives the Fee Key. Devnet CPMM config `7K5fZrc5LPZjDSvQZ1LmWJJoas86PX55YWBDuFqsP4qN` was verified on-chain at 2500 trade fee and 12500 creator fee, with pool creation enabled. This does not enforce 40/60 splitting or reinvestment and is not proof of any terminal’s support.

Preparation simulates without broadcasting, validates the simulated resulting account, and compares payer debit with account rent plus quoted network fee. The browser presents recipients, rates, LP rights and estimated devnet cost before wallet signing. Relay accepts only the exact prepared message and a current blockhash; newly prepared reviews supersede prior unsigned ones. Finalization checks the on-chain platform settings. Preparing a platform does not enable token launches, swaps, live candles or automation.

A funded-wallet unsigned simulation succeeded on 2026-11-06: 0.00544576 SOL rent + 0.000005 SOL network fee = 0.00545076 devnet SOL. No wallet signature or broadcast was performed by the agent. Preparations are rebuilt at review time; costs are re-estimated then.

References: https://developers.circle.com/stablecoins/usdc-contract-addresses and Raydium's published LaunchLab GlobalConfig/PlatformConfig documentation and SDK 0.2.84-alpha.
