# BlueMint

Private interactive product preview for a USDC-first Raydium LaunchLab launchpad.

## Implemented
- Responsive black, blue, white token discovery interface.
- Search, market filters, sorting, device-local watchlist and launch drafts.
- Clearly labeled sample markets and simulated buy/sell fee allocation.
- 1.25% launchpad fee: 0.50% treasury and 0.75% traded token liquidity; Raydium fee is additional.
- Liquidity policy explanation, seed-liquidity commitment input.

## Not deployed
No mint, wallet adapter, on-chain transaction, live market feed, fee collector, treasury, keeper, or LP lock exists. This is a static product prototype. Fee calculations are illustrative. Never use its sample markets as quotes.

## Production work
1. Pin and inspect deployed LaunchLab and CPMM configurations and supported fee rights. Confirm 125 bps can be collected and allocated separately from Raydium fees before and after graduation. Do not assume the pre-graduation platform fee survives migration.
2. Implement reviewed Solana wallet transactions, live USDC mint verification, quotes, simulation, slippage limits and confirmation handling.
3. Build per-token accounting and a 40/60 split of collected launchpad fees between treasury and liquidity strategy. Preserve distinct balances and index actual collection events.
4. Define the seed-liquidity custody and refund policy and LP token source. A normal curve buy is not automatically LP provision. No funds go to a mint account.
5. Implement keeper-triggered buy-and-add operations using optimal USDC partitioning, minimum economic batch size, maximum price impact and inventory limits. Route into the canonical eligible token/USDC pool; lock resulting LP with verifiable receipts.
6. Support pre-graduation accrual without falsely claiming CPMM liquidity already exists.
7. Validate each target terminal at both trading phases. Other pools can bypass venue fees. Do not promise universal capture.
8. Confirm main launchpad token branding: user requested ticker USDC; this is not Circle USDC and must never be treated as the dollar quote mint. No platform mint is created in this prototype.
9. Audit contracts and end-to-end accounting before production financial activity.

## Validation
`node --check dist/app.js` passed. Managed browser preview relay was unavailable; browser QA remains unverified.

## Token-page and motion update
- Dedicated shareable `#token/<id>` routes with refresh/back/forward handling and unknown-token state.
- Native branded Canvas OHLC chart (no chart-vendor branding or external chart dependency): candle/line modes, six timeframes, price/illustrative-market-cap views, zoom, pointer and keyboard inspection.
- Deterministic OHLC fixtures in `dist/market.js`; not live prices. Fictional transaction rows and no mint addresses.
- Featured carousel with manual navigation, pause, focus/hover suspension, and reduced-motion behavior.
- Pixel coin float/tilt, token-card transitions, responsive terminal layout and inline fee simulator.
- Automated checks passed for JavaScript syntax and fixture invariants (OHLC bounds, positive values, interval spacing, reproducibility and token/timeframe separation).
- Managed preview relay remains unavailable, so visual browser QA is unverified.

## The Mint
The liquidity strategy is now branded The Mint with a dedicated `#mint` route, treasury-style visual identity, per-token sample allocations, time-period controls, filterable sample ledger, and reconciliation of allocated/deployed/pending capital. All values are explicitly illustrative; no live financial integration was added.

Higgsfield generated the pixel vault GIF (job fc1a599b-0a11-43e0-aa84-7cc25d7799a8). The delivered GIF is 512×384, 16 frames, 2.88 seconds. Frame inspection verified door opening and a growing pile of blue USDC coins. A first-frame PNG supports pause and reduced-motion mode. Animation is a visual metaphor, not a custody/balance representation.

Validated syntax and ledger reconciliation for each period; browser QA remains unverified because the managed preview relay is unavailable.

## USDC chip animation update
- Replaced the Mint's rectangular growth bars with layered blue-and-white USDC casino chips, using a code-native SVG and staggered looping stack animations.
- Added three bespoke landing-page process cards: launch, allocate the 0.50%/0.75% fee split, and buy/pair/add liquidity.
- Removed carousel and vault pause/play buttons and their event handlers. OS reduced-motion preferences still disable motion and select the vault poster.
- JavaScript syntax checks passed. No visible pause controls remain. Browser QA is still blocked by the unavailable managed preview relay.

## Higgsfield pixel explainer refresh
Three generated GIFs now replace the earlier CSS-only process illustrations: token/USDC pair launch, allocation flow, and growing chip stacks. They are placed immediately below the landing hero, before metrics and markets. The growing-chip animation also replaces the Mint's vector stack illustration. Code-native chip assets use stepped pixel geometry instead of smooth ellipses.

Higgsfield jobs: launch 42303f96-1c85-4888-97f2-4da686b53d9c; allocation 21549643-8e16-4223-99b0-8cfb5cc269bb; growth 7e797e1c-4063-4eda-85b4-ae3647d159c1. Contact-sheet inspection confirmed progression and pixel styling. Reduced-motion picture sources use representative static frames. No pause buttons added. These animations remain illustrative, not live transaction visualizations.

## Pixel cards and Create Launch page
Implemented Higgsfield card template reference (job 3d24ff42-98f9-48ce-bc07-cfa049cacd33) as real HTML/SVG data components, with stepped double frame, candlestick previews, sample market cap/USDC liquidity/volume/mint age, segmented bonding progress and Mint allocation badge. The generated reference is retained in assets/card-template-reference.png; financial chart values are rendered independently and remain demo data, not pixels from the generated image.

Dedicated #create page supports PNG/JPG/WebP PFP uploads up to 256 KB, name/ticker/description, HTTPS Twitter/X and website links, seed commitment, live identity preview, animated Mint treasury, review and device-local draft save. PFP and links persist with the draft and are visible on its token page. Profile is not editable through the UI after saving; this is NOT an on-chain metadata lock. Drafts have no mint address, live price chart or transactions. No wallet or financial transaction was added.

Checks: JS syntax, HTTPS URL rejection/acceptance, OHLC bounds, asset existence, removed pause controls. Managed browser preview remains unavailable.
