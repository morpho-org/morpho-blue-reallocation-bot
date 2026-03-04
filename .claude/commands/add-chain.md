# Add Chain

Interactive workflow for adding a new chain to the reallocation bot. Follow CLAUDE.md "How to Add a New Chain" exactly.

## Input

Ask the user for:
1. **Chain name** — e.g. `base`, `arbitrum`
2. **Is the chain available in `viem/chains`?** If not, collect: Chain ID, display name, native currency, default RPC URL
3. **Which strategy to use** (from existing `StrategyName` values)
4. **Vault whitelist** — list of vault addresses

## Steps

### 1. Add chain config

Add an entry to the `chains` array in `apps/config/src/config.ts`:

```typescript
{ chain: <chainImport>, strategy: "<strategyName>" },
```

Import the chain at the top of the file from `viem/chains`.

### 2. Add strategy-specific config

If the strategy requires per-chain configuration, update the relevant files in `apps/config/src/strategies/`:

- For `equilizeUtilizations`: add chain entries in `vaultsMinUtilizationDeltaBips` in `equilizeUtilizations.ts`
- For `apyRange`: add chain entries in `vaultsDefaultApyRanges`, `marketsApyRanges`, etc. in `apyRange.ts`

### 3. Reminder

After scaffolding, remind the user:
- Set up environment variables:
  - `RPC_URL_<chainId>` — RPC endpoint
  - `REALLOCATOR_PRIVATE_KEY_<chainId>` — private key for the reallocator wallet
  - `VAULT_WHITELIST_<chainId>` — comma-separated vault addresses
  - `EXECUTION_INTERVAL_<chainId>` — seconds between runs
- Run `pnpm build:config` to verify the config compiles
- Run `pnpm test:strategies` to validate
