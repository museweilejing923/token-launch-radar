// Token Radar, model radar-2: rank pre-token protocols by the implied value of a
// token they might one day issue, derived only from the sealed snapshot's own figures.
//
// The model has four parts, each computed from the snapshot, never from a list of names:
//
//   comparable  The category's own market multiple: the winsorised median mcap/TVL of
//               the live-token protocols in the same category (at least 3 peers, else the
//               winsorised global median). A token is worth what its category's tokens
//               already sell for, per dollar of TVL.
//   growth      Seven-day TVL change, clamped to [-50, +200]%, weighted 0.6: a protocol
//               gaining TVL fast is worth more than one shrinking, but a week's move is
//               only part of the story, so the multiplier runs 0.70 to 2.20.
//   maturity    Days since DefiLlama began tracking it, saturating at 2 years: a protocol
//               that has run a long time with no token has more pent-up launch value.
//               Unknown age counts as one year. The multiplier runs 0.70 to 1.00.
//   breadth     One extra chain past the first adds 4%, up to 6 chains: a launch that
//               reaches more chains reaches more holders. The multiplier runs 1.00 to 1.24.
//
//   implied = TVL x comparable x growth x maturity x breadth, capped at 3x TVL.
//
// Live-token protocols are never ranked: the board shows the market's own value for
// them, apart, so the two kinds are never mixed. A protocol "records no token" in the
// snapshot's language: the snapshot cannot prove it has none, so the board says so.

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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  value_cap_multiple: number;
  min_category_peers: number;
  winsor_low: number;
  winsor_high: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 200,
  maturity_floor: 0.7,
  maturity_days: 730,
  unknown_age_days: 365,
  breadth_per_chain: 0.04,
  breadth_max_chains: 6,
  value_cap_multiple: 3,
  min_category_peers: 3,
  winsor_low: 0.05,
  winsor_high: 0.95,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
  age_days: number | null;
  token_status: 'pre-token';
  implied_value_usd: number;
  value_per_tvl: number;
  model: {
    category_multiple: number;
    multiple_source: 'category' | 'global';
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  value_note: string;
  farm_steps: string[];
}

/** The dashboard's view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  implied_value_usd: number;
  value_per_tvl: number;
  watchlist: boolean;
  category_multiple: number;
  multiple_source: 'category' | 'global';
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  value_note: string;
  farm_steps: string[];
  comparables: Comparable[];
}

/** One live-token peer in the same category, for the detail view. */
export interface Comparable {
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  multiple: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's comparable multiple, for the model page. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  multiple: number;
  source: 'category' | 'global';
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  median_implied_usd: number;
  global_multiple: number;
  category_multiples: CategoryMultiple[];
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

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The q-th quantile of a sorted copy, by nearest rank. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** An exchange's name at the start of a protocol's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a wrapped, staked, bridged or exchange product, not a launch of their own. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked, bridged or exchange product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * The comparable multiples, from the snapshot's own live-token protocols: for each
 * category with at least `min_category_peers` live peers, the winsorised median of
 * their mcap/TVL; every other category falls back to the winsorised global median.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, number>; global: number } {
  const live = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const winsorise = (values: number[]): number[] => {
    const lo = quantile(values, model.winsor_low);
    const hi = quantile(values, model.winsor_high);
    return values.map((v) => Math.min(hi, Math.max(lo, v)));
  };
  const all = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const global = quantile(winsorise(all), 0.5);
  const byCategory = new Map<string, number>();
  const grouped = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '(uncategorised)';
    const list = grouped.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    grouped.set(key, list);
  }
  for (const [key, values] of grouped) {
    if (values.length >= model.min_category_peers) byCategory.set(key, quantile(winsorise(values), 0.5));
  }
  return { byCategory, global };
}

/** The three live-token peers with the largest market cap in a category, for the detail view. */
export function comparables(snapshot: Snapshot, category: string | null): Comparable[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && p.category === category)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, 3)
    .map((p) => ({ name: p.name, mcap_usd: p.mcap_usd!, tvl_usd: p.tvl_usd, multiple: round4(p.mcap_usd! / p.tvl_usd) }));
}

/** The multipliers and the implied value one protocol gets under the model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, number>; global: number },
  model: ModelConstants = MODEL,
): {
  implied: number;
  categoryMultiple: number;
  multipleSource: 'category' | 'global';
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const key = protocol.category ?? '(uncategorised)';
  const fromCategory = multiples.byCategory.get(key);
  const categoryMultiple = fromCategory ?? multiples.global;
  const multipleSource = fromCategory !== undefined ? 'category' : 'global';
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (1 - model.maturity_floor) * (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const chainCount = Math.max(1, protocol.chains.length);
  const breadthMult = 1 + model.breadth_per_chain * Math.min(chainCount - 1, model.breadth_max_chains);
  const raw = protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * breadthMult;
  const implied = Math.max(1, Math.round(Math.min(raw, protocol.tvl_usd * model.value_cap_multiple)));
  return { implied, categoryMultiple, multipleSource, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's two qualifying actions, in the words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): [string, string] {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return [
      `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
      `Borrow $20 against the deposit, keep the health factor above 2, and repay it after a week.`,
    ];
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return [
      `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      `Swap $10 through the pool once a week so the wallet shows trading activity, not only a deposit.`,
    ];
  }
  if (c.includes('risk') || c.includes('curator') || c.includes('allocator') || c.includes('vault')) {
    return [
      `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
      `Split a second $${capital} deposit across a different vault of ${name} a week later.`,
    ];
  }
  if (c.includes('rwa') || c.includes('real world')) {
    return [
      `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`,
      `Check the yield accrual once a week and keep the receipt token in the same wallet.`,
    ];
  }
  if (c.includes('stak') || c.includes('restak')) {
    return [
      `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
      `Restake the receipt once, if the protocol offers it, and leave the position staked.`,
    ];
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return [
      `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`,
      `Close the position after a week and open a fresh one, so the wallet shows repeated use.`,
    ];
  }
  if (c.includes('payment')) {
    return [
      `Fund a ${name} account with $${capital} on ${chain} and make one real payment through it.`,
      `Set one recurring payment of $10 a month through ${name} and leave it running.`,
    ];
  }
  if (c.includes('chain')) {
    return [
      `Bridge $${capital} of USDC to ${chain} and use it in the chain's flagship app.`,
      `Make one transaction on ${chain} each week from the same wallet.`,
    ];
  }
  if (c.includes('insurance')) {
    return [
      `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`,
      `Extend the cover once before it lapses, from the same wallet.`,
    ];
  }
  if (c.includes('stable')) {
    return [
      `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
      `Provide $25 of the stable asset as liquidity on ${chain} for a week.`,
    ];
  }
  if (c.includes('prediction')) {
    return [
      `Fund $${capital} and place one market position on ${name}.`,
      `Settle the position and place a second one the following week.`,
    ];
  }
  if (c.includes('govern')) {
    return [
      `Deposit $${capital} into ${name} on ${chain} and delegate the voting power it gives.`,
      `Vote on one live proposal from the same wallet.`,
    ];
  }
  return [
    `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    `Make a second deposit of $25 a week later, from the same wallet.`,
  ];
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const [first, second] = actionsFor(p, capital, chain);
  const gas = capital >= 200 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    { text: first, cost: `$${capital} of capital and about $${gas} of gas`, time: '15 minutes to set up' },
    { text: second, cost: `about $${gas} of gas, on top of the $${capital} already in`, time: '10 minutes' },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Open ${p.name}'s own points or rewards page once a week and finish any quest it lists; only ever use the link the protocol itself publishes.`,
      cost: 'no fee to check',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, claim only from the protocol's own page, never pay anyone to claim for you, and write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to claim',
      time: '10 minutes',
    },
  ];
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = categoryMultiples(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, by TVL, every one of them.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const steps = farmSteps(s.p, s.age).map(stepText);
    const note = `TVL $${s.p.tvl_usd.toLocaleString('en-US')} x ${round4(s.categoryMultiple)} ${s.multipleSource} multiple x ${round4(s.growthMult)} growth x ${round4(s.maturityMult)} maturity x ${round4(s.breadthMult)} breadth`;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      age_days: s.age,
      token_status: 'pre-token',
      implied_value_usd: s.implied,
      value_per_tvl: round4(s.implied / s.p.tvl_usd),
      model: {
        category_multiple: round4(s.categoryMultiple),
        multiple_source: s.multipleSource,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        breadth_multiplier: round4(s.breadthMult),
      },
      value_note: note,
      farm_steps: steps,
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot, model);
  const watchlistSet = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlistSet.has(r.slug)).length;
  const sortedImplied = [...board].map((r) => r.implied_value_usd).sort((a, b) => a - b);
  const total = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const categoryMultipleRows: CategoryMultiple[] = [...multiples.byCategory.entries()]
    .map(([category, multiple]) => ({
      category,
      peers: snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && (p.category ?? '(uncategorised)') === category).length,
      multiple: round4(multiple),
      source: 'category' as const,
    }))
    .sort((a, b) => b.multiple - a.multiple);
  const rows: RadarRow[] = board.map((r) => {
    const p = snapshot.protocols.find((x) => x.slug === r.slug)!;
    return {
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      value_per_tvl: r.value_per_tvl,
      watchlist: watchlistSet.has(r.slug),
      category_multiple: r.model.category_multiple,
      multiple_source: r.model.multiple_source,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      value_note: r.value_note,
      farm_steps: r.farm_steps,
      comparables: comparables(snapshot, r.category),
    };
  });
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: total,
    median_implied_usd: sortedImplied[Math.floor(sortedImplied.length / 2)] ?? 0,
    global_multiple: round4(multiples.global),
    category_multiples: categoryMultipleRows,
    rows,
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
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 the gate wants`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
