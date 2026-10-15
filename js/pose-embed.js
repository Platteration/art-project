// Opened inside Portrait Value Studio (pose.html?embed=1 in a frame): no header, the stage sized from
// the app's window rather than the frame's (the frame grows to fit the page), the app's light or dark
// theme, and the page's height sent to the app so it can make the frame that tall.
(function () {
  if (!/[?&]embed=1(&|$)/.test(location.search) || window.parent === window) return;
  const root = document.documentElement;
  root.classList.add('embed');
  let host = null;
  try { if (window.parent.document) host = window.parent; } catch (err) { host = null; }
  const size = () => {
    const vh = host ? host.innerHeight : 800;
    const h = window.innerWidth < 880 ? Math.max(340, vh * 0.62) : Math.max(380, Math.min(780, vh - 225));
    root.style.setProperty('--stage-h', Math.round(h) + 'px');
  };
  const theme = () => {
    const t = host && host.document.documentElement.getAttribute('data-theme');
    if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
  };
  size();
  theme();
  window.addEventListener('resize', size);
  if (host) {
    host.addEventListener('resize', size);
    new MutationObserver(theme).observe(host.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  let told = 0;
  const tell = () => {
    const app = document.querySelector('.app');
    if (!app) return;
    const h = Math.ceil(app.getBoundingClientRect().bottom + window.scrollY);
    if (h !== told) { told = h; window.parent.postMessage({ type: 'pose-and-light:height', height: h }, location.origin); }
  };
  document.addEventListener('DOMContentLoaded', () => { tell(); if (window.ResizeObserver) new ResizeObserver(tell).observe(document.querySelector('.app')); });
  window.addEventListener('load', tell);
})();
