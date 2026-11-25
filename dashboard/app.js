// Token Radar dashboard: renders window.RADAR with no network. The page reads the
// dataset main.ts wrote (data.js), filters and sorts it in place, and opens one protocol
// at a time in the detail drawer. Hash routes drive the three screenshots:
//   #detail=<slug>        open one protocol's detail view
//   #filter=cat:<name>    filter the board to one category
//   #tab=board|live|model switch views

const D = window.RADAR;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** $2.75B, $637.5M, $3.9M, $850K, $42. */
function money(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(abs >= 1e11 ? 0 : 2).replace(/\.00$/, '') + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(abs >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(abs >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return '$' + Math.round(n);
}

/** +12.5%, -4.0%, or — when unreported. */
function pct(v) {
  if (v == null) return '<span class="flat">—</span>';
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
}

/** 214d, 1.6y, or — when unreported. */
function age(v) {
  if (v == null) return '—';
  if (v < 365) return v + 'd';
  return (v / 365).toFixed(1) + 'y';
}

function chainsCell(chains) {
  const list = (chains || []).slice(0, 2).map((c) => `<span class="pill">${esc(c)}</span>`).join('');
  const more = (chains || []).length > 2 ? `<span class="pill">+${(chains || []).length - 2}</span>` : '';
  return list + more || '<span class="flat">—</span>';
}

const state = { q: '', cat: '', chain: '', tvl: 0, watch: false, sort: 'implied', tab: 'board' };

function sortRows(rows) {
  const key = state.sort;
  const copy = [...rows];
  if (key === 'tvl') copy.sort((a, b) => b.tvl_usd - a.tvl_usd);
  else if (key === 'growth') copy.sort((a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9));
  else if (key === 'age') copy.sort((a, b) => (b.age_days ?? -1) - (a.age_days ?? -1));
  else if (key === 'multiple') copy.sort((a, b) => b.value_per_tvl - a.value_per_tvl);
  else copy.sort((a, b) => a.rank - b.rank);
  return copy;
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  return D.rows.filter((r) => {
    if (state.watch && !r.watchlist) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !(r.chains || []).includes(state.chain)) return false;
    if (r.tvl_usd < state.tvl) return false;
    if (q && !(r.name.toLowerCase().includes(q) || (r.category || '').toLowerCase().includes(q) || (r.chains || []).some((c) => c.toLowerCase().includes(q)))) return false;
    return true;
  });
}

function renderBoard() {
  const rows = sortRows(filtered());
  $('count').textContent = `${rows.length} of ${D.rows.length} protocols shown · ranked by implied value`;
  $('rows').innerHTML = rows.map((r) => `<tr data-slug="${esc(r.slug)}">
    <td class="rank${r.rank <= 3 ? ' top' : ''}">${r.rank}</td>
    <td><span class="name">${esc(r.name)}</span> <span class="slug">${esc(r.slug)}</span>${r.watchlist ? '<span class="badge watch">Watchlist</span>' : '<span class="badge early">Early</span>'}</td>
    <td>${esc(r.category || '—')}</td>
    <td>${chainsCell(r.chains)}</td>
    <td class="num">${money(r.tvl_usd)}</td>
    <td class="num">${pct(r.change_7d)}</td>
    <td class="num">${age(r.age_days)}</td>
    <td class="num"><b>${money(r.implied_value_usd)}</b></td>
    <td class="num">${r.value_per_tvl.toFixed(2)}×</td>
  </tr>`).join('') || '<tr><td colspan="9"><div class="empty">No protocols match these filters.</div></td></tr>';
}

function renderLive() {
  $('live-rows').innerHTML = D.live.map((p) => `<tr>
    <td><span class="name">${esc(p.name)}</span> <span class="slug">${esc(p.slug)}</span></td>
    <td>${esc(p.category || '—')}</td><td>${chainsCell(p.chains)}</td>
    <td class="num">${money(p.tvl_usd)}</td><td class="num"><b>${money(p.mcap_usd)}</b></td>
    <td class="num">${p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—'}</td>
    <td class="num">${pct(p.change_7d)}</td>
  </tr>`).join('');
}

function renderModel() {
  const m = D.model;
  $('constants').innerHTML = `
    <dt>Growth weight</dt><dd>${m.growth_weight} — a week's TVL change moves value by ${Math.round(m.growth_weight * 100)}% of itself</dd>
    <dt>Growth clamp</dt><dd>${m.growth_floor}% to +${m.growth_cap}% — one wild week cannot decide a rank</dd>
    <dt>Maturity</dt><dd>${m.maturity_floor} at launch, rising to 1.00 over ${m.maturity_days} days tracked with no token</dd>
    <dt>Unknown age</dt><dd>counts as ${m.unknown_age_days} days</dd>
    <dt>Breadth</dt><dd>+${Math.round(m.breadth_per_chain * 100)}% per extra chain, up to ${m.breadth_max_chains} chains</dd>
    <dt>Value cap</dt><dd>never more than ${m.value_cap_multiple}× TVL</dd>
    <dt>Multiple</dt><dd>winsorised median mcap / TVL, ${Math.round(m.winsor_low * 100)}–${Math.round(m.winsor_high * 100)}th percentile, ${m.min_category_peers}+ live peers per category</dd>`;
  $('multiples').innerHTML = D.category_multiples.map((c) => `<tr>
    <td>${esc(c.category)}</td><td class="num">${c.peers}</td><td class="num">${c.multiple.toFixed(2)}×</td>
  </tr>`).join('') + `<tr><td><i>Global fallback</i></td><td class="num">—</td><td class="num">${D.global_multiple.toFixed(2)}×</td></tr>`;
}

function barRow(label, value, max) {
  const w = Math.max(2, Math.min(100, (value / max) * 100));
  return `<div class="bar-row"><span class="lbl">${label}</span><span class="bar"><i style="width:${w.toFixed(0)}%"></i></span><span class="val">${value.toFixed(2)}×</span></div>`;
}

function openDetail(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  const box = $('drawer');
  if (!r) { box.hidden = true; return; }
  const maxMult = Math.max(...D.rows.map((x) => x.category_multiple), 0.01);
  const comps = (r.comparables || []).map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${money(c.mcap_usd)}</td><td class="num">${money(c.tvl_usd)}</td><td class="num">${c.multiple.toFixed(2)}×</td></tr>`).join('');
  box.innerHTML = `
    <button class="close" type="button" id="drawer-close">Close ✕</button>
    <h2>${esc(r.name)}</h2>
    <p class="sub">${esc(r.slug)} · ${esc(r.category || 'Uncategorised')} · ${r.watchlist ? 'On the watchlist' : 'Early find below the floor'}</p>
    <div class="big">${money(r.implied_value_usd)} <small>implied value · rank #${r.rank}</small></div>
    <div class="stats">
      <div class="stat"><div class="k">TVL</div><div class="v">${money(r.tvl_usd)}</div></div>
      <div class="stat"><div class="k">7-day TVL</div><div class="v">${r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%'}</div></div>
      <div class="stat"><div class="k">Tracked</div><div class="v">${r.age_days == null ? 'Unknown' : age(r.age_days)}</div></div>
      <div class="stat"><div class="k">Chains</div><div class="v">${(r.chains || []).length} · ${esc((r.chains || [])[0] || '—')}</div></div>
    </div>
    <h3>How the value is built</h3>
    <div class="bars">
      ${barRow('Category', r.category_multiple, maxMult)}
      ${barRow('Growth', r.growth_multiplier, 2.2)}
      ${barRow('Maturity', r.maturity_multiplier, 1)}
      ${barRow('Breadth', r.breadth_multiplier, 1.24)}
    </div>
    <p class="mono">${esc(r.value_note)}</p>
    <p class="sub">The ${r.multiple_source === 'category' ? 'category' : 'global'} multiple prices this protocol like the live-token protocols ${r.multiple_source === 'category' ? 'in its own category' : 'across the market (too few live peers in its category)'}.</p>
    <h3>Live comparables in ${esc(r.category || 'its category')}</h3>
    ${comps ? `<table class="mini"><thead><tr><th>Protocol</th><th class="num">Mcap</th><th class="num">TVL</th><th class="num">Mcap / TVL</th></tr></thead><tbody>${comps}</tbody></table>` : '<p class="sub">No live-token protocol in this category to compare against.</p>'}
    <h3>Farm plan · 7 steps</h3>
    <ol class="steps">${r.farm_steps.map((s) => {
      const m = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?$/);
      if (!m) return `<li>${esc(s)}</li>`;
      return `<li>${esc(m[1])}<span class="ct"><span class="chip">Cost: ${esc(m[2])}</span><span class="chip">Time: ${esc(m[3])}</span></span></li>`;
    }).join('')}</ol>
    <p class="sub">Costs are estimates from the protocol's own size and chain. Never pay anyone to claim for you.</p>`;
  box.hidden = false;
  $('drawer-close').addEventListener('click', () => { box.hidden = true; history.replaceState(null, '', '#'); });
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('view-board').hidden = tab !== 'board';
  $('view-live').hidden = tab !== 'live';
  $('view-model').hidden = tab !== 'model';
  if (tab === 'live') renderLive();
  if (tab === 'model') renderModel();
}

function fillSelects() {
  const cats = [...new Set(D.rows.map((r) => r.category).filter(Boolean))].sort();
  $('f-cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  const chains = [...new Set(D.rows.flatMap((r) => r.chains || []))].sort();
  $('f-chain').innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join('');
}

function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('tab')) setTab(h.get('tab'));
  if (h.get('filter')) {
    const f = h.get('filter');
    if (f.startsWith('cat:')) { state.cat = f.slice(4); $('f-cat').value = state.cat; }
  }
  if (h.get('detail')) openDetail(h.get('detail'));
  renderBoard();
}

function init() {
  $('meta').innerHTML = `Snapshot as of <b>${esc(D.as_of)}</b><br>${D.rows.length} protocols ranked · model <b>${esc(D.model_version)}</b><br>Floor $${(D.floor_usd / 1e6).toFixed(0)}M TVL`;
  $('kpis').innerHTML = `
    <div class="kpi"><div class="k">Watchlist covered</div><div class="v">${D.watchlist_size} / ${D.watchlist_size}</div><div class="s">every protocol on the house list</div></div>
    <div class="kpi"><div class="k">Protocols ranked</div><div class="v">${D.board_size}</div><div class="s">${D.early_size} early finds below the floor</div></div>
    <div class="kpi"><div class="k">Total implied value</div><div class="v">${money(D.total_implied_usd)}</div><div class="s">median ${money(D.median_implied_usd)} per protocol</div></div>
    <div class="kpi"><div class="k">Top protocol</div><div class="v">${esc(D.rows[0].name)}</div><div class="s">${money(D.rows[0].implied_value_usd)} implied · ${esc(D.rows[0].category || '')}</div></div>`;
  $('foot').innerHTML = `Data: sealed DefiLlama snapshot, ${esc(D.as_of)} — ${esc(D.source)}. The snapshot carries no ranking, no implied value and no farm plan; deriving them is this radar's work. “Pre-token” means the snapshot's record carries no market cap, no CoinGecko id and no symbol — not proof the protocol has no token. Implied values are this entry's own estimates, never a prediction of whether or when a token launches.`;
  fillSelects();
  $('q').addEventListener('input', (e) => { state.q = e.target.value; renderBoard(); });
  $('f-cat').addEventListener('change', (e) => { state.cat = e.target.value; renderBoard(); });
  $('f-chain').addEventListener('change', (e) => { state.chain = e.target.value; renderBoard(); });
  $('f-tvl').addEventListener('change', (e) => { state.tvl = Number(e.target.value); renderBoard(); });
  $('f-watch').addEventListener('change', (e) => { state.watch = e.target.checked; renderBoard(); });
  $('f-sort').addEventListener('change', (e) => { state.sort = e.target.value; renderBoard(); });
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  $('rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.dataset.slug);
  });
  window.addEventListener('hashchange', applyHash);
  applyHash();
}

init();
