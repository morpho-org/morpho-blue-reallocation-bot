import type { StrategyName } from "@morpho-blue-reallocation-bot/config";
import type { Strategy } from "./strategy";
import { ApyRange } from "./apyRange";
import { EquilizeUtilizations } from "./equilizeUtilizations";

export function createStrategy(name: StrategyName): Strategy {
  switch (name) {
    case "equilizeUtilizations":
      return new EquilizeUtilizations();
    case "apyRange":
      return new ApyRange();
  }
}
