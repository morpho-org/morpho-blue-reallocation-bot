import { Range } from "@morpho-blue-reallocation-bot/config";
import { Address, Hex, maxUint256, parseUnits, zeroAddress } from "viem";
import { beforeEach, describe, expect, it } from "vitest";

import { ApyRange } from "../../../src/strategies/apyRange/index.js";
import { apyToRate, percentToWad, rateToUtilization, wMulDown } from "../../../src/utils/maths.js";
import { MarketParams, VaultData, VaultMarketData } from "../../../src/utils/types.js";

// --- Test harness ---

interface TestConfig {
  ALLOW_IDLE_REALLOCATION: boolean;
  DEFAULT_APY_RANGE: Range;
  CAP_BUFFER_PERCENT: number;
  DEFAULT_MIN_APY_DELTA_BIPS: number;
  vaultsDefaultApyRanges: Record<number, Record<Address, Range>>;
  marketsDefaultApyRanges: Record<number, Record<Hex, Range>>;
}

class TestableApyRange extends ApyRange {
  private readonly config: TestConfig;

  constructor(config: TestConfig) {
    super();
    this.config = config;
  }

  allowIdleReallocation() {
    return this.config.ALLOW_IDLE_REALLOCATION;
  }

  getApyRange(_chainId: number, _vaultAddress: Address, marketId: Hex) {
    const apyRange =
      this.config.marketsDefaultApyRanges[1]?.[marketId] ?? this.config.DEFAULT_APY_RANGE;
    return {
      min: percentToWad(apyRange.min),
      max: percentToWad(apyRange.max),
    };
  }

  getMinApyDeltaBips() {
    return this.config.DEFAULT_MIN_APY_DELTA_BIPS;
  }
}

// --- Helpers ---

const VAULT = "0x0000000000000000000000000000000000000001" as Address;
const LOAN_TOKEN = "0x0000000000000000000000000000000000000010" as Address;
const COLLATERAL = "0x0000000000000000000000000000000000000020" as Address;
const ORACLE = "0x0000000000000000000000000000000000000030" as Address;
const IRM = "0x0000000000000000000000000000000000000040" as Address;

let marketCounter = 0;

function makeMarketParams(overrides?: Partial<MarketParams>): MarketParams {
  marketCounter++;
  return {
    loanToken: LOAN_TOKEN,
    collateralToken: COLLATERAL,
    oracle: ORACLE,
    irm: IRM,
    lltv: parseUnits("0.8", 18) + BigInt(marketCounter), // unique per market
    ...overrides,
  };
}

function makeMarketId(): Hex {
  return `0x${marketCounter.toString(16).padStart(64, "0")}` as Hex;
}

/**
 * Build a market with a specific utilization.
 * utilization = totalBorrowAssets / totalSupplyAssets (in WAD).
 */
function makeMarket(opts: {
  utilization: bigint;
  vaultAssets: bigint;
  cap: bigint;
  rateAtTarget: bigint;
  id?: Hex;
  params?: MarketParams;
}): VaultMarketData {
  const totalSupplyAssets = parseUnits("100000", 6);
  const totalBorrowAssets = wMulDown(totalSupplyAssets, opts.utilization);
  return {
    chainId: 1,
    id: opts.id ?? makeMarketId(),
    params: opts.params ?? makeMarketParams(),
    state: {
      totalSupplyAssets,
      totalSupplyShares: totalSupplyAssets * 1_000_000n, // 1:1 ratio simplified
      totalBorrowAssets,
      totalBorrowShares: totalBorrowAssets * 1_000_000n,
      lastUpdate: 0n,
      fee: 0n,
    },
    cap: opts.cap,
    vaultAssets: opts.vaultAssets,
    rateAtTarget: opts.rateAtTarget,
  };
}

function makeIdleMarket(vaultAssets: bigint, cap?: bigint): VaultMarketData {
  return {
    chainId: 1,
    id: makeMarketId(),
    params: makeMarketParams({
      collateralToken: zeroAddress,
      oracle: zeroAddress,
      irm: zeroAddress,
      lltv: 0n,
    }),
    state: {
      totalSupplyAssets: vaultAssets,
      totalSupplyShares: vaultAssets * 1_000_000n,
      totalBorrowAssets: 0n,
      totalBorrowShares: 0n,
      lastUpdate: 0n,
      fee: 0n,
    },
    cap: cap ?? maxUint256,
    vaultAssets,
    rateAtTarget: 0n,
  };
}

function makeVaultData(markets: VaultMarketData[]): VaultData {
  return { vaultAddress: VAULT, marketsData: markets };
}

// A reasonable rateAtTarget (~3% APY at target utilization)
const RATE_AT_TARGET = parseUnits("0.03", 18) / (365n * 24n * 60n * 60n);

const defaultConfig: TestConfig = {
  ALLOW_IDLE_REALLOCATION: true,
  DEFAULT_APY_RANGE: { min: 2, max: 8 },
  CAP_BUFFER_PERCENT: 99.99,
  DEFAULT_MIN_APY_DELTA_BIPS: 0, // No min delta threshold so tests are predictable
  vaultsDefaultApyRanges: {},
  marketsDefaultApyRanges: {},
};

/**
 * Compute the utilization that corresponds to a given APY for a given rateAtTarget.
 */
function apyToUtilization(apyPercent: number, rateAtTarget: bigint): bigint {
  return rateToUtilization(apyToRate(percentToWad(apyPercent)), rateAtTarget);
}

// --- Tests ---

describe("ApyRange unit tests", () => {
  beforeEach(() => {
    marketCounter = 0;
  });

  describe("no reallocation needed", () => {
    it("returns undefined when all markets are within APY range", () => {
      const strategy = new TestableApyRange(defaultConfig);

      // Utilization that produces ~5% APY (within 2-8% range)
      const midUtilization = apyToUtilization(5, RATE_AT_TARGET);

      const market = makeMarket({
        utilization: midUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([market]));
      expect(result).toBeUndefined();
    });

    it("returns undefined when only one market is out of range with no counterpart", () => {
      const strategy = new TestableApyRange(defaultConfig);

      // Market above upper bound → needs deposit, but no withdrawal source
      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);

      const market = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([market]));
      expect(result).toBeUndefined();
    });

    it("returns undefined when all markets are below lower bound (no deposit targets)", () => {
      const strategy = new TestableApyRange(defaultConfig);

      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);

      const market1 = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });
      const market2 = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([market1, market2]));
      expect(result).toBeUndefined();
    });
  });

  describe("zero-delta market handling (bug fix)", () => {
    it("excludes deposit market when supply cap is already reached", () => {
      const strategy = new TestableApyRange(defaultConfig);

      // Market above upper bound, but cap already reached → deposit = 0
      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);
      const vaultAssets = parseUnits("50000", 6);
      const capReachedMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets,
        cap: vaultAssets, // cap = vaultAssets → no room to deposit
        rateAtTarget: RATE_AT_TARGET,
      });

      // Market below lower bound → withdrawal source
      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([capReachedMarket, withdrawalMarket]));

      // totalDepositableAmount = 0 because cap is reached → toReallocate = 0 → undefined
      expect(result).toBeUndefined();
    });

    it("excludes withdrawal market when vault has no assets in that market", () => {
      const strategy = new TestableApyRange(defaultConfig);

      // Market below lower bound, but vault has 0 assets → withdrawal = 0
      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const emptyMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: 0n, // no assets to withdraw
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      // Market above upper bound → deposit target
      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);
      const depositMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([emptyMarket, depositMarket]));

      // totalWithdrawableAmount = 0 → toReallocate = 0 → undefined
      expect(result).toBeUndefined();
    });

    it("skips cap-reached market but includes other deposit markets", () => {
      const strategy = new TestableApyRange(defaultConfig);

      // Market 1: above upper bound, cap reached → zero delta
      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);
      const vaultAssets1 = parseUnits("50000", 6);
      const capReachedMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: vaultAssets1,
        cap: vaultAssets1, // no room
        rateAtTarget: RATE_AT_TARGET,
      });

      // Market 2: also above upper bound, but has cap room → valid deposit target
      const depositMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      // Market 3: below lower bound → withdrawal source
      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("20000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(
        makeVaultData([capReachedMarket, depositMarket, withdrawalMarket]),
      );

      expect(result).toBeDefined();
      // Cap-reached market should NOT appear in the result
      const marketParams = result!.map((r) => r.marketParams);
      expect(marketParams).not.toContainEqual(capReachedMarket.params);
      // The other two should appear
      expect(marketParams).toContainEqual(depositMarket.params);
      expect(marketParams).toContainEqual(withdrawalMarket.params);
    });
  });

  describe("basic reallocation", () => {
    it("withdraws from below-range and deposits to above-range market", () => {
      const strategy = new TestableApyRange(defaultConfig);

      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);
      const depositMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("20000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([depositMarket, withdrawalMarket]));

      expect(result).toBeDefined();
      expect(result!.length).toBe(2);

      // Withdrawals come first, then deposits
      const [withdrawal, deposit] = result!;
      expect(withdrawal.marketParams).toEqual(withdrawalMarket.params);
      expect(deposit.marketParams).toEqual(depositMarket.params);

      // Withdrawal assets should be less than original
      expect(withdrawal.assets).toBeLessThan(withdrawalMarket.vaultAssets);
      // Deposit assets should be greater than original (or maxUint256)
      expect(deposit.assets === maxUint256 || deposit.assets > depositMarket.vaultAssets).toBe(
        true,
      );
    });

    it("does not include in-range markets in the reallocation", () => {
      const strategy = new TestableApyRange(defaultConfig);

      const midUtilization = apyToUtilization(5, RATE_AT_TARGET);
      const inRangeMarket = makeMarket({
        utilization: midUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);
      const depositMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("20000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(
        makeVaultData([inRangeMarket, depositMarket, withdrawalMarket]),
      );

      expect(result).toBeDefined();
      const marketParams = result!.map((r) => r.marketParams);
      expect(marketParams).not.toContainEqual(inRangeMarket.params);
    });
  });

  describe("min APY delta threshold", () => {
    it("returns undefined when APY delta is below threshold", () => {
      const strategy = new TestableApyRange({
        ...defaultConfig,
        DEFAULT_MIN_APY_DELTA_BIPS: 10000, // Very high threshold (100%)
      });

      const highUtilization = apyToUtilization(9, RATE_AT_TARGET); // Slightly above 8% max
      const depositMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const lowUtilization = apyToUtilization(1.5, RATE_AT_TARGET); // Slightly below 2% min
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("20000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([depositMarket, withdrawalMarket]));

      expect(result).toBeUndefined();
    });
  });

  describe("idle market handling", () => {
    it("uses idle market as deposit target for excess withdrawals", () => {
      const strategy = new TestableApyRange(defaultConfig);

      // Only a withdrawal market (below range), no deposit market
      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("20000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const idleMarket = makeIdleMarket(0n);

      const result = strategy.findReallocation(makeVaultData([withdrawalMarket, idleMarket]));

      expect(result).toBeDefined();
      // Should have withdrawal + idle deposit
      const idleAlloc = result!.find((r) => r.marketParams.collateralToken === zeroAddress);
      expect(idleAlloc).toBeDefined();
      expect(idleAlloc!.assets).toBe(maxUint256);
    });

    it("uses idle market as withdrawal source for deposits", () => {
      const strategy = new TestableApyRange(defaultConfig);

      // Only a deposit market (above range), no withdrawal market
      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);
      const depositMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const idleMarket = makeIdleMarket(parseUnits("50000", 6));

      const result = strategy.findReallocation(makeVaultData([depositMarket, idleMarket]));

      expect(result).toBeDefined();
      // Should have idle withdrawal + deposit
      const idleAlloc = result!.find((r) => r.marketParams.collateralToken === zeroAddress);
      expect(idleAlloc).toBeDefined();
      expect(idleAlloc!.assets).toBeLessThan(parseUnits("50000", 6));
    });

    it("does not use idle market when ALLOW_IDLE_REALLOCATION is false", () => {
      const strategy = new TestableApyRange({
        ...defaultConfig,
        ALLOW_IDLE_REALLOCATION: false,
      });

      // Only a withdrawal market, no deposit market
      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("20000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const idleMarket = makeIdleMarket(0n);

      const result = strategy.findReallocation(makeVaultData([withdrawalMarket, idleMarket]));

      // No deposit target available (idle disabled) → no reallocation
      expect(result).toBeUndefined();
    });
  });

  describe("last deposit gets maxUint256", () => {
    it("assigns maxUint256 to the last deposit market", () => {
      const strategy = new TestableApyRange(defaultConfig);

      const highUtilization = apyToUtilization(12, RATE_AT_TARGET);
      const depositMarket = makeMarket({
        utilization: highUtilization,
        vaultAssets: parseUnits("10000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const lowUtilization = apyToUtilization(0.5, RATE_AT_TARGET);
      const withdrawalMarket = makeMarket({
        utilization: lowUtilization,
        vaultAssets: parseUnits("20000", 6),
        cap: parseUnits("100000", 6),
        rateAtTarget: RATE_AT_TARGET,
      });

      const result = strategy.findReallocation(makeVaultData([depositMarket, withdrawalMarket]));

      expect(result).toBeDefined();
      // Last deposit (only deposit here) should get maxUint256
      const deposits = result!.filter((r) => r.marketParams === depositMarket.params);
      expect(deposits.length).toBe(1);
      expect(deposits[0].assets).toBe(maxUint256);
    });
  });
});
