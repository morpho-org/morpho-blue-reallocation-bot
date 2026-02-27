import { type Account, type Address, type Chain, type Client, type Hex, type Transport } from "viem";
import { readContract } from "viem/actions";
import { type MarketId } from "@morpho-org/blue-sdk";
import { fetchMarket, fetchPosition } from "@morpho-org/blue-sdk-viem";

import { metaMorphoAbi } from "../../abis/MetaMorpho.js";
import { toAssetsDown } from "./maths.js";
import type { VaultData, VaultMarketData } from "./types.js";

export async function fetchVaultData(
  client: Client<Transport, Chain, Account>,
  vaultAddresses: Address[],
): Promise<VaultData[]> {
  const chainId = client.chain.id;

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

      const now = BigInt(Math.floor(Date.now() / 1000));

      // 3. For each market, fetch all data in parallel using blue-sdk-viem
      const marketsData = await Promise.all(
        marketIds.map(async (id): Promise<VaultMarketData> => {
          const marketId = id as MarketId;

          const [market, position, config] = await Promise.all([
            fetchMarket(marketId, client, { chainId }),
            fetchPosition(vaultAddress, marketId, client, { chainId }),
            readContract(client, {
              address: vaultAddress,
              abi: metaMorphoAbi,
              functionName: "config",
              args: [id],
            }),
          ]);

          // Accrue interest to get up-to-date market state
          const accruedMarket = market.accrueInterest(now);

          const [cap] = config;

          const vaultAssets = toAssetsDown(
            position.supplyShares,
            accruedMarket.totalSupplyAssets,
            accruedMarket.totalSupplyShares,
          );

          return {
            chainId,
            id: id as Hex,
            params: {
              loanToken: accruedMarket.params.loanToken,
              collateralToken: accruedMarket.params.collateralToken,
              oracle: accruedMarket.params.oracle,
              irm: accruedMarket.params.irm,
              lltv: accruedMarket.params.lltv,
            },
            state: {
              totalSupplyAssets: accruedMarket.totalSupplyAssets,
              totalSupplyShares: accruedMarket.totalSupplyShares,
              totalBorrowAssets: accruedMarket.totalBorrowAssets,
              totalBorrowShares: accruedMarket.totalBorrowShares,
              lastUpdate: accruedMarket.lastUpdate,
              fee: accruedMarket.fee,
            },
            cap: BigInt(cap),
            vaultAssets,
            rateAtTarget: accruedMarket.rateAtTarget ?? 0n,
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
