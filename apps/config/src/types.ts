import type { Address, Chain, Hex } from "viem";

export interface ChainConfig {
  chain: Chain;
  chainId: number;
  rpcUrl: string;
  vaultWhitelist: Address[];
  reallocatorPrivateKey: Hex;
  executionInterval: number;
}
