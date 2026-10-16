/* Portrait Value Studio - safety net. Loaded before everything else and depending on nothing, so
   that when a script fails to load or throws, the visitor sees a short note in the page instead of
   a control that silently stops working. The note reuses the app's toast element. */
(function () {
  'use strict';

  // The page starts with class="no-js" on <html>, which shows the guide instead of dead controls.
  // Scripts are running, so take it off before anything is drawn.
  document.documentElement.classList.remove('no-js');

  // The app needs <dialog>, ResizeObserver, Promise.prototype.finally and object spread. A browser
  // without them (roughly before 2022) gets a standing note instead of controls that die one by one.
  var modern = 'HTMLDialogElement' in window && 'ResizeObserver' in window && typeof Promise !== 'undefined' && !!Promise.prototype.finally && typeof Object.assign === 'function';
  if (!modern) document.documentElement.classList.add('old-browser');

  var shown = 0;
  var timer = 0;
  var APP_FAILED = 'Something went wrong in the app. If a control stops responding, reload the page.';
  var SAVED_FAILED = 'Your saved settings or painting could not be read.';
  var PREFIX = 'portrait-value-studio.';
  var DB_NAME = 'portrait-value-studio';

  // Every key this site keeps in localStorage, removed. The marker is one of them.
  function sweep() {
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf(PREFIX) === 0 || k.indexOf('pose-and-light.') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* storage unavailable: nothing kept */ }
  }

  // Forget everything this site keeps in the browser: settings, palettes, scores and the saved painting.
  // The Studio listens for the event and stops its autosave, so the painting cannot come back.
  function forget(reload) {
    try { window.dispatchEvent(new Event('studio:forget')); } catch (e) { /* nothing listening */ }
    // the site's other open tabs hear a marker (a storage event) and start over too, so a painting one of
    // them is still saving cannot come back; the marker itself is gone at once. A full storage refuses the
    // marker: the keys still go, and the marker is written once the sweep has made room.
    var told = false;
    try { localStorage.setItem(PREFIX + 'forget', String(Date.now())); told = true; } catch (e) { /* full, or unavailable */ }
    sweep();
    try {
      if (!told) { localStorage.setItem(PREFIX + 'forget', String(Date.now())); localStorage.removeItem(PREFIX + 'forget'); }
    } catch (e) { /* storage unavailable: nothing kept */ }
    var done = false;
    // swept once more just before the reload: a module that does not watch studio:forget may have written
    // between the first sweep and now, and what it wrote must not be what the page opens with
    function finish() { if (done) return; done = true; if (reload) { sweep(); location.reload(); } }
    try {
      var req = window.indexedDB && indexedDB.deleteDatabase(DB_NAME);
      if (req) { req.onsuccess = finish; req.onerror = finish; req.onblocked = finish; }
    } catch (e) { /* nothing kept */ }
    setTimeout(finish, 1500); // whatever the database does, the page moves on
  }

  function note(msg, offerReset) {
    if (shown >= 3) return; // a few notes a visit at most, never a stream
    var toast = document.getElementById('toast');
    if (!toast) return;
    shown += 1;
    toast.textContent = msg;
    if (offerReset) {
      // two taps, and the label says what goes: the saved painting too
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = 'Reset settings and saved painting';
      var armed = false;
      btn.addEventListener('click', function () {
        if (!armed) { armed = true; btn.textContent = 'Tap again to reset'; clearTimeout(timer); return; }
        btn.disabled = true;
        forget(true);
      });
      toast.append(' ', btn);
    }
    show(toast, offerReset ? 20000 : 6000);
  }

  // The app's notes and the guard's share the one toast, so they share one hide timer: a note never goes
  // early on a timer that a note before it set. Hidden, the toast drops its reset button, so nothing
  // invisible can be pressed (or reached by Tab) where the note was.
  function show(toast, ms) {
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () {
      toast.classList.remove('show');
      var btn = toast.querySelector('.toast-action');
      if (btn) btn.remove();
    }, ms);
  }
  function toastNote(msg, ms) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    show(toast, ms);
  }

  // Modules report errors here. { saved: true } means the error came from reading saved state, which
  // is the one case where offering a reset makes sense.
  function report(err, info) {
    if (window.console && console.error) console.error(err);
    var saved = !!(info && info.saved);
    note(saved ? SAVED_FAILED : APP_FAILED, saved);
  }

  // A module whose dependencies never loaded (a script that failed or threw) calls this: the standing
  // "has not started" note shows, and the module stays out instead of dying halfway with errors.
  function failed(what, tab) {
    if (window.console && console.error) console.error(what);
    var root = document.documentElement;
    // the class hides the module's controls (all of them, or its tab); the "part did not start" note it
    // also shows stays hidden while the standing load note is up (styles.css), so one note says it
    root.classList.add(tab === 'all' ? 'all-failed' : 'part-failed');
    syncNotes();
    if (tab && tab !== 'all') {
      var item = document.querySelector('[data-tab="' + tab + '"]');
      var panel = document.getElementById('tab-' + tab);
      // the Study tab's "Use my Studio painting" needs the Studio: it goes with it, as do the guide's buttons
      // that open the tab ("Go to Studio")
      if (tab === 'paint') { var fromStudio = document.getElementById('artFromStudio'); if (fromStudio) fromStudio.hidden = true; }
      var goes = document.querySelectorAll('[data-go="' + tab + '"]');
      for (var g = 0; g < goes.length; g++) goes[g].hidden = true;
      // palette.js plans the paints (it has no tab of its own): without it the paints part and the block
      // study's Palette switch leave, the blocks keep the photo's colors, and the drawer's header still says
      // what it is set to
      if (tab === 'palette') {
        var paints = document.getElementById('paints'); if (paints) paints.hidden = true;
        var bv = document.querySelector('.block-view'); if (bv) bv.hidden = true;
        var sayColors = function () { var st = document.getElementById('colorsState'), cs = document.getElementById('colors'); if (st && cs) st.textContent = cs.value + ' per value'; };
        sayColors();
        var cs = document.getElementById('colors'); if (cs) cs.addEventListener('input', sayColors);
      }
      if (item) {
        item.hidden = true;
        // the group's button names one of its items: not this one any more; a group with none left goes too
        var group = item.closest ? item.closest('.tab-group') : null;
        if (group) {
          var left = group.querySelectorAll('.tab-item:not([hidden])');
          var sub = group.querySelector('.tab-sub');
          var name = item.querySelector('span');
          if (!left.length) group.hidden = true;
          else if (sub && name && sub.textContent === name.textContent && left[0].querySelector('span')) sub.textContent = left[0].querySelector('span').textContent;
        }
      }
      if (panel) {
        var showing = !panel.hidden;
        panel.hidden = true;
        // the page may have opened on this very tab (index.html#game) before its script was found missing
        if (showing && window.Studio && Studio.go) { try { Studio.go('study'); } catch (e) { /* the Study tab is already there */ } }
      }
    }
  }

  // The three standing notes show by the classes on <html> (styles.css). Without the stylesheet they would
  // all show at once, so each also carries the hidden attribute, kept in step with the classes here.
  function syncNotes() {
    var c = document.documentElement.classList;
    var down = c.contains('no-js') || c.contains('load-failed') || c.contains('all-failed');
    var set = function (cls, on) { var n = document.querySelector('.' + cls); if (n) n.hidden = !on; };
    set('nojs-note', down);
    set('oldbrowser-note', c.contains('old-browser'));
    set('partfail-note', c.contains('part-failed') && !down);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncNotes); else syncNotes();

  window.StudioGuard = { report: report, forget: forget, failed: failed, toast: toastNote };

  // Forget my work on this device, pressed in another tab of this site: this tab stops saving and starts
  // over as well (the Studio hears studio:forget and drops its pending autosave)
  window.addEventListener('storage', function (e) {
    if (e.key !== PREFIX + 'forget' || !e.newValue) return;
    try { window.dispatchEvent(new Event('studio:forget')); } catch (err) { /* nothing listening */ }
    setTimeout(function () { sweep(); location.reload(); }, 300); // swept again first, as forget() does
  });

  // Until the page has loaded, the scripts are still starting: an error from one of them then means
  // that module did not start, and its tab is taken off the menu (a module cannot do that for itself).
  var booting = true;
  window.addEventListener('load', function () { booting = false; });
  var TAB_OF = { app: 'all', painting: 'paint', game: 'game', battle: 'battle', loomis: 'loomis', figure: 'figure', subjects: 'game', palette: 'palette' };

  // Capture phase, so failed resource loads (which don't bubble) are seen here too. A script or the
  // stylesheet failing to load shows the standing note at the top of the page, not a passing toast,
  // and the module that script was takes its controls off the page (app.js: everything but the guide).
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el !== window && el.tagName) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'script') {
        var src = /\/js\/([a-z-]+)\.js$/.exec(el.src || '');
        // one module's script: its part leaves the page with the "part did not start" note; app.js or one of
        // the scripts before it: the app has not started, and the standing note says so over the guide
        if (src && TAB_OF.hasOwnProperty(src[1]) && TAB_OF[src[1]] !== 'all') { failed(src[1] + '.js did not load', TAB_OF[src[1]]); return; }
        document.documentElement.classList.add('load-failed');
        syncNotes();
        if (src && TAB_OF[src[1]] === 'all') failed('app.js did not load', 'all');
      } else if (tag === 'link' && el.rel === 'stylesheet' && /styles\.css$/.test(el.href || '')) {
        document.documentElement.classList.add('load-failed'); // (fonts.css failing only costs the typefaces)
        syncNotes();
      }
      return; // images have their own handling in the app
    }
    if (booting && e.filename) {
      var m = /\/js\/([a-z-]+)\.js$/.exec(e.filename);
      if (m && TAB_OF.hasOwnProperty(m[1])) { failed(m[1] + '.js did not start: ' + e.message, TAB_OF[m[1]]); return; }
    }
    note(APP_FAILED);
  }, true);

  window.addEventListener('unhandledrejection', function () { note(APP_FAILED); });
})();
