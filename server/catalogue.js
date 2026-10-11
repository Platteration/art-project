/* What the shop sells. Names, blurbs and what each purchase grants live here;
   the Stripe Price for each product comes from an environment variable, so the
   same code runs against Stripe's test and live modes and a product only shows
   in the shop once its price is configured.

   To add a product: add an entry here, create a Product + Price in the Stripe
   dashboard, and set `STRIPE_PRICE_<ID in upper snake case>` (see docs/shop.md).

   - `grants`: entitlement keys written to the buyer's account on payment. The
     apps read these: DrawDraw unlocks Pro on `drawdraw.pro`.
   - `physical`: collects a shipping address at checkout; nothing is granted
     automatically, the order is yours to fulfil (see /api/shop/orders).
*/

export const CATALOGUE = [
  {
    id: 'drawdraw-pro',
    name: 'DrawDraw Pro',
    blurb:
      'The full construction head, proportion packs for child, infant and stylized heads, turnaround sheets and the step-by-step lessons, in the DrawDraw app. One payment, not a subscription.',
    grants: ['drawdraw.pro'],
  },
  {
    id: 'studio-supporter',
    name: 'Studio supporter',
    blurb:
      'Keep Portrait Value Studio free for everyone. A one-time thank-you that puts a supporter mark on your account; it unlocks nothing, because nothing here is locked.',
    grants: ['studio.supporter'],
  },
];

export function priceEnvName(productId) {
  return `STRIPE_PRICE_${productId.replace(/-/g, '_').toUpperCase()}`;
}

/** The products that have a Stripe price configured, with that price id attached. */
export function availableProducts(env) {
  return CATALOGUE.flatMap((p) => {
    const priceId = env[priceEnvName(p.id)];
    return priceId ? [{ ...p, priceId }] : [];
  });
}

export function findProduct(env, id) {
  return availableProducts(env).find((p) => p.id === id) || null;
}
