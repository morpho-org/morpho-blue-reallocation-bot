import { maxUint256, zeroAddress } from "viem";

import { VaultData, VaultMarketData } from "../../utils/types";
import { Strategy } from "../strategy";

export class EqualizeCapital implements Strategy {
  findReallocation(vaultData: VaultData) {
    // Split marketsData into non-idle markets and idle market
    const nonIdleMarkets = vaultData.marketsData.filter(
      (marketData) => marketData.params.collateralToken !== zeroAddress,
    );
    const idleMarketData = vaultData.marketsData.find(
      (marketData) => marketData.params.collateralToken === zeroAddress,
    );

    // Check if ALL non-idle markets are at their supply caps
    const allMarketsAtCap = nonIdleMarkets.every(
      (marketData) => marketData.vaultAssets >= marketData.cap,
    );

    if (allMarketsAtCap) {
      console.log(
        "All non-idle markets have reached their allocation caps. No reallocation needed.",
      );
      return [];
    }

    // Calculate total capital across ALL markets (including idle)
    const totalCapital = vaultData.marketsData.reduce(
      (acc, marketData) => acc + marketData.vaultAssets,
      0n,
    );
    const numMarkets = BigInt(nonIdleMarkets.length);

    console.log(`Total capital: ${totalCapital.toString()}`);
    console.log(`Number of non-idle markets: ${numMarkets.toString()}`);

    if (numMarkets === 0n || totalCapital === 0n) {
      return [];
    }

    // Compute equal allocation per non-idle market
    const targetAllocation = totalCapital / numMarkets;
    const remainder = totalCapital % numMarkets;

    console.log(`Target allocation per non-idle market: ${targetAllocation.toString()}`);
    console.log(`Remainder: ${remainder.toString()}`);

    // Calculate target for each market, respecting supply caps
    let excessCapital = 0n;
    const marketAllocations = nonIdleMarkets.map((marketData, i) => {
      // Distribute remainder across first N markets (1 unit each)
      let proposedAllocation = targetAllocation + (i < Number(remainder) ? 1n : 0n);

      // Check if proposed allocation exceeds supply cap
      if (proposedAllocation > marketData.cap) {
        excessCapital += proposedAllocation - marketData.cap;
        proposedAllocation = marketData.cap;
        console.log(
          `Market ${marketData.id}: Capped at ${marketData.cap.toString()} (proposed was ${(targetAllocation + (i < Number(remainder) ? 1n : 0n)).toString()})`,
        );
      }

      const delta = proposedAllocation - marketData.vaultAssets;
      return { marketData, target: proposedAllocation, delta };
    });

    console.log(
      `Market allocations: ${marketAllocations.map((m) => `${m.marketData.id}: (current: ${m.marketData.vaultAssets.toString()}, target: ${m.target.toString()}, delta: ${m.delta.toString()})`).join(", ")}`,
    );
    console.log(`Excess capital to route to idle market: ${excessCapital.toString()}`);

    // Build final allocations list
    interface AllocationEntry {
      marketData: VaultMarketData;
      delta: bigint;
    }
    const allAllocations: AllocationEntry[] = [...marketAllocations];

    // Idle market target is excessCapital (whatever couldn't fit in non-idle markets)
    // This means: if no markets are capped, idle should go to 0
    // If some markets are capped, idle gets the excess
    if (idleMarketData) {
      const idleTarget = excessCapital;
      const idleDelta = idleTarget - idleMarketData.vaultAssets;
      if (idleDelta !== 0n) {
        allAllocations.push({
          marketData: idleMarketData,
          delta: idleDelta,
        });
        console.log(
          `Idle market: current=${idleMarketData.vaultAssets.toString()}, target=${idleTarget.toString()}, delta=${idleDelta.toString()}`,
        );
      }
    }

    // Sort so withdrawals (negative delta) come BEFORE supplies (positive delta)
    // This is required because MORPHO.supply() does a transferFrom, which needs the vault
    // to have idle tokens first (obtained from withdrawals)
    const sortedAllocations = allAllocations
      .filter(({ delta }) => delta !== 0n)
      .sort((a, b) => (a.delta < b.delta ? -1 : a.delta > b.delta ? 1 : 0));

    // For the LAST supply (positive delta), use maxUint256 to tell the contract
    // to supply whatever was actually withdrawn. This handles interest accrual
    // between data fetch and tx execution, avoiding InconsistentReallocation errors.
    const allocations = sortedAllocations.map(({ marketData, delta }, index) => {
      const isLastSupply = delta > 0n && index === sortedAllocations.length - 1;
      return {
        marketParams: marketData.params,
        assets: isLastSupply ? maxUint256 : marketData.vaultAssets + delta,
      };
    });

    console.log(
      `Final allocations: ${allocations.map((allocation) => `${allocation.marketParams.collateralToken}: ${allocation.assets.toString()}`).join(", ")}`,
    );

    return allocations;
  }
}
