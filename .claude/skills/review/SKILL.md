---
name: review
description: Review code against CLAUDE.md standards with focus on config separation, BigInt precision, and strategy patterns.
---

# Review Skill

Review code changes against the root CLAUDE.md standards.

## Usage

```
/review              # Review changed files (default)
/review <path>       # Review specific file or directory
```

## Workflow

### 1. Gather Standards

Read the root `CLAUDE.md` to understand the code standards.

### 2. Identify Files to Review

Run:
```bash
git diff --name-only origin/main...HEAD
```
Filter to `.ts` files, exclude `node_modules`, `dist`, and generated files.

For a specific path: review only files under the provided path.

### 3. Review Each File

For each file, check for violations of CLAUDE.md standards. Focus areas:

**Config Separation** (CRITICAL):
- Client utility code (e.g. `utils/maths.ts`) must NOT import from config
- Client code must NOT import from `process.env` or `dotenv`
- Client code must NOT hardcode addresses, chain IDs, or parameters that belong in config
- New parameters must be added to config types and passed through, not hardcoded
- Strategy selection must only be defined in config, never hardcoded in client

**BigInt Precision**:
- No `number` type for on-chain values (amounts, shares, caps)
- No manual `10 ** n` — use `parseUnits`/`formatUnits` or `percentToWad`
- Rounding direction is correct
- No floating-point arithmetic on token amounts

**Multi-Chain Safety**:
- No hardcoded chain-specific addresses in client code (they belong in config)
- Chain ID assumptions are documented
- New chain additions include all required config fields

**Strategy Patterns**:
- New strategies implement the `Strategy` interface
- Registered in the factory switch statement
- Type name added to the `StrategyName` union type in config
- Config constants exported from config package
- Tests added

**viem Usage**:
- Uses viem types (`Address`, `Hex`, `Chain`) consistently
- Uses `viem/actions` for chain interactions
- Proper error handling around on-chain calls

**Error Handling**:
- On-chain calls wrapped in try/catch
- Individual vault reallocation failures don't crash the bot
- Errors logged with vault address for debugging

### 4. Output Format

For each issue found:
```
[PRIORITY] TITLE
  Standard: SECTION > RULE
  FILE:LINE
  DESCRIPTION
```

Where:
- PRIORITY: P0 (critical — config/secret leak, BigInt misuse), P1 (high), P2 (medium), P3 (low)
- Standard: Reference to the CLAUDE.md section violated

### 5. No Issues

If no violations found:
```
No issues found (reviewed N files)
```
