import { chainConfig, chains } from "@morpho-blue-reallocation-bot/config";
import { launchBot } from ".";

async function run() {
  const configs = chains.map((chain) => chainConfig(chain));

  try {
    // biome-ignore lint/complexity/noForEach: <explanation>
    configs.forEach((config) => launchBot(config));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
