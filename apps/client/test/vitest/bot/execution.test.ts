import nock from "nock";
import { maxUint256, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { EquilizeUtilizations } from "../../../src/strategies/equilizeUtilizations/index.js";
import { readContract, writeContract } from "viem/actions";
import { WBTC, MORPHO } from "../../constants.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { ReallocationBot } from "../../../src/bot.js";
import { test } from "../../setup.js";
import type { GetVaultsDataQuery } from "../../../src/api/types.js";
import {
  setupVault,
  marketParams1,
  marketParams2,
  marketParams3,
  marketId1,
  marketId2,
  marketId3,
  prepareBorrow,
  borrow,
} from "../vaultSetup.js";

describe("should test the reallocation execution", () => {
  const strategy = new EquilizeUtilizations();

  const caps = parseUnits("100000", 6);

  const suppliedAmount = parseUnits("10000", 6);
  const collateralAmount = parseUnits("2", 8);

  const loanAmount1 = parseUnits("10000", 6);
  const loanAmount2 = parseUnits("5000", 6);
  const loanAmount3 = parseUnits("2000", 6);

  test.sequential("should equalize rates", async ({ client }) => {
    // setup vault and supply

    const vault = await setupVault(client, caps, 3n * suppliedAmount);

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

    /// Supply collateral

    await prepareBorrow(client, [{ address: WBTC, amount: 3n * collateralAmount }]);

    await borrow(client, [
      { marketParams: marketParams1, loanAmount: loanAmount1, collateralAmount },
      { marketParams: marketParams2, loanAmount: loanAmount2, collateralAmount },
      { marketParams: marketParams3, loanAmount: loanAmount3, collateralAmount },
    ]);

    /// Equalize

    const [marketState1, marketState2, marketState3] = await Promise.all([
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

    // first market is at 100% utilization
    expect(marketState1[2]).toBe(marketState1[0]);

    // Mock GraphQL response matching GetVaultsDataQuery type
    const apiResponse = {
      vaults: {
        items: [
          {
            address: vault,
            state: {
              allocation: [
                {
                  market: {
                    uniqueKey: marketId1,
                    collateralAsset: {
                      address: marketParams1.collateralToken,
                    },
                    loanAsset: {
                      address: marketParams1.loanToken,
                    },
                    oracle: {
                      address: marketParams1.oracle,
                    },
                    irmAddress: marketParams1.irm,
                    lltv: marketParams1.lltv.toString(),
                    state: {
                      supplyAssets: marketState1[0].toString(),
                      supplyShares: marketState1[1].toString(),
                      borrowAssets: marketState1[2].toString(),
                      borrowShares: marketState1[3].toString(),
                      rateAtTarget: "0",
                      fee: Number(marketState1[5]),
                      timestamp: marketState1[4].toString(),
                    },
                  },
                  supplyAssets: suppliedAmount.toString(),
                  supplyCap: caps.toString(),
                },
                {
                  market: {
                    uniqueKey: marketId2,
                    collateralAsset: {
                      address: marketParams2.collateralToken,
                    },
                    loanAsset: {
                      address: marketParams2.loanToken,
                    },
                    oracle: {
                      address: marketParams2.oracle,
                    },
                    irmAddress: marketParams2.irm,
                    lltv: marketParams2.lltv.toString(),
                    state: {
                      supplyAssets: marketState2[0].toString(),
                      supplyShares: marketState2[1].toString(),
                      borrowAssets: marketState2[2].toString(),
                      borrowShares: marketState2[3].toString(),
                      rateAtTarget: "0",
                      fee: Number(marketState2[5]),
                      timestamp: marketState2[4].toString(),
                    },
                  },
                  supplyAssets: suppliedAmount.toString(),
                  supplyCap: caps.toString(),
                },
                {
                  market: {
                    uniqueKey: marketId3,
                    collateralAsset: {
                      address: marketParams3.collateralToken,
                    },
                    loanAsset: {
                      address: marketParams3.loanToken,
                    },
                    oracle: {
                      address: marketParams3.oracle,
                    },
                    irmAddress: marketParams3.irm,
                    lltv: marketParams3.lltv.toString(),
                    state: {
                      supplyAssets: marketState3[0].toString(),
                      supplyShares: marketState3[1].toString(),
                      borrowAssets: marketState3[2].toString(),
                      borrowShares: marketState3[3].toString(),
                      rateAtTarget: "0",
                      fee: Number(marketState3[5]),
                      timestamp: marketState3[4].toString(),
                    },
                  },
                  supplyAssets: suppliedAmount.toString(),
                  supplyCap: caps.toString(),
                },
              ],
            },
          },
        ],
      },
    } as unknown as GetVaultsDataQuery;

    // Mock GraphQL POST request to Blue API
    nock("https://api.morpho.org")
      .post("/graphql", (body) => {
        // Match the getVaultsData query
        return (
          body.query?.includes("getVaultsData") &&
          body.variables?.chainId === 1 &&
          body.variables?.addresses?.includes(vault)
        );
      })
      .reply(200, { data: apiResponse });

    const bot = new ReallocationBot(1, client, [vault], strategy);

    await bot.run();

    const newMarketState1 = await readContract(client, {
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "market",
      args: [marketId1],
    });

    // first market should not be at 100% utilization after reallocation
    expect(newMarketState1[2]).not.toBe(newMarketState1[0]);
  });
});
