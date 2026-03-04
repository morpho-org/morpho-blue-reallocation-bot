import { Market } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";

import { apiSdk } from "../api/index.js";
import { toAssetsDown, toSharesDown } from "./maths.js";
import type { VaultData, VaultMarketData } from "./types";

export async function fetchVaultData(
  chainId: number,
  vaultAddresses: Address[],
): Promise<VaultData[]> {
  const { vaults } = await apiSdk.getVaultsData({ chainId, addresses: vaultAddresses });

  if (!vaults?.items) {
    console.error(new Error(`No vaults found for addresses: ${vaultAddresses.join(", ")}`));
    return [];
  }

  return vaults.items
    .filter(
      (vault): vault is NonNullable<typeof vault> & { state: NonNullable<typeof vault.state> } =>
        vault !== null && vault.state !== null,
    )
    .map((vault) => {
      const now = BigInt(Math.floor(Date.now() / 1000));

      const marketsData: VaultMarketData[] = vault.state.allocation.map((allocation) => {
        const { market } = allocation;

        const params = {
          loanToken: market.loanAsset.address as Address,
          collateralToken:
            (market.collateralAsset?.address ?? "0x0000000000000000000000000000000000000000") as Address,
          oracle: (market.oracle?.address ?? "0x0000000000000000000000000000000000000000") as Address,
          irm: market.irmAddress as Address,
          lltv: BigInt(market.lltv),
        };

        const apiTotalSupplyAssets = BigInt(market.state?.supplyAssets ?? "0");
        const apiTotalSupplyShares = BigInt(market.state?.supplyShares ?? "0");
        const apiVaultAssets = BigInt(allocation.supplyAssets);

        // Accrue interest to match on-chain state at execution time.
        const sdkMarket = new Market({
          params,
          totalSupplyAssets: apiTotalSupplyAssets,
          totalSupplyShares: apiTotalSupplyShares,
          totalBorrowAssets: BigInt(market.state?.borrowAssets ?? "0"),
          totalBorrowShares: BigInt(market.state?.borrowShares ?? "0"),
          lastUpdate: BigInt(market.state?.timestamp ?? "0"),
          fee: BigInt(market.state?.fee ?? "0"),
          rateAtTarget: market.state?.rateAtTarget != null ? BigInt(market.state.rateAtTarget) : undefined,
        });
        const accrualTimestamp = now > sdkMarket.lastUpdate ? now : sdkMarket.lastUpdate;
        const accrued = sdkMarket.accrueInterest(accrualTimestamp);

        // Recompute vault assets with accrued supply ratio.
        const vaultSupplyShares = toSharesDown(apiVaultAssets, apiTotalSupplyAssets, apiTotalSupplyShares);
        const vaultAssets = toAssetsDown(vaultSupplyShares, accrued.totalSupplyAssets, accrued.totalSupplyShares);

        return {
          chainId,
          id: market.uniqueKey as Hex,
          params,
          state: {
            totalSupplyAssets: accrued.totalSupplyAssets,
            totalSupplyShares: accrued.totalSupplyShares,
            totalBorrowAssets: accrued.totalBorrowAssets,
            totalBorrowShares: accrued.totalBorrowShares,
            lastUpdate: accrued.lastUpdate,
            fee: accrued.fee,
          },
          cap: BigInt(allocation.supplyCap),
          vaultAssets,
          rateAtTarget: accrued.rateAtTarget ?? 0n,
        };
      });

      return {
        vaultAddress: vault.address,
        marketsData,
      };
    });
}
