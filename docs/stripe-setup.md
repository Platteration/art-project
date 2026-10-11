# Tutorial 2 · Stripe: taking payments

The service sells through **Stripe Checkout**: the buyer leaves for a Stripe-hosted page, pays,
and comes back to `shop.html`. Stripe then calls the service's webhook, which records the order
and grants what the product promises on the buyer's account. Card details never touch the site.

Do tutorial 1 first: a purchase is attached to the signed-in account, so there has to be one.
Everything below works in Stripe's **test mode** first, with fake cards, and goes live in the
last step without code changes.

## You will need

- A Stripe account: <https://dashboard.stripe.com/register>. You can build and test everything
  right away; activating the account (business details, bank account) is only needed to go live.
- The [Stripe CLI](https://docs.stripe.com/stripe-cli) for local testing (`brew install stripe/stripe-cli/stripe`
  or the download on that page).

## Step 1 · Products and prices (test mode)

With the **Test mode** switch on (top right of the dashboard):

1. **Product catalog → Add product**.
   - Name `DrawDraw Pro`, a description (it shows on the Checkout page), optionally an image.
   - Pricing: **One-off**, amount (say `7.99` USD), **Save product**.
2. Open the product and copy the price's id, `price_…` (not the product id `prod_…`).
3. Repeat for `Studio supporter` (say `5.00`) if you want it, and anything else in
   `server/catalogue.js` (tutorial 3 explains the catalogue).

Prices are referenced by id, so the amount can be changed later in Stripe without a deploy:
make a new price on the product, point the variable at it, and archive the old one.

## Step 2 · Keys and price ids into the service

1. **Developers → API keys** (in test mode): copy the **Secret key** `sk_test_…`.
2. Set it as a secret on the Worker, and the price ids as secrets too (they are not sensitive,
   but keeping them with the key means test and live are swapped in one place without a commit):

   ```sh
   npx wrangler@4 secret put STRIPE_SECRET_KEY
   npx wrangler@4 secret put STRIPE_PRICE_DRAWDRAW_PRO
   npx wrangler@4 secret put STRIPE_PRICE_STUDIO_SUPPORTER
   ```

   The variable name for a product is `STRIPE_PRICE_` plus its catalogue id in upper snake case
   (`drawdraw-pro` → `STRIPE_PRICE_DRAWDRAW_PRO`). A product without a price variable is simply
   not shown in the shop.

3. For local work, put the same values in `server/.dev.vars`.

## Step 3 · The webhook

Stripe tells the service about payments by calling `/api/stripe/webhook`. The service checks
Stripe's signature on every call, so it needs the endpoint's signing secret.

**Deployed (Cloudflare):**

1. **Developers → Webhooks → Add endpoint** (still in test mode).
2. Endpoint URL: `https://studio.example.com/api/stripe/webhook` (your `PUBLIC_ORIGIN` from
   tutorial 1, or the `workers.dev` address).
3. Events to send: `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
   (Other events are accepted and ignored; sending fewer keeps the log readable.)
4. Add the endpoint, open it, **Reveal** the **Signing secret** (`whsec_…`) and:

   ```sh
   npx wrangler@4 secret put STRIPE_WEBHOOK_SECRET
   ```

**Locally**, Stripe cannot reach your computer, so the CLI forwards events:

```sh
stripe login
stripe listen --forward-to localhost:8000/api/stripe/webhook
```

It prints a `whsec_…` of its own; put that in `server/.dev.vars` as `STRIPE_WEBHOOK_SECRET`
and restart `node server/dev.mjs`. Keep `stripe listen` running while you test.

## Step 4 · A test purchase

1. Open the shop (`/shop.html`), sign in, press **Buy** on DrawDraw Pro.
2. On Stripe's page, pay with the test card `4242 4242 4242 4242`, any future expiry, any CVC,
   any postcode. (Other test cards: `4000 0000 0000 9995` is declined; `4000 0025 0000 3155`
   asks for 3-D Secure.)
3. You land back on `/shop.html?checkout=success`. The page says thank you and watches your
   account for a few seconds; when the webhook lands, the product reads **Yours** and appears
   under **Your orders**. `/api/me` now lists `drawdraw.pro`.
4. In the DrawDraw app, signed in with the same Google account, **Restore purchase** unlocks Pro.

Where to look if a step does not happen: **Developers → Webhooks → your endpoint** lists every
delivery with the service's response (`{"received":true,"fulfilled":true,…}` when it granted;
`bad_signature` means the wrong `whsec_`; the **Resend** button retries one). `npm run tail`
shows the Worker's own log.

`stripe trigger checkout.session.completed` sends a synthetic event with no user on it; the
service records nothing from it (`"reason":"no_user_or_product"`). Test with a real checkout.

## Step 5 · Receipts and emails

**Settings → Emails** (test and live are separate): turn on **Successful payments** so Stripe
emails a receipt. Checkout already knows the buyer's email (the service passes the account's
address), so nothing is typed twice. The shop page tells buyers the receipt comes from Stripe.

## Step 6 · Going live

1. **Activate** the account (the banner in the dashboard: business details, bank account for
   payouts, identity). Stripe reviews it, usually within a day.
2. Switch the dashboard to **live mode**. Test-mode products do not carry over: open each
   product in test mode and use **Copy to live mode**, or create them again. Copy the live
   `price_…` ids.
3. **Developers → API keys** in live mode: the live secret key `sk_live_…`.
4. Add the webhook endpoint again in live mode (Step 3) and take its live `whsec_…`.
5. Replace the four secrets on the Worker with the live values:

   ```sh
   npx wrangler@4 secret put STRIPE_SECRET_KEY
   npx wrangler@4 secret put STRIPE_WEBHOOK_SECRET
   npx wrangler@4 secret put STRIPE_PRICE_DRAWDRAW_PRO
   npx wrangler@4 secret put STRIPE_PRICE_STUDIO_SUPPORTER
   ```

   Secrets take effect on the next request; no redeploy needed.
6. Buy something with a real card, check it lands on the account, then refund it from the
   dashboard. That is your live test.

Keep `server/.dev.vars` on test keys forever. Live keys never belong on a laptop.

## Refunds, disputes and revoking

- **Refund** from the dashboard (Payments → the payment → Refund). The service does not watch
  refund events, so the entitlement stays until you remove it:

  ```sh
  npx wrangler@4 kv key get --binding STORE "ent:google:123456789012345678901"
  npx wrangler@4 kv key delete --binding STORE "ent:google:123456789012345678901"
  ```

  The user id is on the payment in Stripe under **Metadata → user** (the service writes
  `user` and `product` on every Checkout session and its payment intent, so a payment is
  always traceable to an account). Deleting the key removes every entitlement for that user;
  to remove one, `kv key get`, edit the JSON, `kv key put`.
- **Disputes** (chargebacks) are handled in the dashboard; Stripe emails you. Respond with the
  order details and, for a digital unlock, the sign-in records.
- **Tax**: Stripe Tax can be switched on per Checkout session (`automatic_tax[enabled]=true`
  in the session parameters in `server/worker.js`) once you have registrations set up in
  **Settings → Tax**. Off by default.

## Troubleshooting

- **The shop says "Nothing is for sale yet".** `STRIPE_SECRET_KEY` is not set, or no
  `STRIPE_PRICE_*` variable matches a product in `server/catalogue.js`. `/api/health` lists
  the products it found under `products`.
- **A product shows "Price at checkout" instead of an amount.** The price lookup failed: the
  price id is from the other mode (test vs live), or was typed wrong. `npm run tail` shows
  `Could not read Stripe price …`.
- **Buy gives "Could not start the checkout".** Usually the same key/mode mismatch; the message
  carries Stripe's reason.
- **Paid, but nothing granted.** Check the webhook deliveries. No deliveries at all: the
  endpoint URL is wrong or in the other mode. `400 bad_signature`: wrong `STRIPE_WEBHOOK_SECRET`
  (the CLI's `whsec_` only works with `stripe listen`; the dashboard endpoint has its own).
  `duplicate: true`: Stripe retried an event already handled; harmless.
- **Buy says "Your account already has this".** The entitlement is already on the account;
  the shop shows it as **Yours** after a reload.
