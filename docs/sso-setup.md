# Tutorial 1 · Sign-in (SSO) for the studio and the DrawDraw app

One Google account signs in to Portrait Value Studio on the web and to the DrawDraw app, and
both see the same purchases. This tutorial takes you from nothing to a working sign-in on a
real domain. Budget about an hour the first time; the local run at the start takes ten minutes
and proves everything before you touch a domain.

## What you are setting up

```
 browser (studio)  ──cookie──▶ ┌──────────────────────────┐ ◀──bearer token── DrawDraw app
                               │  account service  /api/* │
 Google sign-in ◀──────────────│  (server/worker.js)      │────────▶ Stripe (tutorial 2)
                               │  users · entitlements ·  │
                               │  orders  in Cloudflare KV│
                               └──────────────────────────┘
```

- **The service** is `server/worker.js`: a Cloudflare Worker with no dependencies. It runs the
  Google sign-in itself, so neither the web page nor the app ever holds a Google secret, and it
  issues its own sessions: an HttpOnly cookie for the web page, a bearer token for the app.
- **The web site** (this repository's `index.html` and friends) is served by the same Worker from
  the same origin, so `/api` is first-party and needs no CORS.
- **The app** opens the system browser on `/api/auth/google/start?client=app` and gets a
  one-time code back on its own URL scheme (`drawdraw://auth`), protected by PKCE. Its side of
  the set-up is `drawdraw/docs/ACCOUNT_SETUP.md`.
- **Hosting**: Cloudflare, because one `wrangler deploy` ships the site and the service
  together and the free tier covers this comfortably. Google is the identity provider either
  way. If you would rather run on Google Cloud, see *Hosting on Google instead* at the end:
  the code is portable, the storage adapter is the one piece to write.

## You will need

- A Google account, for the Google Cloud console (free; no billing account needed for OAuth).
- A Cloudflare account (free plan is enough) and, for the real thing, a domain. The domain can
  stay at its current registrar; Cloudflare only needs to serve DNS for it, or you can use a
  `*.workers.dev` address to start.
- Node 22 or newer on your computer. Nothing to install in the repository: the tests and the
  local server are plain Node, and `wrangler` is fetched on demand by `npx`.

## Step 1 · Run it on your computer (10 minutes)

1. In the `art-project` folder, copy the example configuration and open it:

   ```sh
   cp server/.dev.vars.example server/.dev.vars
   ```

2. Make a session secret and paste it in as `SESSION_SECRET`:

   ```sh
   openssl rand -base64 48
   ```

3. Create a Google OAuth client (Step 2 below, it takes five minutes) with the redirect URI
   `http://localhost:8000/api/auth/google/callback`, and paste its id and secret in as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

4. Start it:

   ```sh
   node server/dev.mjs
   ```

   It prints what is configured. Open <http://localhost:8000>: the studio now has a **Shop**
   link and a **Sign in** button at the top right. (They only appear when `/api` answers; the
   same folder served by `python3 -m http.server` shows neither.)

5. Click **Sign in**, choose your Google account, and you are back on the studio with your
   avatar in the top bar. Open <http://localhost:8000/api/health> to see the same thing the
   service sees: `"store": true, "google": true`.

6. Run the tests whenever you change the service:

   ```sh
   npm test
   ```

Local accounts live in `server/.dev-store.json` (ignored by git); delete it to start over.

## Step 2 · Google: the OAuth client

Everything here is in the [Google Cloud console](https://console.cloud.google.com/).

1. **Create a project** (top bar → project picker → New project), e.g. `portrait-studio`.
2. **APIs & Services → OAuth consent screen** (Google now calls this *Google Auth Platform →
   Branding / Audience*).
   - User type **External**.
   - App name, support email, developer contact email. A logo is optional; adding one triggers
     a brand review that can take a few days, so leave it out at first.
   - Scopes: none to add. The service asks only for `openid email profile`, which are not
     sensitive, so there is no verification step for them.
   - Audience: while the app is in **Testing**, only the test users you list can sign in
     (up to 100). Add yourself. When you are ready for the public, press **Publish app**;
     with only these scopes it is immediate.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type **Web application** (one web client serves both the site and the app,
     because the app's sign-in runs through the service; you do not need iOS or Android
     client IDs).
   - Name: `account service`.
   - **Authorized redirect URIs**, one per line:
     - `http://localhost:8000/api/auth/google/callback` (for Step 1)
     - `https://YOUR-DOMAIN/api/auth/google/callback` (add it when you have the domain, Step 4)
     - the `https://….workers.dev/api/auth/google/callback` address if you use one in Step 3
   - **Authorized JavaScript origins** can stay empty; the page never calls Google directly.
4. Copy the **Client ID** and **Client secret**. The secret is shown once; if you lose it,
   make a new one from the client's page.

## Step 3 · Cloudflare: deploy the site and the service

All commands run in the `art-project` folder.

1. Sign in once (opens a browser):

   ```sh
   npx wrangler@4 login
   ```

2. Create the key-value store the service keeps users, entitlements and orders in:

   ```sh
   npx wrangler@4 kv namespace create STORE
   ```

   It prints an `id`. Paste it into `wrangler.jsonc` in place of
   `REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

3. Set the secrets. Each command prompts for the value and stores it encrypted; nothing goes
   in the repository:

   ```sh
   npx wrangler@4 secret put SESSION_SECRET        # a fresh `openssl rand -base64 48`, not the local one
   npx wrangler@4 secret put GOOGLE_CLIENT_ID
   npx wrangler@4 secret put GOOGLE_CLIENT_SECRET
   ```

4. Deploy:

   ```sh
   npm run deploy
   ```

   The first deploy prints a `https://portrait-value-studio.<you>.workers.dev` address. Open
   `/api/health` on it: `"store": true, "google": true`. (The `*.workers.dev` address can be
   turned off later under the Worker's **Settings → Domains & Routes** once your domain is on.)

5. Sign-in on that address needs its callback registered with Google: add
   `https://portrait-value-studio.<you>.workers.dev/api/auth/google/callback` to the OAuth
   client's redirect URIs (Step 2.3). Then **Sign in** on the site works end to end.

What `wrangler.jsonc` does: `assets.directory: "."` uploads this folder as the static site
(minus everything in `.assetsignore`: the server source, docs, README, git), and
`run_worker_first: ["/api/*"]` sends only `/api` requests to the Worker. Everything else is
served as plain files, exactly as before.

## Step 4 · Your domain

1. In the Cloudflare dashboard, **Add a domain** (free plan). Cloudflare gives you two
   nameservers to set at your registrar; DNS moves to Cloudflare, nothing else changes.
   If you bought the domain through Cloudflare Registrar, this is already done.
2. **Workers & Pages → portrait-value-studio → Settings → Domains & Routes → Add → Custom
   domain**, enter `studio.example.com` (or the bare domain). Cloudflare creates the DNS
   record and the certificate; it is live within a minute or two.
3. In `wrangler.jsonc`, set `"PUBLIC_ORIGIN": "https://studio.example.com"` and deploy again.
   The service builds Google's redirect URI and Stripe's return URLs from it.
4. Add `https://studio.example.com/api/auth/google/callback` to the OAuth client (Step 2.3).
5. Sign in on the domain. Done: the session cookie is `Secure`, `HttpOnly`, `SameSite=Lax`,
   valid for `SESSION_DAYS` (30 by default).

## Step 5 · The DrawDraw app

Follow `drawdraw/docs/ACCOUNT_SETUP.md`. In short: build the app with
`EXPO_PUBLIC_ACCOUNT_API_BASE=https://studio.example.com/api`, and keep
`APP_REDIRECT_SCHEMES` in `wrangler.jsonc` at `drawdraw` for production (add `exp` while you
test in Expo Go). The app's **Sign in with Google** on the paywall then goes through the same
service, and the same account.

## Checks that it is all working

- `https://studio.example.com/api/health` → `{"ok":true,"store":true,"google":true,…}`.
- Sign in on the web; the avatar menu shows your name and email; **Sign out** clears it.
- Sign in in the app with the same Google account; the paywall shows **Signed in as** the
  same email. After tutorial 2, a Pro bought on the web appears in the app on
  **Restore purchase**.
- `npm run tail` streams the Worker's logs while you try things; sign-in failures are logged
  with their reason.

## Day to day

- **Signing everyone out**: change `SESSION_SECRET` (`npx wrangler@4 secret put SESSION_SECRET`).
  Every cookie and app token becomes invalid at once; accounts and purchases are untouched.
- **Looking at the data**: `npx wrangler@4 kv key list --binding STORE` lists keys
  (`user:google:…`, `ent:google:…`, `order:google:…`); `kv key get` reads one. The dashboard
  (Storage & Databases → KV) shows the same.
- **Deleting an account** (a GDPR request, say): delete that user's `user:`, `ent:` and
  `order:` keys. Their Google account is unaffected; signing in again makes a fresh record.
- **Abuse**: the service has no rate limits of its own. Cloudflare's **Security → WAF → Rate
  limiting rules** can cap `/api/auth/*` per IP (the free plan includes one rule); that keys
  on the client IP Cloudflare sees, which the client cannot choose.
- **Sign in with Apple**: required by Apple before the app ships with Google sign-in
  (guideline 4.8). The service's provider code is `server/google.js`; an Apple provider is
  the same shape (authorization URL, code exchange, id_token check against Apple's keys)
  plus the routes. Not written yet.

## Hosting on Google instead

The service uses web-standard APIs only, so it runs anywhere `fetch`, `Request`, `Response`
and `crypto.subtle` exist. `server/dev.mjs` is already a Node server for it. To run on Google
Cloud you would:

1. Replace `MemoryStore` in `dev.mjs` with a Firestore-backed object exposing the same four
   methods (`get`, `put`, `delete`, `list` by prefix; see `server/store.js`). About forty lines
   with `@google-cloud/firestore`.
2. Put `node server/dev.mjs` in a container and deploy it to **Cloud Run** with the secrets in
   **Secret Manager** and `PUBLIC_ORIGIN` set; map your domain to the service (Cloud Run →
   Domain mappings) or put **Firebase Hosting** in front with a rewrite of `/api/**` to the
   Cloud Run service and the static files on Hosting.
3. Register the same `/api/auth/google/callback` redirect URI; the Google side is identical.

Cloudflare is the path this repository is set up and tested for; the Google path is sketched
here so you know the code does not lock you in.

## Troubleshooting

- **Google: `redirect_uri_mismatch`.** The callback URL the service sent does not match one
  registered on the OAuth client, character for character. It is `PUBLIC_ORIGIN` (or the
  request's origin when that is empty) plus `/api/auth/google/callback`. Add it in Step 2.3.
- **Google: `access_blocked` / "app has not completed verification".** The consent screen is
  in Testing and this account is not a test user, or the app is not published.
- **"This sign-in was started in another browser".** The 10-minute nonce cookie from
  `/start` was not sent back on the callback: the start and the callback hit different hosts
  (`www.` vs bare domain, or `localhost` vs `127.0.0.1`), or more than ten minutes passed.
  Use one host and keep `PUBLIC_ORIGIN` equal to it.
- **Signed in, but reloading shows Sign in again.** The cookie was set `Secure` on an `https`
  origin and the page is on `http`, or `PUBLIC_ORIGIN` points at a different host than the
  one in the address bar.
- **`503 not_configured`** on `/api/*`: `SESSION_SECRET` is missing or shorter than 32
  characters, or there is no `STORE` binding (the KV id in `wrangler.jsonc`).
- **The Sign in button never appears.** `/api/me` is not answering on this origin: the site is
  being served without the Worker. Check `wrangler.jsonc` has `run_worker_first: ["/api/*"]`
  and that you deployed from this folder.
