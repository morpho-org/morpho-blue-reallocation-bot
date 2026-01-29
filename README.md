# Morpho Blue Reallocation Bot

A simple, fast, and easily deployable reallocation bot for the **Morpho Blue** protocol. This bot is entirely based on **RPC calls and the Morpho API** and is designed to automate Morpho vaultsV1 reallocations according customable strategies.

## Features

- Automatically rebalances assets within MetaMorpho vaults to maintain capital efficiency
- Equalizes utilization rates across markets
- Multi-chain compatible (Ethereum, Base, and more)
- Configurable minimum threshold for utilization changes (2.5% by default)

### ⚠️ Disclaimer

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

## Chain Configuration

The bot can be configured to run on any EVM-compatible chain where the Morpho stack has been deployed and supported by the Morpho API. The chain configuration is done in the `apps/config/config.ts` file. Just fill the array with the chains where you want the bot to run.

### Secrets

**Database secrets (optional):**

- `POSTGRES_DATABASE_URL`: The URL of the postgres database that will be used by the bot. If not set, the bot will launch a docker container with a local postgres database.

**Chain secrets:**

For each chain, the following secrets must be set:

- `RPC_URL`: The RPC URL of the chain that will be used by the bot.
- `REALLOCATOR_PRIVATE_KEY`: The private key of the EOA that will be used to execute the reallocations.

**Vault Whitelist**: The bot will only rebalance assets within vaults that are whitelisted:

- `VAULT_WHITELIST`: List of MetaMorpho vaults addresses.

**Execution Interval**: The bot will run once every N seconds, with this value as N:

- `EXECUTION_INTERVAL`: Seconds to wait between runs.

The secrets must be set in the `.env` file at the root of the repository, with the following keys:

- `RPC_URL_<chainId>`
- `REALLOCATOR_PRIVATE_KEY_<chainId>`
- `VAULT_WHITELIST_<chainId>`
- `EXECUTION_INTERVAL_<chainId>`

Example for mainnet (chainId 1):

```
RPC_URL_1=https://eth-mainnet.g.alchemy.com/v2/<your-alchemy-api-key>
REALLOCATOR_PRIVATE_KEY_1=0x1234567890123456789012345678901234567890123456789012345678901234
VAULT_WHITELIST_1=0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183,0x8eB67A509616cd6A7c1B3c8C21D48FF57df3d458
EXECUTION_INTERVAL_1=900
```

### Strategies config

Some strategies require some chains and vaults specific configutation.
This configuration is handled in the `apps/config/src/strategies` folder, which contains the config files of every configurable strategies.

## Reallocation Strategy

The bot uses by default an `EquilizeUtilizations` strategy that:

1. Calculates a target utilization rate across all markets within a vault
2. Identifies markets with higher-than-target and lower-than-target utilization
3. Determines optimal withdrawals and deposits to balance utilization rates
4. Only executes reallocations when the utilization delta exceeds a minimum threshold (2.5% by default)

## Apy Range Strategy

The bot can also use the `ApyRange` strategy (if you change the strategy passed to the bot in the `apps/client/src/index.ts` file).

This strategy tries to keep vaults listed markets borrow APY within the ranges defined in `apps/config/src/strategies/apyRange.ts`.
Ranges can be defined at the global level, at the vaults level, or/and at the markets level.

## Run the bot

Once the bot is installed and configured, you can run it by executing the following command:

```bash
pnpm reallocate
```

This command will start the bot.
