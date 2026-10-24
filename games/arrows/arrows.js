/* Arrows — a relaxing arrow escape puzzle for disc0.net/games
 *
 * Each arrow is a path of grid cells, tail to head, that may bend.
 * Tap an arrow and it slides forward along its own track in the
 * direction the head points, the body following through every turn.
 * It only leaves if every cell ahead of the head is empty. A blocked
 * tap costs a heart. Clear every arrow to finish the level.
 *
 * Levels come from a seeded RNG so level N is always the same puzzle.
 * Boards are built in reverse: each new arrow must have a clear exit
 * past everything placed before it, so removing arrows in reverse
 * order always works and every board is solvable by construction.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'd0-arrows-v1';
  var MAX_HEARTS = 3;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  var ANG = { R: 0, D: 90, L: 180, U: 270 };
  var NAMES = { U: 'up', D: 'down', L: 'left', R: 'right' };
  var SIZES = [[3, 3], [4, 4], [4, 5], [5, 5], [5, 6], [6, 6], [6, 7], [7, 7], [7, 8], [7, 9], [8, 9], [8, 10]];
  var COLORS = 4;

  // Geometry in cell units: how far the body stub extends behind the tail
  // centre, and how far past the head centre the line tucks under the tip.
  var TAIL_STUB = 0.28;
  var HEAD_TUCK = 0.08;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- seeded rng ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- geometry ---------- */
  function headOf(a) { return a.cells[a.cells.length - 1]; }

  function dirBetween(p, q) {
    if (q[0] > p[0]) return 'R';
    if (q[0] < p[0]) return 'L';
    if (q[1] > p[1]) return 'D';
    return 'U';
  }

  // Direction the tail end points away from the body (used for the stub).
  function tailDir(a) {
    return a.cells.length > 1 ? dirBetween(a.cells[1], a.cells[0]) : dirOpposite(a.dir);
  }

  function dirOpposite(d) { return { U: 'D', D: 'U', L: 'R', R: 'L' }[d]; }

  // Length of the drawn body along its track, in cells.
  function bodyLength(a) { return TAIL_STUB + (a.cells.length - 1) + HEAD_TUCK; }

  // Walk ahead of the head. blocker is -1 for a clear path; gap counts empty cells.
  function pathInfo(b, occ, a) {
    var d = DIRS[a.dir], h = headOf(a), hx = h[0], hy = h[1], gap = 0;
    for (;;) {
      hx += d[0]; hy += d[1];
      if (hx < 0 || hy < 0 || hx >= b.w || hy >= b.h) return { blocker: -1, gap: gap };
      var o = occ[hy * b.w + hx];
      if (o !== -1 && o !== a.id) return { blocker: o, gap: gap };
      gap++;
    }
  }

  function buildOcc(b, arrows) {
    var occ = new Array(b.w * b.h);
    for (var i = 0; i < occ.length; i++) occ[i] = -1;
    arrows.forEach(function (a) {
      a.cells.forEach(function (c) { occ[c[1] * b.w + c[0]] = a.id; });
    });
    return occ;
  }

  /* ---------- generation ---------- */
  function levelParams(n) {
    var tier = Math.min(SIZES.length - 1, Math.floor((n - 1) / 3));
    return {
      w: SIZES[tier][0],
      h: SIZES[tier][1],
      fill: Math.min(0.8, 0.52 + n * 0.012),
      maxLen: n < 3 ? 2 : n < 7 ? 3 : n < 14 ? 4 : n < 24 ? 5 : 6
    };
  }

  // Random self-avoiding walk through free cells, tail first.
  function randomPath(w, h, occ, rng, len) {
    var x = Math.floor(rng() * w), y = Math.floor(rng() * h);
    if (occ[y * w + x] !== -1) return null;
    var cells = [[x, y]], seen = {};
    seen[y * w + x] = true;
    var dirs = ['U', 'D', 'L', 'R'], last = null;
    for (var k = 1; k < len; k++) {
      var opts = [];
      for (var i = 0; i < 4; i++) {
        var d = DIRS[dirs[i]], nx = x + d[0], ny = y + d[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (occ[ny * w + nx] !== -1 || seen[ny * w + nx]) continue;
        opts.push(dirs[i]);
      }
      if (!opts.length) break;
      // Lean toward going straight so arrows read as arrows, not scribbles.
      var pick = (last && opts.indexOf(last) !== -1 && rng() < 0.55) ? last : opts[Math.floor(rng() * opts.length)];
      x += DIRS[pick][0]; y += DIRS[pick][1];
      cells.push([x, y]);
      seen[y * w + x] = true;
      last = pick;
    }
    var dir = last || dirs[Math.floor(rng() * 4)];
    return { cells: cells, dir: dir };
  }

  function randomBoard(p, rng) {
    var w = p.w, h = p.h, target = Math.round(w * h * p.fill);
    var occ = new Array(w * h), arrows = [], filled = 0;
    for (var i = 0; i < occ.length; i++) occ[i] = -1;
    var tries = w * h * 14;
    while (filled < target && tries-- > 0) {
      var len = 1 + Math.floor(rng() * p.maxLen);
      var path = randomPath(w, h, occ, rng, len);
      if (!path) continue;
      var a = { id: arrows.length, cells: path.cells, dir: path.dir };
      if (pathInfo({ w: w, h: h }, occ, a).blocker !== -1) continue;
      arrows.push(a);
      a.cells.forEach(function (c) { occ[c[1] * w + c[0]] = a.id; });
      filled += a.cells.length;
    }
    return arrows.length ? { w: w, h: h, arrows: arrows } : null;
  }

  // Greedy removal is complete here: removing an arrow never blocks another.
  function solveStats(b) {
    var occ = buildOcc(b, b.arrows);
    var alive = b.arrows.slice(), rounds = 0, firstFree = 0;
    for (;;) {
      var free = alive.filter(function (a) { return pathInfo(b, occ, a).blocker === -1; });
      if (!free.length) break;
      if (!rounds) firstFree = free.length;
      free.forEach(function (a) {
        a.cells.forEach(function (c) { occ[c[1] * b.w + c[0]] = -1; });
      });
      alive = alive.filter(function (a) { return free.indexOf(a) === -1; });
      rounds++;
    }
    return { solvable: alive.length === 0, rounds: rounds, firstFree: firstFree };
  }

  function generate(n) {
    var p = levelParams(n), rng = mulberry32(n * 7919 + 13), best = null;
    for (var c = 0; c < 24; c++) {
      var cand = randomBoard(p, rng);
      if (!cand) continue;
      var s = solveStats(cand);
      if (!s.solvable) continue;
      // Prefer deep dependency chains with few immediately-free arrows.
      var score = s.rounds * 10 - s.firstFree;
      if (!best || score > best.score) best = { board: cand, score: score };
    }
    if (!best) {
      // Should not happen, but never leave the player without a board.
      return { w: p.w, h: p.h, arrows: [{ id: 0, cells: [[0, 0]], dir: 'R' }] };
    }
    return best.board;
  }

  /* ---------- persistence ---------- */
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { level: s.level || 1, max: s.max || 1, wins: s.wins || 0 };
    } catch (e) { return { level: 1, max: 1, wins: 0 }; }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (e) {}
  }

  /* ---------- dom ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var stageEl = $('ar-stage'), boardEl = $('ar-board'), heartsEl = $('ar-hearts');
  var levelBtn = $('ar-level-btn'), hintBtn = $('ar-hint-btn');
  var overlay = $('g-overlay'), dlgTitle = $('g-dialog-title'), dlgText = $('g-dialog-text');
  var dlgBtns = $('g-dialog-btns'), dlgStat = $('g-dialog-stat');

  var progress = load();
  var board, occ, live, els, hearts, over, mistakes, svg;

  function fitBoard() {
    if (!board) return;
    var sw = stageEl.clientWidth, sh = stageEl.clientHeight;
    var size = Math.min(sw, sh * board.w / board.h, 560);
    boardEl.style.width = Math.max(120, size) + 'px';
    boardEl.style.height = Math.max(120, size * board.h / board.w) + 'px';
    boardEl.style.backgroundSize = (100 / board.w) + '% ' + (100 / board.h) + '%';
  }

  function el(name, attrs) {
    var e = document.createElementNS(SVG_NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function fmt(n) { return Math.round(n * 1000) / 1000; }

  // Track: a stub behind the tail, through every cell centre, then straight
  // on from the head far past the board edge. The body is a dash on it.
  function trackPath(a) {
    var t = DIRS[tailDir(a)], c0 = a.cells[0];
    var pts = [[c0[0] + 0.5 + t[0] * TAIL_STUB, c0[1] + 0.5 + t[1] * TAIL_STUB]];
    a.cells.forEach(function (c) { pts.push([c[0] + 0.5, c[1] + 0.5]); });
    var h = headOf(a), d = DIRS[a.dir], far = board.w + board.h + a.cells.length + 2;
    pts.push([h[0] + 0.5 + d[0] * far, h[1] + 0.5 + d[1] * far]);
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + fmt(p[0]) + ' ' + fmt(p[1]); }).join(' ');
  }

  // One full square per cell: a fat, reliable tap target on a phone.
  function hitGroup(a) {
    var g = el('g', { 'class': 'ar-hit' });
    a.cells.forEach(function (c) { g.appendChild(el('rect', { x: c[0], y: c[1], width: 1, height: 1 })); });
    return g;
  }

  function tipTransform(a, offset) {
    var h = headOf(a), d = DIRS[a.dir];
    return 'translate(' + fmt(h[0] + 0.5 + d[0] * offset) + ' ' + fmt(h[1] + 0.5 + d[1] * offset) + ') rotate(' + ANG[a.dir] + ')';
  }

  function arrowEl(a) {
    var g = el('g', { 'class': 'ar-arrow ar-c' + (a.id % COLORS), tabindex: '0', role: 'button' });
    g.dataset.id = a.id;
    g.setAttribute('aria-label', NAMES[a.dir] + ' arrow, ' + a.cells.length + (a.cells.length === 1 ? ' cell' : ' cells'));
    var L = bodyLength(a), far = (board.w + board.h) * 2 + 20;
    var hit = hitGroup(a);
    var body = el('path', { 'class': 'ar-body', d: trackPath(a), 'stroke-dasharray': fmt(L) + ' ' + far, 'stroke-dashoffset': '0' });
    var tip = el('polygon', { 'class': 'ar-tip', points: '0.46,0 0.06,-0.3 0.06,0.3', transform: tipTransform(a, 0) });
    g.appendChild(hit); g.appendChild(body); g.appendChild(tip);
    return g;
  }

  // Slide an arrow along its track to `offset` cells ahead of rest.
  function setOffset(a, g, offset) {
    g.querySelector('.ar-body').setAttribute('stroke-dashoffset', fmt(-offset));
    g.querySelector('.ar-tip').setAttribute('transform', tipTransform(a, offset));
    g.querySelector('.ar-hit').setAttribute('transform', 'translate(' + fmt(DIRS[a.dir][0] * offset) + ' ' + fmt(DIRS[a.dir][1] * offset) + ')');
  }

  function easeIn(t) { return t * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2); }

  // Animate offset from -> to over dur ms with easing fn, then call done.
  function slide(a, g, from, to, dur, ease, done) {
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var t = dur ? Math.min(1, (ts - start) / dur) : 1;
      setOffset(a, g, from + (to - from) * ease(t));
      if (t < 1) requestAnimationFrame(frame); else if (done) done();
    }
    requestAnimationFrame(frame);
  }

  function renderHearts() {
    var html = '';
    for (var i = 0; i < MAX_HEARTS; i++) html += '<span class="' + (i < hearts ? '' : 'is-lost') + '">♥</span>';
    heartsEl.innerHTML = html;
  }

  function startLevel(n) {
    progress.level = n;
    save();
    board = generate(n);
    occ = buildOcc(board, board.arrows);
    live = {};
    els = {};
    hearts = MAX_HEARTS;
    mistakes = 0;
    over = false;
    levelBtn.textContent = 'Level ' + n;
    boardEl.innerHTML = '';
    svg = el('svg', { viewBox: '0 0 ' + board.w + ' ' + board.h, 'class': 'ar-svg' });
    boardEl.appendChild(svg);
    fitBoard();
    board.arrows.forEach(function (a) {
      live[a.id] = a;
      var g = arrowEl(a);
      els[a.id] = g;
      svg.appendChild(g);
    });
    renderHearts();
    hideDialog();
  }

  function remaining() { return Object.keys(live).length; }

  function tap(id) {
    if (over) return;
    var a = live[id];
    if (!a || a.locked) return;
    var g = els[id];
    var info = pathInfo(board, occ, a);

    if (info.blocker === -1) {
      // Free: drop it from the logic now so the next tap sees the gap.
      a.cells.forEach(function (c) { occ[c[1] * board.w + c[0]] = -1; });
      delete live[id];
      g.classList.add('is-leaving');
      // head clears the edge after gap+1 cells, then the body follows.
      var dist = info.gap + 1 + bodyLength(a) + 0.6;
      var dur = reduceMotion ? 120 : Math.min(620, 140 + 60 * dist);
      slide(a, g, 0, dist, dur, easeIn, function () { g.remove(); });
      if (!remaining()) { over = true; setTimeout(win, dur + 150); }
      return;
    }

    // Blocked: nudge forward into the blocker, then settle back.
    a.locked = true;
    g.classList.add('is-bumping');
    hearts--;
    mistakes++;
    renderHearts();
    var bumpTo = info.gap + 0.4;
    var d1 = reduceMotion ? 60 : 150, d2 = reduceMotion ? 80 : 200;
    slide(a, g, 0, bumpTo, d1, easeOut, function () {
      slide(a, g, bumpTo, 0, d2, easeOut, function () { a.locked = false; g.classList.remove('is-bumping'); });
    });
    var bl = els[info.blocker];
    if (bl) { bl.classList.remove('is-hit'); void bl.getBBox(); bl.classList.add('is-hit'); }
    boardEl.classList.remove('is-shake'); void boardEl.offsetWidth; boardEl.classList.add('is-shake');
    if (hearts <= 0) { over = true; setTimeout(fail, 450); }
  }

  function hint() {
    if (over) return;
    var free = [];
    for (var id in live) if (pathInfo(board, occ, live[id]).blocker === -1) free.push(id);
    if (!free.length) return;
    var pick = free[Math.floor(Math.random() * free.length)];
    var g = els[pick];
    g.classList.remove('is-hint'); void g.getBBox(); g.classList.add('is-hint');
  }

  /* ---------- dialogs ---------- */
  function showDialog(title, text, buttons, stat, coral) {
    dlgTitle.textContent = title;
    dlgTitle.classList.toggle('is-coral', !!coral);
    dlgText.innerHTML = text;
    dlgStat.textContent = stat || '';
    dlgBtns.innerHTML = '';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'g-btn' + (b.primary ? ' g-btn--coral' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      dlgBtns.appendChild(btn);
    });
    overlay.hidden = false;
  }

  function hideDialog() { overlay.hidden = true; }

  function win() {
    var n = progress.level;
    progress.wins++;
    if (n >= progress.max) progress.max = n + 1;
    save();
    var flavor = mistakes === 0 ? 'Not a single heart lost.' : mistakes === 1 ? 'One bump on the way out.' : 'A few bumps, but you got there.';
    showDialog('Level ' + n + ' clear', flavor, [
      { label: 'next ▶', primary: true, onClick: function () { startLevel(n + 1); } },
      { label: 'replay', onClick: function () { startLevel(n); } }
    ], progress.wins + (progress.wins === 1 ? ' level' : ' levels') + ' cleared all time');
  }

  function fail() {
    var n = progress.level;
    showDialog('Out of hearts', 'No rush. The same puzzle is waiting whenever you are.', [
      { label: 'try again', primary: true, onClick: function () { startLevel(n); } },
      { label: 'hint next time', onClick: function () { startLevel(n); setTimeout(hint, 400); } }
    ], '', true);
  }

  function menu() {
    var n = progress.level, btns = [];
    btns.push({ label: 'restart', primary: true, onClick: function () { startLevel(n); } });
    if (n > 1) btns.push({ label: '◀ level ' + (n - 1), onClick: function () { startLevel(n - 1); } });
    if (n < progress.max) btns.push({ label: 'level ' + (n + 1) + ' ▶', onClick: function () { startLevel(n + 1); } });
    btns.push({ label: 'back to game', onClick: hideDialog });
    showDialog('Level ' + n,
      'Tap an arrow and it slides forward along its own path, tail and all. It only leaves if every cell ahead of its head is empty. A blocked arrow costs a <b>♥</b>. Clear them all to finish.',
      btns, 'highest unlocked: level ' + progress.max + ' · ' + progress.wins + ' cleared');
  }

  /* ---------- wiring ---------- */
  function arrowFromEvent(e) {
    var t = e.target;
    while (t && t !== boardEl) {
      if (t.classList && t.classList.contains('ar-arrow')) return t;
      t = t.parentNode;
    }
    return null;
  }

  // pointerdown rather than click: it fires the moment a finger lands and
  // avoids iOS deciding whether an SVG element counts as "clickable".
  boardEl.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var g = arrowFromEvent(e);
    if (g) { e.preventDefault(); tap(Number(g.dataset.id)); }
  });
  boardEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var g = arrowFromEvent(e);
    if (g) { e.preventDefault(); tap(Number(g.dataset.id)); }
  });
  hintBtn.addEventListener('click', hint);
  levelBtn.addEventListener('click', menu);
  overlay.addEventListener('click', function (e) { if (e.target === overlay && !over) hideDialog(); });
  window.addEventListener('resize', fitBoard);

  // iOS still zooms on a quick double tap even with touch-action: manipulation
  // (notably when installed to the home screen, or when the two taps land on
  // different elements, which happens all the time once an arrow slides away).
  // Cancelling the second touchend is the only thing WebKit reliably honours.
  // Taps are unaffected: the board acts on pointerdown, not click.
  var lastTouchEnd = 0;
  stageEl.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouchEnd < 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // Pinch zoom on iOS (non-standard event, harmless elsewhere).
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });

  startLevel(progress.level);
})();
