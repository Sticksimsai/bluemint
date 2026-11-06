# BlueMint

USDC-first Solana launchpad with a pixel UI, wallet-signed direct Raydium CPMM launches and per-token liquidity vaults. **Local SBF integration tests pass. The mainnet vault is not deployed, the keeper is not configured, and production launches remain disabled.**

## Run

Node 24.22.1 is pinned for deployment.

```sh
npm ci
npm run build
npm test
npm start
```

Set PUBLIC_URL to the browser origin and DATA_DIR to persistent storage. Environment files are not automatically loaded. Render serves the frontend and API from one origin.

## Implemented

- Wallet challenge authentication, CSRF protection, persistent immutable token profiles and watchlists.
- Recoverable owner-signed token creation, direct CPMM pool creation and initial developer purchase.
- Half the developer USDC budget seeds liquidity; the other half buys tokens. SOL costs are separate.
- Fixed mint supply, revoked mint authority, no freeze authority, immutable on-chain metadata URI pointing to the server-hosted registry.
- Per-token vaults collect creator fees and split actual net receipts 40% treasury / 60% liquidity. Raydium's protocol share is deducted before receipt. The advertised 1.25% creator fee is additional to Raydium trading fees.
- Price-bounded buyback and liquidity deposit instructions, LP custody, owner recovery of an expired unspent initial buy, and an optional fee-only keeper.
- Transaction signatures persisted before broadcast, finalized-state checks and blockhash reconciliation.
- Finalized pool reserve observations for token-page charts. These are not trade-level candles or 24-hour volume.

Mainnet execution requires the exact qualified program binary to be deployed, funded wallets and explicit activation. Standard Raydium pools do not guarantee immediate discovery in every terminal. No mainnet transaction was broadcast during implementation.

## Documentation

- [Mainnet launch operations](docs/mainnet-launches.md)
- [Contract validation and test scope](docs/contract-validation.md)
- [Release manifest](contracts/release.json)

The active chain adapter is `server/vault-chain.js`. Legacy LaunchLab helpers remain for historical tests; their setup API returns 410. The older operator-reported ledger is not an on-chain balance report.
