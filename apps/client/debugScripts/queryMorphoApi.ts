import { chainConfig, chains } from "@morpho-blue-reallocation-bot/config";

import { fetchVaultData } from "../src/utils/fetchers";

async function queryMorphoApi() {
  try {
    const configs = chains.map((chain) => chainConfig(chain));
    for (const config of configs) {
      console.log(`Use Morpho Public API:`, config.morphoApiKey ? "true" : "false");

      const vaultsData = await fetchVaultData(
        config.chainId,
        config.vaultWhitelist,
        config.morphoApiKey,
      );

      console.log(`Fetched Vault Data for chain ${String(config.chainId)}:`);
      console.dir(vaultsData, { depth: 10 });

      for (const vaultData of vaultsData) {
        for (const marketData of vaultData.marketsData) {
          console.log(
            `Vault Assets ${vaultData.vaultAddress}: ${marketData.vaultAssets.toString()}`,
          );
        }
        const totalCapital = vaultData.marketsData.reduce(
          (acc, marketData) => acc + marketData.vaultAssets,
          0n,
        );
        console.log(
          `Total capital for vault ${vaultData.vaultAddress}: ${totalCapital.toString()}`,
        );
      }
    }
  } catch (err) {
    console.error("Error fetching vault data:", err);
  }
}

void queryMorphoApi();
