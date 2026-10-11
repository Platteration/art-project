/* Portrait Value Studio - Shop: lists what the account service sells and sends a signed-in
   visitor to Stripe Checkout. Purchases come back as entitlements on the account
   (see server/catalogue.js); the page shows them and the past orders. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const products = $('products');
  const notice = $('shopNotice');
  const ordersBox = $('orders');
  const ordersList = $('ordersList');
  const Account = window.Account;
  if (!products || !Account) return;

  const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
  function money(price) {
    if (!price || typeof price.amount !== 'number') return '';
    const amount = ZERO_DECIMAL.has(price.currency) ? price.amount : price.amount / 100;
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency.toUpperCase() }).format(amount); }
    catch (e) { return amount + ' ' + price.currency.toUpperCase(); }
  }

  function say(kind, text) {
    notice.hidden = !text;
    notice.className = 'notice' + (kind ? ' notice-' + kind : '');
    notice.textContent = text || '';
  }

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

  let catalogue = null;

  async function loadProducts() {
    try {
      catalogue = await Account.api('/shop/products');
    } catch (e) {
      catalogue = null;
      say('warn', 'The shop could not be reached right now. Please try again in a moment.');
    }
    renderProducts();
  }

  function owned(p) {
    return !p.physical && p.grants.length > 0 && p.grants.every((g) => Account.has(g));
  }

  async function buy(p, button) {
    if (Account.state.status !== 'signed-in') { Account.signIn('/shop.html'); return; }
    button.disabled = true;
    button.classList.add('is-busy');
    try {
      const out = await Account.api('/shop/checkout', { method: 'POST', body: { product: p.id } });
      location.href = out.url;
    } catch (e) {
      button.disabled = false;
      button.classList.remove('is-busy');
      say('warn', e.code === 'already_owned' ? 'Your account already has this.' : e.code === 'signed_out' ? 'Please sign in first.' : 'Could not start the checkout: ' + e.message);
      if (e.code === 'signed_out') Account.refresh();
    }
  }

  function renderProducts() {
    products.textContent = '';
    if (!catalogue) return;
    if (!catalogue.configured || catalogue.products.length === 0) {
      products.appendChild(el('p', { class: 'shop-empty', text: 'Nothing is for sale yet. Check back soon.' }));
      return;
    }
    const signedIn = Account.state.status === 'signed-in';
    catalogue.products.forEach((p) => {
      const isOwned = signedIn && owned(p);
      const price = money(p.price);
      const button = el('button', {
        type: 'button', class: 'btn btn-primary', disabled: isOwned,
        text: isOwned ? 'Yours' : signedIn ? (price ? 'Buy · ' + price : 'Buy') : 'Sign in to buy',
      });
      button.addEventListener('click', () => buy(p, button));
      products.appendChild(el('article', { class: 'product' + (isOwned ? ' is-owned' : '') }, [
        el('div', { class: 'product-head' }, [
          el('h2', { text: p.name }),
          el('span', { class: 'product-price', text: price || 'Price at checkout' }),
        ]),
        el('p', { class: 'product-blurb', text: p.blurb }),
        p.physical ? el('p', { class: 'hint', text: 'Shipped to the address you give at checkout.' }) : null,
        p.grants.includes('drawdraw.pro') ? el('p', { class: 'hint', text: 'Unlocks in the DrawDraw app when you sign in there with the same Google account.' }) : null,
        el('div', { class: 'product-actions' }, [button]),
      ]));
    });
  }

  async function loadOrders() {
    if (Account.state.status !== 'signed-in') { ordersBox.hidden = true; return; }
    try {
      const { orders } = await Account.api('/shop/orders');
      ordersList.textContent = '';
      ordersBox.hidden = false;
      if (!orders.length) {
        ordersList.appendChild(el('li', { class: 'order order-none', text: 'No orders yet.' }));
        return;
      }
      orders.forEach((o) => {
        const when = new Date(o.created * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        ordersList.appendChild(el('li', { class: 'order' }, [
          el('span', { class: 'order-name', text: o.name || o.product }),
          el('span', { class: 'order-when', text: when }),
          el('span', { class: 'order-amount', text: money({ amount: o.amount, currency: o.currency }) }),
          el('span', { class: 'order-status', text: o.fulfilled ? 'Done' : 'Being prepared' }),
        ]));
      });
    } catch (e) {
      ordersBox.hidden = true;
    }
  }

  /* Back from Stripe: the webhook that grants the purchase can land a few seconds
     after the browser does, so look again a few times before giving up. */
  async function afterCheckout() {
    const params = new URLSearchParams(location.search);
    const result = params.get('checkout');
    if (!result) return;
    params.delete('checkout');
    params.delete('session_id');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : ''));
    if (result === 'cancelled') { say('', 'Checkout cancelled. Nothing was charged.'); return; }
    if (result !== 'success') return;
    say('ok', 'Thank you! Your receipt is on its way by email. Attaching the purchase to your account…');
    const before = Account.state.entitlements.slice();
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      await Account.refresh();
      const now = Account.state.entitlements;
      if (now.length > before.length) {
        say('ok', 'Thank you! Your purchase is on your account. Your receipt is on its way by email.');
        return;
      }
    }
    say('ok', 'Thank you! Your receipt is on its way by email. If the purchase does not show here within a few minutes, reload the page.');
  }

  Account.subscribe(() => { renderProducts(); loadOrders(); });
  loadProducts();
  if (Account.state.status !== 'loading') { renderProducts(); loadOrders(); }
  afterCheckout();
})();
