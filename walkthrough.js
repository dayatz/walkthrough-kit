/* walkthrough kit runtime. Page defines globals OVERVIEW, MAP, STEPS (see README.md);
   this file renders theme toggle, overview mermaid, SVG map, stepper. */
(function () {
  const THEME_KEY = 'artifact-theme';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const $ = id => document.getElementById(id);
  const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const hasMermaid = () => typeof mermaid !== 'undefined';

  function applyTheme(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    localStorage.setItem(THEME_KEY, t);
    document.querySelectorAll('.theme-toggle button').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.theme === t ? 'true' : 'false'));
  }

  function initMermaid() {
    if (!hasMermaid()) return;
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'loose', theme: 'base',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      flowchart: { nodeSpacing: 26, rankSpacing: 32, padding: 6, curve: 'basis', useMaxWidth: false },
      themeVariables: {
        background: cssVar('--surface'), primaryColor: cssVar('--surface-2'),
        primaryTextColor: cssVar('--ink'), primaryBorderColor: cssVar('--rule'),
        lineColor: cssVar('--ink-2'), secondaryColor: cssVar('--surface-2'),
        tertiaryColor: cssVar('--surface'), fontSize: '13px'
      }
    });
  }

  // mermaid bakes colours at render -> classDefs read live CSS vars each time
  function classDefs() {
    const d = (n, bg, line) => 'classDef ' + n + ' fill:' + cssVar(bg) + ',stroke:' + cssVar(line)
      + ',color:' + cssVar('--ink') + ',stroke-width:1.5px';
    return [d('key', '--deep-bg', '--deep'), d('ok', '--keep-bg', '--keep'),
      d('bad', '--lost-bg', '--lost'), d('warn', '--warn-bg', '--warn'),
      'classDef dim fill:' + cssVar('--surface-2') + ',stroke:' + cssVar('--rule')
        + ',color:' + cssVar('--ink-2') + ',stroke-dasharray:3 3'].join('\n  ');
  }

  function mountMmd(el, src) {
    if (!hasMermaid()) { el.innerHTML = '<pre>' + esc(src) + '</pre>'; return; }
    el.innerHTML = '<pre class="mermaid">' + src + '\n  ' + classDefs() + '</pre>';
    const node = el.querySelector('pre.mermaid');
    mermaid.run({ nodes: [node] }).catch(() => { node.textContent = src; });
  }

  function renderDia(rows) {
    if (!rows || !rows.length) return '';
    const cell = c => '<div class="dia-cell ' + (c.tone || '') + '"><div class="t">'
      + (c.n ? '<span class="badge">' + c.n + '</span>' : '') + c.t + '</div>'
      + (c.s ? '<div class="s">' + c.s + '</div>' : '')
      + (c.list ? '<ul><li>' + c.list.join('</li><li>') + '</li></ul>' : '') + '</div>';
    const arrow = (g, lbl, cls) => '<div class="dia-arrow ' + (cls || '') + '">' + g
      + (lbl ? '<span class="lbl">' + lbl + '</span>' : '') + '</div>';
    return '<div class="dia">' + rows.map((row, i) => {
      const cells = row.cells.map(cell);
      const inner = row.dir === 'x' ? cells.join(arrow('&rarr;', null, 'h')) : cells.join('');
      return '<div class="dia-row' + (row.dir === 'x' ? ' x' : '') + '">' + inner + '</div>'
        + (i < rows.length - 1 ? arrow('&#9660;', rows[i + 1].via) : '');
    }).join('') + '</div>';
  }

  // MAP -> SVG. Levels top-down: triggers row, spine column, lanes, converge column, out row.
  // ponytail: fixed 880 grid, long labels overflow; redraw by hand only if a subsystem truly needs it
  function renderMap(map) {
    const W = 880, M = 20, H = 40, laneIds = [];
    let y = 20, prev = [], boxes = [], edges = [], labels = [];
    const box = (it, x, w) => ({ id: it[0], l: it[1], d: it[2], x: x, y: y, w: w });
    const row = items => {
      const n = items.length, gap = 12;
      const w = Math.min(300, (W - 2 * M - (n - 1) * gap) / n);
      const x0 = (W - (n * w + (n - 1) * gap)) / 2;
      return items.map((it, i) => box(it, x0 + i * (w + gap), w));
    };
    const cx = b => b.x + b.w / 2;
    const bot = b => (b.bot != null ? b.bot : b.y + H);
    const connect = (from, to, mid) => {
      if (!from.length) return;
      if (from.length === 1 && to.length === 1 && Math.abs(cx(from[0]) - cx(to[0])) < 1) {
        edges.push('M' + cx(from[0]) + ' ' + bot(from[0]) + ' V' + to[0].y); return;
      }
      const xs = from.concat(to).map(cx);
      let p = from.map(b => 'M' + cx(b) + ' ' + bot(b) + ' V' + mid).join(' ');
      p += ' M' + Math.min.apply(null, xs) + ' ' + mid + ' H' + Math.max.apply(null, xs);
      p += ' ' + to.map(b => 'M' + cx(b) + ' ' + mid + ' V' + b.y).join(' ');
      edges.push(p);
    };
    const level = (bs, gap) => {
      bs.forEach(b => { b.y = y; });
      if (prev.length) connect(prev, bs, y - gap / 2);
      boxes = boxes.concat(bs); prev = bs; y += H;
    };
    if (map.triggers && map.triggers.length) level(row(map.triggers), 0);
    (map.spine || []).forEach(it => { y += 28; level([box(it, W / 2 - 175, 350)], 28); });
    if (map.lanes && map.lanes.length) {
      const n = map.lanes.length, gap = 40, w = (W - 2 * M - (n - 1) * gap) / n;
      y += 44;
      const top = y, mid = y - 30, heads = [], tails = [];
      let bottom = y;
      map.lanes.forEach((lane, li) => {
        const x = M + li * (w + gap);
        laneIds.push(lane.nodes.map(it => it[0]));
        labels.push('<text class="lane" x="' + x + '" y="' + (top - 8) + '">' + esc(lane.label) + '</text>');
        lane.nodes.forEach((it, i) => {
          y = top + i * (H + 12);
          const b = box(it, x, w);
          if (i) edges.push('M' + cx(b) + ' ' + (y - 12) + ' V' + y); else heads.push(b);
          if (i === lane.nodes.length - 1) tails.push(b);
          boxes.push(b);
          bottom = Math.max(bottom, y + H);
        });
      });
      if (prev.length) connect(prev, heads, mid);
      prev = tails;
      y = bottom;
      // short lanes route their exit edge from the shared bottom
      tails.forEach(b => { if (b.y + H < bottom) { edges.push('M' + cx(b) + ' ' + (b.y + H) + ' V' + bottom); b.bot = bottom; } });
    }
    (map.converge || []).forEach(it => { y += 28; level([box(it, W / 2 - 175, 350)], 28); });
    if (map.out && map.out.length) { y += 30; level(row(map.out), 30); }
    const svgBoxes = boxes.map(b => {
      const by = b.y;
      return '<g class="n" id="' + esc(b.id) + '"><rect x="' + b.x + '" y="' + by + '" width="' + b.w
        + '" height="' + H + '" rx="5"/><text x="' + cx(b) + '" y="' + (by + 17) + '" text-anchor="middle">' + esc(b.l)
        + '</text><text x="' + cx(b) + '" y="' + (by + 30) + '" text-anchor="middle">' + esc(b.d) + '</text></g>';
    });
    return { laneIds: laneIds, svg: '<svg viewBox="0 0 ' + W + ' ' + (y + 20) + '" role="img" aria-label="flow map">'
      + edges.map(e => '<path class="edge" d="' + e + '"/>').join('') + labels.join('') + svgBoxes.join('') + '</svg>' };
  }

  function main() {
    // page globals are top-level consts -> not on window, read via typeof guard
    const ovSrc = typeof OVERVIEW !== 'undefined' ? OVERVIEW : null;
    const map = typeof MAP !== 'undefined' ? MAP : null;
    const steps = typeof STEPS !== 'undefined' ? STEPS : [];

    const header = document.querySelector('header');
    if (header) {
      const t = document.createElement('div');
      t.className = 'theme-toggle'; t.setAttribute('role', 'group'); t.setAttribute('aria-label', 'Theme');
      t.innerHTML = ['auto', 'light', 'dark'].map(m => '<button type="button" data-theme="' + m + '">' + m + '</button>').join('');
      const bar = document.createElement('div'); bar.className = 'topbar';
      const eyebrow = header.querySelector('.eyebrow');
      if (eyebrow) header.insertBefore(bar, eyebrow), bar.appendChild(eyebrow); else header.prepend(bar);
      bar.appendChild(t);
    }
    applyTheme(localStorage.getItem(THEME_KEY) || 'auto');
    initMermaid();

    const ov = $('overview');
    if (ov) ov.classList.add('overview');
    const renderOverview = () => { if (ov && ovSrc) mountMmd(ov, ovSrc); };
    renderOverview();

    let laneIds = [];
    const mapEl = $('map');
    if (mapEl && map) {
      const r = renderMap(map);
      laneIds = r.laneIds;
      mapEl.innerHTML = '<p class="cap">The highlighted box is where the current step lives; other lanes dim out. '
        + '<b>Red</b> means the step is about how that box fails.</p><div class="stage">' + r.svg + '</div>';
      mapEl.style.display = 'flex'; mapEl.style.flexDirection = 'column'; mapEl.style.gap = '14px';
    }

    const st = $('stepper');
    if (!st || !steps.length) return wireTheme(renderOverview, () => {});
    st.innerHTML = '<p class="cap" style="margin-bottom:16px">Each step builds on the last. Green is the healthy path, amber is a trap, red is a failure.</p>'
      + '<div class="stepper"><nav class="rail" id="rail" aria-label="Steps"></nav>'
      + '<article class="panel" aria-live="polite"><div class="crumbs"><span class="pill info" id="s-tag"></span>'
      + '<span class="dim mono" id="s-where" style="font-size:12px"></span></div><h2 id="s-title"></h2>'
      + '<div id="s-dia"></div><div id="s-body"></div><div class="refs" id="s-refs"></div>'
      + '<div class="nav"><button id="prev">&larr; Prev</button><button id="next">Next &rarr;</button>'
      + '<span class="count"><span class="kbd">&larr;</span> <span class="kbd">&rarr;</span> &nbsp;<span id="s-count"></span></span></div></article></div>';

    const rail = $('rail');
    steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="idx">' + (i + 1) + '</span><span>' + s.title + '</span>';
      b.addEventListener('click', () => go(i));
      rail.appendChild(b);
    });
    const allNodes = Array.from(document.querySelectorAll('#map svg .n'));

    let cur = -1;
    function go(i) {
      if (i < 0 || i >= steps.length || i === cur) return;
      cur = i;
      const s = steps[i];
      Array.from(rail.children).forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
      $('s-tag').className = 'pill ' + (s.fail ? 'stuck' : 'info');
      $('s-tag').textContent = s.tag || '';
      $('s-where').textContent = s.where || '';
      $('s-title').textContent = s.title;
      if (s.mmd) mountMmd($('s-dia'), s.mmd); else $('s-dia').innerHTML = renderDia(s.dia);
      $('s-body').innerHTML = s.body || '';
      $('s-refs').innerHTML = (s.refs || []).map(r => '<div class="ref"><b>' + esc(r[0]) + '</b> &nbsp;&mdash;&nbsp; ' + r[1] + '</div>').join('');
      $('s-count').textContent = (i + 1) + ' / ' + steps.length;
      $('prev').disabled = i === 0;
      $('next').disabled = i === steps.length - 1;
      const dim = typeof s.lane === 'number' ? [].concat.apply([], laneIds.filter((_, j) => j !== s.lane)) : [];
      const on = s.nodes || [];
      allNodes.forEach(n => {
        n.classList.toggle('on', on.includes(n.id));
        n.classList.toggle('fail', !!s.fail);
        n.classList.toggle('faded', dim.includes(n.id));
      });
      history.replaceState(null, '', '#step-' + (i + 1));
    }

    $('prev').addEventListener('click', () => go(cur - 1));
    $('next').addEventListener('click', () => go(cur + 1));
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
    });
    const h = parseInt((location.hash.match(/^#step-(\d+)$/) || [])[1], 10);
    go(h >= 1 && h <= steps.length ? h - 1 : 0);
    wireTheme(renderOverview, () => { const i = cur; cur = -1; go(i); });
  }

  function wireTheme(renderOverview, rerenderStep) {
    document.querySelectorAll('.theme-toggle button').forEach(b => b.addEventListener('click', () => {
      applyTheme(b.dataset.theme); initMermaid(); renderOverview(); rerenderStep();
    }));
  }

  // works deferred from CDN or inlined in <head> by inline.sh
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main); else main();
})();
