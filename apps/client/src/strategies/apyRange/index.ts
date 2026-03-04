import {
  ALLOW_IDLE_REALLOCATION,
  CAP_BUFFER_PERCENT,
  DEFAULT_APY_RANGE,
  DEFAULT_MIN_APY_DELTA_BIPS,
  marketsApyRanges,
  marketsMinApsDeltaBips,
  vaultsDefaultApyRanges,
  vaultsDefaultMinApsDeltaBips,
} from "@morpho-blue-reallocation-bot/config";
import { Address, Hex, maxUint256, zeroAddress } from "viem";

import {
  apyToRate,
  getDepositableAmount,
  getWithdrawableAmount,
  getUtilization,
  min,
  percentToWad,
  rateToApy,
  rateToUtilization,
  utilizationToRate,
} from "../../utils/maths";
import { MarketAllocation, VaultData } from "../../utils/types";
import { Strategy } from "../strategy";

export class ApyRange implements Strategy {
  findReallocation(vaultData: VaultData) {
    const idleMarket = vaultData.marketsData.find(
      (marketData) => marketData.params.collateralToken === zeroAddress,
    );

    const marketsData = vaultData.marketsData.filter(
      (marketData) => marketData.params.collateralToken !== zeroAddress,
    );

    let totalWithdrawableAmount = 0n;
    let totalDepositableAmount = 0n;

    let didExceedMinApyDelta = false; // (true if *at least one* market moves enough)

    for (const marketData of marketsData) {
      const apyRange = this.getApyRange(marketData.chainId, vaultData.vaultAddress, marketData.id);

      const upperUtilizationBound = rateToUtilization(
        apyToRate(apyRange.max),
        marketData.rateAtTarget,
      );
      const lowerUtilizationBound = rateToUtilization(
        apyToRate(apyRange.min),
        marketData.rateAtTarget,
      );

      const utilization = getUtilization(marketData.state);

      if (utilization > upperUtilizationBound) {
        totalDepositableAmount += getDepositableAmount(marketData, upperUtilizationBound, CAP_BUFFER_PERCENT);

        const apyDelta =
          rateToApy(utilizationToRate(upperUtilizationBound, marketData.rateAtTarget)) -
          rateToApy(utilizationToRate(utilization, marketData.rateAtTarget));

        didExceedMinApyDelta ||=
          Math.abs(Number(apyDelta / 1_000_000_000n) / 1e5) >
          this.getMinApyDeltaBips(marketData.chainId, vaultData.vaultAddress, marketData.id);
      } else if (utilization < lowerUtilizationBound) {
        totalWithdrawableAmount += getWithdrawableAmount(marketData, lowerUtilizationBound);

        const apyDelta =
          rateToApy(utilizationToRate(lowerUtilizationBound, marketData.rateAtTarget)) -
          rateToApy(utilizationToRate(utilization, marketData.rateAtTarget));

        didExceedMinApyDelta ||=
          Math.abs(Number(apyDelta / 1_000_000_000n) / 1e5) >
          this.getMinApyDeltaBips(marketData.chainId, vaultData.vaultAddress, marketData.id);
      }
    }

    let idleWithdrawal = 0n;
    let idleDeposit = 0n;

    if (idleMarket) {
      if (totalWithdrawableAmount > totalDepositableAmount && this.allowIdleReallocation()) {
        idleDeposit = min(
          totalWithdrawableAmount - totalDepositableAmount,
          idleMarket.cap - idleMarket.vaultAssets,
        );
        totalDepositableAmount += idleDeposit;
      } else if (totalDepositableAmount > totalWithdrawableAmount) {
        idleWithdrawal = min(
          totalDepositableAmount - totalWithdrawableAmount,
          idleMarket.vaultAssets,
        );
        totalWithdrawableAmount += idleWithdrawal;
      }
    }

    const toReallocate = min(totalWithdrawableAmount, totalDepositableAmount);

    if (toReallocate === 0n || !didExceedMinApyDelta) return;

    let remainingWithdrawal = toReallocate;
    let remainingDeposit = toReallocate;

    const withdrawals: MarketAllocation[] = [];
    const deposits: MarketAllocation[] = [];

    for (const marketData of marketsData) {
      const apyRange = this.getApyRange(marketData.chainId, vaultData.vaultAddress, marketData.id);

      const upperUtilizationBound = rateToUtilization(
        apyToRate(apyRange.max),
        marketData.rateAtTarget,
      );
      const lowerUtilizationBound = rateToUtilization(
        apyToRate(apyRange.min),
        marketData.rateAtTarget,
      );
      const utilization = getUtilization(marketData.state);

      if (utilization > upperUtilizationBound) {
        const deposit = min(
          getDepositableAmount(marketData, upperUtilizationBound, CAP_BUFFER_PERCENT),
          remainingDeposit,
        );
        remainingDeposit -= deposit;

        deposits.push({
          marketParams: marketData.params,
          assets: remainingDeposit === 0n ? maxUint256 : marketData.vaultAssets + deposit,
        });
      } else if (utilization < lowerUtilizationBound) {
        const withdrawal = min(
          getWithdrawableAmount(marketData, lowerUtilizationBound),
          remainingWithdrawal,
        );
        remainingWithdrawal -= withdrawal;

        withdrawals.push({
          marketParams: marketData.params,
          assets: marketData.vaultAssets - withdrawal,
        });
      }

      if (remainingWithdrawal === 0n && remainingDeposit === 0n) break;
    }

    if (idleMarket) {
      if (idleWithdrawal > 0n) {
        withdrawals.push({
          marketParams: idleMarket.params,
          assets: idleMarket.vaultAssets - idleWithdrawal,
        });
      }

      if (idleDeposit > 0n && this.allowIdleReallocation()) {
        deposits.push({
          marketParams: idleMarket.params,
          assets: maxUint256,
        });
      }
    }
    return [...withdrawals, ...deposits];
  }

  protected allowIdleReallocation() {
    return ALLOW_IDLE_REALLOCATION;
  }

  protected getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
    let apyRange = DEFAULT_APY_RANGE;

    if (vaultsDefaultApyRanges[chainId]?.[vaultAddress] !== undefined)
      apyRange = vaultsDefaultApyRanges[chainId][vaultAddress];

    if (marketsApyRanges[chainId]?.[marketId] !== undefined)
      apyRange = marketsApyRanges[chainId][marketId];

    return {
      min: percentToWad(apyRange.min),
      max: percentToWad(apyRange.max),
    };
  }

  protected getMinApyDeltaBips(chainId: number, vaultAddress: Address, marketId: Hex) {
    let minApyDeltaBips = DEFAULT_MIN_APY_DELTA_BIPS;

    if (vaultsDefaultMinApsDeltaBips[chainId]?.[vaultAddress] !== undefined)
      minApyDeltaBips = vaultsDefaultMinApsDeltaBips[chainId][vaultAddress];

    if (marketsMinApsDeltaBips[chainId]?.[marketId] !== undefined)
      minApyDeltaBips = marketsMinApsDeltaBips[chainId][marketId];

    return minApyDeltaBips;
  }
}
