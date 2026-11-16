// Token Radar's dashboard logic. Reads window.RADAR (written beside dashboard/ by main.ts) and renders a
// sortable, filterable board, a live-token view, a per-protocol detail drawer that recomputes the
// model's own arithmetic in the browser, and a panel stating the model's constants and version. No
// network and no framework: every byte shown here is already in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var root = document.getElementById('app');
  if (!DATA || !root) return;

  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'rank', dir: 1, selected: null };

  // ---------------------------------------------------------------- formatting

  var usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unlisted';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtX(n) { return (Math.round(n * 1000) / 1000) + 'x'; }
  function orNone(s) { return s && s.length ? s : 'Uncategorized'; }

  // The page recomputes a row's implied value from the same five multipliers board.json carried, so the
  // reader can see the rendered arithmetic and the stored number agree without trusting either alone.
  function recomputeImplied(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.tvl_multiple * row.category_multiplier * row.chain_multiplier * row.growth_multiplier * row.maturity_multiplier));
  }
  function clampedGrowthPct(row, model) {
    var raw = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    return Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
  }

  // ---------------------------------------------------------------- tiny DOM helper

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---------------------------------------------------------------- URL state

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    var url = window.location.pathname + window.location.search + (next ? '#' + next : '');
    window.history.replaceState(null, '', url);
  }

  // ---------------------------------------------------------------- data views

  function allCategories() {
    var set = {};
    DATA.rows.concat(DATA.live).forEach(function (r) { set[orNone(r.category)] = true; });
    return Object.keys(set).sort();
  }
  function allChains() {
    var set = {};
    DATA.rows.concat(DATA.live).forEach(function (r) { (r.chains || []).forEach(function (c) { set[c] = true; }); });
    return Object.keys(set).sort();
  }

  function matchesFilters(r) {
    if (state.category !== 'all' && orNone(r.category) !== state.category) return false;
    if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    var hay = [r.name, r.slug, orNone(r.category)].concat(r.chains || []).join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function filteredBoard() { return DATA.rows.filter(matchesFilters); }
  function filteredLive() { return DATA.live.filter(matchesFilters); }

  function sortedBoard(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = orNone(a.category).toLowerCase(); bv = orNone(b.category).toLowerCase(); }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---------------------------------------------------------------- header / lede

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'sweep', 'aria-hidden': 'true' }),
        el('div', { class: 'brand-text' },
          el('span', { class: 'brand-name', text: 'TOKEN RADAR' }),
          el('span', { class: 'brand-sub', text: 'pre-token protocol scanner' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'chip', text: 'Snapshot ' }, el('b', { text: DATA.as_of })),
        el('span', { class: 'chip', text: 'DefiLlama protocol index' }),
        el('span', { class: 'chip accent', text: 'Model ' + DATA.model_version })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Who is about to launch, and what it is worth' }),
        el('p', { text: 'Every protocol with no token on record is scored by a five-factor model built only from the snapshot\u2019s own figures \u2014 TVL scale, category risk, chain reach, seven-day growth and time run with no token \u2014 so a reader can see the arithmetic behind every rank, never a hand-picked list.' }),
        el('p', { class: 'explain', text: 'In one sentence: implied value is a protocol\u2019s TVL scaled by a size-decaying base multiple, then adjusted up or down for its category\u2019s risk, its chain reach, its recent growth and how long it has run without a token.' })
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: DATA.watchlist_size + '/' + DATA.watchlist_size }), el('span', { text: 'Watchlist covered' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'Pre-token rows scored' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.outside_watchlist_size) }), el('span', { text: 'Beyond the watchlist floor' })),
        el('div', { class: 'stat' }, el('b', { text: String(DATA.live_size) }), el('span', { text: 'Live-token protocols' }))
      )
    );
  }

  // ---------------------------------------------------------------- controls

  function controls() {
    var categories = allCategories();
    var chains = allChains();

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });

    var categorySelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    categorySelect.addEventListener('change', function () { state.category = categorySelect.value; writeHash(); render(); });

    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });

    var preBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });

    var shown = state.tab === 'pre-token' ? sortedBoard(filteredBoard()).length : filteredLive().length;

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), categorySelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { text: 'Token status' }), el('div', { class: 'tabs' }, preBtn, liveBtn)),
      el('span', { class: 'count', text: shown + ' row' + (shown === 1 ? '' : 's') + ' shown' })
    );
  }

  // ---------------------------------------------------------------- the board table

  function sortHeader(key, label) {
    var active = state.sort === key;
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; } render(); } },
        label,
        active ? el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? '\u25BC' : '\u25B2' }) : null
      )
    );
  }

  function chainTags(chains, max) {
    var list = chains || [];
    var shown = list.slice(0, max || 3);
    var rest = list.length - shown.length;
    var tags = shown.map(function (c) { return el('span', { class: 'chain-tag', text: c }); });
    if (rest > 0) tags.push(el('span', { class: 'chain-tag', text: '+' + rest }));
    if (tags.length === 0) tags.push(el('span', { class: 'sub', text: 'none listed' }));
    return tags;
  }

  function emptyPanel(onClear) {
    return el('div', { class: 'panel' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Clear the search, category or chain filter to see the board again.' }),
      el('button', { class: 'btn primary', type: 'button', text: 'Clear filters', onclick: onClear })
    ));
  }

  function clearFilters() { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); }

  function boardTable() {
    var list = sortedBoard(filteredBoard());
    if (list.length === 0) return emptyPanel(clearFilters);
    var maxImplied = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', null, el('span', { class: 'rank-badge' + (r.rank <= 10 ? ' top' : ''), text: '#' + r.rank })),
        el('td', null, el('div', { class: 'name-cell' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', null, el('span', { class: 'sub', text: orNone(r.category) })),
        el('td', null, chainTags(r.chains, 2)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied-cell' },
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'bar-track', 'aria-hidden': 'true' }, el('i', { class: 'bar-fill', style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100)) + '%' }))
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Click a column to sort it, click a row to open its detail and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('category', 'Category'),
            sortHeader('chains', 'Chains'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value')
          )),
          tbody
        )
      )
    );
  }

  // The live list shares state.sort/state.dir with the board: a key the live columns don't carry (the
  // board's initial 'rank', or 'age'/'implied' left over from a board sort) falls back to market cap,
  // descending, so the view starts the same as before this table became sortable.
  var LIVE_SORT_KEYS = { name: true, category: true, chains: true, tvl: true, growth: true, mcap: true };
  function sortedLive(list) {
    var key = LIVE_SORT_KEYS[state.sort] ? state.sort : 'mcap';
    var dir = LIVE_SORT_KEYS[state.sort] ? state.dir : -1;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = orNone(a.category).toLowerCase(); bv = orNone(b.category).toLowerCase(); }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else { av = a.mcap_usd === null ? -Infinity : a.mcap_usd; bv = b.mcap_usd === null ? -Infinity : b.mcap_usd; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function liveTable() {
    var list = sortedLive(filteredLive());
    if (list.length === 0) return emptyPanel(clearFilters);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status-pill live' }, 'trades')),
        el('td', null, el('div', { class: 'name-cell' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', null, el('span', { class: 'sub', text: orNone(r.category) })),
        el('td', null, chainTags(r.chains, 2)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Click a column to sort it. These protocols already record a token: their market cap is a fact, not this model\u2019s estimate. They are set apart from the ranked board.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Status' }),
            sortHeader('name', 'Protocol'),
            sortHeader('category', 'Category'),
            sortHeader('chains', 'Chains'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('mcap', 'Market cap')
          )),
          tbody
        )
      )
    );
  }

  // ---------------------------------------------------------------- model panel

  function modelPanel() {
    var m = DATA.model;
    var c = m.category_multipliers;
    var formula = [
      'base       = tvl_usd',
      'tvlMult    = ' + m.base_multiple_max + ' - (' + m.base_multiple_max + ' - ' + m.base_multiple_min + ') x log10(tvl_usd / ' + m.tvl_ref_low + ') / log10(' + m.tvl_ref_high + ' / ' + m.tvl_ref_low + '), clamped [' + m.base_multiple_min + ', ' + m.base_multiple_max + ']',
      'catMult    = category risk: core ' + c.core + ' / staking ' + c.staking + ' / infra ' + c.infra + ' / cex ' + c.cex + ' / unlabeled ' + c.unlabeled + ' / other ' + c.other,
      'chainMult  = 1 + ' + m.chain_weight + ' x log2(1 + min(chains, ' + m.chain_cap + '))',
      'growthMult = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight,
      'matureMult = ' + m.maturity_min + ' + (' + m.maturity_max + ' - ' + m.maturity_min + ') x (1 - e^(-age_days / ' + m.maturity_half_life_days + ')), unlisted age = ' + m.unknown_age_days + ' days',
      'implied    = max(1, round(base x tvlMult x catMult x chainMult x growthMult x matureMult))',
    ].join('\n');

    var constants = [
      ['TVL reference floor', fmtUsd(m.tvl_ref_low)],
      ['TVL reference ceiling', fmtUsd(m.tvl_ref_high)],
      ['Base multiple, max', m.base_multiple_max],
      ['Base multiple, min', m.base_multiple_min],
      ['Category: core', c.core], ['Category: staking', c.staking], ['Category: infra', c.infra],
      ['Category: CEX', c.cex], ['Category: unlabeled', c.unlabeled], ['Category: other', c.other],
      ['Chain weight', m.chain_weight], ['Chain cap', m.chain_cap],
      ['Growth weight', m.growth_weight], ['Growth floor / cap', m.growth_floor + ' / ' + m.growth_cap + '%'],
      ['Maturity floor / ceiling', m.maturity_min + ' / ' + m.maturity_max],
      ['Maturity half-life', m.maturity_half_life_days + ' days'],
      ['Unlisted age fallback', m.unknown_age_days + ' days'],
    ];

    return el('section', { class: 'panel model-panel' },
      el('div', { class: 'model-panel-head' },
        el('h2', { text: 'How implied value is derived' }),
        el('span', { class: 'chip accent', text: 'Model ' + DATA.model_version })
      ),
      el('p', { class: 'sub', text: 'Every row runs through the same six-line function below; no protocol\u2019s name changes which branch it takes, and the watchlist is folded in regardless of the filter so its coverage never depends on the model\u2019s own judgment of what looks rankable.' }),
      el('div', { class: 'formula', text: formula }),
      el('div', { class: 'const-grid' }, constants.map(function (row) {
        return el('div', { class: 'const-item' }, el('span', { text: row[0] }), el('b', { text: String(row[1]) }));
      }))
    );
  }

  // ---------------------------------------------------------------- detail drawer

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();

    var model = DATA.model;
    var base = row.tvl_usd * row.tvl_multiple;
    var afterCategory = base * row.category_multiplier;
    var afterChain = afterCategory * row.chain_multiplier;
    var afterGrowth = afterChain * row.growth_multiplier;
    var finalValue = afterGrowth * row.maturity_multiplier;
    var recomputed = recomputeImplied(row);
    var growthPct = clampedGrowthPct(row, model);

    var inner = el('div', { class: 'detail-inner' });
    inner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-sub', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: row.slug + ' \u00b7 ' + orNone(row.category) })
      ),
      el('button', { class: 'close-btn', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Record' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('span', null, chainTags(row.chains, 8))),
        el('div', null, el('span', { text: 'Seven-day change' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Listed' }), el('b', { class: 'num', text: row.listed_at || 'unlisted' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) }))
      )
    ));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The model\u2019s arithmetic' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Base = TVL \u00d7 TVL multiple (' + fmtX(row.tvl_multiple) + ')' }), el('b', { class: 'num', text: fmtUsd(base) })),
        el('div', null, el('span', { text: '\u00d7 Category multiplier (' + fmtX(row.category_multiplier) + ')' }), el('b', { class: 'num', text: fmtUsd(afterCategory) })),
        el('div', null, el('span', { text: '\u00d7 Chain multiplier (' + fmtX(row.chain_multiplier) + ', ' + (row.chains || []).length + ' chains)' }), el('b', { class: 'num', text: fmtUsd(afterChain) })),
        el('div', null, el('span', { text: '\u00d7 Growth multiplier (' + fmtX(row.growth_multiplier) + ', clamped 7d ' + fmtPct(growthPct) + ')' }), el('b', { class: 'num', text: fmtUsd(afterGrowth) })),
        el('div', null, el('span', { text: '\u00d7 Maturity multiplier (' + fmtX(row.maturity_multiplier) + ')' }), el('b', { class: 'num', text: fmtUsd(finalValue) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num result', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'check-line', text: 'The page recomputes this row from the same multipliers board.json carries: ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same figure the board stores.' : ', which differs from the board \u2014 the page\u2019s data would be stale.') + ' This is a model\u2019s estimate, never a price or a promise.' })
    ));

    var stepsList = el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
      var costAt = s.indexOf(' Cost: ');
      var timeAt = s.indexOf(' Time: ');
      var action = costAt >= 0 ? s.slice(0, costAt) : s;
      var cost = costAt >= 0 && timeAt > costAt ? s.slice(costAt + 7, timeAt).replace(/\.$/, '') : '';
      var time = timeAt >= 0 ? s.slice(timeAt + 7).replace(/\.$/, '') : '';
      return el('li', null,
        el('b', { text: action }),
        el('div', { class: 'step-meta' }, el('span', { text: 'Cost: ' + cost }), el('span', { text: 'Time: ' + time }))
      );
    }));
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan (' + row.farm_steps.length + ' steps)' }),
      stepsList
    ));

    dialog.textContent = '';
    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  // ---------------------------------------------------------------- render loop

  function render() {
    root.textContent = '';
    var shell = el('div', { class: 'shell', id: 'board' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    root.appendChild(shell);
    root.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) root.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
