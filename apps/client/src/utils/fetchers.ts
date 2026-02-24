import {
  zeroAddress,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Hex,
  type Transport,
} from "viem";
import { readContract } from "viem/actions";
import { getChainAddresses } from "@morpho-org/blue-sdk";

import { morphoBlueAbi } from "../../abis/MorphoBlue.js";
import { adaptiveCurveIrmAbi } from "../../abis/AdaptiveCurveIrm.js";
import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { toAssetsDown } from "./maths.js";
import type { VaultData, VaultMarketData } from "./types.js";

export async function fetchVaultData(
  client: Client<Transport, Chain, Account>,
  vaultAddresses: Address[],
): Promise<VaultData[]> {
  const chainId = client.chain.id;
  const { morpho, adaptiveCurveIrm } = getChainAddresses(chainId);

  return Promise.all(
    vaultAddresses.map(async (vaultAddress): Promise<VaultData> => {
      // 1. Get withdraw queue length
      const queueLength = await readContract(client, {
        address: vaultAddress,
        abi: metaMorphoAbi,
        functionName: "withdrawQueueLength",
      });

      // 2. Get all market IDs from withdraw queue
      const marketIds = await Promise.all(
        Array.from({ length: Number(queueLength) }, (_, i) =>
          readContract(client, {
            address: vaultAddress,
            abi: metaMorphoAbi,
            functionName: "withdrawQueue",
            args: [BigInt(i)],
          }),
        ),
      );

      // 3. For each market, fetch all data in parallel
      const marketsData = await Promise.all(
        marketIds.map(async (id): Promise<VaultMarketData> => {
          const [params, marketState, position, config] = await Promise.all([
            readContract(client, {
              address: morpho,
              abi: morphoBlueAbi,
              functionName: "idToMarketParams",
              args: [id],
            }),
            readContract(client, {
              address: morpho,
              abi: morphoBlueAbi,
              functionName: "market",
              args: [id],
            }),
            readContract(client, {
              address: morpho,
              abi: morphoBlueAbi,
              functionName: "position",
              args: [id, vaultAddress],
            }),
            readContract(client, {
              address: vaultAddress,
              abi: metaMorphoAbi,
              functionName: "config",
              args: [id],
            }),
          ]);

          const [loanToken, collateralToken, oracle, irm, lltv] = params;
          const [
            totalSupplyAssets,
            totalSupplyShares,
            totalBorrowAssets,
            totalBorrowShares,
            lastUpdate,
            fee,
          ] = marketState;
          const [supplyShares] = position;
          const [cap] = config;

          // 4. Fetch rateAtTarget for non-idle markets
          let rateAtTarget = 0n;
          if (irm !== zeroAddress) {
            rateAtTarget = await readContract(client, {
              address: adaptiveCurveIrm,
              abi: adaptiveCurveIrmAbi,
              functionName: "rateAtTarget",
              args: [id],
            });
          }

          const vaultAssets = toAssetsDown(supplyShares, totalSupplyAssets, totalSupplyShares);

          return {
            chainId,
            id: id as Hex,
            params: {
              loanToken,
              collateralToken,
              oracle,
              irm,
              lltv,
            },
            state: {
              totalSupplyAssets,
              totalSupplyShares,
              totalBorrowAssets,
              totalBorrowShares,
              lastUpdate,
              fee,
            },
            cap: BigInt(cap),
            vaultAssets,
            rateAtTarget: BigInt(rateAtTarget),
          };
        }),
      );

      return {
        vaultAddress,
        marketsData,
      };
    }),
  );
}
