import dotenv from "dotenv";
import type { Address, Chain, Hex } from "viem";

import { chains } from "./config";
import type { ChainConfig } from "./types";

dotenv.config();

export function chainConfig(chain: Chain): ChainConfig {
  const { rpcUrl, vaultWhitelist, reallocatorPrivateKey, executionInterval, morphoApiKey } =
    getSecrets(chain);
  return {
    chain,
    chainId: chain.id,
    rpcUrl,
    reallocatorPrivateKey,
    vaultWhitelist,
    executionInterval,
    morphoApiKey,
  };
}

export function getSecrets(chain: Chain) {
  const chainId = chain.id;
  const defaultRpcUrl = chain.rpcUrls.default.http[0];

  const rpcUrl = process.env[`RPC_URL_${String(chainId)}`] ?? defaultRpcUrl;
  const vaultWhitelist = process.env[`VAULT_WHITELIST_${String(chainId)}`]?.split(",") ?? [];
  const reallocatorPrivateKey = process.env[`REALLOCATOR_PRIVATE_KEY_${String(chainId)}`];
  const executionInterval = process.env[`EXECUTION_INTERVAL_${String(chainId)}`];
  const morphoApiKey = process.env.MORPHO_API_KEY;

  if (!rpcUrl) {
    throw new Error(`No RPC URL found for chainId ${String(chainId)}`);
  }
  if (!reallocatorPrivateKey) {
    throw new Error(`No reallocator private key found for chainId ${String(chainId)}`);
  }
  if (vaultWhitelist.length === 0) {
    throw new Error(`No vault whitelist found for chainId ${String(chainId)}`);
  }
  if (!executionInterval) {
    throw new Error(`No execution interval found for chainId ${String(chainId)}`);
  }
  return {
    rpcUrl,
    vaultWhitelist: vaultWhitelist as Address[],
    reallocatorPrivateKey: reallocatorPrivateKey as Hex,
    executionInterval: Number(executionInterval),
    morphoApiKey: morphoApiKey ?? "",
  };
}

export { type ChainConfig, chains };
export * from "./strategies";
