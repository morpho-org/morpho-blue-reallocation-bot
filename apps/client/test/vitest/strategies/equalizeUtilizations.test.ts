import { Address, Hex, maxUint256, parseUnits } from "viem";
import { describe, expect } from "vitest";
import { EquilizeUtilizations } from "../../../src/strategies/equilizeUtilizations/index.js";
import { readContract, writeContract } from "viem/actions";
import { WBTC, MORPHO } from "../../constants.js";
import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { metaMorphoAbi } from "../../../abis/MetaMorpho.js";
import { wDivDown } from "../../../src/utils/maths.js";
import { test } from "../../setup.js";
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

describe("equilizeUtilizations strategy", () => {
  const strategy = new EquilizeUtilizations(0, 0);

  const caps = parseUnits("100000", 6);

  const suppliedAmount = parseUnits("10000", 6);
  const collateralAmount = parseUnits("2", 8);

  const loanAmount1 = parseUnits("9000", 6);
  const loanAmount2 = parseUnits("5000", 6);
  const loanAmount3 = parseUnits("2000", 6);

  const tolerance = parseUnits("1", 12); // We check that the utilization diverges from 0.0001% from the target utilization.

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

    /// Borrow

    await prepareBorrow(client, [{ address: WBTC, amount: 3n * collateralAmount }]);

    await borrow(client, [
      { marketParams: marketParams1, loanAmount: loanAmount1, collateralAmount },
      { marketParams: marketParams2, loanAmount: loanAmount2, collateralAmount },
      { marketParams: marketParams3, loanAmount: loanAmount3, collateralAmount },
    ]);

    /// Equalize

    const expectedUtilization = wDivDown(
      loanAmount1 + loanAmount2 + loanAmount3,
      suppliedAmount * 3n,
    );

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

    const vaultData = {
      vaultAddress: vault as Address,
      marketsData: [
        {
          chainId: 1,
          id: marketId1 as Hex,
          params: marketParams1,
          state: {
            totalSupplyAssets: marketState1[0],
            totalSupplyShares: marketState1[1],
            totalBorrowAssets: marketState1[2],
            totalBorrowShares: marketState1[3],
            lastUpdate: marketState1[4],
            fee: marketState1[5],
          },
          cap: caps,
          vaultAssets: suppliedAmount,
        },
        {
          chainId: 1,
          id: marketId2 as Hex,
          params: marketParams2,
          state: {
            totalSupplyAssets: marketState2[0],
            totalSupplyShares: marketState2[1],
            totalBorrowAssets: marketState2[2],
            totalBorrowShares: marketState2[3],
            lastUpdate: marketState2[4],
            fee: marketState2[5],
          },
          cap: caps,
          vaultAssets: suppliedAmount,
        },
        {
          chainId: 1,
          id: marketId3 as Hex,
          params: marketParams3,
          state: {
            totalSupplyAssets: marketState3[0],
            totalSupplyShares: marketState3[1],
            totalBorrowAssets: marketState3[2],
            totalBorrowShares: marketState3[3],
            lastUpdate: marketState3[4],
            fee: marketState3[5],
          },
          cap: caps,
          vaultAssets: suppliedAmount,
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

    const market1newUtilization = wDivDown(
      marketState1PostReallocation[2],
      marketState1PostReallocation[0],
    );
    const market2newUtilization = wDivDown(
      marketState2PostReallocation[2],
      marketState2PostReallocation[0],
    );
    const market3newUtilization = wDivDown(
      marketState3PostReallocation[2],
      marketState3PostReallocation[0],
    );

    expect(abs(market1newUtilization - expectedUtilization)).toBeLessThan(tolerance);
    expect(abs(market2newUtilization - expectedUtilization)).toBeLessThan(tolerance);
    expect(abs(market3newUtilization - expectedUtilization)).toBeLessThan(tolerance);
  });
});

const abs = (x: bigint) => (x < 0n ? -x : x);
