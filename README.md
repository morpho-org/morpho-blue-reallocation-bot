# Morpho Blue Reallocation Bot

A simple, fast, and easily deployable reallocation bot for the **Morpho Blue** protocol. This bot is entirely based on **RPC calls** and is designed to automate Morpho vaults reallocations according to customizable strategies.

## Features

- Automatically rebalances assets within MetaMorpho vaults to maintain capital efficiency
- Multiple built-in strategies (EquilizeUtilizations, ApyRange)
- Per-chain strategy selection via configuration
- Multi-chain compatible (Ethereum, Base, and more)
- Configurable minimum threshold for utilization/APY changes

### Disclaimer

This bot is provided as-is, without any warranty. The **Morpho Association is not responsible** for any potential loss of funds resulting from the use of this bot, including (but not limited to) gas fees, failed transactions, or reallocations on malicious or misconfigured markets.

Use at your own risk.

## Requirements

- Node.js >= 20
- [pnpm](https://pnpm.io/) (this repo uses `pnpm` as package manager)
- A valid RPC URL (via Alchemy, Infura, etc)
- The private key of an EOA with enough funds to pay for gas

## Installation

```bash
git clone https://github.com/morpho-org/morpho-blue-reallocation-bot.git
cd morpho-blue-reallocation-bot
pnpm install
```

## Configuration

All configuration is done in the `apps/config/` package. You should not need to modify the `apps/client/` package unless you want to add a new strategy (see [Adding a New Strategy](#adding-a-new-strategy)).

### Chain and Strategy Selection

The chain and strategy configuration is done in `apps/config/src/config.ts`. Each entry in the `chains` array defines the chain to run on and the strategy to use for that chain:

```ts
export const chains: { chain: Chain; strategy: StrategyName }[] = [
  { chain: base, strategy: "apyRange" },
];
```

The strategy is selected **per chain**, so you can run different strategies on different chains.

### Secrets

For each chain, the following secrets must be set in the `.env` file at the root of the repository:

- `RPC_URL_<chainId>`: The RPC URL of the chain.
- `REALLOCATOR_PRIVATE_KEY_<chainId>`: The private key of the EOA that will execute reallocations.
- `VAULT_WHITELIST_<chainId>`: Comma-separated list of MetaMorpho vault addresses.
- `EXECUTION_INTERVAL_<chainId>`: Seconds to wait between runs.

Example for mainnet (chainId 1):

```
RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/<your-alchemy-api-key>
REALLOCATOR_PRIVATE_KEY_1=0x1234567890123456789012345678901234567890123456789012345678901234
VAULT_WHITELIST_1=0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183,0x8eB67A509616cd6A7c1B3c8C21D48FF57df3d458
EXECUTION_INTERVAL_1=900
```

### Strategy Parameters

Some strategies require chain- and vault-specific configuration. This is handled in the `apps/config/src/strategies/` folder, which contains the config files for each strategy.

#### General

- `CAP_BUFFER_PERCENT` (in `config.ts`): When supplying into a market, the bot targets this percentage of the cap instead of the full cap, to avoid hitting the exact cap limit. Defaults to `99.99` (i.e. 99.99% of the cap).

#### EquilizeUtilizations

- `DEFAULT_MIN_UTILIZATION_DELTA_BIPS`: Minimum utilization delta (in bips) to trigger a reallocation. Defaults to `250` (2.5%).
- `vaultsMinUtilizationDeltaBips`: Per-chain, per-vault overrides.

#### ApyRange

- `DEFAULT_APY_RANGE`: Global default APY range (in percent).
- `ALLOW_IDLE_REALLOCATION`: Whether the bot can reallocate liquidity into the idle market.
- `vaultsDefaultApyRanges`: Per-chain, per-vault APY range overrides.
- `marketsApyRanges`: Per-chain, per-market APY range overrides.
- `DEFAULT_MIN_APY_DELTA_BIPS`: Minimum APY delta (in bips) to trigger a reallocation.

## Strategies

### EquilizeUtilizations

1. Calculates a target utilization rate across all markets within a vault
2. Identifies markets with higher-than-target and lower-than-target utilization
3. Determines optimal withdrawals and deposits to balance utilization rates
4. Only executes reallocations when the utilization delta exceeds a minimum threshold (2.5% by default)

### ApyRange

Tries to keep listed markets' borrow APY within configured ranges. Ranges can be defined at the global level, at the vault level, or at the market level (with market-level overriding vault-level, which overrides global).

## Adding a New Strategy

If you want to add a custom strategy, you will need to modify the `apps/client/` package:

1. Create a new strategy class in `apps/client/src/strategies/` that implements the `Strategy` interface.
2. Add the strategy name to the `StrategyName` type in `apps/config/src/types.ts`.
3. Register it in the factory function in `apps/client/src/strategies/factory.ts`.
4. Set it in `apps/config/src/config.ts` for the desired chain(s).

## Run the bot

Once the bot is installed and configured, you can run it by executing the following command:

```bash
pnpm reallocate
```

This command will start the bot.
