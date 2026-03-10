import { AnvilTestClient, testAccount } from "@morpho-org/test";
import { Address, maxUint184, maxUint256, parseUnits, zeroAddress } from "viem";
import { getTransactionReceipt, writeContract } from "viem/actions";
import { vi } from "vitest";

import { metaMorphoAbi } from "../../abis/MetaMorpho";
import { morphoBlueAbi } from "../../abis/MorphoBlue";
import { MarketParams } from "../../src/utils/types";
import { metaMorphoFactoryAbi } from "../abis/MetaMorphoFactory";
import {
  USDC,
  WBTC,
  WBTC_USDC_ORACLE,
  IRM,
  MORPHO,
  METAMORPHO_FACTORY,
  MIN_TIMELOCK,
} from "../constants";

export interface BorrowStruct {
  marketParams: MarketParams;
  collateralAmount: bigint;
  loanAmount: bigint;
}

export const marketParams1 = {
  loanToken: USDC,
  collateralToken: WBTC,
  oracle: WBTC_USDC_ORACLE,
  irm: IRM,
  lltv: parseUnits("0.385", 18),
};

export const marketParams2 = {
  loanToken: USDC,
  collateralToken: WBTC,
  oracle: WBTC_USDC_ORACLE,
  irm: IRM,
  lltv: parseUnits("0.625", 18),
};

export const marketParams3 = {
  loanToken: USDC,
  collateralToken: WBTC,
  oracle: WBTC_USDC_ORACLE,
  irm: IRM,
  lltv: parseUnits("0.77", 18),
};

export const idleMarketParams = {
  loanToken: USDC,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
};

export const supplier = testAccount(2);
export const borrower = testAccount(3);

export const marketId1 = "0x60f25d76d9cd6762dabce33cc13d2d018f0d33f9bd62323a7fbe0726e0518388";
export const marketId2 = "0x88d40fc93bdfe3328504a780f04c193e2938e0ec3d92e6339b6a960f4584229a";
export const marketId3 = "0x91e04f21833b80e4f17241964c25dabcd9b062a6e4790ec4fd52f72f3f5b1f2e";
export const idleMarketId = "0x54efdee08e272e929034a8f26f7ca34b1ebe364b275391169b28c6d7db24dbc8";

export async function setupVault(client: AnvilTestClient, cap: bigint, suppliedAmount: bigint) {
  /// Deploy markets

  await writeContract(client, {
    address: MORPHO,
    abi: morphoBlueAbi,
    functionName: "createMarket",
    args: [marketParams1],
  });

  await writeContract(client, {
    address: MORPHO,
    abi: morphoBlueAbi,
    functionName: "createMarket",
    args: [marketParams2],
  });

  await writeContract(client, {
    address: MORPHO,
    abi: morphoBlueAbi,
    functionName: "createMarket",
    args: [marketParams3],
  });

  /// Deploy vault

  const hash = await writeContract(client, {
    address: METAMORPHO_FACTORY,
    abi: metaMorphoFactoryAbi,
    functionName: "createMetaMorpho",
    args: [
      client.account.address,
      MIN_TIMELOCK,
      USDC,
      "Test Vault",
      "TEST",
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ],
  });

  const deploymentReceipt = await getTransactionReceipt(client, { hash });
  const vault = deploymentReceipt.logs[0]?.address!;

  /// Submit caps

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [marketParams1, cap],
  });

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [marketParams2, cap],
  });

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [marketParams3, cap],
  });

  /// Accept caps

  await syncTimestamp(client, (await client.timestamp()) + MIN_TIMELOCK);

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "acceptCap",
    args: [marketParams1],
  });

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "acceptCap",
    args: [marketParams2],
  });

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "acceptCap",
    args: [marketParams3],
  });

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "setSupplyQueue",
    args: [[marketId1]],
  });

  /// Deposit

  await client.deal({
    erc20: USDC,
    account: supplier.address,
    amount: suppliedAmount,
  });

  await client.approve({
    account: supplier.address,
    address: USDC,
    args: [vault, maxUint256],
  });

  await writeContract(client, {
    account: supplier,
    address: vault,
    abi: metaMorphoAbi,
    functionName: "deposit",
    args: [suppliedAmount, supplier.address],
  });

  return vault;
}

export async function enableIdleMarket(client: AnvilTestClient, vault: Address) {
  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "submitCap",
    args: [idleMarketParams, maxUint184],
  });

  await syncTimestamp(client, (await client.timestamp()) + MIN_TIMELOCK);

  await writeContract(client, {
    address: vault,
    abi: metaMorphoAbi,
    functionName: "acceptCap",
    args: [idleMarketParams],
  });
}

export async function prepareBorrow(
  client: AnvilTestClient,
  collaterals: { address: Address; amount: bigint }[],
) {
  for (const collateral of collaterals) {
    await client.deal({
      erc20: collateral.address,
      account: borrower,
      amount: collateral.amount,
    });

    await client.approve({
      account: borrower,
      address: collateral.address,
      args: [MORPHO, maxUint256],
    });
  }
}

export async function borrow(client: AnvilTestClient, borrowStructs: BorrowStruct[]) {
  for (const borrowStruct of borrowStructs) {
    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "supplyCollateral",
      args: [borrowStruct.marketParams, borrowStruct.collateralAmount, borrower.address, "0x"],
    });

    await writeContract(client, {
      account: borrower,
      address: MORPHO,
      abi: morphoBlueAbi,
      functionName: "borrow",
      args: [
        borrowStruct.marketParams,
        borrowStruct.loanAmount,
        0n,
        borrower.address,
        borrower.address,
      ],
    });
  }
}

export const syncTimestamp = async (client: AnvilTestClient, timestamp?: bigint) => {
  timestamp ??= (await client.timestamp()) + 60n;

  vi.useFakeTimers({
    now: Number(timestamp) * 1000,
    toFake: ["Date"], // Avoid faking setTimeout, used to delay retries.
  });

  vi.setSystemTime(Number(timestamp) * 1000);

  await client.setNextBlockTimestamp({ timestamp });

  return timestamp;
};
