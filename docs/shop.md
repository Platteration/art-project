# Tutorial 3 · The shop

`shop.html` lists what is for sale, sends a signed-in visitor to Stripe Checkout, and shows
what they own and have ordered. What is for sale, and what each purchase grants, is one file:
`server/catalogue.js`. This tutorial covers running the shop day to day and changing what it
sells. It assumes tutorials 1 (sign-in) and 2 (Stripe) are done.

## How a purchase flows

```
shop.html ──POST /api/shop/checkout {product}──▶ service ──creates Checkout Session──▶ Stripe
    ◀──────────── redirect to Stripe's page ───────┘                                    │
    ◀──────── back to /shop.html?checkout=success ──────────────────────────────────────┘
                                                   service ◀── webhook: session paid ── Stripe
                                                     │ writes  order:<user>:…
                                                     │ writes  ent:<user>  += product.grants
shop.html ──GET /api/me───▶ "entitlements": ["drawdraw.pro"]        (and the app sees the same)
```

- Buying needs a signed-in account, so the purchase has somewhere to land. A visitor who
  presses **Sign in to buy** is sent through Google and comes back to the shop.
- The entitlement is granted by the **webhook**, not by the browser coming back: a closed tab,
  a lost connection or a forged `?checkout=success` URL grants nothing. The page just polls
  `/api/me` for a few seconds so the buyer sees it land.
- A product whose grants the account already has cannot be bought twice (the button reads
  **Yours**; the service answers `409 already_owned`).

## The catalogue

```js
// server/catalogue.js
{
  id: 'drawdraw-pro',                 // stable; used in URLs, metadata and the price variable
  name: 'DrawDraw Pro',               // shown on the shop card
  blurb: '…',                         // shown under it
  grants: ['drawdraw.pro'],           // entitlement keys written to the buyer's account
  // physical: true,                  // collect a shipping address; nothing granted automatically
}
```

| Product | Grants | Who reads it |
| --- | --- | --- |
| `drawdraw-pro` | `drawdraw.pro` | the DrawDraw app: `pro` becomes true on sign-in (`src/lib/pro.js`) |
| `studio-supporter` | `studio.supporter` | the studio's account menu shows a supporter mark; nothing is locked behind it |

The Stripe price for each product comes from `STRIPE_PRICE_<ID>` (tutorial 2, Step 2). The
shop shows only products that have one, so you can keep a product in the file and take it off
sale by removing its variable.

### Add a product

1. Add an entry to `CATALOGUE` in `server/catalogue.js` with a new `id`.
2. Create the product and a one-off price in Stripe (test mode first), copy the `price_…`.
3. `npx wrangler@4 secret put STRIPE_PRICE_<ID>` (and the same in `server/.dev.vars` locally).
4. `npm test`, then `npm run deploy`. `/api/health` lists the product under `products` and the
   shop shows it. Do the same in live mode when you go live.

### Sell something physical

Set `physical: true` on the product. Checkout then collects a shipping address, limited to
the countries in the `SHIP_COUNTRIES` variable (comma-separated ISO codes; `wrangler.jsonc`
`vars`, default is a list of common ones). On payment the service records the order with the
address and marks it `fulfilled: false`; it grants nothing (add `grants` too if a print should
also unlock something).

Fulfilment is yours: the Stripe dashboard (**Payments**, each with the shipping address and
the `user` / `product` metadata) is the pick list. The service has no admin screen to mark an
order shipped; a buyer sees **Being prepared** under **Your orders** until one exists. If you
start selling physical goods, that admin endpoint is the first thing to add.

### Change a price

Make a new price on the product in Stripe, point `STRIPE_PRICE_<ID>` at it, archive the old
price. The service caches a price for ten minutes, so the shop shows the new amount within
that. Checkout always charges whatever the variable points at.

### Discounts

Stripe promotion codes are not enabled on the Checkout session. To allow them, add
`allow_promotion_codes: 'true'` to the `params` in `checkout()` in `server/worker.js` and
create codes under **Product catalog → Coupons** in Stripe.

## Using a purchase on the web

`js/account.js` exposes `window.Account`:

```js
Account.state            // { status: 'signed-in' | 'signed-out' | 'loading' | 'unavailable', user, entitlements }
Account.has('studio.supporter')   // true when the signed-in account owns it
Account.subscribe((state) => …)   // called after every refresh
Account.signIn('/shop.html')      // leaves for Google and comes back to that path
Account.signOut()
Account.api('/shop/orders')       // fetch helper for the service, same-origin cookie
```

Nothing in the studio is gated today; to gate something, check `Account.has(key)` and
re-check in a `subscribe` callback, since the account loads after the page.

## In the DrawDraw app

A Pro bought here unlocks in the app when its owner signs in there with the same Google
account (`drawdraw/docs/ACCOUNT_SETUP.md`). Two Apple rules shape this:

- The app must **also** sell Pro as an in-app purchase (App Store guideline 3.1.3(b)); the web
  purchase is an extra way in, not the only one. The in-app side is the `purchases.js` seam,
  still to be wired.
- The app must **not** send people to this shop: no link, no mention of the web price. The
  paywall only offers sign-in for an existing purchase.

A Pro bought in-app does not flow back to the web account (there is no server record of
store purchases). If that matters, the next step is a route that verifies a StoreKit / Play
receipt and writes the same `drawdraw.pro` entitlement.

## What is stored, and where

Everything is in the `STORE` KV namespace (Cloudflare → Storage & Databases → KV):

| Key | Value |
| --- | --- |
| `user:google:<sub>` | id, email, name, picture (from Google), created / last sign-in times |
| `ent:google:<sub>` | `{ "drawdraw.pro": { grantedAt, order, product } }` |
| `order:google:<sub>:<created>:<cs_…>` | product, amount, currency, email, shipping, `fulfilled` |
| `cs:<cs_…>` | which user and product a Checkout session was started for (two days) |
| `evt:<evt_…>` | webhook events already handled, so a retry grants nothing twice (seven days) |

Stripe holds the payment itself, the card and the receipt; the service keeps only what it
needs to show the shop and grant purchases. Email, name and picture come from the Google
profile; the privacy policy you publish should say so.

## Checking it

- `npm test` runs the service's tests, including the full web and app purchase flows against a
  fake Google and Stripe.
- By hand, in test mode: sign in → Buy → `4242…` → back on the shop → **Yours** within a few
  seconds → **Your orders** lists it → Buy again is refused → sign out and in again, still
  **Yours** → in the app, **Restore purchase** unlocks Pro.
