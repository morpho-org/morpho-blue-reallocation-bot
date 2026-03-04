# Morpho Blue Reallocation Bot

Multi-chain reallocation bot for Morpho Blue MetaMorpho vaults. Monitors vault allocations across all configured chains and executes reallocations to maintain target utilization or APY ranges.

## Architecture

Workspace monorepo with two packages:

- **`apps/config`** — Chain configurations, strategy selection, strategy parameters, and all tunable constants. This is the single source of truth for what the bot does and how.
- **`apps/client`** — Bot logic, strategy implementations, data fetching, and on-chain execution. Contains no configuration — everything is injected from config.

### Key abstractions

- **`Strategy`** (`apps/client/src/strategies/strategy.ts`) — Interface for finding reallocations on a vault. Strategies implement `findReallocation(vaultData)` which returns market allocations or `undefined` if no reallocation is needed.
- **Factory** (`apps/client/src/strategies/factory.ts`) — Maps config string identifiers (`StrategyName`) to strategy class instances. The config package exports only string names; the client package owns the implementations.
- **`ReallocationBot`** (`apps/client/src/bot.ts`) — Core orchestrator. Fetches vault data, delegates to the strategy for reallocation decisions, simulates gas, and executes transactions.

### Flow

1. Config defines which chains and strategies to use, plus all strategy parameters
2. `script.ts` reads all chain configs, resolves secrets from env vars, launches one bot per chain
3. Each bot fetches vault data (market states, positions, caps) via RPC
4. Strategy analyzes each vault and returns optimal market allocations
5. Bot simulates and executes the `reallocate` transaction on-chain

### Strategy implementations

- **`EquilizeUtilizations`** (`apps/client/src/strategies/equilizeUtilizations/`) — Calculates average utilization across all markets and reallocates to balance them. Only triggers when the utilization delta exceeds a configurable threshold.
- **`ApyRange`** (`apps/client/src/strategies/apyRange/`) — Keeps borrow APY within configured ranges per vault or per market. Supports idle market reallocation. Ranges can be overridden at global, vault, or market level.

### Utility functions

- **`maths.ts`** (`apps/client/src/utils/maths.ts`) — WAD-based fixed-point math (wMulDown, wDivDown, mulDivUp), utilization/rate/APY conversions, depositable/withdrawable amount calculations.
- **`fetchers.ts`** (`apps/client/src/utils/fetchers.ts`) — Fetches vault data (market states, positions, caps) entirely via RPC using `@morpho-org/blue-sdk-viem`.

## Non-Negotiables

- **Never commit secrets or private keys.** All secrets (RPC URLs, private keys) are resolved from environment variables in `apps/config/src/index.ts`. Never hardcode them anywhere.
- **Client code must not depend on configuration constants directly in core utilities.** Strategy parameters live in the config package (`apps/config`). Strategies import config values and pass them to utility functions. The `utils/maths.ts` module must remain pure (no config imports).
- **Never push directly to `main`.** Always use feature branches and PRs.
- **Always run tests after code changes.** Run the relevant test suite before considering work complete.
- **Preserve strategy selection via config.** Strategy selection is per-chain in `apps/config/src/config.ts`. Users should not need to modify client code to switch strategies.

## Code Standards

### TypeScript & viem

- Strict TypeScript. Use viem types (`Address`, `Hex`, `Chain`, `Transport`) throughout.
- Use `bigint` for all on-chain values. Never use `number` for token amounts, shares, or caps.
- Use `viem/actions` for chain interactions (`readContract`, `writeContract`, `estimateGas`).
- Use `parseUnits`/`formatUnits` for decimal conversions — never manual `10 ** n`.
- Use `percentToWad` from `utils/maths.ts` to convert percentage numbers to WAD-based bigints.

### BigInt precision

- Always be explicit about decimal precision when converting between units.
- `WAD = 10^18` is used as the fixed-point base. Use `wMulDown`/`wDivDown` from `utils/maths.ts`.
- When dealing with supply caps, a buffer is applied (`CAP_BUFFER_PERCENT` in config) to avoid hitting the exact cap limit when interest accrues between calculation and execution.

### Error handling

- Wrap on-chain calls in try/catch. A failing vault reallocation should not crash the bot.
- Log errors with the vault address for debugging.

### Testing

- **Strategy tests**: `pnpm test:strategies` — tests both EquilizeUtilizations and ApyRange strategies
- **Execution tests**: `pnpm test:execution` — tests bot execution with mainnet fork
- Tests use vitest with 45s timeout and mainnet fork at a pinned block number
- When adding a new strategy, always add corresponding tests

## How to Add a New Strategy

1. **Config** (`apps/config`):
   - Add the strategy name to the `StrategyName` union type in `apps/config/src/types.ts`
   - If the strategy needs configuration, create `apps/config/src/strategies/<strategyName>.ts` and export from `apps/config/src/strategies/index.ts`
   - Set the strategy for the desired chain(s) in `apps/config/src/config.ts`

2. **Client** (`apps/client`):
   - Create `apps/client/src/strategies/<strategyName>/index.ts` implementing the `Strategy` interface
   - Register it in the factory switch in `apps/client/src/strategies/factory.ts`
   - Export it from `apps/client/src/strategies/index.ts`

3. **Tests**:
   - Add `apps/client/test/vitest/strategies/<strategyName>.test.ts`
   - Run `pnpm test:strategies` to validate

## How to Add a New Chain

1. Add the chain to the `chains` array in `apps/config/src/config.ts` with the desired strategy
2. Set up environment variables: `RPC_URL_<chainId>`, `REALLOCATOR_PRIVATE_KEY_<chainId>`, `VAULT_WHITELIST_<chainId>`, `EXECUTION_INTERVAL_<chainId>`
3. Add any chain-specific strategy overrides in `apps/config/src/strategies/`

## Development Commands

- `pnpm build:config` — Build the config package (required before running tests or bot)
- `pnpm test:strategies` — Run strategy tests
- `pnpm test:execution` — Run bot execution tests
- `pnpm reallocate` — Run the bot (requires `.env`)
- `pnpm lint` — Lint all packages
