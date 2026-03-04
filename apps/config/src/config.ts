import { base, Chain, mainnet } from "viem/chains";
import type { StrategyName } from "./types";

export const chains: { chain: Chain; strategy: StrategyName }[] = [
  { chain: mainnet, strategy: "apyRange" },
  { chain: base, strategy: "apyRange" },
];

/** Cap buffer in percent (e.g. 99.99 means targeting 99.99% of the cap). */
export const CAP_BUFFER_PERCENT = 99.99;
