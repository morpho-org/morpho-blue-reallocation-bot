import { parseUnits } from "viem";

import { MarketState, VaultMarketData } from "./types";

export const WAD = parseUnits("1", 18);
export const YEAR = 60n * 60n * 24n * 365n;

const VIRTUAL_ASSETS = 1n;
const VIRTUAL_SHARES = 10n ** 6n;

const CURVE_STEEPNESS = 4n;
const TARGET_UTILIZATION = parseUnits("0.9", 18);

export const min = (a: bigint, b: bigint) => (a < b ? a : b);

export const mulDivDown = (x: bigint, y: bigint, d: bigint): bigint => (x * y) / d;
export const mulDivUp = (x: bigint, y: bigint, d: bigint): bigint => (x * y + (d - 1n)) / d;
export const wDivDown = (x: bigint, y: bigint): bigint => mulDivDown(x, WAD, y);
export const wDivUp = (x: bigint, y: bigint): bigint => mulDivUp(x, WAD, y);
export const wMulDown = (x: bigint, y: bigint): bigint => mulDivDown(x, y, WAD);

export const toAssetsUp = (shares: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivUp(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
};
export const toAssetsDown = (shares: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivDown(shares, totalAssets + VIRTUAL_ASSETS, totalShares + VIRTUAL_SHARES);
};
export const toSharesUp = (assets: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivUp(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS);
};
export const toSharesDown = (assets: bigint, totalAssets: bigint, totalShares: bigint): bigint => {
  return mulDivDown(assets, totalShares + VIRTUAL_SHARES, totalAssets + VIRTUAL_ASSETS);
};

export const bound = (x: bigint, min: bigint, max: bigint): bigint => {
  if (x < min) return min;
  if (x > max) return max;
  return x;
};

export const getUtilization = (marketState: MarketState) => {
  return wDivDown(marketState.totalBorrowAssets, marketState.totalSupplyAssets);
};

function getWithdrawalToUtilization(marketState: MarketState, targetUtilization: bigint) {
  return wMulDown(
    marketState.totalSupplyAssets,
    WAD - wDivDown(getUtilization(marketState), targetUtilization),
  );
}

function getDepositToUtilization(marketState: MarketState, targetUtilization: bigint) {
  return wMulDown(
    marketState.totalSupplyAssets,
    wDivDown(getUtilization(marketState), targetUtilization) - WAD,
  );
}

export function getWithdrawableAmount(marketData: VaultMarketData, targetUtilization: bigint) {
  return min(
    getWithdrawalToUtilization(marketData.state, targetUtilization),
    marketData.vaultAssets,
  );
}

export function getDepositableAmount(marketData: VaultMarketData, targetUtilization: bigint) {
  return min(
    getDepositToUtilization(marketData.state, targetUtilization),
    marketData.cap - marketData.vaultAssets,
  );
}

export const getRateFromAPY = (apy: bigint): bigint => {
  const firstTerm = apy;
  const secondTerm = wMulDown(firstTerm, firstTerm);
  const thirdTerm = wMulDown(secondTerm, firstTerm);
  const apr = firstTerm - secondTerm / 2n + thirdTerm / 3n;
  return apr / YEAR;
};

export const rateToUtilization = (wantedRate: bigint, rateAtTarget: bigint): bigint => {
  const maxRate = CURVE_STEEPNESS * rateAtTarget;
  const minRate = rateAtTarget / CURVE_STEEPNESS;
  let newUtilization = 0n;

  if (wantedRate >= maxRate) {
    newUtilization = WAD;
  } else if (wantedRate >= rateAtTarget) {
    newUtilization =
      TARGET_UTILIZATION +
      mulDivDown(WAD - TARGET_UTILIZATION, wantedRate - rateAtTarget, maxRate - rateAtTarget);
  } else if (wantedRate > minRate) {
    newUtilization = mulDivDown(TARGET_UTILIZATION, wantedRate - minRate, rateAtTarget - minRate);
  }
  return newUtilization;
};

export const percentToWad = (percent: number): bigint => {
  return parseUnits(percent.toString(), 16);
};
