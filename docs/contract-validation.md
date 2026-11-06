# Vault validation — 6 November 2026

Program: `9YKKi1RQgT8uco9Cecj849btWboxQ2qxYA4GXmYGHLkE`.
This is an implementation test report, not an independent security audit or proof of mainnet deployment.

## Results

- 18 Node tests passed: existing authentication/storage controls, canonical Raydium account derivation, ABI order and packet size, vault identity parsing, fee configuration changes and wrong-network rejection.
- 8 Rust tests passed: accounting conservation, rounding, reserve bounds, fresh/stale oracle handling and spot-price limits.
- SBF release compilation passed using platform-tools v1.58. Anchor emitted expected cfg warnings; no stack-offset errors were reported.
- Local validator integration passed against the public mainnet CPMM binary/configuration cloned on this date. The validator used synthetic USDC and disposable local funding only.
- Creation seeded 50 USDC from a 100 USDC budget, reserved 50 USDC, moved the full token supply into the pool and subsequently delivered purchased tokens to the owner.
- LP tokens remained in the program-derived account. Duplicate purchases, early refunds, treasury substitution and pool substitution failed.
- Fee collection conserved actual received USDC across the 40/60 split. Reinvestment without sufficient oracle history failed.
- A second isolated genesis used the actual launch snapshot with a synthetic mature oracle window and expired buy deadline. Reinvestment increased LP balance and conserved the pending budget. Expired-buy refund returned only the unspent 50 USDC, preserved seeded LP and rejected a duplicate refund.

## Scope limits

The maturity/deadline tests modify local fixtures; they do not demonstrate 15 minutes of organic price history. Pool-price observations are not a trade-level indexer. Browser signing and recovery have not been exercised with a funded mainnet wallet. No mainnet launch, deployment or keeper transaction was broadcast.

The release manifest qualifies the tested binary for deployment checks. Runtime compares the deployed program bytes with that manifest, rejects altered fees/network/account identities, and still requires `ENABLE_TOKEN_MINTING=true`. The flag alone cannot bypass missing or mismatched program deployment.

## Reproduce

Use Node 24.22.1, Rust, Solana/Agave CLI and platform-tools v1.58.

```sh
npm ci
npm test
cargo test --locked -p bluemint-vault
npm run build:contract
npm run fixtures:local
npm run test:integration
npm run test:recovery
```

Fixture preparation performs public mainnet reads only. Both integration runners start isolated local validators; test clients reject mainnet/devnet genesis hashes. Generated fixture keys, validator ledgers and compiled binaries are excluded from Git.
