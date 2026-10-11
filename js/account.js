/* Portrait Value Studio - Account: sign in with Google through the account service (/api/*)
   and show who is signed in. The studio works fully without an account; this control
   only appears when the service answers, so a copy of the site served without it
   (a local folder, a plain static host) looks exactly as before. */
(function () {
  'use strict';

  const API = String(window.ACCOUNT_API_BASE || '/api').replace(/\/$/, '');
  const host = document.getElementById('account');
  if (!host) return;

  const state = { status: 'loading', user: null, entitlements: [], available: false };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });

  async function api(path, options) {
    const opts = Object.assign({ credentials: 'same-origin', headers: {} }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers = Object.assign({ 'content-type': 'application/json' }, opts.headers);
    }
    const res = await fetch(API + path, opts);
    const type = res.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await res.json() : null;
    if (!res.ok) {
      const err = new Error((body && body.message) || ('Request failed (' + res.status + ')'));
      err.code = (body && body.error) || 'http_' + res.status;
      err.status = res.status;
      throw err;
    }
    return body;
  }

  async function refresh() {
    try {
      const me = await api('/me');
      if (!me || !('user' in me)) throw new Error('No account service here');
      state.available = true;
      state.user = me.user;
      state.entitlements = me.entitlements || [];
      state.status = me.user ? 'signed-in' : 'signed-out';
    } catch (e) {
      // No service behind this page (or it is down): keep the studio exactly as it was.
      state.available = false;
      state.user = null;
      state.entitlements = [];
      state.status = 'unavailable';
    }
    render();
    emit();
    return state;
  }

  function signIn(redirect) {
    const back = redirect || (location.pathname + location.search);
    location.href = API + '/auth/google/start?redirect=' + encodeURIComponent(back);
  }

  async function signOut() {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) { console.warn('Sign-out request failed', e); }
    await refresh();
  }

  const has = (key) => state.entitlements.includes(key);

  /* ---- the control in the top bar ---- */
  const el = (tag, attrs, children) => {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  };

  const onShopPage = /(^|\/)shop\.html$/.test(location.pathname);
  let note = '';
  const params = new URLSearchParams(location.search);
  if (params.has('signin')) {
    note = params.get('signin') === 'access_denied' ? 'Sign-in cancelled.' : 'Sign-in did not finish.';
    params.delete('signin');
    const clean = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
    history.replaceState(null, '', clean);
  }

  function initial(user) {
    const from = user.name || user.email || '?';
    return from.trim().charAt(0).toUpperCase();
  }

  function render() {
    host.textContent = '';
    if (!state.available) { host.hidden = true; return; }
    host.hidden = false;
    host.classList.toggle('is-signed-in', state.status === 'signed-in');

    if (!onShopPage) host.appendChild(el('a', { class: 'btn btn-small account-shop', href: 'shop.html', text: 'Shop' }));

    if (state.status !== 'signed-in') {
      if (note) host.appendChild(el('span', { class: 'account-note', role: 'status', text: note }));
      host.appendChild(el('button', { type: 'button', class: 'btn btn-small account-signin', onclick: () => signIn(), text: 'Sign in' }));
      return;
    }

    const user = state.user;
    const avatar = user.picture
      ? el('img', { class: 'account-avatar', src: user.picture, alt: '', referrerpolicy: 'no-referrer', onerror: function () { this.replaceWith(el('span', { class: 'account-avatar account-initial', text: initial(user) })); } })
      : el('span', { class: 'account-avatar account-initial', text: initial(user) });
    const menu = el('div', { class: 'account-menu', role: 'menu', hidden: true }, [
      el('div', { class: 'account-who' }, [
        el('strong', { text: user.name || user.email || 'Signed in' }),
        user.name && user.email ? el('small', { text: user.email }) : null,
        has('studio.supporter') ? el('small', { class: 'account-badge', text: '✦ Studio supporter, thank you' }) : null,
      ]),
      el('a', { class: 'account-item', role: 'menuitem', href: 'shop.html', text: onShopPage ? 'Your orders' : 'Shop' }),
      el('button', { type: 'button', class: 'account-item', role: 'menuitem', onclick: () => { close(); signOut(); }, text: 'Sign out' }),
    ]);
    const button = el('button', {
      type: 'button', class: 'account-button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      title: user.email || user.name || 'Account', 'aria-label': 'Account: ' + (user.name || user.email || 'signed in'),
      onclick: () => (menu.hidden ? open() : close()),
    }, [avatar]);
    const open = () => { menu.hidden = false; button.setAttribute('aria-expanded', 'true'); document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc); };
    const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc); };
    const away = (e) => { if (!host.contains(e.target)) close(); };
    const esc = (e) => { if (e.key === 'Escape') { close(); button.focus(); } };
    host.appendChild(el('div', { class: 'account-wrap' }, [button, menu]));
  }

  window.Account = {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    refresh, signIn, signOut, has, api,
  };

  refresh();
})();
