/* Figures for the RQAE post. Each <figure data-fig="..."> keeps its original image
   as a fallback; when this script runs it redraws the figure so it follows the page's
   type and colours (light and dark) and stays readable on a phone. The charts use
   values read off the original plots (see rqae-data.js). */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var D = window.RQAE_DATA || {};
  var uid = 0;

  // ---------- small DOM helpers ----------
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) {
      var v = attrs[k];
      if (v === undefined || v === null) continue;
      if ((k === 'fill' || k === 'stroke') && /var\(|color-mix/.test(v)) e.style[k] = v; else e.setAttribute(k, v);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function html(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, anchor) {
    var t = svg('text', { x: x, y: y, 'class': cls || 'fx-tick', 'text-anchor': anchor || 'middle' }, parent);
    t.textContent = s; return t;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmt(v, d) {
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k';
    return (+v.toFixed(d === undefined ? 2 : d)).toString();
  }
  function onResize(el, fn) {
    var w = 0;
    function go() { var nw = Math.round(el.clientWidth); if (nw && nw !== w) { w = nw; fn(nw); } }
    if ('ResizeObserver' in window) new ResizeObserver(go).observe(el); else window.addEventListener('resize', go);
    go();
  }
  var C = function (n) { return 'var(--fx-' + n + ')'; };
  function mix(a, b, k) { return 'color-mix(in srgb, ' + a + ' ' + Math.round((1 - k) * 100) + '%, ' + b + ')'; }
  function ramp(a, b, i, n) { return mix(C(a), C(b), n <= 1 ? 0 : i / (n - 1)); }

  // a static key: [{name, color, line, hatch}]
  function key(parent, items, title) {
    var row = html('div', 'fx-key', parent);
    if (title) html('span', 'fx-key-title', row, title);
    items.forEach(function (it) {
      var k = html('span', 'fx-keyitem', row), sw = html('span', 'fx-swatch' + (it.line ? ' line' : ''), k);
      sw.style.background = it.color;
      k.appendChild(document.createTextNode(it.name));
    });
    return row;
  }
  function panel(parent, title) {
    var p = html('div', 'fx-panel', parent);
    if (title) html('div', 'fx-panel-title', p, title);
    return p;
  }

  // ---------- scales and paths ----------
  function scale(d0, d1, r0, r1, log) {
    if (log) { var a = Math.log10(d0), b = Math.log10(d1); var f = function (v) { return r0 + (Math.log10(Math.max(v, 1e-12)) - a) / (b - a) * (r1 - r0); }; f.inv = function (p) { return Math.pow(10, a + (p - r0) / (r1 - r0) * (b - a)); }; return f; }
    var g = function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
    g.inv = function (p) { return d0 + (p - r0) / (r1 - r0) * (d1 - d0); };
    return g;
  }
  function pathOf(pts, X, Y) {
    var s = ''; // points with no value (hidden behind another line in the original) are skipped
    for (var i = 0; i < pts.length; i++) if (pts[i][1] !== null) s += (s ? 'L' : 'M') + X(pts[i][0]).toFixed(1) + ',' + Y(pts[i][1]).toFixed(1);
    return s;
  }
  function bandOf(pts, X, Y) { // pts: [x, lo, hi]
    var top = '', bot = '';
    for (var i = 0; i < pts.length; i++) top += (i ? 'L' : 'M') + X(pts[i][0]).toFixed(1) + ',' + Y(pts[i][2]).toFixed(1);
    for (var j = pts.length - 1; j >= 0; j--) bot += 'L' + X(pts[j][0]).toFixed(1) + ',' + Y(pts[j][1]).toFixed(1);
    return top + bot + 'Z';
  }
  function clipRect(root, x, y, w, h) {
    var id = 'fxc' + (++uid);
    var cp = svg('clipPath', { id: id }, svg('defs', {}, root));
    svg('rect', { x: x, y: y, width: w, height: h }, cp);
    return 'url(#' + id + ')';
  }
  function yLabel(g, s, x, y) { var t = txt(g, 0, 0, s, 'fx-label'); t.setAttribute('transform', 'translate(' + x + ',' + y + ') rotate(-90)'); return t; }
  function sup10(g, x, y, e) { var t = txt(g, x, y, '10', 'fx-tick', 'end'); var s = svg('tspan', { dy: -5, 'font-size': '0.75em' }, t); s.textContent = e; return t; }

  // ---------- tooltip ----------
  function tooltip(box) {
    var tip = html('div', 'fx-tip', box);
    return {
      show: function (rows, ax, ay, W, H) {
        tip.innerHTML = '';
        rows.forEach(function (r) {
          var line = html('div', r.head ? 'fx-tip-head' : 'fx-tip-row', tip);
          if (r.head) { line.textContent = r.head; return; }
          if (r.color) { var sw = html('span', 'fx-swatch', line); sw.style.background = r.color; }
          html('span', 'fx-tip-name', line, r.name);
          html('b', '', line, r.value);
        });
        tip.style.display = 'block';
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = ax + 14 + tw > W ? ax - 14 - tw : ax + 14;
        tip.style.left = clamp(left, 0, Math.max(0, W - tw)) + 'px';
        tip.style.top = clamp(ay - th / 2, 0, Math.max(0, H - th)) + 'px';
      },
      hide: function () { tip.style.display = 'none'; }
    };
  }

  // ---------- line chart with bands, hover readout ----------
  // opts: { x:{min,max,ticks,ticksNarrow,label,tickFmt,hoverLabel,log}, y:{min,max,ticks,label,log,tickFmt,minor},
  //         series:[{name,color,points,band,markers,width}], hlines:[{y,label}], right, rightLabel,
  //         aspect, minH, maxH, snap:'points', readout, valueFmt, after, skipHover }
  function lineChart(host, opts) {
    var box = html('div', 'fx-plot', host), tip = tooltip(box);
    var root, X, Y, M, W, H, hoverG;
    function draw(width) {
      if (root) root.remove();
      W = width; H = Math.round(clamp(W * (opts.aspect || 0.62), opts.minH || 210, opts.maxH || 380));
      M = { l: opts.y.label ? 52 : 40, r: opts.right || 12, t: 10, b: opts.x.label ? 42 : 26 };
      root = svg('svg', { width: W, height: H, 'class': 'fx-svg', role: 'img', 'aria-label': opts.label || '' });
      box.insertBefore(root, box.firstChild);
      X = scale(opts.x.min, opts.x.max, M.l, W - M.r, opts.x.log);
      Y = scale(opts.y.min, opts.y.max, H - M.b, M.t, opts.y.log);
      var g = svg('g', {}, root);
      var xt = W < 420 && opts.x.ticksNarrow ? opts.x.ticksNarrow : opts.x.ticks;
      (opts.y.minor || []).forEach(function (v) { svg('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), 'class': 'fx-grid minor' }, g); });
      opts.y.ticks.forEach(function (v) {
        svg('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), 'class': 'fx-grid' }, g);
        if (opts.y.sup) sup10(g, M.l - 7, Y(v) + 4, Math.round(Math.log10(v)));
        else txt(g, M.l - 7, Y(v) + 4, (opts.y.tickFmt || fmt)(v), 'fx-tick', 'end');
      });
      xt.forEach(function (v) { txt(g, X(v), H - M.b + 16, (opts.x.tickFmt || fmt)(v)); });
      svg('line', { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, 'class': 'fx-axis' }, g);
      if (opts.x.label) txt(g, (M.l + W - M.r) / 2, H - 6, opts.x.label, 'fx-label');
      if (opts.y.label) yLabel(g, opts.y.label, 13, (M.t + H - M.b) / 2);
      (opts.hlines || []).forEach(function (h) {
        svg('line', { x1: M.l, x2: W - M.r, y1: Y(h.y), y2: Y(h.y), 'class': 'fx-hline' }, g);
        if (h.label) txt(g, W - M.r + 6, Y(h.y) + 4, h.label, 'fx-tick strong', 'start');
      });
      if (opts.rightLabel) { var rl = txt(g, 0, 0, opts.rightLabel, 'fx-label'); rl.setAttribute('transform', 'translate(' + (W - 10) + ',' + ((M.t + H - M.b) / 2) + ') rotate(90)'); }
      var pg = svg('g', { 'clip-path': clipRect(root, M.l, M.t - 2, W - M.l - M.r, H - M.t - M.b + 4) }, root);
      opts.series.forEach(function (s) {
        if (s.band) { var bp = svg('path', { d: bandOf(s.band, X, Y), 'class': 'fx-band', fill: s.color }, pg); if (s.bandOpacity) bp.style.opacity = s.bandOpacity; }
        if (s.points) svg('path', { d: pathOf(s.points, X, Y), 'class': 'fx-line', stroke: s.color, 'stroke-width': s.width }, pg);
      });
      opts.series.forEach(function (s) {
        if (s.markers) s.points.forEach(function (p) { svg('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.4, fill: s.color, 'class': 'fx-dot' }, root); });
      });
      if (opts.after) opts.after(root, X, Y, M, W, H);
      hoverG = svg('g', { 'class': 'fx-hover' }, root);
    }
    function nearest(pts, x) {
      var best = null, bd = Infinity;
      for (var i = 0; i < pts.length; i++) { if (pts[i][1] === null) continue; var d = Math.abs(pts[i][0] - x); if (d < bd) { bd = d; best = pts[i]; } }
      return best;
    }
    function hover(ev) {
      var r = root.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
      if (px < M.l || px > W - M.r || py > H - M.b + 4 || (opts.skipHover && opts.skipHover(px, py))) return leave();
      while (hoverG.firstChild) hoverG.firstChild.remove();
      if (opts.snap === 'points') {
        var best = null, bd = 28 * 28;
        opts.series.forEach(function (s) {
          s.points.forEach(function (p) { var dx = X(p[0]) - px, dy = Y(p[1]) - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = { s: s, p: p }; } });
        });
        if (!best) return leave();
        svg('circle', { cx: X(best.p[0]), cy: Y(best.p[1]), r: 6.5, 'class': 'fx-ring', stroke: best.s.color }, hoverG);
        tip.show(opts.readout(best.s, best.p), X(best.p[0]), Y(best.p[1]), W, H);
        return;
      }
      var x = X.inv(px), rows = [], head = null;
      svg('line', { x1: px, x2: px, y1: M.t, y2: H - M.b, 'class': 'fx-cross' }, hoverG);
      opts.series.forEach(function (s) {
        var p = nearest(s.points, x);
        if (!p || Math.abs(X(p[0]) - px) > 30) return;
        if (head === null) head = p[0];
        svg('circle', { cx: X(p[0]), cy: Y(p[1]), r: 4, fill: s.color, 'class': 'fx-dot' }, hoverG);
        var bp = s.band ? nearest(s.band, x) : null;
        rows.push({ color: s.color, name: s.name, value: opts.valueFmt ? opts.valueFmt(p[1], bp) : fmt(p[1]) });
      });
      if (!rows.length) return leave();
      rows.unshift({ head: (opts.x.hoverLabel || '') + (opts.x.hoverFmt || opts.x.tickFmt || fmt)(Math.round(head)) });
      tip.show(rows, px, py, W, H);
    }
    function leave() { tip.hide(); if (hoverG) while (hoverG.firstChild) hoverG.firstChild.remove(); }
    box.addEventListener('pointermove', hover);
    box.addEventListener('pointerdown', hover);
    box.addEventListener('pointerleave', leave);
    onResize(box, draw);
  }

  var LAYER_TICKS = [0, 200, 400, 600, 800, 1000], LAYER_NARROW = [0, 250, 500, 750, 1000];
  function bandFmt(v, b) { return v.toFixed(2) + (b ? ' (' + b[1].toFixed(2) + ' to ' + b[2].toFixed(2) + ')' : ''); }

  // ---------- drawing pieces for the diagrams ----------
  function arrowHead(g, from, to, color, s) {
    var dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    svg('path', { d: 'M' + to[0] + ',' + to[1] + 'L' + (to[0] - ux * s - uy * s * 0.6) + ',' + (to[1] - uy * s + ux * s * 0.6) + 'L' + (to[0] - ux * s * 0.72) + ',' + (to[1] - uy * s * 0.72) + 'L' + (to[0] - ux * s + uy * s * 0.6) + ',' + (to[1] - uy * s - ux * s * 0.6) + 'Z', fill: color }, g);
  }
  function arrow(g, from, to, color, width, dash, head) {
    var dx = to[0] - from[0], dy = to[1] - from[1], L = Math.hypot(dx, dy), s = Math.min(head || width * 3.2 + 4, L * 0.5), k = L ? (L - s * 0.75) / L : 0;
    svg('line', { x1: from[0], y1: from[1], x2: from[0] + dx * k, y2: from[1] + dy * k, stroke: color, 'stroke-width': width, 'stroke-dasharray': dash || null, 'stroke-linecap': dash ? 'butt' : 'round', 'class': 'fx-arrow' }, g);
    if (L > 3) arrowHead(g, from, to, color, s);
  }
  // a hatched bar: the colour at low opacity with diagonal stripes, as in the original sketches
  function hatchDef(defs, color) {
    var id = 'fxh' + (++uid);
    var p = svg('pattern', { id: id, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    svg('rect', { width: 6, height: 6, fill: color, 'class': 'fx-hatch-bg' }, p);
    svg('line', { x1: 1.5, y1: 0, x2: 1.5, y2: 6, stroke: color, 'stroke-width': 2.4 }, p);
    return 'url(#' + id + ')';
  }
  function bar(g, defs, x, y, w, h, color, hatched) {
    svg('rect', { x: x, y: y, width: w, height: h, rx: Math.min(3, w / 5), fill: hatched ? hatchDef(defs, color) : color, stroke: color, 'stroke-width': 1.4 }, g);
  }

  // ---------- Fig. 1a and 2c: a 2D sketch of residual quantization ----------
  // The path is a hand-drawn schematic (like the original figure), not data.
  var STAIR = [[0, 0], [0.47, 0.05], [0.6, 0.22], [0.52, 0.34], [0.72, 0.45], [0.8, 0.575], [0.925, 0.625], [0.875, 0.738]];
  var ACT = [0.88, 0.75];
  function plane(host, mode) {
    var feat = mode === 'features', n = STAIR.length - 1;
    var box = html('div', 'fx-plot fx-center', host), root;
    var aria = feat ? 'Sketch: each RQAE feature is the sum of the first k codebook vectors, so deeper features point closer to the activation'
      : 'Sketch: the activation is approximated by a sum of one codebook vector per layer';
    onResize(box, function (width) {
      if (root) root.remove();
      var W = Math.min(width, 600), Hp = Math.round(W * 0.6), H = Hp + (feat ? 112 : 92);
      root = svg('svg', { width: W, height: H, 'class': 'fx-svg', role: 'img', 'aria-label': aria }, box);
      var defs = svg('defs', {}, root), g = svg('g', {}, root);
      var X = scale(-0.07, 1.0, 14, W - 14), Y = scale(-0.08, 0.8, Hp, 8);
      var O = [X(0), Y(0)], aw = Math.max(1.4, W / 400);
      // axes with arrowheads on both ends
      [[[X(-0.07), Y(0)], [X(1.0), Y(0)]], [[X(0), Y(-0.08)], [X(0), Y(0.8)]]].forEach(function (ax) {
        svg('line', { x1: ax[0][0], y1: ax[0][1], x2: ax[1][0], y2: ax[1][1], 'class': 'fx-axis' }, g);
        arrowHead(g, ax[1], ax[0], C('faint'), 7); arrowHead(g, ax[0], ax[1], C('faint'), 7);
      });
      var A = [X(ACT[0]), Y(ACT[1])], th = clamp(W / 70, 4.5, 9);
      arrow(g, O, A, C('accent'), th, null, th * 2.4);
      var ang = Math.atan2(A[1] - O[1], A[0] - O[0]), deg = ang * 180 / Math.PI;
      var lp = [O[0] + (A[0] - O[0]) * 0.4 + Math.sin(ang) * (th / 2 + 9), O[1] + (A[1] - O[1]) * 0.4 - Math.cos(ang) * (th / 2 + 9)];
      var lt = txt(g, 0, 0, 'LLM activation', 'fx-label strong');
      lt.setAttribute('transform', 'translate(' + lp[0].toFixed(1) + ',' + lp[1].toFixed(1) + ') rotate(' + deg.toFixed(1) + ')');
      var P = STAIR.map(function (p) { return [X(p[0]), Y(p[1])]; });
      var sw = clamp(W / 170, 2, 3.4);
      if (feat) {
        for (var i = 1; i <= n; i++) arrow(g, P[i - 1], P[i], C('stair'), sw * 0.8, '5 4', 9);
        for (var j = 1; j <= n; j++) arrow(g, O, P[j], ramp('f1', 'f5', j - 1, n), sw * 0.9, '7 5', 11);
      } else {
        for (var k = 1; k <= n; k++) arrow(g, P[k - 1], P[k], ramp('s1', 's5', k - 1, n), sw, '7 5', 12);
      }
      // the row of bars underneath
      var bw = clamp(W / 32, 10, 18), bh = clamp(W / 13, 30, 44), sg = svg('g', {}, root), y0 = Hp + (feat ? 34 : 22);
      if (feat) {
        var step = bw + clamp(W / 70, 4, 9), tw = n * step - (step - bw), x0 = (W - tw) / 2;
        var ft = txt(sg, W / 2, y0 - 10, 'Features', 'fx-label strong');
        for (var f = 0; f < n; f++) bar(sg, defs, x0 + f * step, y0, bw, bh, ramp('f1', 'f5', f, n), true);
        var ya = y0 + bh + 18;
        arrow(sg, [x0, ya], [x0 + tw, ya], C('faint'), 1.4, null, 8);
        txt(sg, W / 2, ya + 18, 'Layer', 'fx-tick');
      } else {
        var gap = clamp(W / 32, 10, 20), items = [];
        for (var b = 0; b < n; b++) { items.push({ bar: b }); items.push({ op: b === n - 1 ? '≈' : (b === 3 ? '+ … +' : '+') }); }
        items.push({ act: true });
        var widths = items.map(function (it) { return it.op ? (it.op.length > 1 ? gap * 2.4 : gap) : bw; });
        var total = widths.reduce(function (s, v) { return s + v; }, 0), x = (W - total) / 2;
        items.forEach(function (it, i) {
          if (it.op) txt(sg, x + widths[i] / 2, y0 + bh / 2 + 5, it.op, 'fx-op');
          else if (it.act) bar(sg, defs, x, y0, bw, bh, C('accent'), false);
          else bar(sg, defs, x, y0, bw, bh, ramp('s1', 's5', it.bar, n), true);
          x += widths[i];
        });
        if (W < 480) txt(sg, W / 2, y0 + bh + 20, 'codebook vectors, one per layer, summed', 'fx-tick');
        else {
          txt(sg, (W - total) / 2, y0 + bh + 20, 'one codebook vector per layer, summed', 'fx-tick', 'start');
          txt(sg, x, y0 + bh + 20, 'activation', 'fx-tick', 'end');
        }
      }
    });
  }

  // ---------- Fig. 1b: the RQAE layer, step by step ----------
  function arch(host) {
    var box = html('div', 'fx-plot fx-center', host), legend = html('ol', 'fx-steps', host), root;
    var STAGES = ['Project into subspace', 'Normalize', 'Vector quantize', 'Project back'];
    STAGES.forEach(function (s) { html('li', '', legend, s); });
    onResize(box, function (width) {
      if (root) root.remove();
      var W = Math.min(width, 640), narrow = W < 430;
      legend.style.display = narrow ? '' : 'none';
      var s = Math.min(1.15, (W - 12) / 452), ox = (W - 452 * s) / 2;
      var u = function (v) { return ox + v * s; };
      var BH = 130 * s, labelH = narrow ? 30 : 52, rowGap = 40 * s + 22, EQ = 62 * s;
      var rowY = function (r) { return labelH + r * (BH + 18 + 22 + EQ + rowGap); }; // top of the row
      var H = rowY(2) - rowGap + 30;
      root = svg('svg', { width: W, height: H, 'class': 'fx-svg', role: 'img', 'aria-label': 'One RQAE layer: project the input into a small subspace, normalize, snap to the nearest codebook, project back; the residual goes to the next layer' }, box);
      var defs = svg('defs', {}, root), g = svg('g', {}, root);
      var cols = [C('accent'), ramp('s2', 's4', 1, 3), ramp('s2', 's4', 2, 3)];
      function row(r) {
        var top = rowY(r), cy = top + BH / 2, inC = cols[r];
        var hb = function (h) { return [cy - h * s / 2, h * s]; };
        var t = hb(130); bar(g, defs, u(0), t[0], 22 * s, t[1], inC, false);
        svg('path', { d: 'M' + u(34) + ',' + (cy - 65 * s) + 'L' + u(104) + ',' + (cy - 28 * s) + 'L' + u(104) + ',' + (cy + 28 * s) + 'L' + u(34) + ',' + (cy + 65 * s) + 'Z', 'class': 'fx-trap' }, g);
        var pb = hb(44); svg('rect', { x: u(112), y: pb[0], width: 16 * s, height: pb[1], rx: 3, 'class': 'fx-sub' }, g);
        arrow(g, [u(133), cy], [u(158), cy], C('faint'), 1.6, null, 7);
        svg('circle', { cx: u(185), cy: cy, r: 24 * s, 'class': 'fx-sub' }, g);
        arrow(g, [u(212), cy], [u(237), cy], C('faint'), 1.6, null, 7);
        svg('circle', { cx: u(264), cy: cy, r: 24 * s, 'class': 'fx-sub dashed' }, g);
        arrow(g, [u(291), cy], [u(316), cy], C('faint'), 1.6, null, 7);
        svg('rect', { x: u(322), y: pb[0], width: 16 * s, height: pb[1], rx: 3, 'class': 'fx-sub dashed' }, g);
        svg('path', { d: 'M' + u(346) + ',' + (cy - 28 * s) + 'L' + u(416) + ',' + (cy - 65 * s) + 'L' + u(416) + ',' + (cy + 65 * s) + 'L' + u(346) + ',' + (cy + 28 * s) + 'Z', 'class': 'fx-trap' }, g);
        bar(g, defs, u(428), t[0], 22 * s, t[1], inC, true);
        txt(g, u(0), top + BH + 15, r ? 'residual' : 'r', 'fx-tick it', 'start');
        txt(g, u(439), top + BH + 15, 'r̂', 'fx-tick it');
        // r - r_hat = residual
        var ey = top + BH + 26, ew = 16 * s, ex = u(226) - 2.5 * ew;
        bar(g, defs, ex, ey, ew, EQ, inC, false);
        txt(g, ex + ew * 1.5, ey + EQ / 2 + 6, '−', 'fx-op');
        bar(g, defs, ex + ew * 2, ey, ew, EQ, inC, true);
        txt(g, ex + ew * 3.5, ey + EQ / 2 + 6, '=', 'fx-op');
        bar(g, defs, ex + ew * 4, ey, ew, EQ, cols[r + 1], false);
        txt(g, ex + ew * 5 + 8, ey + EQ / 2 + 4, 'residual', 'fx-label', 'start');
        // hand the residual to the next layer
        var from = [ex + ew * 4.5, ey + EQ + 5];
        if (r === 0) {
          var to = [u(11), rowY(1) - 6];
          svg('path', { d: 'M' + from[0] + ',' + from[1] + 'C' + from[0] + ',' + (from[1] + rowGap * 0.8) + ' ' + to[0] + ',' + (from[1] + 4) + ' ' + to[0] + ',' + (to[1] - 6), 'class': 'fx-curve' }, g);
          arrowHead(g, [to[0], to[1] - 10], to, C('faint'), 8);
        } else {
          svg('path', { d: 'M' + from[0] + ',' + from[1] + 'C' + from[0] + ',' + (from[1] + 16) + ' ' + u(11) + ',' + (from[1] + 4) + ' ' + u(11) + ',' + (from[1] + 18), 'class': 'fx-curve' }, g);
          arrowHead(g, [u(11), from[1] + 12], [u(11), from[1] + 22], C('faint'), 8);
          txt(g, u(11) + 12, from[1] + 24, '… and so on, for every layer (1,024 here)', 'fx-label', 'start');
        }
      }
      // stage labels with braces over the first row
      var groups = [[0, 128], [161, 209], [240, 288], [322, 450]];
      groups.forEach(function (gr, i) {
        var y = labelH - 8, a = u(gr[0]), b = u(gr[1]), m = (a + b) / 2;
        svg('path', { d: 'M' + a + ',' + (y + 5) + 'Q' + a + ',' + y + ' ' + (a + 5) + ',' + y + 'L' + (m - 5) + ',' + y + 'Q' + m + ',' + y + ' ' + m + ',' + (y - 5) + 'Q' + m + ',' + y + ' ' + (m + 5) + ',' + y + 'L' + (b - 5) + ',' + y + 'Q' + b + ',' + y + ' ' + b + ',' + (y + 5), 'class': 'fx-brace' }, g);
        if (narrow) { svg('circle', { cx: m, cy: y - 14, r: 8, 'class': 'fx-num' }, g); txt(g, m, y - 10, String(i + 1), 'fx-num-t'); }
        else {
          var words = [['Project into', 'subspace'], ['Normalize'], ['Vector', 'quantize'], ['Project back']][i];
          words.forEach(function (w, j) { txt(g, m, y - 10 - (words.length - 1 - j) * 15, w, 'fx-label strong'); });
        }
      });
      row(0); row(1);
    });
  }

  // ---------- Fig. 2a ----------
  function histogram(host, data) {
    var bins = data.bins, total = 0, within = 0;
    bins.forEach(function (b) { total += b.count; if (Math.abs(b.x) <= 0.2) within += b.count; });
    var box = html('div', 'fx-plot', host), tip = tooltip(box), root, X, Y, W, H, M;
    onResize(box, function (width) {
      if (root) root.remove();
      W = width; H = Math.round(clamp(W * 0.68, 220, 300)); M = { l: 46, r: 8, t: 10, b: 42 };
      root = svg('svg', { width: W, height: H, 'class': 'fx-svg', role: 'img', 'aria-label': 'Histogram of pairwise cosine similarities between codebooks, log scale' });
      box.insertBefore(root, box.firstChild);
      X = scale(-0.5, 0.36, M.l, W - M.r); Y = scale(0.5, 2e6, H - M.b, M.t, true);
      var g = svg('g', {}, root);
      svg('rect', { x: X(-0.2), y: M.t, width: X(0.2) - X(-0.2), height: H - M.b - M.t, 'class': 'fx-shade' }, g);
      [1, 10, 100, 1e3, 1e4, 1e5, 1e6].forEach(function (v, i) {
        svg('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), 'class': 'fx-grid' }, g);
        if (W > 300 || i % 2 === 0) sup10(g, M.l - 7, Y(v) + 4, i);
      });
      (W > 360 ? [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3] : [-0.4, -0.2, 0, 0.2]).forEach(function (v) { txt(g, X(v), H - M.b + 16, fmt(v, 1)); });
      txt(g, (M.l + W - M.r) / 2, H - 6, 'Cosine similarity', 'fx-label');
      yLabel(g, 'Pairs of codebooks', 12, (M.t + H - M.b) / 2);
      bins.forEach(function (b) {
        var x0 = X(b.x - b.w / 2), x1 = X(b.x + b.w / 2), y = Y(Math.max(b.count, 1));
        svg('rect', { x: x0, y: y, width: Math.max(0.8, x1 - x0 - 0.5), height: H - M.b - y, 'class': 'fx-bar' }, g);
      });
      svg('line', { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, 'class': 'fx-axis' }, g);
      var pct = (100 * within / total).toFixed(3) + '%';
      txt(g, X(-0.2) - 6, M.t + 14, pct, 'fx-tick strong', 'end');
      txt(g, X(-0.2) - 6, M.t + 28, 'within ±0.2', 'fx-tick', 'end');
    });
    function hov(e) {
      var r = root.getBoundingClientRect(), x = X.inv(e.clientX - r.left), b = null, bd = 1;
      bins.forEach(function (q) { var d = Math.abs(q.x - x); if (d < bd) { bd = d; b = q; } });
      if (!b || bd > 0.02) return tip.hide();
      tip.show([{ head: 'Cosine similarity ' + b.x.toFixed(3) }, { name: 'Pairs', value: Math.round(b.count).toLocaleString() }], e.clientX - r.left, M.t + 30, W, H);
    }
    box.addEventListener('pointermove', hov); box.addEventListener('pointerdown', hov);
    box.addEventListener('pointerleave', function () { tip.hide(); });
  }

  // ---------- Fig. 6a: grouped bars with error bars ----------
  function sweep(host, d) {
    var box = html('div', 'fx-plot', host), tip = tooltip(box), root, W, H;
    var COLS = [C('rq1'), C('rq2'), C('rq3'), C('sae1'), C('sae2'), C('sae3'), C('sae4'), C('sae5')];
    onResize(box, function (width) {
      if (root) root.remove();
      W = width; H = Math.round(clamp(W * 0.66, 220, 300));
      var M = { l: 40, r: 4, t: 10, b: 28 };
      root = svg('svg', { width: W, height: H, 'class': 'fx-svg', role: 'img', 'aria-label': 'Detection and fuzzing scores for RQAE and SAEs' });
      box.insertBefore(root, box.firstChild);
      var Y = scale(0, 1, H - M.b, M.t), g = svg('g', {}, root);
      [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) { svg('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), 'class': 'fx-grid' }, g); txt(g, M.l - 7, Y(v) + 4, v.toFixed(1), 'fx-tick', 'end'); });
      yLabel(g, 'Score', 11, (M.t + H - M.b) / 2);
      var gw = (W - M.l - M.r) / 2, n = d.labels.length, pad = gw * 0.07, gap = gw * 0.06, bw = (gw - 2 * pad - gap) / n;
      ['detection', 'fuzzing'].forEach(function (gr, gi) {
        var x0 = M.l + gi * gw + pad;
        txt(g, M.l + gi * gw + gw / 2, H - 8, gr[0].toUpperCase() + gr.slice(1), 'fx-label strong');
        d[gr].forEach(function (v, i) {
          var x = x0 + i * bw + (i >= 3 ? gap : 0), cx = x + bw / 2;
          svg('rect', { x: x + 0.75, y: Y(v[0]), width: bw - 1.5, height: Y(0) - Y(v[0]), fill: COLS[i] }, g);
          svg('line', { x1: cx, x2: cx, y1: Y(v[1]), y2: Y(v[2]), 'class': 'fx-err' }, g);
          svg('line', { x1: cx - bw * 0.22, x2: cx + bw * 0.22, y1: Y(v[1]), y2: Y(v[1]), 'class': 'fx-err' }, g);
          svg('line', { x1: cx - bw * 0.22, x2: cx + bw * 0.22, y1: Y(v[2]), y2: Y(v[2]), 'class': 'fx-err' }, g);
          var hit = svg('rect', { x: x, y: M.t, width: bw, height: H - M.b - M.t, fill: 'transparent' }, g);
          function show() { tip.show([{ head: gr[0].toUpperCase() + gr.slice(1) }, { color: COLS[i], name: d.labels[i], value: v[0].toFixed(3) }, { name: '± standard error', value: ((v[2] - v[1]) / 2).toFixed(3) }], cx, Y(v[0]), W, H); }
          hit.addEventListener('pointerenter', show); hit.addEventListener('pointerdown', show);
        });
      });
      svg('line', { x1: M.l, x2: W - M.r, y1: Y(0), y2: Y(0), 'class': 'fx-axis' }, g);
    });
    box.addEventListener('pointerleave', function () { tip.hide(); });
    key(host, d.labels.map(function (l, i) { return { name: l.replace('L0=', 'L₀ = ').replace(/^(\d+k) /, 'SAE $1, '), color: COLS[i] }; }));
  }

  // ---------- figure registry ----------
  var FIGS = {
    'rvq-toy': function (h) { plane(h, 'decompose'); },
    'feature-toy': function (h) { plane(h, 'features'); },
    'rqae-steps': function (h) { arch(h); },
    'codebooks': function (h) {
      if (!D.cosine || !D.l2) return false;
      var grid = html('div', 'fx-two', h);
      histogram(panel(grid, 'Pairwise cosine similarity of codebooks'), D.cosine);
      lineChart(panel(grid, 'L2 norm of projected codebooks'), {
        label: 'L2 norm of projected codebooks by RQAE layer', aspect: 0.68, minH: 220, maxH: 300,
        x: { min: 0, max: 1024, ticks: LAYER_TICKS, ticksNarrow: LAYER_NARROW, tickFmt: String, label: 'Layer', hoverLabel: 'Layer ' },
        y: { min: 0, max: 25, ticks: [0, 5, 10, 15, 20, 25], label: 'L2 norm' },
        series: [{ name: 'L2 norm', color: C('accent'), points: D.l2.points }],
        valueFmt: function (v) { return v.toFixed(2); }
      });
    },
    'recon': function (h) {
      if (!D.training || !D.ceL0) return false;
      var models = [['9B', 'Gemma 2 9B', C('m9')], ['2B', 'Gemma 2 2B', C('m2')]];
      key(h, models.map(function (m) { return { name: m[1], color: m[2], line: true }; }));
      var grid = html('div', 'fx-two', h);
      [['ce', 'Cross-entropy loss difference', { min: -0.05, max: 0.5, ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5] }],
       ['mse', 'MSE loss', { min: 0, max: 1, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] }]].forEach(function (c) {
        var t = D.training[c[0]];
        lineChart(panel(grid, c[1]), {
          label: c[1] + ' over training', aspect: 0.68, minH: 210, maxH: 290,
          x: { min: 0, max: 450000, ticks: [0, 100000, 200000, 300000, 400000], ticksNarrow: [0, 200000, 400000], label: 'Training steps', hoverLabel: 'Step ', hoverFmt: function (v) { return Math.round(v / 1000) + 'k'; } },
          y: c[2],
          series: models.map(function (m) {
            var rows = t[m[0]];
            return { name: m[1], color: m[2], bandOpacity: 0.32, width: 1.5, points: rows.map(function (r) { return [r.step, r.med]; }), band: rows.map(function (r) { return [r.step, r.min, r.max]; }) };
          }),
          valueFmt: function (v, b) { return v.toFixed(3); }
        });
      });
      html('p', 'fx-hint', h, 'The shaded areas cover the noisy range of each loss curve; the darker line runs through its middle.');
      // CE vs L0, with one horizontal line per RQAE depth
      var bot = panel(html('div', 'fx-block', h), 'Cross-entropy loss difference: SAEs by L₀ vs RQAE by number of layers');
      var names = ['16k', '32k', '65k', '262k', '524k'];
      var series = names.map(function (n, i) { return { name: 'SAE, width ' + n, color: ramp('s2', 's6', i, 5), points: D.ceL0.sae[n], markers: true, width: 1.8 }; });
      key(bot, names.map(function (n, i) { return { name: n, color: series[i].color, line: true }; }), 'SAE width');
      lineChart(bot, {
        label: 'CE loss difference versus L0 for SAEs, with RQAE reconstruction levels', aspect: 0.62, minH: 300, maxH: 420,
        x: { min: 0, max: 460, ticks: [0, 100, 200, 300, 400], label: 'L₀ (SAEs)' },
        y: { min: 0.001, max: 1, log: true, ticks: [0.001, 0.01, 0.1, 1], label: 'CE loss difference', tickFmt: function (v) { return String(v); } },
        hlines: D.ceL0.rqae.map(function (l) { return { y: l.ce, label: String(l.layers) }; }),
        right: 56, rightLabel: 'RQAE layers',
        series: series, snap: 'points',
        readout: function (s, p) { return [{ head: s.name }, { name: 'L₀', value: Math.round(p[0]) }, { name: 'CE loss diff.', value: p[1].toPrecision(2) }]; }
      });
    },
    'spearman': function (h) {
      if (!D.spearman) return false;
      var pts = D.spearman.points, mk = function (ps) { return [{ name: 'Mean', color: C('accent'), points: ps.map(function (p) { return [p[0], p[1]]; }), band: ps.map(function (p) { return [p[0], p[2], p[3]]; }) }]; };
      var zoom = pts.filter(function (p) { return p[0] <= 140; }), host = html('div', '', h), inset = null, below = html('div', 'fx-block', h);
      var zoomOpts = {
        label: 'Zoom on the first 140 layers', aspect: 0.55, minH: 200, maxH: 260,
        x: { min: 0, max: 140, ticks: [0, 20, 40, 60, 80, 100, 120, 140], ticksNarrow: [0, 35, 70, 105, 140], label: 'Layer', hoverLabel: 'Layer ' },
        y: { min: -0.12, max: 0.75, ticks: [0, 0.2, 0.4, 0.6], label: 'Spearman' },
        series: mk(zoom), valueFmt: bandFmt
      };
      var narrowMade = false;
      lineChart(host, {
        label: 'Spearman correlation between feature ranking and cosine-similarity ranking, by layer', aspect: 0.62, minH: 280, maxH: 420,
        x: { min: 0, max: 1024, ticks: LAYER_TICKS, ticksNarrow: LAYER_NARROW, tickFmt: String, label: 'Layer', hoverLabel: 'Layer ' },
        y: { min: -0.15, max: 0.85, ticks: [0, 0.2, 0.4, 0.6, 0.8], label: 'Spearman correlation' },
        series: mk(pts), valueFmt: bandFmt,
        skipHover: function (px, py) { return inset && px > inset[0] && px < inset[0] + inset[2] && py > inset[1] && py < inset[1] + inset[3]; },
        after: function (root, X, Y, M, W, H) {
          inset = null;
          if (W < 500) { below.style.display = ''; if (!narrowMade) { narrowMade = true; lineChart(panel(below, 'First 140 layers'), zoomOpts); } return; }
          below.style.display = 'none';
          var ix = X(300), iy = Y(0.46), iw = X(1010) - ix, ih = Y(-0.13) - iy;
          inset = [ix, iy, iw, ih];
          var g = svg('g', {}, root);
          var zx = X(0), zy = Y(0.75), zw = X(140) - X(0), zh = Y(-0.12) - zy;
          svg('rect', { x: zx, y: zy, width: zw, height: zh, 'class': 'fx-zoom-box' }, g);
          svg('line', { x1: zx + zw, y1: zy, x2: ix, y2: iy, 'class': 'fx-zoom' }, g);
          svg('line', { x1: zx + zw, y1: zy + zh, x2: ix, y2: iy + ih, 'class': 'fx-zoom' }, g);
          svg('rect', { x: ix, y: iy, width: iw, height: ih, rx: 4, 'class': 'fx-inset' }, g);
          var m = { l: 34, r: 10, t: 22, b: 22 };
          var IX = scale(0, 140, ix + m.l, ix + iw - m.r), IY = scale(-0.12, 0.75, iy + ih - m.b, iy + m.t);
          txt(g, ix + 10, iy + 15, 'First 140 layers', 'fx-tick strong', 'start');
          [0, 0.2, 0.4, 0.6].forEach(function (v) { svg('line', { x1: IX(0), x2: IX(140), y1: IY(v), y2: IY(v), 'class': 'fx-grid' }, g); txt(g, IX(0) - 5, IY(v) + 4, fmt(v), 'fx-tick small', 'end'); });
          [0, 20, 40, 60, 80, 100, 120, 140].forEach(function (v) { txt(g, IX(v), iy + ih - 7, String(v), 'fx-tick small'); });
          var s = mk(zoom)[0], cg = svg('g', { 'clip-path': clipRect(root, IX(0), IY(0.75), IX(140) - IX(0), IY(-0.12) - IY(0.75)) }, g);
          svg('path', { d: bandOf(s.band, IX, IY), 'class': 'fx-band', fill: s.color }, cg);
          svg('path', { d: pathOf(s.points, IX, IY), 'class': 'fx-line', stroke: s.color }, cg);
        }
      });
    },
    'pearson': function (h) {
      if (!D.pearson) return false;
      var mk = function (rows, name, color) { return { name: name, color: color, points: rows.map(function (p) { return [p[0], p[1]]; }), band: rows.map(function (p) { return [p[0], p[2], p[3]]; }) }; };
      var ser = [mk(D.pearson.encoding, 'Encoding vector', C('ink')), mk(D.pearson.top_token, 'Top activating token', C('accent'))];
      key(h, ser.map(function (s) { return { name: s.name, color: s.color, line: true }; }), 'RQAE feature built from');
      lineChart(h, {
        label: 'Pearson correlation with Gemmascope features by layer', aspect: 0.62, minH: 280, maxH: 420,
        x: { min: 0, max: 1024, ticks: LAYER_TICKS, ticksNarrow: LAYER_NARROW, tickFmt: String, label: 'Layer', hoverLabel: 'Layer ' },
        y: { min: -0.2, max: 1, ticks: [-0.2, 0, 0.2, 0.4, 0.6, 0.8, 1], label: 'Pearson correlation' },
        series: ser, valueFmt: bandFmt
      });
    },
    'sweeps': function (h) {
      if (!D.sweeps) return false;
      var grid = html('div', 'fx-two', h);
      sweep(panel(grid, 'Sweeping L₀ (SAE width 16k)'), D.sweeps.l0);
      sweep(panel(grid, 'Sweeping width (SAE L₀ ≈ 80)'), D.sweeps.width);
      html('p', 'fx-hint', h, 'Bars show the mean over 100 features; whiskers show the standard error.');
    }
  };

  function init() {
    document.querySelectorAll('figure[data-fig]').forEach(function (fig) {
      var make = FIGS[fig.dataset.fig];
      if (!make) return;
      var host = document.createElement('div');
      host.className = 'fx';
      fig.insertBefore(host, fig.querySelector('figcaption'));
      try {
        if (make(host) === false) { host.remove(); return; }
        fig.classList.add('live');
      } catch (e) {
        host.remove(); fig.classList.remove('live');
        if (window.console) console.error('figure ' + fig.dataset.fig, e);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
