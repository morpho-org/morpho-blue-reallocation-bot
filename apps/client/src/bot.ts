import {
  encodeFunctionData,
  type Account,
  type Address,
  type Chain,
  type Client,
  type Transport,
} from "viem";
import { estimateGas, simulateContract, writeContract } from "viem/actions";

import { metaMorphoAbi } from "../abis/MetaMorpho.js";

import { Strategy } from "./strategies/strategy.js";
import { fetchVaultData } from "./utils/fetchers.js";
import { bigIntReplacer } from "./utils/json.js";

export class ReallocationBot {
  private chainId: number;
  private client: Client<Transport, Chain, Account>;
  private vaultWhitelist: Address[];
  private strategy: Strategy;
  private morphoApiKey: string;
  constructor(
    chainId: number,
    client: Client<Transport, Chain, Account>,
    vaultWhitelist: Address[],
    strategy: Strategy,
    morphoApiKey: string,
  ) {
    this.chainId = chainId;
    this.client = client;
    this.vaultWhitelist = vaultWhitelist;
    this.strategy = strategy;
    this.morphoApiKey = morphoApiKey;
  }

  async run() {
    console.log(`Running bot on chain ${this.chainId.toString()}`);

    const { client } = this;
    const vaultsData = await fetchVaultData(this.chainId, this.vaultWhitelist, this.morphoApiKey);

    await Promise.all(
      vaultsData.map(async (vaultData) => {
        const reallocation = await this.strategy.findReallocation(vaultData);
        console.log(`Reallocation:`, JSON.stringify(reallocation, bigIntReplacer, 2));

        if (!reallocation) return;

        try {
          /// TX SIMULATION - Use simulateContract to get better error messages
          try {
            await simulateContract(client, {
              address: vaultData.vaultAddress,
              abi: metaMorphoAbi,
              functionName: "reallocate",
              args: [reallocation],
            });
            console.log(`✓ Simulation passed for ${vaultData.vaultAddress}`);
          } catch (simError) {
            // simulateContract provides better error messages
            console.error(`✗ Simulation failed for ${vaultData.vaultAddress}:`, simError);
            throw simError; // Re-throw to skip gas estimation and execution
          }

          // Gas estimation
          const populatedTx = {
            to: vaultData.vaultAddress,
            data: encodeFunctionData({
              abi: metaMorphoAbi,
              functionName: "reallocate",
              args: [reallocation],
            }),
            value: 0n, // TODO: find a way to get encoder value
          };

          const gasEstimate = await estimateGas(client, populatedTx);
          console.log(`Gas estimate: ${gasEstimate.toString()}`);

          // TX EXECUTION
          await writeContract(client, {
            address: vaultData.vaultAddress,
            abi: metaMorphoAbi,
            functionName: "reallocate",
            args: [reallocation],
          });

          console.info(`Reallocated on ${vaultData.vaultAddress}`);
        } catch (error) {
          console.error(`Failed to reallocate on ${vaultData.vaultAddress}:`, error);
        }
      }),
    );
  }
}
