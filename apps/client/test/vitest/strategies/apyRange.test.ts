import { describe, expect } from "vitest";
import { Address, Hex, maxUint184, maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { readContract, writeContract } from "viem/actions";
import { test } from "../../setup.js";
import { morphoBlueAbi } from "../../../abis/MorphoBlue.js";
import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { adaptiveCurveIrmAbi } from "../../../abis/AdaptiveCurveIrm.js";
import { WBTC, MORPHO, IRM } from "../../constants.js";
import { Range } from "@morpho-blue-reallocation-bot/config";
import { rateToApy, getUtilization, percentToWad, WAD } from "../../../src/utils/maths.js";
import { abs, formatMarketState } from "../helpers.js";
import { ApyRange } from "../../../src/strategies/apyRange/index.js";
import {
  setupVault,
  marketParams1,
  marketParams2,
  marketParams3,
  marketId1,
  marketId2,
  marketId3,
  enableIdleMarket,
  prepareBorrow,
  borrow,
  idleMarketId,
  idleMarketParams,
} from "../vaultSetup.js";

const targetMarket1 = { min: 0.5, max: 2 };
const targetMarket2 = { min: 8, max: 12 };

const testConfig = {
  DEFAULT_APY_RANGE: { min: 2, max: 8 },
  vaultsDefaultApyRanges: {},
  marketsDefaultApyRanges: {
    [mainnet.id]: {
      [marketId1]: targetMarket1,
      [marketId2]: targetMarket2,
    },
  },
  ALLOW_IDLE_REALLOCATION: true,
};

type TestConfig = {
  ALLOW_IDLE_REALLOCATION: boolean;
  DEFAULT_APY_RANGE: Range;
  vaultsDefaultApyRanges: Record<number, Record<Address, Range>>;
  marketsDefaultApyRanges: Record<number, Record<Hex, Range>>;
};

class MinRatesTest extends ApyRange {
  private readonly config: TestConfig;

  constructor(testConfig: TestConfig) {
    super();
    this.config = testConfig;
  }

  allowIdleReallocation() {
    return this.config.ALLOW_IDLE_REALLOCATION;
  }

  getApyRange(chainId: number, vaultAddress: Address, marketId: Hex) {
    let apyRange = this.config.DEFAULT_APY_RANGE;

    if (this.config.vaultsDefaultApyRanges[chainId]?.[vaultAddress] !== undefined) {
      apyRange = this.config.vaultsDefaultApyRanges[chainId][vaultAddress];
    }

    if (this.config.marketsDefaultApyRanges[chainId]?.[marketId] !== undefined) {
      apyRange = this.config.marketsDefaultApyRanges[chainId][marketId];
    }

    return {
      min: percentToWad(apyRange.min),
      max: percentToWad(apyRange.max),
    };
  }
}

describe("equilizeUtilizations strategy", () => {
  const strategy = new MinRatesTest(testConfig);

  const caps = parseUnits("100000", 6);

  const suppliedAmount = parseUnits("10000", 6);
  const collateralAmount = parseUnits("2", 8);
  const loanAmount = parseUnits("5000", 6);

  const tolerance = parseUnits("0.01", 16); // We accept errors on the rates up to 1 BP

  test.sequential("should equalize rates", async ({ client }) => {
    const vault = await setupVault(client, caps, 3n * suppliedAmount);
    await enableIdleMarket(client, vault);

    // reallocate

    const reallocation = [
      { marketParams: marketParams1, assets: suppliedAmount },
      { marketParams: marketParams2, assets: suppliedAmount },
      { marketParams: marketParams3, assets: maxUint256 },
    ];

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [reallocation],
    });

    /// Borrow

    await prepareBorrow(client, [{ address: WBTC, amount: 3n * collateralAmount }]);

    await borrow(client, [
      { marketParams: marketParams1, loanAmount, collateralAmount },
      { marketParams: marketParams2, loanAmount, collateralAmount },
      { marketParams: marketParams3, loanAmount, collateralAmount },
    ]);

    const [marketState1, marketState2, marketState3, marketStateIdle] = await Promise.all([
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId1],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId2],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId3],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [idleMarketId],
      }),
    ]);

    const [marketState1RateAtTarget, marketState2RateAtTarget, marketState3RateAtTarget] =
      await Promise.all([
        readContract(client, {
          address: IRM,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId1],
        }),
        readContract(client, {
          address: IRM,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId2],
        }),
        readContract(client, {
          address: IRM,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [marketId3],
        }),
      ]);

    const vaultData = {
      vaultAddress: vault as Address,
      marketsData: [
        {
          chainId: 1,
          id: marketId1 as Hex,
          params: marketParams1,
          state: formatMarketState(marketState1),
          cap: caps,
          vaultAssets: suppliedAmount,
          rateAtTarget: marketState1RateAtTarget,
        },
        {
          chainId: 1,
          id: marketId2 as Hex,
          params: marketParams2,
          state: formatMarketState(marketState2),
          cap: caps,
          vaultAssets: suppliedAmount,
          rateAtTarget: marketState2RateAtTarget,
        },
        {
          chainId: 1,
          id: marketId3 as Hex,
          params: marketParams3,
          state: formatMarketState(marketState3),
          cap: caps,
          vaultAssets: suppliedAmount,
          rateAtTarget: marketState3RateAtTarget,
        },
        {
          chainId: 1,
          id: idleMarketId as Hex,
          params: idleMarketParams,
          state: formatMarketState(marketStateIdle),
          cap: maxUint184,
          vaultAssets: 0n,
          rateAtTarget: 0n,
        },
      ],
    };

    const reallocationProposed = strategy.findReallocation(vaultData)!;

    await writeContract(client, {
      address: vault,
      abi: metaMorphoAbi,
      functionName: "reallocate",
      args: [reallocationProposed],
    });

    const [
      marketState1PostReallocation,
      marketState2PostReallocation,
      marketState3PostReallocation,
    ] = await Promise.all([
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId1],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId2],
      }),
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId3],
      }),
    ]);

    const toMarketStruct = (s: readonly [bigint, bigint, bigint, bigint, bigint, bigint]) =>
      ({
        totalSupplyAssets: s[0],
        totalSupplyShares: s[1],
        totalBorrowAssets: s[2],
        totalBorrowShares: s[3],
        lastUpdate: s[4],
        fee: s[5],
      }) as const;

    const [marketState1Rate, marketState2Rate] = await Promise.all([
      readContract(client, {
        address: IRM,
        abi: adaptiveCurveIrmAbi,
        functionName: "borrowRateView",
        args: [marketParams1, toMarketStruct(marketState1PostReallocation)],
      }),
      readContract(client, {
        address: IRM,
        abi: adaptiveCurveIrmAbi,
        functionName: "borrowRateView",
        args: [marketParams2, toMarketStruct(marketState2PostReallocation)],
      }),
    ]);

    // Market 1 should be at max apy
    expect(abs(rateToApy(marketState1Rate) - percentToWad(targetMarket1.max))).toBeLessThan(
      tolerance,
    );

    // Market 2 should be at min apy
    expect(abs(rateToApy(marketState2Rate) - percentToWad(targetMarket2.min))).toBeLessThan(
      tolerance,
    );

    // Market 3 should have not been touched (same utilization as before reallocation)
    expect(getUtilization(formatMarketState(marketState3PostReallocation)) - WAD / 2n).toBeLessThan(
      tolerance,
    );
  });
});
