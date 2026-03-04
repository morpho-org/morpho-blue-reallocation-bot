import type { Address, Chain, Hex } from "viem";

export type StrategyName = "equilizeUtilizations" | "apyRange";

export interface ChainConfig {
  chain: Chain;
  chainId: number;
  rpcUrl: string;
  vaultWhitelist: Address[];
  reallocatorPrivateKey: Hex;
  executionInterval: number;
  strategy: StrategyName;
}
