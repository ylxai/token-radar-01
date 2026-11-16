// The token radar's value model: one sealed snapshot in, one ranked board out.
//
// A protocol is pre-token when its index entry records no market cap, no CoinGecko id and no symbol.
// The board scores every pre-token protocol that looks like a genuine early subject -- not a wrapped,
// staked or bridged shadow of a protocol whose token already trades, not an exchange's own listing, not
// a versioned pool -- using the same five-factor function for every row. The watchlist is always folded
// in first, whether or not it would otherwise pass that filter, because covering it is the gate's own
// requirement; a snapshot's 40-protocol watchlist and the hundreds below its floor get one law, not two.
//
// Implied value is read from five figures the snapshot itself carries:
//
//   tvlMultiple  = BASE_MAX - (BASE_MAX - BASE_MIN) x log10(tvl_usd / TVL_REF_LOW) / log10(TVL_REF_HIGH / TVL_REF_LOW)
//                  clamped to [BASE_MIN, BASE_MAX]        -- a protocol's own TVL scale: a launch at a
//                  few million dollars of TVL has room to re-rate far above its TVL once it has a token
//                  (small floats, thin liquidity, high FDV/TVL comparables); a protocol already carrying
//                  tens of billions has none of that room left, so its multiple decays by TVL decade.
//   categoryMult = 1.15 fee-bearing/structuring categories (Lending, Dexs, Derivatives, CDP, RWA, Risk
//                  Curators, Onchain Capital Allocator, Yield Aggregator and the like -- the `core` tier),
//                  0.82 commoditised staking/restaking categories, 0.65 bridge/chain infrastructure, 0.5
//                  CEX, 0.9 when DefiLlama names no category, 1.0 otherwise -- the category's own risk of
//                  staying a thin-margin utility instead of a fee- and governance-bearing protocol.
//   chainMult    = 1 + CHAIN_WEIGHT x log2(1 + min(chains.length, CHAIN_CAP))
//                  -- a protocol live on more chains has already built the distribution an airdrop
//                  needs, with steeply diminishing returns past a double-digit chain count.
//   growthMult   = 1 + clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) / 100 x GROWTH_WEIGHT
//                  -- the snapshot's own seven-day TVL trend, clamped so one volatile week cannot swing
//                  a protocol's implied value by more than a third either way.
//   maturityMult = MATURITY_MIN + (MATURITY_MAX - MATURITY_MIN) x (1 - e^(-age_days / HALF_LIFE))
//                  -- how long the protocol has run with no token, an exponential approach so the first
//                  year of running un-tokenised counts for much more than the fifth; age_days unknown
//                  uses UNKNOWN_AGE_DAYS.
//
//   implied = max(1, round(tvl_usd x tvlMultiple x categoryMult x chainMult x growthMult x maturityMult))
//
// The constants are named below, shown on the dashboard and changeable in one place; no protocol's name
// ever changes which branch of the function it takes.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The category classes the model rates, each a multiplier on the TVL-scaled base. */
export interface CategoryMultipliers {
  core: number;
  staking: number;
  infra: number;
  cex: number;
  unlabeled: number;
  other: number;
}

/** The model's constants, stated on the dashboard and changeable in this one place. */
export interface ModelConstants {
  tvl_ref_low: number;
  tvl_ref_high: number;
  base_multiple_max: number;
  base_multiple_min: number;
  category_multipliers: CategoryMultipliers;
  chain_weight: number;
  chain_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_min: number;
  maturity_max: number;
  maturity_half_life_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  tvl_ref_low: 5_000_000,
  tvl_ref_high: 100_000_000_000,
  base_multiple_max: 0.4,
  base_multiple_min: 0.12,
  category_multipliers: { core: 1.15, staking: 0.82, infra: 0.65, cex: 0.5, unlabeled: 0.9, other: 1.0 },
  chain_weight: 0.05,
  chain_cap: 16,
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_min: 0.6,
  maturity_max: 1.3,
  maturity_half_life_days: 450,
  unknown_age_days: 540,
};

/** The model's version label: the dashboard names it and a page's formula quotes it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS = 60;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The model's arithmetic for one row, kept alongside the figures it was computed from. */
export interface ModelBreakdown {
  tvl_multiple: number;
  category_multiplier: number;
  chain_multiplier: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** The dashboard's compact view of one row: the same figures, with the formatted farm plan folded in. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  tvl_multiple: number;
  category_multiplier: number;
  chain_multiplier: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model that scored it. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  outside_watchlist_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const ONE_DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A value kept between `low` and `high`. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is missing or unparseable. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const end = Date.parse(`${asOf}T00:00:00Z`);
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((end - start) / ONE_DAY_MS));
}

/** The base multiple a protocol's own TVL earns: highest near the floor, decaying by TVL decade. */
export function tvlMultiple(tvlUsd: number, model: ModelConstants): number {
  const span = Math.log10(model.tvl_ref_high / model.tvl_ref_low);
  const decades = Math.log10(Math.max(tvlUsd, 1) / model.tvl_ref_low) / span;
  return clamp(model.base_multiple_max - (model.base_multiple_max - model.base_multiple_min) * decades, model.base_multiple_min, model.base_multiple_max);
}

/** Categories whose token, once issued, tends to carry real fees, governance or structuring weight -- the `core` tier. */
const CORE_CATEGORIES = new Set([
  'Dexs', 'Lending', 'Derivatives', 'CDP', 'CDP Manager', 'Yield', 'Yield Aggregator', 'RWA',
  'Onchain Capital Allocator', 'Risk Curators', 'Synthetics', 'Options', 'Options Vault',
  'Prediction Market', 'Launchpad', 'Insurance', 'Privacy', 'Payments', 'AI Agents', 'Decentralized AI',
  'Interest Rate Derivatives', 'Basis Trading', 'Liquidity Manager', 'Uncollateralized Lending',
  'Collateral Management', 'Collateral Markets', 'Algo-Stables', 'Dual-Token Stablecoin',
  'Stablecoin Issuer', 'Reserve Currency', 'NFT Marketplace', 'OTC Marketplace', 'Crypto Card Issuer',
  'Token Locker', 'Governance Incentives', 'DOR', 'Farm', 'Leveraged Farming', 'Indexes', 'CeDeFi',
]);

/** Categories whose yield is largely a commodity: staking and restaking of an existing asset. */
const STAKING_CATEGORIES = new Set(['Staking Pool', 'Anchor BTC', 'Decentralized BTC', 'Restaking']);

/** Categories that are infrastructure, priced on throughput rather than token-holder upside. */
const INFRA_CATEGORIES = new Set(['Cross Chain Bridge', 'Chain']);

/** The category risk multiplier a protocol's own `category` earns. */
export function categoryMultiplier(category: string | null, model: ModelConstants): number {
  const c = model.category_multipliers;
  if (category === null) return c.unlabeled;
  if (category === 'CEX') return c.cex;
  if (INFRA_CATEGORIES.has(category) || category === 'Bridge' || category === 'Canonical Bridge') return c.infra;
  if (STAKING_CATEGORIES.has(category) || category === 'Liquid Staking' || category === 'Liquid Restaking' || category === 'Restaked BTC') return c.staking;
  if (CORE_CATEGORIES.has(category)) return c.core;
  return c.other;
}

/** The distribution bonus a protocol's own chain count earns, saturating past `chain_cap` chains. */
export function chainMultiplier(chains: string[], model: ModelConstants): number {
  const counted = Math.min(chains.length, model.chain_cap);
  return 1 + model.chain_weight * Math.log2(1 + counted);
}

/** The growth multiplier a protocol's own seven-day TVL change earns, clamped either way. */
export function growthMultiplier(changeSevenDay: number | null, model: ModelConstants): { pct: number; multiplier: number } {
  const pct = clamp(finiteOr(changeSevenDay, 0), model.growth_floor, model.growth_cap);
  return { pct, multiplier: 1 + (pct / 100) * model.growth_weight };
}

/** The maturity multiplier a protocol's own time with no token earns, saturating by `maturity_half_life_days`. */
export function maturityMultiplier(ageInDays: number | null, model: ModelConstants): number {
  const age = ageInDays ?? model.unknown_age_days;
  const progress = 1 - Math.exp(-Math.max(age, 0) / model.maturity_half_life_days);
  return model.maturity_min + (model.maturity_max - model.maturity_min) * progress;
}

/**
 * The five multipliers and the implied value one protocol gets under `model`. The breakdown keeps each
 * multiplier at full precision, never rounded for display here: the dashboard recomputes implied_value_usd
 * from these same numbers, and rounding them first would make that recomputation drift from the board by
 * the rounding error compounded across five multiplications. Only growth_pct, which the implied value
 * itself does not use, is rounded for a tidy read.
 */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; breakdown: ModelBreakdown } {
  const age = ageDays(asOf, protocol.listed_at);
  const base = tvlMultiple(protocol.tvl_usd, model);
  const cat = categoryMultiplier(protocol.category, model);
  const chain = chainMultiplier(protocol.chains, model);
  const { pct, multiplier: growth } = growthMultiplier(protocol.change_7d, model);
  const maturity = maturityMultiplier(age, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * base * cat * chain * growth * maturity));
  return {
    implied,
    breakdown: {
      tvl_multiple: base,
      category_multiplier: cat,
      chain_multiplier: chain,
      growth_pct: round4(pct),
      growth_multiplier: growth,
      maturity_multiplier: maturity,
      age_days: age,
    },
  };
}

/** DefiLlama's version-marker rule: a name ending in a release number is a pool of another protocol. */
const VERSIONED_NAME = /\s(?:[Vv]\d+(?:\.\d+)?|\d+\.\d+)$/;

/** The watchlist's own wrapped/staked/staking rule: a whole word, in any case. */
const WRAPPED_OR_STAKED_NAME = /\b(?:wrapped|staked|staking)\b/i;

/** The watchlist's own exchange-prefix rule. */
const EXCHANGE_PREFIXED_NAME = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;

/** The watchlist's own excluded categories: bridges, commodity liquid-(re)staking wrappers, and CEX. */
const NEVER_RANKABLE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol's index entry records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a genuine early subject for the radar: pre-token, and not a wrapped, staked or
 * bridged shadow of a protocol whose token already trades, an exchange's own listing or a versioned
 * pool -- the same shape the snapshot's own watchlist rule draws, applied below its floor too.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && NEVER_RANKABLE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  if (WRAPPED_OR_STAKED_NAME.test(p.name)) return false;
  if (EXCHANGE_PREFIXED_NAME.test(p.name)) return false;
  return true;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let text = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text = `${text} Hold the position and recheck the protocol's own page.`;
  return text;
}

/** The chain a plan names: a protocol's first listed chain, or a neutral phrase when it names none. */
function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its primary chain';
}

/** How much capital one farm position needs, tiered from the protocol's own TVL. */
export function capitalForTvl(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 300;
  if (tvlUsd >= 500_000_000) return 150;
  if (tvlUsd >= 50_000_000) return 75;
  return 40;
}

/** How long to hold a position, tiered from the protocol's own age: a younger protocol needs longer proof. */
export function holdDaysForAge(age: number | null): number {
  if (age === null) return 45;
  if (age < 120) return 75;
  if (age < 365) return 50;
  if (age < 730) return 35;
  return 21;
}

/** One category's concrete farm action, naming the protocol and chain. */
type FarmAction = (name: string, capital: number, chain: string) => string;

const lendingAction: FarmAction = (name, capital, chain) => `Supply $${capital} of USDC as collateral on ${name} on ${chain} and leave the position open.`;
const liquidityAction: FarmAction = (name, capital, chain) => `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and leave it staked in the pool.`;
const yieldAction: FarmAction = (name, capital, chain) => `Deposit $${capital} into ${name}'s main vault on ${chain} and let it auto-compound.`;
const stakingAction: FarmAction = (name, capital, chain) => `Stake $${capital} of the chain's base asset through ${name} and hold the receipt token.`;
const derivativesAction: FarmAction = (name, capital, chain) => `Post $${capital} of USDC as margin on ${name} and open one small, fully-hedged position.`;
const predictionAction: FarmAction = (name, capital) => `Fund a wallet with $${capital} and take one market position on ${name}.`;
const vaultAction: FarmAction = (name, capital, chain) => `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
const stableAction: FarmAction = (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
const rwaAction: FarmAction = (name, capital, chain) => `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
const insuranceAction: FarmAction = (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
const launchpadAction: FarmAction = (name, capital, chain) => `Commit $${capital} to one of ${name}'s listed sales on ${chain} and hold any allocation received.`;
const paymentsAction: FarmAction = (name, capital, chain) => `Route $${capital} of spend through ${name} on ${chain} over several transactions.`;
const lockerAction: FarmAction = (name, capital, chain) => `Lock or route $${capital} of tokens through ${name} on ${chain} and keep the receipt.`;
const syntheticAction: FarmAction = (name, capital, chain) => `Mint or trade $${capital} of notional through ${name} on ${chain} with a fully-hedged position.`;
const aiAgentAction: FarmAction = (name, capital, chain) => `Run $${capital} of activity through ${name}'s agent product on ${chain} and keep the usage logs.`;
const indexAction: FarmAction = (name, capital, chain) => `Deposit $${capital} into one of ${name}'s index products on ${chain} and hold the shares.`;
const chainAction: FarmAction = (name, capital) => `Bridge $${capital} onto ${name} and make one transaction with its native app (a swap or a deposit) so the chain's own explorer records activity from your wallet.`;
const bridgeAction: FarmAction = (name, capital, chain) => `Bridge $${capital} across ${name} on ${chain} and complete one round-trip transfer so the bridge's own explorer records the activity.`;
const basisAction: FarmAction = (name, capital, chain) => `Open one small, delta-neutral basis position on ${name} on ${chain} (long spot, short perp) and leave it open.`;
const uncollateralizedLendingAction: FarmAction = (name, capital, chain) => `Deposit $${capital} of USDC as single-sided lending liquidity on ${name} on ${chain}; this category lends without borrower collateral, so a depositor supplies capital, not collateral.`;
const privacyAction: FarmAction = (name, capital, chain) => `Route $${capital} through ${name}'s shielded transfer on ${chain} and keep the receipt of the private transaction.`;
const nftAction: FarmAction = (name, capital, chain) => `Buy or sell one listing worth about $${capital} on ${name} on ${chain} and keep the transaction receipt.`;
const oracleAction: FarmAction = (name, capital, chain) => `Report or stake $${capital} of value through ${name} on ${chain} and keep the attestation as proof of participation.`;
const cexAction: FarmAction = (name, capital) => `Trade $${capital} of volume on ${name} and keep the account statement as proof of activity.`;
const defaultAction: FarmAction = (name, capital, chain) => `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;

/**
 * Every category the model classifies into a multiplier tier, keyed by the snapshot's own exact category
 * string -- never a substring scan, so no category can accidentally take another's action (the old
 * `.includes()` chain let "Chain" match an "ai" needle and "Indexes" match a "dex" needle). A category
 * absent from this map, including no category at all, gets the one clearly-labelled `defaultAction` below.
 */
const FARM_ACTIONS = new Map<string, FarmAction>([
  ['Lending', lendingAction],
  ['CDP', lendingAction],
  ['CDP Manager', lendingAction],
  ['Collateral Markets', lendingAction],
  ['Collateral Management', lendingAction],
  ['Dexs', liquidityAction],
  ['Liquidity Manager', liquidityAction],
  ['Leveraged Farming', liquidityAction],
  ['Farm', liquidityAction],
  ['Yield', yieldAction],
  ['Yield Aggregator', yieldAction],
  ['Staking Pool', stakingAction],
  ['Restaking', stakingAction],
  ['Anchor BTC', stakingAction],
  ['Decentralized BTC', stakingAction],
  ['Liquid Staking', stakingAction],
  ['Liquid Restaking', stakingAction],
  ['Restaked BTC', stakingAction],
  ['Derivatives', derivativesAction],
  ['Interest Rate Derivatives', derivativesAction],
  ['Prediction Market', predictionAction],
  ['Onchain Capital Allocator', vaultAction],
  ['Risk Curators', vaultAction],
  ['CeDeFi', vaultAction],
  ['Dual-Token Stablecoin', stableAction],
  ['Stablecoin Issuer', stableAction],
  ['Stablecoin Wrapper', stableAction],
  ['Reserve Currency', stableAction],
  ['Algo-Stables', stableAction],
  ['RWA', rwaAction],
  ['Insurance', insuranceAction],
  ['Launchpad', launchpadAction],
  ['Payments', paymentsAction],
  ['Crypto Card Issuer', paymentsAction],
  ['OTC Marketplace', lockerAction],
  ['Token Locker', lockerAction],
  ['Governance Incentives', lockerAction],
  ['Synthetics', syntheticAction],
  ['Options', syntheticAction],
  ['Options Vault', syntheticAction],
  ['AI Agents', aiAgentAction],
  ['Decentralized AI', aiAgentAction],
  ['Indexes', indexAction],
  ['Chain', chainAction],
  ['Cross Chain Bridge', bridgeAction],
  ['Bridge', bridgeAction],
  ['Canonical Bridge', bridgeAction],
  ['Basis Trading', basisAction],
  ['Uncollateralized Lending', uncollateralizedLendingAction],
  ['Privacy', privacyAction],
  ['NFT Marketplace', nftAction],
  ['DOR', oracleAction],
  ['CEX', cexAction],
]);

/** The category's one concrete action, in the words a farmer can follow, naming the protocol and chain. */
function actionForCategory(p: SnapshotProtocol, capital: number, chain: string): string {
  const action = p.category === null ? undefined : FARM_ACTIONS.get(p.category);
  return (action ?? defaultAction)(p.name, capital, chain);
}

/**
 * A protocol's farm plan: five concrete steps, each an action with a cost and a time, derived only from
 * the protocol's own record (category, chains, TVL, age) -- never a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = primaryChain(p);
  const capital = capitalForTvl(p.tvl_usd);
  const hold = holdDaysForAge(age);
  const action = actionForCategory(p, capital, chain);
  const gas = capital >= 150 ? 9 : 4;
  return [
    {
      text: `Set up a wallet used only for this farm, funded from an exchange withdrawal so the deposit history is clean.`,
      cost: 'under $3 of network gas for the first transfer',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital plus about $${gas} of gas on ${chain}`,
      time: '15 to 20 minutes to set up',
    },
    {
      text: `Repeat one qualifying action a week -- a deposit, a swap, a vote or a claim -- so activity spans more than one on-chain snapshot.`,
      cost: 'about $2 to $5 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, since ${p.name} has run ${age === null ? 'an unlisted stretch' : `about ${Math.round(age / 30)} months`} with no token and a short hold rarely counts toward an airdrop.`,
      cost: `the $${capital} of capital stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before unwinding, check ${p.name}'s own announcements for a points or rewards page, and claim only from the link it publishes there.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** Every protocol the board may rank: the watchlist, folded in unconditionally, plus every other protocol that looks like a genuine early subject. */
function boardCandidates(snapshot: Snapshot): SnapshotProtocol[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p] as const));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  return [...chosen.values()];
}

/** The protocols the board ranks, strongest implied value first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const scored = boardCandidates(snapshot).map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const { implied, breakdown } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, breakdown, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    implied_value_usd: s.implied,
    model: s.breakdown,
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

/** A board row's compact form for data.js, with its own age and farm plan folded in. */
function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.model.age_days,
    implied_value_usd: row.implied_value_usd,
    tvl_multiple: row.model.tvl_multiple,
    category_multiplier: row.model.category_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlistSlugs = new Set(snapshot.watchlist);
  const outside = board.filter((r) => !watchlistSlugs.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    outside_watchlist_size: outside,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json must hold a JSON object');
  const doc = raw as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');

  const protocols: SnapshotProtocol[] = doc.protocols.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new SnapshotError(`protocols[${index}] is not an object`);
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string') throw new SnapshotError(`protocols[${index}] has no slug or name`);
    if (typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`protocols[${index}] has no numeric tvl_usd`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return { as_of: doc.as_of, source: doc.source, floor_usd: doc.floor_usd, protocols, watchlist: doc.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, a flat board, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside the 100..4000 the gate takes`;

  const ranks = board.map((r) => r.rank).slice().sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} of the sorted ranks is ${ranks[i]}, not ${i + 1}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
