/*
 * Trace onto paper: the photo to trace laid over a live picture from the camera. The phone is fixed above the paper,
 * camera down; the photo floats over the camera's picture, as see-through as the Transparency slider says, and is moved,
 * sized (and turned) until it sits on the paper where the drawing should go, then locked, so a touch while drawing cannot
 * move it. Set frame keeps the camera's view of the paper at that moment, in memory only: Show frame lays it faintly over
 * the live picture, so a phone knocked out of place is moved back until the paper's edges line up with it again.
 *
 * The camera starts only when asked (the browser asks for permission on that tap). It stops when the tab is left or the
 * page is hidden, for privacy and the battery, and comes back by itself on return when the browser says the permission
 * is granted (else the card asks for a tap). While it runs the screen is kept awake where the browser allows it. Nothing
 * of the camera's picture is stored or sent: it goes to the screen, and to the frame kept in memory until the page closes.
 *
 * The photo's place is kept in fractions of the camera's picture (its centre, and its width as a share of the picture's
 * width), so a resized window or a phone turned on its side keeps it where it was over the picture.
 */
(function () {
  'use strict';

  // the modules this one needs (the photo checks and the tabs); without app.js this tab stays out and the page says so
  if (!window.Study || !window.Studio) {
    if (window.StudioGuard) StudioGuard.failed('trace.js: app.js did not finish loading', 'trace');
    return;
  }
  const $ = (id) => document.getElementById('tr-' + id);
  const root = $('root');
  if (!root) return;
  const stage = $('stage'), wrap = $('wrap'), video = $('video'), ghost = $('ghost'), photoCv = $('photo'), hit = $('hit');
  const card = $('card'), say = $('say'), startBtn = $('start'), status = $('status'), strip = $('strip');
  const camBtn = $('camera'), chooseBtn = $('choose'), studyBtn = $('useStudy'), fitBtn = $('fit'), lockBtn = $('lock');
  const setFrameBtn = $('setFrame'), showFrameBtn = $('showFrame'), switchBtn = $('switch'), turnBtn = $('turn');
  const transparency = $('transparency'), sizeIn = $('size'), strength = $('strength'), fileIn = $('file'), panEl = $('pan'), panX = $('panX'), panY = $('panY'), toolsBtn = $('tools'), hideBtn = $('toolsHide'), zoomInBtn = $('zoomIn'), zoomOutBtn = $('zoomOut'), zoomResetBtn = $('zoomReset');

  // ---- Kept between visits: conveniences only (how see-through the photo is, how strong the frame shows) ----------------
  const KEY = 'portrait-value-studio.trace';
  const DEFAULTS = { transparency: 50, frame: 40 };
  const RANGES = { transparency: [0, 100], frame: [10, 80] };
  const settings = { ...DEFAULTS };
  (function loadSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { saved = null; /* unreadable or no storage: the defaults */ }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
    // field by field: an own number inside its range, or the default (a saved 'constructor' is not a setting)
    Object.keys(DEFAULTS).forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(saved, k)) return;
      const v = saved[k], [lo, hi] = RANGES[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi) settings[k] = Math.round(v);
    });
  })();
  // written only when a slider is moved, so a visit that changes nothing stores nothing
  function saveSettings() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* kept for this visit only */ } }
  const simple = () => document.body.classList.contains('mode-simple');
  // Simple shows no Frame strength slider and uses the default; the value set in Advanced comes back with Advanced
  const frameStrength = () => (simple() ? DEFAULTS.frame : settings.frame);

  // zoom: the whole view (camera, frame and photo together) magnified; x, y are the point of the camera's picture, as fractions of it,
  // that sits in the middle of the stage, so the photo keeps its place on the paper whatever the zoom
  const state = {
    tools: false, // the pop-up of controls (the picture has the whole screen until it is asked for)
    zoom: { z: 1, x: 0.5, y: 0.5 },
    active: false,      // the tab is open
    stream: null,       // the camera's MediaStream while it runs
    starting: false,    // asked for, not answered yet (the browser may be asking the visitor)
    wanted: false,      // the visitor started the camera and has not stopped it: it comes back when the tab or page does
    job: 0,             // each start and stop; a start answered after a later one is let go
    deviceId: '',       // the camera Switch camera chose (none: the one facing away from the screen, where there is one)
    cameras: [],        // the cameras the browser lists (with ids, which it gives once the camera is allowed)
    aspect: 0,          // the camera picture's width over its height, kept while the camera is off so the view stays put
    note: null,         // what the card says instead of its introduction: { text, retry }
    photo: null,        // the picture on #tr-photo: { w, h, name }
    place: { cx: 0.5, cy: 0.5, w: 1, turn: 0, fitted: true },
    locked: false,
    frame: false,       // a frame has been set: the still is on #tr-ghost
    frameShown: false,
  };

  // ---- What the camera cannot do here, in words ---------------------------------------------------------------------
  const INTRO = say.textContent;
  const framed = () => { try { return window.self !== window.top; } catch (e) { return true; } };
  const FRAMED = 'This page sits inside another site, which does not let it use the camera. Open Portrait Value Studio in a tab of its own to trace with the camera.';
  const POLICY = 'This site is set up to refuse the camera (its Permissions-Policy header turns it off), so the camera cannot start here. Whoever runs the site can allow it.';
  // a reason the camera can never start on this page, so the card says it straight away and offers no button
  function blocked() {
    if (!window.isSecureContext) return 'The camera needs this site opened over https. Open it at its https:// address: a page opened over plain http cannot use a camera.';
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') return 'This browser gives the page no camera. Trace onto paper needs a current Safari, Chrome, Edge or Firefox, with the site opened over https.';
    // the page's Permissions-Policy (or a frame without allow="camera") forbids it: asking would only be refused
    let allowed = true;
    try { const p = document.permissionsPolicy || document.featurePolicy; if (p && typeof p.allowsFeature === 'function') allowed = p.allowsFeature('camera'); } catch (e) { allowed = true; }
    if (!allowed) return framed() ? FRAMED : POLICY;
    return '';
  }
  // the visitor or the site said no to the camera (as against a camera that is gone, busy or broken)
  const refused = (err) => ['NotAllowedError', 'SecurityError', 'PermissionDeniedError'].includes(err && err.name);
  function cameraError(err) {
    const name = (err && err.name) || 'Error';
    if (refused(err)) {
      return framed()
        ? 'The camera was refused: the browser was told no, or the site this page sits inside does not let it use the camera. Allow the camera for this site in the browser\'s settings, or open Portrait Value Studio in a tab of its own, then press Start camera.'
        : 'The camera was refused. Allow the camera for this site in the browser\'s settings (the icon beside the address, or the site settings), then press Start camera.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'No camera was found. Connect one, or open this page on a phone or tablet, then press Start camera.';
    if (name === 'NotReadableError' || name === 'TrackStartError') return 'The camera is in use by another app. Close the other app (a video call, the camera app), then press Start camera.';
    return `The camera did not start (${name}). Reload the page, then press Start camera again.`;
  }
  const ENDED = 'The camera stopped: another app may have taken it, or it was unplugged. Press Start camera to go on.';
  const PAUSED = 'The camera stopped when you left, to keep its picture private and save the battery. Press Start camera to go on.';
  const OTHER = 'The frame showed the other camera\'s view, so it is gone: set it again from this camera.';

  // ---- The camera ----------------------------------------------------------------------------------------------------
  const stopTracks = (s) => { if (s) s.getTracks().forEach((tr) => { try { tr.stop(); } catch (e) { /* already stopped */ } }); };
  function constraints() {
    const which = state.deviceId ? { deviceId: { exact: state.deviceId } } : { facingMode: { ideal: 'environment' } };
    return { audio: false, video: { ...which, width: { ideal: 1920 }, height: { ideal: 1080 } } };
  }
  // the control that has the focus goes off while the browser is asked (Start camera) or the camera changes over (Switch), or
  // goes with the card, and the focus falls to the page: when the answer is in it goes to `to`, unless the visitor moved it
  const holding = (b) => (document.activeElement === b ? b : null);
  function giveFocus(from, to) {
    const a = document.activeElement;
    if (from && (!a || a === document.body || a === from) && !to.disabled && !to.closest('[hidden]')) to.focus({ preventScroll: true });
  }
  // from: the button that asked, if it held the focus
  async function start(from) {
    if (state.stream || state.starting) return;
    if (blocked()) { state.wanted = false; render(); return; }
    const job = ++state.job;
    state.starting = true; state.wanted = true; state.note = null;
    render();
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints());
    } catch (err) {
      if (job !== state.job) return;
      // a camera Switch camera chose that will not open (unplugged, or in use: a phone lists lenses that never open): the
      // default one is tried once instead, and the frame, taken from the other camera, goes
      if (state.deviceId && !refused(err)) {
        state.deviceId = ''; state.starting = false;
        dropFrame(OTHER);
        start(from);
        return;
      }
      state.starting = false; state.wanted = false;
      state.note = { text: cameraError(err), retry: true };
      render();
      giveFocus(from, startBtn);
      return;
    }
    // stopped, left or hidden while the browser was asking: the camera goes straight off again
    if (job !== state.job) { stopTracks(stream); return; }
    state.starting = false;
    state.stream = stream;
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', () => { if (state.stream === stream) { stop(); state.note = { text: ENDED, retry: true }; render(); } });
    video.srcObject = stream;
    const playing = video.play();
    if (playing && playing.catch) playing.catch(() => { /* muted and playsinline: it plays; a refusal shows as no picture */ });
    wakeOn();
    listCameras();
    render();
    giveFocus(from, strip.hidden ? toolsBtn : from === startBtn ? camBtn : from);
  }
  // keepWanted: the tab or the page went away, and the camera comes back with it
  function stop(keepWanted) {
    state.job++;
    state.starting = false;
    stopTracks(state.stream);
    state.stream = null;
    video.pause();
    video.srcObject = null;
    if (!keepWanted) state.wanted = false;
    wakeOff();
    render();
  }
  // back on the tab, or the page shown again: the camera comes back without a tap where the browser has the permission
  // granted; elsewhere (asked each time, or no way to tell) the card asks for Start camera
  async function resume() {
    if (!state.wanted || state.stream || state.starting || !state.active || document.hidden) return;
    let perm = 'unknown';
    try { if (navigator.permissions && navigator.permissions.query) perm = (await navigator.permissions.query({ name: 'camera' })).state; } catch (e) { perm = 'unknown'; }
    if (!state.wanted || state.stream || state.starting || !state.active || document.hidden) return;
    if (perm === 'granted') { start(); return; }
    state.wanted = false;
    state.note = { text: PAUSED, retry: true };
    render();
  }
  async function listCameras() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') return;
    try { state.cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId); } catch (e) { state.cameras = []; }
    render();
  }
  if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') navigator.mediaDevices.addEventListener('devicechange', listCameras);
  function switchCamera() {
    if (state.cameras.length < 2 || !state.stream) return;
    const track = state.stream.getVideoTracks()[0];
    const now = (track && track.getSettings && track.getSettings().deviceId) || state.deviceId;
    const i = state.cameras.findIndex((c) => c.deviceId === now);
    state.deviceId = state.cameras[(i + 1) % state.cameras.length].deviceId;
    dropFrame(OTHER);
    const from = holding(switchBtn);
    stop(true); // a phone opens one camera at a time: the one on goes off first
    state.wanted = true;
    start(from);
  }

  // the screen stays on while the camera runs (a phone dims and locks in the middle of a drawing otherwise); a browser
  // without a wake lock, or one that refuses it, leaves the screen to its own settings
  let wake = null, waking = false;
  async function wakeOn() {
    if (wake || waking || !state.stream || document.hidden || !navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') return;
    waking = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!state.stream || document.hidden) lock.release().catch(() => { /* gone */ });
      else { wake = lock; lock.addEventListener('release', () => { if (wake === lock) wake = null; }); }
    } catch (e) { /* refused (a battery saver, a frame, a hidden page): the screen may dim */ }
    waking = false;
  }
  function wakeOff() { const lock = wake; wake = null; if (lock) lock.release().catch(() => { /* already released */ }); }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (state.stream || state.starting) stop(true); return; }
    resume();
  });
  window.addEventListener('pagehide', () => { if (state.stream || state.starting) stop(true); });

  // ---- The frame: the camera's view of the paper, kept to line it up again ------------------------------------------
  // a frame only lines up with the camera it was taken from, at the shape it was taken at: another camera, or the same one
  // giving a picture of another shape, would leave it drawn over a view it cannot match, so it is let go and asked for again
  function dropFrame(why) {
    if (!state.frame) return;
    state.frame = false;
    state.frameShown = false;
    ghost.width = ghost.height = 1;
    render();
    Studio.toast(why, 5000);
  }
  // (a video whose size is known (loadedmetadata) may not have a picture yet: drawn then, it would keep a blank still)
  const hasPicture = () => video.videoWidth > 0 && video.readyState >= 2;
  function setFrame() {
    if (!state.stream || !hasPicture()) return;
    const k = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    ghost.width = Math.max(1, Math.round(video.videoWidth * k));
    ghost.height = Math.max(1, Math.round(video.videoHeight * k));
    const g = ghost.getContext('2d');
    if (!g) { Studio.toast('The frame could not be kept: this device is short of memory. Close other tabs and try again.', 5000); return; }
    g.drawImage(video, 0, 0, ghost.width, ghost.height);
    const again = state.frame;
    state.frame = true;
    render();
    Studio.toast(again ? 'Frame set again from what the camera sees now.' : 'Frame set. If the phone moves, Show frame lays it over the camera.', 5000);
  }

  // ---- The photo to trace -------------------------------------------------------------------------------------------
  const MAX_SIDE = 2048; // more than a phone's screen shows, and a quarter of the memory of a 4096 px photo
  // puts a picture (already checked by the app's photo checks) over the camera, fitted and centred; false if it cannot be
  // drawn, and the photo before stays
  // a canvas that drew nothing: every pixel of a 16 px copy is see-through (some browsers hand back a blank canvas for an image
  // element they have let go of, or draw a picture that is fully transparent)
  function blank(cv) {
    const t = document.createElement('canvas');
    t.width = t.height = 16;
    const g = t.getContext('2d');
    if (!g) return false;
    try {
      g.drawImage(cv, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return false;
      return true;
    } catch (e) { return false; }
  }
  // soft: a picture that drew nothing is only reported (false), not said, so the caller can try another way to read the file
  function usePicture(src, name, soft) {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    if (!w || !h) return false;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(w * k)); next.height = Math.max(1, Math.round(h * k));
    const g = next.getContext('2d');
    try {
      if (!g) throw new Error('no canvas');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, next.width, next.height);
    } catch (e) {
      Studio.toast('That picture could not be drawn here. Save it as a PNG or JPG first.', 5000);
      return false;
    }
    if (blank(next)) {
      if (!soft) Studio.toast(`That picture came out blank here (${w} × ${h} px). If it is not fully see-through, save it as a JPG and try again.`, 6000);
      return false;
    }
    photoCv.width = next.width; photoCv.height = next.height;
    photoCv.getContext('2d').drawImage(next, 0, 0);
    state.photo = { w: next.width, h: next.height, name };
    // a new photo starts fitted, the right way up and free to move
    state.place = { cx: 0.5, cy: 0.5, w: 1, turn: 0, fitted: true };
    state.locked = false;
    render();
    return true;
  }
  chooseBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => {
    const file = fileIn.files && fileIn.files[0];
    fileIn.value = '';
    // the app's own checks (not a picture, empty, too small, an SVG that cannot be read back, a huge photo reduced): a
    // refused file is said in the toast and the photo over the camera stays as it was
    Studio.readImage(file, (img, note) => {
      const name = file.name || 'photo';
      const said = () => Studio.toast([`${file.name || 'The photo'} is over the camera.`, note].filter(Boolean).join(' '), note ? 6000 : 2500);
      if (usePicture(img, name, true)) { said(); return; }
      // the image element drew nothing (iOS Safari does this for some PNGs, screenshots among them): the file is decoded directly
      if (!window.createImageBitmap) { usePicture(img, name); return; }
      createImageBitmap(file).then((bmp) => {
        const ok = usePicture(bmp, name);
        if (bmp.close) bmp.close();
        if (ok) said();
      }, () => usePicture(img, name));
    }, 'trace');
  });
  function useStudy() {
    const src = Studio.source();
    if (!src) return;
    const name = Studio.isSample() ? 'The sample portrait' : Studio.sourceTitle() || Studio.sourceBase() || 'The Study photo';
    if (usePicture(src, name)) Studio.toast(`${name} is over the camera.`, 2500);
  }
  studyBtn.addEventListener('click', useStudy);
  // a photo loaded the app's way while this tab is open (Load photo, a drop, a paste) becomes the Study photo, as on
  // every tab, and is put over the camera too
  window.addEventListener('studio:source', () => { if (state.active) useStudy(); });

  // ---- Where the photo sits: fractions of the camera's picture ------------------------------------------------------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const view = () => ({ w: wrap.clientWidth, h: wrap.clientHeight });
  // the photo's width, as a share of the picture's width, when it fits the picture whole (turned as it is)
  function fitW() {
    const v = view(), p = state.photo;
    if (!p || !v.w || !v.h) return 1;
    const odd = state.place.turn % 2 === 1, bw = odd ? p.h : p.w, bh = odd ? p.w : p.h;
    return (p.w * Math.min(v.w / bw, v.h / bh)) / v.w;
  }
  const MIN_SIZE = 0.2, MAX_SIZE = 4; // from a fifth of the fitted size to four times it
  function setWidth(w) { const f = fitW(); state.place.w = clamp(w, f * MIN_SIZE, f * MAX_SIZE); state.place.fitted = false; }
  const sizePct = () => Math.round((state.place.w / fitW()) * 100);
  // the Size slider runs on a ratio scale (each step the same share bigger), so the fitted size sits near its middle
  // and the small sizes get as much of it as the large ones
  const STEPS = +sizeIn.max || 200;
  const toSlider = (pct) => Math.round((STEPS * Math.log(pct / 100 / MIN_SIZE)) / Math.log(MAX_SIZE / MIN_SIZE));
  const fromSlider = (v) => MIN_SIZE * Math.pow(MAX_SIZE / MIN_SIZE, clamp(v, 0, STEPS) / STEPS);
  function drawPhoto() {
    applyZoom();
    if (!state.photo) { photoCv.hidden = true; return; }
    const v = view();
    if (!v.w || !v.h) return;
    const p = state.photo, pl = state.place;
    if (pl.fitted) pl.w = fitW();
    const w = pl.w * v.w, h = (w * p.h) / p.w;
    photoCv.style.width = `${w}px`;
    photoCv.style.height = `${h}px`;
    photoCv.style.left = `${pl.cx * v.w - w / 2}px`;
    photoCv.style.top = `${pl.cy * v.h - h / 2}px`;
    photoCv.style.transform = pl.turn ? `rotate(${pl.turn * 90}deg)` : '';
    photoCv.style.opacity = String(1 - settings.transparency / 100);
    photoCv.hidden = false;
  }
  // ---- Zoom: the whole view magnified about a point; the photo is not moved, so it stays where it is on the paper ----------
  const MIN_ZOOM = 1, MAX_ZOOM = 6;
  const zoomed = () => state.zoom.z > 1;
  function applyZoom() {
    const zm = state.zoom, v = view();
    // the Left–right and Up–down sliders are there while zoomed in, and follow a drag, a pinch or a key
    panEl.hidden = zm.z <= 1;
    if (document.activeElement !== panX) panX.value = String(Math.round(zm.x * 100));
    if (document.activeElement !== panY) panY.value = String(Math.round(zm.y * 100));
    panX.setAttribute('aria-valuetext', `${Math.round(zm.x * 100)}% from the left edge`);
    panY.setAttribute('aria-valuetext', `${Math.round(zm.y * 100)}% from the top edge`);
    wrap.style.transform = zm.z > 1 && v.w && v.h ? `translate(${-zm.z * (zm.x - 0.5) * v.w}px, ${-zm.z * (zm.y - 0.5) * v.h}px) scale(${zm.z})` : '';
  }
  // where the picture's middle sits on the screen when nothing is zoomed (layout ignores transforms)
  function wrapCentre() {
    const s = stage.getBoundingClientRect();
    return { x: s.left + wrap.offsetLeft + wrap.clientWidth / 2, y: s.top + wrap.offsetTop + wrap.clientHeight / 2 };
  }
  // the point of the picture (fractions of it) under a point of the screen
  function pictureAt(sx, sy, zm = state.zoom) {
    const c = wrapCentre(), v = view();
    return { x: zm.x + (sx - c.x) / (zm.z * v.w), y: zm.y + (sy - c.y) / (zm.z * v.h) };
  }
  // zoom to z with the picture point (nx, ny) under the screen point (sx, sy); back at 100% the view is the whole picture again
  function zoomTo(z, nx, ny, sx, sy) {
    const zm = state.zoom, v = view(), c = wrapCentre();
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (z < 1.01) { zm.z = 1; zm.x = 0.5; zm.y = 0.5; return; }
    zm.z = z;
    zm.x = clamp(nx - (sx - c.x) / (z * v.w), 0, 1);
    zm.y = clamp(ny - (sy - c.y) / (z * v.h), 0, 1);
  }
  // + and − step the zoom (about the middle of what is on screen: the point there stays there), the readout is back to 100%
  function zoomBy(f) {
    const r = stage.getBoundingClientRect(), sx = r.left + r.width / 2, sy = r.top + r.height / 2, n = pictureAt(sx, sy);
    zoomTo(f ? state.zoom.z * f : 1, n.x, n.y, sx, sy);
    endGesture();
    render();
  }
  // the pan sliders put the middle of the view at a point of the picture (0 the left or top edge, 100 the right or bottom)
  panX.addEventListener('input', () => { if (!zoomed()) return; state.zoom.x = clamp(+panX.value / 100, 0, 1); applyZoom(); placeToast(); });
  panY.addEventListener('input', () => { if (!zoomed()) return; state.zoom.y = clamp(+panY.value / 100, 0, 1); applyZoom(); placeToast(); });
  const ZOOM_STEP = 1.4;
  zoomInBtn.addEventListener('click', () => zoomBy(ZOOM_STEP));
  zoomOutBtn.addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
  zoomResetBtn.addEventListener('click', () => zoomBy(0));
  function fitPhoto() { state.place.cx = 0.5; state.place.cy = 0.5; state.place.fitted = true; render(); }
  fitBtn.addEventListener('click', fitPhoto);
  turnBtn.addEventListener('click', () => {
    if (!state.photo || state.locked) return;
    state.place.turn = (state.place.turn + 1) % 4;
    if (!state.place.fitted) setWidth(state.place.w); // a size of its own stays, inside the new range
    render();
  });
  lockBtn.addEventListener('click', () => {
    if (!state.photo) return;
    state.locked = !state.locked;
    endGesture();
    render();
  });

  // the sliders
  transparency.value = String(settings.transparency);
  strength.value = String(settings.frame);
  transparency.addEventListener('input', () => { settings.transparency = clamp(Math.round(+transparency.value), 0, 100); render(); });
  strength.addEventListener('input', () => { settings.frame = clamp(Math.round(+strength.value), 10, 80); render(); });
  transparency.addEventListener('change', saveSettings);
  strength.addEventListener('change', saveSettings);
  sizeIn.addEventListener('input', () => {
    if (!state.photo || state.locked) { render(); return; }
    setWidth(fitW() * fromSlider(+sizeIn.value));
    render();
  });

  // ---- Dragging and pinching the photo (one finger or the mouse moves it, two fingers size it) -----------------------
  const pointers = new Map();
  let gesture = null;
  function beginGesture() {
    const pts = [...pointers.values()], pl = state.place, r = wrap.getBoundingClientRect();
    if (!pts.length) { gesture = null; return; }
    // zoomed in the photo is locked: a finger looks around the view and two fingers zoom it, about the spot between them
    if (zoomed()) {
      const zm = state.zoom, [a, b] = pts;
      if (pts.length === 1) gesture = { kind: 'pan', x0: a.x, y0: a.y, zx: zm.x, zy: zm.y };
      else {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, n = pictureAt(mx, my);
        gesture = { kind: 'zoom', d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, z0: zm.z, nx: n.x, ny: n.y };
      }
      return;
    }
    if (pts.length === 1) gesture = { kind: 'drag', x0: pts[0].x, y0: pts[0].y, cx: pl.cx, cy: pl.cy };
    else {
      const [a, b] = pts;
      gesture = { kind: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top, cx: pl.cx, cy: pl.cy, w: pl.w, left: r.left, top: r.top };
    }
  }
  function endGesture() { pointers.clear(); gesture = null; }
  hit.addEventListener('pointerdown', (e) => {
    if ((!state.photo && !zoomed()) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    // a touch while drawing leaves the photo where it is (the status line says it is locked); zoomed in, a touch only looks
    // around, which never moves the photo over the paper
    if (state.locked && !zoomed()) return;
    try { hit.setPointerCapture(e.pointerId); } catch (err) { /* the pointer has already gone */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginGesture();
  });
  hit.addEventListener('pointermove', (e) => {
    if (!gesture || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const v = view(), pl = state.place, pts = [...pointers.values()];
    if (!v.w || !v.h) return;
    if (gesture.kind === 'pan' && pts.length === 1) {
      const zm = state.zoom;
      zm.x = clamp(gesture.zx - (pts[0].x - gesture.x0) / (zm.z * v.w), 0, 1);
      zm.y = clamp(gesture.zy - (pts[0].y - gesture.y0) / (zm.z * v.h), 0, 1);
      applyZoom();
      return;
    }
    if (gesture.kind === 'zoom' && pts.length >= 2) {
      const [a, b] = pts;
      zoomTo((gesture.z0 * Math.hypot(b.x - a.x, b.y - a.y)) / gesture.d0, gesture.nx, gesture.ny, (a.x + b.x) / 2, (a.y + b.y) / 2);
      applyZoom(); showZoom();
      return;
    }
    if (gesture.kind === 'drag' && pts.length === 1) {
      pl.cx = clamp(gesture.cx + (pts[0].x - gesture.x0) / v.w, 0, 1);
      pl.cy = clamp(gesture.cy + (pts[0].y - gesture.y0) / v.h, 0, 1);
      pl.fitted = false;
    } else if (gesture.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts, f = fitW();
      const w = clamp((gesture.w * Math.hypot(b.x - a.x, b.y - a.y)) / gesture.d0, f * MIN_SIZE, f * MAX_SIZE), k = w / gesture.w;
      // the spot under the fingers stays under them: the photo grows about the fingers' midpoint and follows it
      const mx = (a.x + b.x) / 2 - gesture.left, my = (a.y + b.y) / 2 - gesture.top;
      pl.cx = clamp((mx + (gesture.cx * v.w - gesture.mx) * k) / v.w, 0, 1);
      pl.cy = clamp((my + (gesture.cy * v.h - gesture.my) * k) / v.h, 0, 1);
      pl.w = w;
      pl.fitted = false;
    }
    drawPhoto(); showSize();
  });
  const lift = (e) => { if (!pointers.delete(e.pointerId)) return; beginGesture(); }; // a finger lifted mid-pinch leaves a drag
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => hit.addEventListener(type, lift));
  hit.addEventListener('contextmenu', (e) => e.preventDefault());
  // from the keyboard: the arrow keys move it (two pixels a press, twenty with Shift) and + and − size it
  const MOVES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  hit.addEventListener('keydown', (e) => {
    if ((!state.photo && !zoomed()) || e.altKey || e.ctrlKey || e.metaKey) return;
    const d = MOVES[e.key], grow = e.key === '+' || e.key === '=' ? 1.03 : e.key === '-' || e.key === '_' || e.key === '−' ? 1 / 1.03 : 0;
    if (!d && !grow) return;
    e.preventDefault();
    if (zoomed()) {
      // zoomed in the keys look around (arrows) and zoom (+ and −); the photo is left where it is
      const zm = state.zoom, v = view(), px = e.shiftKey ? 20 : 2;
      if (d) { zm.x = clamp(zm.x + (d[0] * px) / (zm.z * (v.w || 1)), 0, 1); zm.y = clamp(zm.y + (d[1] * px) / (zm.z * (v.h || 1)), 0, 1); }
      else { const r = stage.getBoundingClientRect(), sx = r.left + r.width / 2, sy = r.top + r.height / 2, n = pictureAt(sx, sy); zoomTo(zm.z * (grow > 1 ? 1.1 : 1 / 1.1), n.x, n.y, sx, sy); }
      render();
      return;
    }
    if (state.locked) return;
    const v = view(), pl = state.place;
    if (d) {
      const px = e.shiftKey ? 20 : 2;
      pl.cx = clamp(pl.cx + (d[0] * px) / (v.w || 1), 0, 1);
      pl.cy = clamp(pl.cy + (d[1] * px) / (v.h || 1), 0, 1);
      pl.fitted = false;
    } else setWidth(pl.w * grow);
    render();
  });

  // ---- The layout: the camera's picture fills the stage whole (letterboxed), the photo over it -----------------------
  // pinned to the screen as the Studio is (the same 760 × 560 line as painting.js pin()): below the tabs on a wide screen,
  // the whole screen on a phone, upright or on its side
  function pinRoot() {
    const vv = window.visualViewport;
    let W = window.innerWidth, H = window.innerHeight, left = 0, top = 0;
    if (vv && Math.abs(vv.scale - 1) < 0.02) { W = vv.width; H = vv.height; left = vv.offsetLeft; top = vv.offsetTop; }
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    if (matchMedia('(min-width: 760px) and (min-height: 560px)').matches && tabs.width > 0) {
      const inset = Math.max(0, Math.round(tabs.bottom + 14 - top));
      root.style.left = `${Math.round(tabs.left)}px`; root.style.top = `${Math.round(top + inset)}px`;
      root.style.width = `${Math.round(tabs.width)}px`; root.style.height = `${Math.max(240, Math.round(H - inset - 16))}px`;
    } else {
      root.style.left = `${left}px`; root.style.top = `${top}px`;
      root.style.width = `${W}px`; root.style.height = `${Math.max(240, H)}px`;
    }
  }
  function fitView() {
    if (!state.active) return;
    const cs = getComputedStyle(stage);
    const W = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (W <= 0 || H <= 0) return;
    // the fitted size follows the picture's shape, and a size of its own is a share of it (what Size says): it keeps its share
    const was = view(), fitted = state.photo && !state.place.fitted && was.w && was.h ? fitW() : 0;
    if (state.stream && video.videoWidth && video.videoHeight) state.aspect = video.videoWidth / video.videoHeight;
    let w = W, h = H;
    if (state.aspect) { const k = Math.min(W / state.aspect, H); w = Math.floor(k * state.aspect); h = Math.floor(k); }
    wrap.style.width = `${w}px`;
    wrap.style.height = `${h}px`;
    if (fitted && fitW() !== fitted) setWidth((state.place.w * fitW()) / fitted);
    placeToast();
    drawPhoto(); showSize();
  }
  // the toast sits at the foot of the camera's picture, clear of the Tools button and of the pop-up when it is open (along the
  // bottom upright, down the left on a wide screen)
  function placeToast() {
    const r = stage.getBoundingClientRect();
    let left = r.left, lift = 64, sheetH = 0, sheetW = 0, top = null;
    if (!panEl.hidden) lift = Math.max(lift, Math.round(r.bottom - panEl.getBoundingClientRect().top) + 10); // clear of the pan sliders when zoomed
    if (state.tools && !strip.hidden) {
      const sr = strip.getBoundingClientRect();
      if (sr.width < r.width * 0.9) { sheetW = Math.max(0, Math.round(sr.right - r.left)); left = Math.max(left, sr.right); } else { sheetH = Math.max(0, Math.round(r.bottom - sr.top)); lift = Math.max(lift, sheetH + 12); }
    }
    // the card keeps to the room the pop-up leaves, and the message goes to the top while the card is up (it would sit on the card's button)
    if (!card.hidden && (sheetH || sheetW)) top = Math.round(r.top + 56);
    root.style.setProperty('--tr-sheet-h', `${sheetH}px`);
    root.style.setProperty('--tr-sheet-w', `${sheetW}px`);
    document.body.style.setProperty('--tr-toast-x', `${Math.round(left + (r.right - left) / 2)}px`);
    document.body.style.setProperty('--tr-toast-b', top === null ? `${Math.round(Math.max(0, window.innerHeight - r.bottom) + lift)}px` : 'auto');
    document.body.style.setProperty('--tr-toast-t', top === null ? 'auto' : `${top}px`);
    document.body.style.setProperty('--tr-toast-w', `${Math.round(Math.max(160, r.right - left - 24))}px`);
  }
  function layout() { if (!state.active) return; pinRoot(); fitView(); }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 60));
  if (window.visualViewport) { visualViewport.addEventListener('resize', layout); visualViewport.addEventListener('scroll', layout); }
  if (window.ResizeObserver) new ResizeObserver(() => fitView()).observe(stage);
  ['loadedmetadata', 'loadeddata', 'resize', 'playing'].forEach((type) => video.addEventListener(type, () => {
    if (state.frame && video.videoWidth && Math.abs(ghost.width / ghost.height - video.videoWidth / video.videoHeight) > 0.01) {
      dropFrame('The camera picture changed shape, so the frame no longer lines up with it: set it again.');
    }
    fitView(); render();
  }));

  // ---- What the strip and the card show ------------------------------------------------------------------------------
  // a control off says why (a screen reader reads the reason with it; the card and the status line say it on screen)
  function able(el, ok, why) {
    el.disabled = !ok;
    if (ok || !why) el.removeAttribute('aria-describedby'); else el.setAttribute('aria-describedby', why);
  }
  function showZoom() {
    const z = state.zoom.z, pct = Math.round(z * 100);
    zoomResetBtn.textContent = `${pct}%`;
    zoomResetBtn.setAttribute('aria-label', z > 1 ? `Zoom ${pct}%: press to see the whole picture` : 'Zoom 100%, the whole picture');
    zoomOutBtn.disabled = z <= MIN_ZOOM;
    zoomInBtn.disabled = z >= MAX_ZOOM - 0.005;
  }
  function showSize() {
    if (!state.photo) return;
    const pct = clamp(sizePct(), MIN_SIZE * 100, MAX_SIZE * 100);
    if (document.activeElement !== sizeIn) sizeIn.value = String(toSlider(pct));
    $('sizeOut').textContent = `${pct}%`;
    sizeIn.setAttribute('aria-valuetext', `${pct}% of the fitted size`);
  }
  function render() {
    const why = blocked(), on = !!state.stream, photo = !!state.photo, locked = photo && state.locked;
    // the card: the introduction, what went wrong, or that the camera is starting; gone while the camera runs
    let text = INTRO, retry = true;
    if (why) { text = why; retry = false; } else if (state.starting) text = 'Starting the camera… If the browser asks, allow the camera for this site.';
    else if (state.note) ({ text, retry } = state.note);
    card.hidden = on;
    if (say.textContent !== text) say.textContent = text;
    startBtn.hidden = !retry;
    startBtn.disabled = state.starting;
    startBtn.textContent = state.starting ? 'Starting…' : 'Start camera';
    // the pop-up of controls and the button that opens it
    strip.hidden = !state.tools;
    toolsBtn.hidden = state.tools;
    toolsBtn.setAttribute('aria-expanded', String(state.tools));
    // the strip
    able(camBtn, !why, 'tr-say');
    camBtn.setAttribute('aria-label', on || state.starting ? 'Stop camera' : 'Start camera');
    camBtn.title = on || state.starting ? 'Stop the camera' : 'Start the camera (the browser asks first)';
    camBtn.classList.toggle('is-on', on);
    studyBtn.hidden = !Studio.source();
    // zoomed in the photo is locked (a drag looks around the view): Fit, Turn and Size wait for 100%
    const zm = zoomed(), stuck = locked || zm, whyStuck = zm ? 'tr-whyZoom' : locked ? 'tr-whyLocked' : 'tr-whyPhoto';
    able(fitBtn, photo && !stuck, whyStuck);
    able(turnBtn, photo && !stuck, whyStuck);
    able(sizeIn, photo && !stuck, whyStuck);
    able(lockBtn, photo, 'tr-whyPhoto');
    lockBtn.setAttribute('aria-pressed', String(locked));
    lockBtn.title = locked ? 'Unlock the photo, to move or size it' : 'Lock the photo in place: drags and pinches do nothing';
    able(setFrameBtn, on && hasPicture(), 'tr-whyCamera');
    setFrameBtn.title = state.frame ? 'Set the frame again from what the camera sees now' : 'Keep the camera\'s view of the paper now, to line it up again later';
    able(showFrameBtn, on && state.frame, on ? 'tr-whyFrame' : 'tr-whyCamera');
    showFrameBtn.setAttribute('aria-pressed', String(on && state.frame && state.frameShown));
    showFrameBtn.title = on && !state.frame ? 'Set a frame first: Set frame keeps the camera\'s view of the paper' : 'Show the kept view faintly over the camera';
    switchBtn.hidden = state.cameras.length < 2;
    able(switchBtn, on, 'tr-whyCamera');
    // the sliders' values, in words for a screen reader too
    $('transparencyOut').textContent = `${settings.transparency}%`;
    transparency.setAttribute('aria-valuetext', `${settings.transparency}% see-through`);
    const fs = frameStrength();
    if (document.activeElement !== strength) strength.value = String(settings.frame);
    $('strengthOut').textContent = `${settings.frame}%`;
    strength.setAttribute('aria-valuetext', `${settings.frame}%`);
    if (!photo) { sizeIn.value = String(toSlider(100)); $('sizeOut').textContent = '100%'; sizeIn.setAttribute('aria-valuetext', '100% of the fitted size'); }
    // the stage: the frame over the camera (under the photo), the photo, and what the status line says
    ghost.hidden = !(on && state.frame && state.frameShown);
    ghost.style.opacity = String(fs / 100);
    hit.tabIndex = photo || zm ? 0 : -1;
    root.classList.toggle('tr-locked', locked);
    root.classList.toggle('tr-live', on);
    const notes = [];
    if (on && !photo) notes.push('Choose a photo to put over the camera.');
    if (on && state.frame && state.frameShown) notes.push('Frame on: move the phone until the paper lines up with it.');
    if (zm) notes.push('Zoomed in: drag to look around. The photo stays where it is on the paper.');
    if (locked) notes.push('Locked: drags and pinches leave the photo where it is.');
    const line = notes.join(' ');
    if (status.textContent !== line) status.textContent = line;
    drawPhoto(); showSize(); showZoom(); placeToast();
  }

  // ---- The buttons ---------------------------------------------------------------------------------------------------
  startBtn.addEventListener('click', () => { start(holding(startBtn)); });
  camBtn.addEventListener('click', () => { if (state.stream || state.starting) { stop(); state.note = null; render(); } else start(); });
  setFrameBtn.addEventListener('click', setFrame);
  showFrameBtn.addEventListener('click', () => { if (!state.frame) return; state.frameShown = !state.frameShown; render(); });
  switchBtn.addEventListener('click', switchCamera);
  // the pop-up: Tools opens it over the picture, Hide tools and Esc close it; the focus goes into it and comes back to the button
  function setTools(open) {
    if (state.tools === open) return;
    state.tools = open;
    render();
    if (state.active) (open ? hideBtn : toolsBtn).focus({ preventScroll: true });
  }
  toolsBtn.addEventListener('click', () => setTools(true));
  hideBtn.addEventListener('click', () => setTools(false));
  strip.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.tools) { e.preventDefault(); e.stopPropagation(); setTools(false); } });
  // (the focus goes to the section it opens: the button pressed is hidden with the pop-up)
  $('exit').addEventListener('click', () => Studio.go('study', true));
  window.addEventListener('studio:mode', render);

  // the focus, when the tab opens and nothing sensible holds it (on a phone the menu's button steps aside with the
  // header): the card's Start camera, or the strip's first control
  function focusIn() {
    if (!state.active) return;
    const a = document.activeElement;
    if (a && a !== document.body && a.offsetParent !== null && !a.closest('[hidden]')) return;
    const first = [startBtn, toolsBtn, camBtn, chooseBtn].find((b) => !b.hidden && !b.disabled && b.offsetParent !== null);
    if (first) first.focus({ preventScroll: true });
  }

  // ---- The tab -------------------------------------------------------------------------------------------------------
  window.addEventListener('studio:tab', (e) => {
    const was = state.active;
    state.active = e.detail === 'trace';
    document.body.classList.toggle('tab-trace', state.active);
    if (!state.active) {
      // leaving: the camera goes off (it comes back with the tab), and a drag in progress ends
      if (state.stream || state.starting) stop(true);
      endGesture();
      return;
    }
    window.scrollTo(0, 0);
    layout();
    render();
    if (!was) { resume(); setTimeout(focusIn, 0); }
    setTimeout(layout, 120);
  });
  if (Studio.tab() === 'trace') window.dispatchEvent(new CustomEvent('studio:tab', { detail: 'trace' }));
  render();

  // for tests: what the module holds
  window.Trace = {
    state,
    settings,
    start,
    stop,
    sizePct,
    usePicture,
    zoom: () => ({ ...state.zoom }),
    tools: (open) => { if (typeof open === 'boolean') setTools(open); return state.tools; },
  };
})();
