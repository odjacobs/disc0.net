/* Potions — a relaxing liquid sorting puzzle for disc0.net/games
 *
 * Bottles hold up to CAP units of coloured potion. Tap a bottle to pick
 * it up, tap another to pour. A pour is allowed onto a matching colour
 * or into an empty bottle, and moves as much of the top colour as fits.
 * Sort every potion into its own bottle to finish the level.
 *
 * Levels come from a seeded RNG so level N is always the same puzzle,
 * and each candidate is checked by a small solver before it is used.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'd0-potions-v1';
  var CAP = 4;
  var EMPTIES = 2;
  var SOLVER_CAP = 60000;
  var PALETTE = ['coral', 'teal', 'gold', 'purple', 'mint', 'sky', 'pink', 'lime', 'orange', 'navy', 'brown', 'red'];

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

  /* ---------- rules ---------- */
  // A bottle is an array of colour indexes, bottom first.
  function topRun(b) {
    if (!b.length) return { color: -1, n: 0 };
    var c = b[b.length - 1], n = 1;
    while (n < b.length && b[b.length - 1 - n] === c) n++;
    return { color: c, n: n };
  }

  function isDone(b) {
    if (b.length !== CAP) return false;
    for (var i = 1; i < b.length; i++) if (b[i] !== b[0]) return false;
    return true;
  }

  // How many units would pour from s to d (0 = not allowed).
  function pourAmount(s, d) {
    if (!s.length || d.length >= CAP) return 0;
    var run = topRun(s);
    if (d.length && d[d.length - 1] !== run.color) return 0;
    if (!d.length && run.n === s.length) return 0; // monochrome into empty: pointless
    return Math.min(run.n, CAP - d.length);
  }

  function doPour(bottles, si, di, n) {
    var s = bottles[si], d = bottles[di];
    for (var k = 0; k < n; k++) d.push(s.pop());
  }

  function solved(bottles) {
    for (var i = 0; i < bottles.length; i++) if (bottles[i].length && !isDone(bottles[i])) return false;
    return true;
  }

  /* ---------- solver ---------- */
  function key(bottles) {
    return bottles.map(function (b) { return b.join(','); }).sort().join('|');
  }

  function clone(bottles) { return bottles.map(function (b) { return b.slice(); }); }

  // Depth-first search with a node budget. Returns move count or -1.
  function solve(start) {
    var seen = {}, nodes = 0, best = -1;
    function moves(bottles) {
      var out = [], emptySeen = false;
      for (var si = 0; si < bottles.length; si++) {
        var s = bottles[si];
        if (!s.length || isDone(s)) continue;
        var run = topRun(s);
        for (var di = 0; di < bottles.length; di++) {
          if (di === si) continue;
          var d = bottles[di];
          if (!d.length) { if (emptySeen) continue; }
          var n = pourAmount(s, d);
          if (!n) continue;
          if (!d.length) emptySeen = true;
          // score: finishing a bottle or clearing a whole run first, empties last
          var score = (d.length && d.length + n === CAP && run.n === n ? 3 : 0) + (run.n === n ? 2 : 0) + (d.length ? 1 : 0);
          out.push({ si: si, di: di, n: n, score: score });
        }
      }
      out.sort(function (a, b) { return b.score - a.score; });
      return out;
    }
    function dfs(bottles, depth) {
      if (solved(bottles)) { best = depth; return true; }
      if (++nodes > SOLVER_CAP) return false;
      var k = key(bottles);
      if (seen[k]) return false;
      seen[k] = true;
      var ms = moves(bottles);
      for (var i = 0; i < ms.length; i++) {
        var next = clone(bottles);
        doPour(next, ms[i].si, ms[i].di, ms[i].n);
        if (dfs(next, depth + 1)) return true;
        if (nodes > SOLVER_CAP) return false;
      }
      return false;
    }
    dfs(clone(start), 0);
    return { moves: best, nodes: nodes };
  }

  /* ---------- generation ---------- */
  function levelParams(n) {
    return { colors: Math.min(PALETTE.length, 3 + Math.floor((n - 1) / 3)) };
  }

  function randomBoard(colors, rng) {
    var units = [];
    for (var c = 0; c < colors; c++) for (var k = 0; k < CAP; k++) units.push(c);
    shuffle(units, rng);
    var bottles = [];
    for (c = 0; c < colors; c++) bottles.push(units.slice(c * CAP, c * CAP + CAP));
    // no bottle may start already sorted, and no bottle may be a single colour stack
    for (c = 0; c < colors; c++) if (isDone(bottles[c])) return null;
    for (k = 0; k < EMPTIES; k++) bottles.push([]);
    return bottles;
  }

  function generate(n) {
    var p = levelParams(n), rng = mulberry32(n * 104729 + 7);
    for (var c = 0; c < 40; c++) {
      var b = randomBoard(p.colors, rng);
      if (!b) continue;
      var s = solve(b);
      if (s.moves >= 0) return { bottles: b, colors: p.colors, par: s.moves };
    }
    // Should not happen; fall back to a trivially sorted-adjacent board.
    var fb = [];
    for (c = 0; c < p.colors; c++) fb.push([c, c, c, (c + 1) % p.colors]);
    for (c = 0; c < p.colors; c++) fb[c][3] = fb[(c + 1) % p.colors][0];
    fb.push([]); fb.push([]);
    return { bottles: fb, colors: p.colors, par: 0 };
  }

  // Expose pure pieces for tests before touching the DOM.
  if (typeof window !== 'undefined' && window.__potionsTest) {
    window.__potionsTest({ generate: generate, solve: solve, pourAmount: pourAmount, solved: solved, levelParams: levelParams });
    return;
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
  var rackEl = $('po-rack'), levelBtn = $('po-level-btn'), undoBtn = $('po-undo-btn'), movesEl = $('po-moves');
  var overlay = $('g-overlay'), dlgTitle = $('g-dialog-title'), dlgText = $('g-dialog-text');
  var dlgBtns = $('g-dialog-btns'), dlgStat = $('g-dialog-stat');

  var progress = load();
  var level, bottles, els, selected, history, over, par;

  function renderMoves() {
    movesEl.textContent = history.length + (history.length === 1 ? ' move' : ' moves');
    undoBtn.disabled = !history.length;
  }

  function bottleEl(i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'po-bottle';
    b.dataset.index = i;
    b.setAttribute('aria-label', 'bottle ' + (i + 1));
    // the button is the fixed tap target; .po-body is what lifts, tilts and flies
    b.innerHTML = '<span class="po-body"><span class="po-neck"></span><span class="po-glass"><span class="po-liquid"></span><span class="po-shine"></span></span></span>';
    return b;
  }

  // Runs of colour from the bottom, so layers can animate height changes.
  function runsOf(b) {
    var runs = [];
    for (var i = 0; i < b.length; i++) {
      if (runs.length && runs[runs.length - 1].color === b[i]) runs[runs.length - 1].n++;
      else runs.push({ color: b[i], n: 1 });
    }
    return runs;
  }

  function removeLater(node) {
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 340);
  }

  function growLater(node, h) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { node.style.height = h; }); });
  }

  function paintBottle(i, animate) {
    var el = els[i], liquid = el.querySelector('.po-liquid'), runs = runsOf(bottles[i]);
    var anim = animate && !reduceMotion;
    // Snapshot the living layers; ones already fading out are ignored.
    var live = Array.prototype.filter.call(liquid.children, function (l) { return !l.dataset.dying; });
    // Surplus layers on top fade away.
    for (var x = live.length - 1; x >= runs.length; x--) {
      var extra = live[x];
      if (anim) { extra.dataset.dying = '1'; extra.style.height = '0%'; removeLater(extra); }
      else liquid.removeChild(extra);
    }
    for (var r = 0; r < runs.length; r++) {
      var layer = live[r], h = (runs[r].n / CAP * 100) + '%';
      if (!layer) {
        layer = document.createElement('span');
        layer.className = 'po-layer po-' + PALETTE[runs[r].color];
        layer.style.height = anim ? '0%' : h;
        // keep bottom-to-top order: new layers go below any that are fading out
        liquid.insertBefore(layer, liquid.querySelector('[data-dying]'));
        if (anim) growLater(layer, h);
      } else {
        layer.className = 'po-layer po-' + PALETTE[runs[r].color];
        layer.style.height = h;
      }
    }
    el.classList.toggle('is-done', isDone(bottles[i]));
  }

  function layoutRack() {
    var n = bottles.length;
    var perRow = n <= 7 ? n : Math.ceil(n / 2);
    rackEl.style.setProperty('--per-row', perRow);
    rackEl.classList.toggle('is-two-rows', n > 7);
  }

  function startLevel(n) {
    level = n;
    progress.level = n;
    save();
    var gen = generate(n);
    bottles = gen.bottles;
    par = gen.par;
    els = [];
    selected = -1;
    history = [];
    over = false;
    levelBtn.textContent = 'Level ' + n;
    rackEl.innerHTML = '';
    layoutRack();
    for (var i = 0; i < bottles.length; i++) {
      var el = bottleEl(i);
      els.push(el);
      rackEl.appendChild(el);
      paintBottle(i, false);
    }
    renderMoves();
    hideDialog();
  }

  function select(i) {
    if (selected >= 0) els[selected].classList.remove('is-selected');
    selected = i;
    if (i >= 0) els[i].classList.add('is-selected');
  }

  // Lift the source over the destination, tilt, and settle back.
  function animatePour(si, di) {
    if (reduceMotion) return;
    var s = els[si], d = els[di];
    var sr = s.getBoundingClientRect(), dr = d.getBoundingClientRect();
    var right = dr.left > sr.left;
    var dx = (dr.left + dr.width / 2) - (sr.left + sr.width / 2) + (right ? -dr.width * 0.55 : dr.width * 0.55);
    var dy = (dr.top - sr.top) - sr.height * 0.55;
    var rot = right ? 38 : -38;
    s.style.zIndex = 5;
    s.querySelector('.po-body').animate([
      { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)', offset: 0.35 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)', offset: 0.7 },
      { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration: 620, easing: 'ease-in-out' }).onfinish = function () { s.style.zIndex = ''; };
  }

  function pour(si, di) {
    var n = pourAmount(bottles[si], bottles[di]);
    if (!n) return false;
    doPour(bottles, si, di, n);
    history.push({ si: si, di: di, n: n });
    animatePour(si, di);
    var delay = reduceMotion ? 0 : 200;
    setTimeout(function () { paintBottle(si, true); paintBottle(di, true); }, delay);
    renderMoves();
    if (solved(bottles)) { over = true; setTimeout(win, reduceMotion ? 200 : 900); }
    return true;
  }

  function tap(i) {
    if (over) return;
    if (selected < 0) {
      if (bottles[i].length && !isDone(bottles[i])) select(i);
      else nudge(i);
      return;
    }
    if (selected === i) { select(-1); return; }
    var from = selected;
    select(-1);
    if (!pour(from, i)) {
      nudge(i);
      if (bottles[i].length && !isDone(bottles[i])) select(i);
    }
  }

  function nudge(i) {
    var el = els[i];
    el.classList.remove('is-nudge'); void el.offsetWidth; el.classList.add('is-nudge');
  }

  function undo() {
    if (over || !history.length) return;
    select(-1);
    var m = history.pop();
    // move n units back from di to si (always legal: they came from there)
    for (var k = 0; k < m.n; k++) bottles[m.si].push(bottles[m.di].pop());
    paintBottle(m.si, true);
    paintBottle(m.di, true);
    renderMoves();
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
    var n = level;
    progress.wins++;
    if (n >= progress.max) progress.max = n + 1;
    save();
    var m = history.length;
    var flavor = par && m <= par ? 'Sorted in ' + m + ' moves. That is as tidy as it gets.' : 'Every potion in its place after ' + m + ' moves.';
    showDialog('Level ' + n + ' sorted', flavor, [
      { label: 'next ▶', primary: true, onClick: function () { startLevel(n + 1); } },
      { label: 'replay', onClick: function () { startLevel(n); } }
    ], progress.wins + (progress.wins === 1 ? ' level' : ' levels') + ' sorted all time');
  }

  function menu() {
    var n = level, btns = [];
    btns.push({ label: 'restart', primary: true, onClick: function () { startLevel(n); } });
    if (n > 1) btns.push({ label: '◀ level ' + (n - 1), onClick: function () { startLevel(n - 1); } });
    if (n < progress.max) btns.push({ label: 'level ' + (n + 1) + ' ▶', onClick: function () { startLevel(n + 1); } });
    btns.push({ label: 'back to game', onClick: hideDialog });
    showDialog('Level ' + n,
      'Tap a bottle to pick it up, then tap another to pour. Potion only pours onto the <b>same colour</b> or into an empty bottle. Get every colour into its own bottle. Undo is free, take your time.',
      btns, 'highest unlocked: level ' + progress.max + ' · ' + progress.wins + ' sorted');
  }

  /* ---------- wiring ---------- */
  rackEl.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var b = e.target.closest('.po-bottle');
    if (b) { e.preventDefault(); tap(Number(b.dataset.index)); }
  });
  rackEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var b = e.target.closest('.po-bottle');
    if (b) { e.preventDefault(); tap(Number(b.dataset.index)); }
  });
  undoBtn.addEventListener('click', undo);
  levelBtn.addEventListener('click', menu);
  overlay.addEventListener('click', function (e) { if (e.target === overlay && !over) hideDialog(); });

  startLevel(progress.level);
})();
