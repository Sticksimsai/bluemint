# Stabled / Pump / USDC migration

Memebase is renamed Stabled, and new Pump launches are quoted in Circle USDC instead of COINx.

## What changed

- New profiles carry an immutable `protocol: pump` marker with `quoteMint` = USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), `quoteSymbol: USDC`, `quoteDecimals: 6`.
- Developer buys are entered and stored in USDC atomic units (six decimals).
- `server/pump.js` holds a small quote registry (`PUMP_QUOTES`). USDC is the only launchable quote. COINx stays in the registry, marked not launchable, so earlier coins keep their own mint, token program and decimals.
- Market reads, trade decoding and confirmation take the quote from each coin's profile. Prices scale by `10^(6 - quoteDecimals)`, so USDC pairs need no adjustment and COINx pairs keep their previous `0.01` factor.
- PumpSwap quote vaults are unpacked with the quote's own token program (classic SPL Token for USDC, Token-2022 for COINx).
- Discovery, market cards, the mint feed and King of Memes include USDC coins only. Atomic units of unlike quote assets are never summed.

## Existing records

No table is altered and no row is rewritten.

- COINx coins: profiles, mints, curves and pools are untouched. `/token/<mint>` and `/api/launches/<id>` still resolve and label the market as COINx. Unminted COINx drafts are refused at preparation with a 409; create a new USDC launch instead.
- Legacy BlueMint launches (no `protocol`): unchanged from the previous migration. Delisted, with metadata, images, ledger and `/fees/legacy` claims preserved.
- Stored metadata under `/m/<digest>` is immutable and keeps whatever origin and quote it was minted with.

## Production flags

`LAUNCH_MODE=pump`, `ENABLE_PUMP_MINTING=true`. Keep the existing mainnet RPC, legacy Raydium identifiers, treasury and keeper configuration. No new secret or on-chain program deployment is needed. `USDC_QUOTE_MINT` already holds the mainnet USDC mint for the legacy network check.

`PUBLIC_URL` is `https://launchonstabled.fun`. Add that custom domain to the Render service, and keep `memebase.fun` attached so metadata URLs of earlier coins resolve.

## Launch path

Pump 4.1.0 `create_v2` creates Token-2022 tokens. Optional purchases use `buy_v3` atomically with USDC from the launch wallet's associated token account. The signed-in wallet is payer and creator; Stabled does not redirect creator fees or collect a platform trading fee. Before building a transaction the server verifies mainnet genesis, that USDC resolves as a supported Pump quote with six decimals on the classic token program, and that it is present in Pump's quote-control or whitelist configuration. Simulation, fixed metadata URI and finalized curve identity are verified as before, and the signed message must match the prepared transaction exactly.

Pump selects its fee tier from the quote asset; USDC falls under its stable-quote schedule where Pump has one configured.

## Limits

- Candles contain finalized observations and bounded curve-trade backfill. 24h volume is partial.
- The USDC path is covered by unit tests. Run `node scripts/verify-pump-launch.mjs` against a mainnet RPC (read-only simulation, never broadcasts) before relying on it; `/api/chain/status` shows `USDC is not an approved Pump quote` if Pump's configuration does not admit it.
- An actual launch still requires the user's wallet approval, SOL for creation costs, and USDC only for an optional developer buy.

Validation: `npm ci`, `npm test`, `npm run check`, `npm run build`.
