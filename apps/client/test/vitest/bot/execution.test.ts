import { maxUint256, parseUnits } from "viem";
import { readContract, writeContract } from "viem/actions";
import { describe, expect } from "vitest";

import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { morphoBlueAbi } from "../../../abis/MorphoBlue.js";
import { ReallocationBot } from "../../../src/bot.js";
import { EquilizeUtilizations } from "../../../src/strategies/equilizeUtilizations/index.js";
import { WBTC, MORPHO } from "../../constants.js";
import { test } from "../../setup.js";
import {
  setupVault,
  syncTimestamp,
  marketParams1,
  marketParams2,
  marketParams3,
  marketId1,
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

    const [marketState1] = await Promise.all([
      readContract(client, {
        address: MORPHO,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [marketId1],
      }),
    ]);

    // first market is at 100% utilization
    expect(marketState1[2]).toBe(marketState1[0]);

    await syncTimestamp(client);

    const bot = new ReallocationBot(client, [vault], strategy);

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
