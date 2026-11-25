# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/museweilejing923/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/museweilejing923/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (model radar-2): every protocol in the sealed DefiLlama snapshot that records no token yet, ranked by what its token would be worth — plus a farm plan for each one. 178 protocols ranked: the full 40-protocol watchlist, and 138 early finds below the $50M floor.

## How the value is built

Implied value = TVL × category multiple × growth × maturity × breadth. Every number comes from the snapshot's own figures; no protocol name is ever special-cased:

- **Category multiple** — the winsorised median mcap / TVL of the live-token protocols in the same category (at least 3 peers, else the global median). A token is worth what its category's tokens already sell for, per dollar of TVL.
- **Growth** — seven-day TVL change, clamped to −50%…+200%, weighted 0.6.
- **Maturity** — days since DefiLlama began tracking it, saturating at 2 years: a protocol that has run a long time with no token has more pent-up launch value.
- **Breadth** — +4% per extra chain, up to 6 chains.
- Capped at 3× TVL. Live-token protocols are never ranked; they are shown apart, at the market's own value, and they are the comparables the model prices against.

“Pre-token” means the snapshot's record carries no market cap, no CoinGecko id and no symbol — not proof the protocol has no token. Wrapped, staked and bridged products of tokens that already trade are left out, as are exchanges and versioned pools.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard's data to `out/data.js`, copies `dashboard/` and `screenshots/` to `out/`, and writes `out/dossier.json` with the vendored make.fun library. The run is deterministic: two runs write the same bytes.

## Layout

- `main.ts` — the entrypoint
- `lib/radar.ts` — the radar-2 model: comparables, implied value, farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit
- `dashboard/` — the static page (index.html, app.css, app.js), no network, no framework
- `screenshots/` — the board, a protocol's detail view, and a filtered view

---

<sub>Entered on [make.fun](https://make.fun/?ref=st95bjr7&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
