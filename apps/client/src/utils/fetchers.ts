import type { Address, Hex } from "viem";

import { createApiSdk } from "../api/index.js";

import type { VaultData, VaultMarketData } from "./types";

export async function fetchVaultData(
  chainId: number,
  vaultAddresses: Address[],
  morphoApiKey: string,
): Promise<VaultData[]> {
  const { vaults } = await createApiSdk(morphoApiKey).getVaultsData({
    chainId,
    addresses: vaultAddresses,
  });

  if (!vaults.items) {
    console.error(new Error(`No vaults found for addresses: ${vaultAddresses.join(", ")}`));
    return [];
  }

  return vaults.items
    .filter(
      (vault): vault is typeof vault & { state: NonNullable<typeof vault.state> } =>
        vault.state !== null,
    )
    .map((vault) => {
      const marketsData: VaultMarketData[] = vault.state.allocation.map((allocation) => {
        const { market } = allocation;

        return {
          chainId,
          id: market.uniqueKey as Hex,
          params: {
            loanToken: market.loanAsset.address,
            collateralToken:
              market.collateralAsset?.address ?? "0x0000000000000000000000000000000000000000",
            oracle: market.oracle?.address ?? "0x0000000000000000000000000000000000000000",
            irm: market.irmAddress,
            lltv: market.lltv,
          },
          state: {
            totalSupplyAssets: BigInt(market.state?.supplyAssets ?? "0"),
            totalSupplyShares: BigInt(market.state?.supplyShares ?? "0"),
            totalBorrowAssets: BigInt(market.state?.borrowAssets ?? "0"),
            totalBorrowShares: BigInt(market.state?.borrowShares ?? "0"),
            lastUpdate: BigInt(market.state?.timestamp ?? "0"),
            fee: BigInt(market.state?.fee ?? "0"),
          },
          cap: allocation.supplyCap,
          vaultAssets: allocation.supplyAssets,
          rateAtTarget: BigInt(market.state?.rateAtTarget ?? "0"),
        };
      });

      return {
        vaultAddress: vault.address,
        marketsData,
      };
    });
}
