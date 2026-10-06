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

  // Forget everything this site keeps in the browser: settings, palettes, scores and the saved painting.
  // The Studio listens for the event and stops its autosave, so the painting cannot come back.
  function forget(reload) {
    try { window.dispatchEvent(new Event('studio:forget')); } catch (e) { /* nothing listening */ }
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf(PREFIX) === 0; }).forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* storage unavailable: nothing kept */ }
    var done = false;
    function finish() { if (done) return; done = true; if (reload) location.reload(); }
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
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('show'); }, offerReset ? 20000 : 6000);
  }

  // Modules report errors here. { saved: true } means the error came from reading saved state, which
  // is the one case where offering a reset makes sense.
  function report(err, info) {
    if (window.console && console.error) console.error(err);
    var saved = !!(info && info.saved);
    note(saved ? SAVED_FAILED : APP_FAILED, saved);
  }

  window.StudioGuard = { report: report, forget: forget };

  // Capture phase, so failed resource loads (which don't bubble) are seen here too. A script or the
  // stylesheet failing to load shows the standing note at the top of the page, not a passing toast.
  window.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el !== window && el.tagName) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'script' || (tag === 'link' && el.rel === 'stylesheet')) document.documentElement.classList.add('load-failed');
      return; // images have their own handling in the app
    }
    note(APP_FAILED);
  }, true);

  window.addEventListener('unhandledrejection', function () { note(APP_FAILED); });
})();
