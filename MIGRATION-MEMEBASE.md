# Memebase / Pump / COINx migration

New profiles carry an immutable `protocol: pump` marker and COINx mint. Existing profiles, mints, Raydium pools, fee claims and buyback allocations remain under their original USDC configuration.

Production launch mode: `LAUNCH_MODE=pump`, `ENABLE_PUMP_MINTING=true`. Keep the existing mainnet RPC, legacy Raydium identifiers, treasury and keeper configuration. No new secret key or on-chain program deployment is needed to create Pump coins. Update these two public flags on the existing Render service; merge changes without replacing unrelated environment variables.

Pump 4.1.0 `create_v2` creates Token-2022 tokens. Optional purchases use `buy_v3` atomically. The user's signed-in wallet is payer and creator; Memebase does not redirect creator fees or collect an extra platform trading fee. Pump quote-control admission, eight-decimal COINx, mainnet genesis, simulation, fixed metadata URI and finalized curve identity are verified. Signed messages must match the prepared transaction exactly. No private wallet keys are kept by this flow.

COINx mint: `Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu`.

A separate `pump_launches` table prevents resuming USDC transactions as COINx launches. New preparations expire after one minute; replacements require finalized proof that the old blockhash is invalid and the curve does not exist. Finality is checked using the persisted transaction signature. Existing legacy drafts cannot create new USDC markets after Pump mode is enabled.

New charts normalize quote/base decimals (8/6) and use Pump virtual reserves before graduation, then canonical PumpSwap vaults. Candles contain finalized observations and bounded curve-trade backfill. 24h volume is partial, and PumpSwap volume backfill is not implemented. No synthetic price history is shown. Legacy and COINx totals are never summed together.

The former 1.25% Raydium platform fee, 40/60 allocation and USDC buyback contract do **not** apply to new Pump coins. No automatic COINx buybacks or developer-buy liquidity split is advertised. Keep the legacy keeper isolated to confirmed `chain_launches` rows.

The `/fees` page links to Pump creator-fee tools. Legacy treasury claims remain at `/fees/legacy`. `/docs` explains pairings, launches, fees, treasury, charts and liquidity. The existing bluemint.fun domain remains until a new domain is configured.

Validation: `npm ci`, `npm test`, `npm run check`, `npm run build`. `node scripts/verify-pump-launch.mjs` performs read-only simulation using a funded public payer; it never broadcasts. `SIM_PAYER` and `SIM_BUY_UNITS` select read-only simulation inputs. An actual launch still requires the user's wallet approval and SOL creation costs.
