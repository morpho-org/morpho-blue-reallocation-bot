import type { Address, Chain, Hex } from "viem";

export interface ChainConfig {
  chain: Chain;
  rpcUrl: string;
  vaultWhitelist: Address[];
  reallocatorPrivateKey: Hex;
}

export interface MarketParams {
  loanToken: Address;
  collateralToken: Address;
  irm: Address;
  oracle: Address;
  lltv: bigint;
}

export interface MarketState {
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  fee: bigint;
}

export interface VaultMarketData {
  chainId: number;
  id: Hex;
  params: MarketParams;
  state: MarketState;
  cap: bigint;
  vaultAssets: bigint;
  rateAtTarget: bigint;
}

export interface VaultData {
  vaultAddress: Address;
  marketsData: VaultMarketData[];
}

export interface MarketAllocation {
  marketParams: MarketParams;
  assets: bigint;
}
