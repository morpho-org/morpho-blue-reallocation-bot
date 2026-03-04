# Add Strategy

Interactive workflow for adding a new reallocation strategy. Follow CLAUDE.md "How to Add a New Strategy" exactly.

## Input

Ask the user for:
1. **Strategy name** (camelCase, e.g. `targetApy`) — this becomes the `StrategyName` union member and directory name
2. **Whether the strategy needs config constants** (per-chain parameters, per-vault overrides, etc.)

## Steps

### 1. Config package (`apps/config`)

**a) Add to union type** in `apps/config/src/types.ts`:
- Add `"<name>"` to the `StrategyName` union type

**b) If config constants are needed**, create `apps/config/src/strategies/<name>.ts`:
- Follow the pattern in existing config files (e.g. `apyRange.ts` for per-chain/per-vault records)
- Import chain objects from `viem/chains`
- Use `Record<number, Record<string, ...>>` keyed by chain ID then vault/market address
- Export from `apps/config/src/strategies/index.ts`

### 2. Client package (`apps/client`)

**a) Create strategy implementation** at `apps/client/src/strategies/<name>/index.ts`:

```typescript
import type { Strategy } from "../strategy";
import type { MarketAllocation, VaultData } from "../../utils/types";

export class <ClassName> implements Strategy {
  findReallocation(vaultData: VaultData): MarketAllocation[] | undefined {
    // TODO: implement reallocation logic
    throw new Error("Not implemented");
  }
}
```

Replace `<ClassName>` with an appropriate PascalCase class name.

**b) Register in factory** at `apps/client/src/strategies/factory.ts`:
- Add import for the new class
- Add `case "<name>":` to the switch returning `new <ClassName>()`

**c) Add re-export** in `apps/client/src/strategies/index.ts`:
- Add `export * from "./<name>";`

### 3. Test scaffold

Create `apps/client/test/vitest/strategies/<name>.test.ts`:

```typescript
import { describe, expect } from "vitest";

import { <ClassName> } from "../../../src/strategies";
import { test } from "../../setup.js";

describe("<name> strategy", () => {
  const strategy = new <ClassName>();

  test.sequential("should reallocate correctly", async ({ client }) => {
    // TODO: set up vault, supply, borrow, then run strategy
    expect(true).toBe(true);
  });
});
```

### 4. Reminder

After scaffolding, remind the user:
- Set `"<name>"` as the strategy for the desired chain(s) in `apps/config/src/config.ts`
- If the strategy imports config constants, pass them as parameters to utility functions (do not import config directly in `utils/maths.ts`)
- Run `pnpm build:config && pnpm test:strategies` to validate
