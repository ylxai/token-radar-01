---
sessionId: session-261116-150857-o8q5
---

# Audit Findings

### What was verified as correct
- `MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json` runs cleanly (exit 0) and writes all five required outputs: `board.json`, `data.js`, `dashboard/`, `screenshots/`, `dossier.json`.
- **Gate audit (programmatic, on real output)**: 197 rows (within 100..4000); ranks are exactly 1..197 once each; `implied_value_usd` is strictly non-increasing by rank (not flat); all 40 watchlist slugs present; every `farm_steps` array has 3-12 strings of 20-600 chars; all `implied_value_usd` are positive whole numbers; no duplicate slugs.
- **Dossier parity**: `buildDossier('out', ...)` called directly returns bytes identical (`Buffer.compare === 0`) to the written `out/dossier.json` (an earlier string-equality check was a false alarm — `buildDossier` returns a `Uint8Array`/`Buffer`, not a string).
- **Screenshot caps**: 3 PNGs (<=4), each well under 512 KiB (153-193 KB); dashboard source is 3 files / 41.7 KB total (well under the 400-file / 4 MiB gate cap and the 64 KB source budget).
- Visually (from `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png`): the dark navy/charcoal theme with one green accent, monospace numerals, consistent spacing, sortable board, working filters, and a detail drawer with full step-by-step arithmetic and a live recompute-check are all present and functioning as designed.

### Weaknesses found (with evidence)
**1. Farm-plan category matching is fragile and produces wrong output for real rows.** `lib/model.ts`'s `actionForCategory` matches a protocol's category with a chain of `.toLowerCase().includes(needle)` checks. This causes two confirmed, reproducible bugs on the actual board:
   - Category `"Chain"` (a pre-token blockchain's own listing, e.g. Hive Protocol) accidentally matches the AI-agent branch because `"chain".includes("ai")` is `true`. Its generated step reads *"Run $75 of activity through Hive Protocol's agent product on BSquared and keep the usage logs"* — nonsensical for a chain.
   - Category `"Indexes"` (e.g. Set Protocol) accidentally matches the DEX-liquidity branch because `"indexes".includes("dex")` is `true`. Its step reads *"Add $40 of liquidity to Set Protocol's deepest pool..."* instead of an index-product action.
   - `"Basis Trading"` (8 of 197 rows, 4%) matches no branch at all and falls through to the generic fallback (*"Deposit $X of USDC into NAME and leave the position open"*), not a funding-rate/basis-specific step.
   - `"Uncollateralized Lending"` gets *"Supply $X of USDC as collateral..."* — contradicting its own category name (undercollateralized lending has no collateral step for a depositor).
   This weakens judge criterion #3 ("concrete steps... not slogans") for a measurable slice of real rows.

**2. A naming collision undermines the model's own clarity.** The model's highest-tier category bucket is internally named `anchor` (1.15x, for fee-bearing/structuring categories) and is shown on the page's formula as `catMult = category risk: anchor 1.15 / staking 0.82 / ...`. This collides with the real DefiLlama category literally named `"Anchor BTC"`, which is actually scored in the *staking* tier (0.82x), not the `anchor` tier. A judge reading the code or the page's formula next to a row whose category is `"Anchor BTC"` scored at 0.82x would reasonably be confused about what `anchor` means. Separately, the board table shows category as plain text with no visual link to which risk tier the model placed it in, which is a missed opportunity for "readable at a glance" (criterion #4/#5) given the model's own category-risk logic is a key part of the pitch.

**3. Minor UI inconsistency.** The Live-token table (`liveTable()` in `dashboard/app.js`) has no clickable/sortable column headers, unlike the main pre-token board, which weakens the page's "sortable table" consistency when toggled.

# Technical Design

### Fix 1 — Replace the substring `.includes()` ladder with an exact-category lookup
- File: `lib/model.ts`, function `actionForCategory` (and its caller `farmSteps`).
- Replace the ordered `if (c.includes(...))` chain with an explicit `Map<string, (p, capital, chain) => string>` keyed by **exact** category strings (not substrings), covering every category the model currently classifies into a multiplier tier (`ANCHOR_CATEGORIES`, `STAKING_CATEGORIES`, `INFRA_CATEGORIES` plus the standalone ones like `Basis Trading`, `Chain`, `Indexes`, `Uncollateralized Lending`, `Collateral Markets`, etc.) — this removes all accidental substring collisions by construction (no string can falsely match another's exact key).
- Fix the specific wordings found broken:
  - `Chain`: a blockchain-specific action, e.g. *"Bridge $X onto {name} and make one transaction with its native app (a swap or a deposit) so the chain's own explorer records activity from your wallet."*
  - `Indexes`: the existing index-product wording (*"Deposit into one of {name}'s index products and hold the shares"*) — now actually reachable.
  - `Basis Trading`: a funding-rate/basis-specific action, e.g. *"Open one small, delta-neutral basis position on {name} on {chain} (long spot, short perp) and leave it open."*
  - `Uncollateralized Lending`: lender-side wording, e.g. *"Deposit $X of USDC as single-sided lending liquidity on {name} on {chain}; this category lends without borrower collateral, so a depositor supplies capital, not collateral."*
- Keep a documented, clearly-labeled default entry for any category not in the map (so a future snapshot's unseen category degrades gracefully, same behavior as the old fallback) — this preserves the "never a hardcoded list of names" property: it is still driven by the snapshot's own `category` field, just matched exactly instead of fuzzily.
- Re-run the category-coverage audit script used during this review (map every distinct board category to its resulting step) to confirm zero accidental matches remain.

### Fix 2 — Resolve the "anchor"/"Anchor BTC" naming collision + add a category-tier badge
- File: `lib/model.ts`: rename the `CategoryMultipliers` interface field and `MODEL.category_multipliers` key from `anchor` to `core` (a tier name that cannot collide with any real DefiLlama category string), updating the one place the constant is defined and the `categoryMultiplier` function that reads it. Update the top-of-file comment and `ANCHOR_CATEGORIES` constant's doc-comment to clarify it feeds the `core` tier.
- File: `dashboard/app.js`, `modelPanel()`: update the formula string and the `const-grid` labels (`['Category: anchor', ...]` to `['Category: core', ...]`) to match.
- Add a small, color-coded **tier badge** next to the category text in both the board table (`boardTable()`) and the detail drawer's Record section, labeling which of the model's five tiers (`core` / `staking` / `infra` / `cex` / `unlabeled-or-other`) a row's category was scored under — reusing the existing pill pattern (`.status-pill`/`.chip` styling already in `app.css`) with new tier-specific accent colors. This ties the model's own stated logic directly to what the reader sees on every row, strengthening criteria #2 and #4/#5 together.
- New CSS: a `.tier-badge` rule family in `dashboard/app.css`, reusing existing custom properties (`--accent`, `--warn`, `--danger`, `--ink-dim`) so the palette stays consistent — no new colors introduced.

### Fix 3 — Make the Live-token table sortable
- File: `dashboard/app.js`, `liveTable()`: reuse the existing `sortHeader()` helper (already used by `boardTable()`) for the Live view's columns (Protocol, Category, Chains, TVL, 7d, Market cap), with `state.sort`/`state.dir` extended to apply to the live list the same way it already applies to the board list. This removes the only asymmetry between the two toggled views and fully satisfies "a sortable table" for both tabs.

### Re-verification plan
- Re-run `MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json` after each fix.
- Re-run the full gate audit script (rows, ranks 1..N, non-increasing implied value, watchlist coverage, farm_steps bounds, positive-whole implied values, no duplicate slugs) — must still pass.
- Re-run the dossier byte-identity check via `Buffer.compare` against a direct `buildDossier(...)` call.
- Re-run the category-coverage audit (map every board category to its farm step) to confirm no category reaches the generic fallback unless genuinely undocumented, and no accidental substring collisions remain.
- Re-capture `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png` with Playwright (already installed in this environment) against the updated dashboard, since judge criterion #1 explicitly requires "the screenshots and the code agree" — the new tier badges and fixed farm-step wording must be visible in the refreshed screenshots.
- Confirm `tsc --strict --noEmit` still passes and dashboard files still contain no `http://`/`https://`.

# Delivery Steps

###   Step 1: Fix the farm-plan category-matching bugs in lib/model.ts
`actionForCategory` produces a correct, specific farm step for every category on the board, with no accidental substring collisions.
- Replace the ordered `.includes()` if-chain with an explicit `Map` keyed by exact category strings covering every category currently classified by `ANCHOR_CATEGORIES`/`STAKING_CATEGORIES`/`INFRA_CATEGORIES` plus the standalone categories (`Basis Trading`, `Chain`, `Indexes`, `Uncollateralized Lending`, `Collateral Markets`, etc.).
- Fix the two confirmed substring bugs: `Chain` (was wrongly matching the AI-agent branch via `"chain".includes("ai")`) gets a blockchain-specific bridge-and-use action; `Indexes` (was wrongly matching the DEX branch via `"indexes".includes("dex")`) gets the index-product action.
- Rewrite the `Basis Trading` step as a funding-rate/basis-specific action instead of the generic fallback, and rewrite `Uncollateralized Lending`'s step to lender-side wording instead of the contradictory "supply as collateral" text.
- Keep one clearly-labeled default entry for any category not in the map, so unseen future categories still degrade gracefully.
- Re-run `node main.ts` and rerun the category-coverage audit (map every distinct board category to its resulting farm step) to confirm zero remaining accidental matches and that every category gets a tailored action.

###   Step 2: Resolve the anchor/"Anchor BTC" naming collision and add category-tier badges
The model's internal tier names no longer collide with any real DefiLlama category, and every row visibly shows which risk tier its category was scored under.
- In `lib/model.ts`, rename the `CategoryMultipliers.anchor` field (and `MODEL.category_multipliers.anchor`) to `core`, updating `categoryMultiplier` and the file's top-of-file doc comment accordingly.
- In `dashboard/app.js`'s `modelPanel()`, update the formula string and constants grid labels from `anchor` to `core` to match.
- Add a small color-coded tier badge (reusing the existing `.status-pill`/`.chip` pattern and the existing CSS custom properties) next to the category text in `boardTable()`'s rows and in the detail drawer's Record section, labeling the row's model tier (core / staking / infra / cex / unlabeled-or-other).
- Add the `.tier-badge` style rules to `dashboard/app.css` using only the existing palette variables.
- Re-run `node main.ts` and visually confirm the badges render correctly across a sample of categories.

###   Step 3: Make the Live-token table sortable and re-run the full verification suite
The Live-token view supports the same click-to-sort column headers as the pre-token board, and the whole entry re-passes every gate check with refreshed screenshots.
- In `dashboard/app.js`'s `liveTable()`, reuse the existing `sortHeader()` helper for its columns (Protocol, Category, Chains, TVL, 7d, Market cap), extending `state.sort`/`state.dir` handling to the live list.
- Re-run `MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json` and re-run the full gate audit: row count, ranks exactly 1..N, non-increasing implied values, full watchlist coverage, farm_steps within 3-12 steps of 20-600 chars, positive whole implied values, no duplicate slugs.
- Re-verify dossier byte-identity against a direct `buildDossier(...)` call using `Buffer.compare`, and re-check screenshot/dashboard size caps and the no-http(s) rule.
- Re-capture `screenshots/1-board.png`, `2-detail.png`, `3-filtered.png` with Playwright against the updated dashboard so the screenshots reflect the new tier badges and corrected farm steps, keeping code and screenshots in agreement.
- Confirm `tsc --strict --noEmit` still passes with zero errors.