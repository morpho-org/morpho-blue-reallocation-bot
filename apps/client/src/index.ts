import type { ChainConfig } from "@morpho-blue-reallocation-bot/config";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ReallocationBot } from "./bot";
import { EqualizeCapital } from "./strategies/equalizeCapital";

export const launchBot = (config: ChainConfig) => {
  const client = createWalletClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
    account: privateKeyToAccount(config.reallocatorPrivateKey),
  });

  const strategy = new EqualizeCapital();

  console.log(`Client created: ${client.account.address}`);
  console.log(`Strategy created`);

  const bot = new ReallocationBot(
    config.chainId,
    client,
    config.vaultWhitelist,
    strategy,
    config.morphoApiKey,
  );

  // Run on startup.
  void bot.run();

  // Thereafter, run every `executionInterval` seconds.
  setInterval(() => {
    void bot.run();
  }, config.executionInterval * 1000);
};
