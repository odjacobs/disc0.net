/* Shared bits for the /games PWA: theme toggle, service worker, install hint. */
(function () {
  'use strict';

  // Theme toggle (same key as the rest of the site).
  var btn = document.getElementById('d0-theme-toggle');
  if (btn) {
    var applyIcon = function () {
      var theme = document.documentElement.getAttribute('data-theme');
      btn.textContent = theme === 'dark' ? '☀' : '☾';
    };
    applyIcon();
    btn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('disc0-theme', next); } catch (e) {}
      applyIcon();
    });
  }

  // Service worker for offline play.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/games/sw.js').catch(function () {});
    });
  }

  // Install hint on the launcher.
  var box = document.getElementById('g-install');
  if (!box) return;
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (standalone) return;

  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    document.getElementById('g-install-ios').hidden = false;
    box.hidden = false;
    return;
  }

  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    document.getElementById('g-install-other').hidden = false;
    var installBtn = document.getElementById('g-install-btn');
    installBtn.hidden = false;
    box.hidden = false;
    installBtn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; box.hidden = true; });
    });
  });
})();
