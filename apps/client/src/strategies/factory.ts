import type { StrategyName } from "@morpho-blue-reallocation-bot/config";

import { ApyRange } from "./apyRange";
import { EquilizeUtilizations } from "./equilizeUtilizations";
import type { Strategy } from "./strategy";

export function createStrategy(name: StrategyName): Strategy {
  switch (name) {
    case "equilizeUtilizations":
      return new EquilizeUtilizations();
    case "apyRange":
      return new ApyRange();
  }
}
