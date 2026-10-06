<!-- Produced on 2026-10-06 by a multi-agent audit: nine independent finders (DOM sinks, saved state,
     third-party code, headers and hosting, launch hygiene, runtime robustness, privacy, CSP compatibility,
     repository hygiene), a merge pass, three adversarial verifiers per finding against the original commit
     b86e250, and a synthesis that re-read every cited line of the hardened commit bc71eaa. The follow-up
     section at the end records what changed after the synthesis, in the commit that adds this file. -->

# Portrait Value Studio — Final Security and Launch Audit

Repository `/home/user/art-project`, branch `ccr-5d19c3bc-ib2kos`. Pre-audit code: commit `b86e250`. Hardened code: commit `bc71eaa` ("Launch hardening"), 32 files, +860/−72. Working tree is clean (`git status --short` empty), so "working tree" and HEAD are identical below; "original" means `b86e250`. Every line number was re-read from the files during this report.

## 1. Summary

The original site was a clean, dependency-free static app with no XSS sink that received user input, no network calls and no secrets in history, but it shipped with nothing around it: Google Fonts sent every visitor's IP, User-Agent and page URL to a third party while the page said "nothing is uploaded"; there was no Content Security Policy, no hosting config, no 404 page, no favicon, no fallback for JavaScript off or a failed script, and any wrongly-typed value in localStorage could throw during start-up and leave a blank Study tab. The dev-server line in the README (`python3 -m http.server`) served `.git/` and directory listings to the whole network.

The hardening commit addresses all of that: a strict CSP (no `unsafe-inline`, no eval, Trusted Types enforced) as a `<meta>` and as a header in `_headers`, `.htaccess` and `deploy/nginx.conf`; self-hosted OFL fonts (zero third-party requests); HTTPS redirect, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP and cache rules; dotfile/README/`deploy/` refused and listings off on Apache and nginx, `_redirects` for Netlify; a styled `404.html` for wrong URLs and bare folders; `js/guard.js` for no-JS, old-browser, failed-load and runtime-error states; shape- and range-validated saved state everywhere, with a two-tap "Forget my work on this device" button. The 24 `innerHTML` sites are gone (20 `replaceChildren()`, 4 rebuilt with `createElement`), and the five inline `style=` attributes moved to CSS.

What remains for the owner is (a) a short list of real but non-blocking robustness items (busy indicator before the first heavy compute, huge-photo guard, startup chain isolation, cache-busting), (b) decisions no auditor can make (a LICENSE and copyright holder, a security contact, frame-ancestors policy, the sub-path 404 question, how best scores are keyed, origin choice), and (c) the deploy itself: publish an export of the runtime files, never the checkout, then run the launch checklist in section 7. The commit exists only on this branch and is not tagged; merging/pushing it to whatever branch the host builds is the first owner step.

## 2. Findings

| ID | Severity | Title | Status | Where |
| --- | --- | --- | --- | --- |
| F01 | High | Hardening existed only as uncommitted changes | **Fixed** (committed as `bc71eaa`; not tagged, not yet on the deploy branch) | `git log -1` |
| F03 | Medium | Photo load freezes the page before "Updating…" appears | Not fixed | `js/app.js:372-379` |
| F02 | Low | Self-hosted fonts lacked CORS for sandboxed embeds | Fixed | `_headers:19-21`, `.htaccess:42-45`, `deploy/nginx.conf:16-19,70` |
| F04 | Low | No size cap / async decode for very large photos | Not fixed | `js/app.js:438-460` |
| F05 | Low | No LICENSE or copyright holder for the app's own code | Owner decision | `README.md:254` |
| F06 | Low | Deploy directory is the git checkout; `.git/` served by hosts that ignore the configs | Owner decision (mitigated in configs) | `.htaccess:23`, `deploy/nginx.conf:52`, `README.md:155-156` |
| F07 | Low | Directory listings on hosts with autoindex on | Fixed (Apache/nginx/Netlify/CF/GH Pages); residual on unconfigured hosts | `.htaccess:4,7-8`, `deploy/nginx.conf:43,47-49,57` |
| F09 | Low | Start-up is one unisolated chain; a throw in app.js degrades four tabs | Not fixed (partly mitigated) | `js/app.js:2549,2570-2594`; `js/game.js:1614`; `js/painting.js:733,742`; `js/battle.js:444`; `js/loomis.js:313,475,480` |
| F10 | Low | `404.html` is root-absolute and depends on `/styles.css`; unstyled under a sub-path | Owner decision | `404.html:11-14,21-22`; `README.md:175` |
| F11 | Low | Unversioned asset names; freshness depends on `Cache-Control: no-cache` | Not fixed (mitigated by headers) | `index.html:19-20,1118-1127`; `404.html:14` |
| F12 | Low | Game best-score keys embed the photo's file name, kept forever | Owner decision (disclosed; code unchanged) | `js/app.js:2559`; `js/game.js:287,1249-1251` |
| F13 | Low | Studio autosaves to IndexedDB on every stroke with no first-use notice or opt-out | Not fixed (disclosed in Help) | `js/painting.js:393-396,408-428,429` |
| F18 | Low | No SECURITY.md / `.well-known/security.txt` / any contact route | Owner decision | repo root |
| F19 | Low | No `.gitattributes` | Fixed | `.gitattributes:1-8` |
| F20 | Low | No web manifest, og:image, canonical, sitemap | Not fixed (needs public URL) | `index.html:8-18` |
| F08 | Info | README/configs served as pages on Netlify/CF Pages/GH Pages | Fixed (Netlify); documented residual on CF Pages/GH Pages | `_redirects:3-8`; `README.md:156` |
| F14 | Info | Sizeless SVG became a 1×1 study | Fixed | `js/app.js:447-452` |
| F15 | Info | `img-src data:` was load-bearing only for the save preview | Fixed (blob: preview, `data:` removed) | `js/app.js:194-197,210` |
| F16 | Info | Twenty `innerHTML = ''` clears blocked Trusted Types | Fixed (20× `replaceChildren()`, TT enforced) | `index.html:6`; all five CSP copies |
| F17 | Info | `frame-ancestors` intentionally open | Owner decision (documented) | `_headers:4-6`; `.htaccess:34`; `deploy/nginx.conf:60-62`; `README.md:173` |
| F21 | Info | `paintChoice.source/preset/max` not whitelisted | Fixed | `js/palette.js:60-64` |
| F22 | Info | Referrer-Policy could be `no-referrer` | Owner decision | `index.html:9` + 4 configs |
| F23 | Info | `.gitignore` gaps | Fixed | `.gitignore:15-18` |
| F24 | Info | No `.editorconfig` | Fixed | `.editorconfig` |
| F25 | Info | Script dependency order undocumented | Fixed | `index.html:1116-1117` |
| F26 | Info | All processing on the main thread | Not fixed (design) | `js/processing.js:650+`; `js/app.js:267-269` |
| F27 | Info | Fonts immutable for a year under unversioned names | Not fixed (documented convention) | `_headers:17-20` |
| F28 | Info | Help screenshots 2.0 MB baseline JPEG | Not fixed | `img/help/` |
| F29 | Info | IBM Plex Mono 600/700 synthesised (only 400/500 shipped) | Not fixed (pre-existing) | `styles.css:21-49`; 19 rules; `js/app.js:1071,1476` |
| F39 | Info | spectral.js MIT notice would be stripped by a minifier | Not fixed (one-character hedge) | `js/mixing.js:27` |
| F40 | Info | OFL fonts redistributed correctly; RFN technicality | Verified clean | `fonts/LICENSE-*.txt` |
| F42 | Info | External links only in README; link rot possible | Not fixed (manual check) | `README.md:251,256` |
| F43 | Info | Storage namespace shared with anything on the same origin | Owner decision | `js/app.js:953-957`; all `portrait-value-studio.` keys |

Resolved-and-verified items from the hardening pass (F30–F38, F41) are listed in section 5b.

## 3. Details

### F01 — The hardening pass was uncommitted (High → Fixed)
**Was:** at audit time every fix lived only in the working tree; `b86e250` (then HEAD) still loaded `fonts.googleapis.com` (`git show b86e250:index.html` lines 7–9), had no CSP, 404 page, guard, favicon or storage validation, and its root tree was just `README.md img index.html js styles.css`. Any git-driven host would have published that.
**Now:** `bc71eaa` contains the whole pass in one commit (32 files incl. `fonts/`, `js/guard.js`, `_redirects`, `.editorconfig`, `.gitattributes`), and `git status` is clean, so the partial-commit hazard (CSS referencing `fonts/*.woff2` without the files) cannot occur.
**Leftover:** no tag exists (`git tag` is empty) and the commit is on `ccr-5d19c3bc-ib2kos`, not necessarily the branch the host builds. Merge/push it, tag it, and deploy from the tag. The README still does not say "deploy only from a clean, tagged tree; `fonts/` and `js/guard.js` are required runtime assets".

### F03 — Photo load freezes before the busy indicator (Medium, not fixed)
**Was and is:** `prepareAndRun()` (`js/app.js:372-379`) runs `Study.prepare()` (full `drawImage` + per-pixel Lab loop, `js/processing.js:72-90`), then `autoSplit()` (edge-aware blur), and only then `runSoon(0)`; `els.busy.hidden = false` first happens inside `runSoon` (`js/app.js:262`). Called synchronously from the file input, drop (`:539`), paste (`:542`) and the Working-size select. Measured by the runtime auditor: ~0.5 s unindicated at the default 900 px on desktop, ~1.3 s at 1400 px; phones 3–5× slower.
**Why it matters:** this is a "raw browser state instead of a GUI" moment; visitors tap again or think it broke.
**Fix for the owner:** set `els.busy.hidden = false` first, null `state.prep`, and defer the body with a double `requestAnimationFrame`; keep a job token so a second load drops the first. Do **not** reach for a Web Worker without revisiting the CSP: `trusted-types 'none'` (all five copies) makes `new Worker(url)` throw in Chromium because the URL must be a `TrustedScriptURL`.

### F02 — Font CORS for sandboxed embeds (Low → Fixed)
**Was:** self-hosting removed Google's `Access-Control-Allow-Origin: *`; @font-face loads are CORS-mode, so an `<iframe sandbox="allow-scripts">` (opaque origin) lost every font (headless test: 0 of 4 loaded).
**Now:** `_headers:19-21` (`/fonts/*` → `Access-Control-Allow-Origin: *`), `.htaccess:42-45` (`<FilesMatch "\.woff2$">`), `deploy/nginx.conf:16-19` map + `:70` (`add_header ... $pvs_font_cors always`; nginx drops the header when the value is empty, so only `/fonts/` gets it). Re-test: 4 fonts loaded in the opaque-origin sandbox.
**Leftover:** GitHub Pages already sends ACAO `*`; nothing to do there. The README checklist (`README.md:190`) says "try it once inside an iframe" but does not mention the sandboxed case specifically.

### F04 — No upper bound on photo size (Low, not fixed)
**Is:** `readImage()` (`js/app.js:438-460`) rejects non-images and, since the pass, images under 16 px (`:447-452`), but has no `file.size`/megapixel check, no `img.decode()`, no `createImageBitmap(file, { resizeWidth })`; `prepare()` then draws the full-resolution element (`js/processing.js:86`). The only pixel cap in the app is the 16384 guard on the restored Studio painting (`js/painting.js:414`).
**Why:** a 50 MP JPEG decodes to ~200 MB before downsampling; iOS Safari may jettison the tab with no message.
**Fix:** check `naturalWidth * naturalHeight` in `onload` (bytes are a poor proxy), toast "very large photo, reducing it", and use `createImageBitmap` with `imageOrientation: 'from-image'` behind a try/catch fallback to the `<img>` path (older Safari ignored EXIF orientation there, which would rotate portraits). `await img.decode()` alone moves the decode off the click handler.

### F05 — No LICENSE (Low, owner decision)
`ls LICENSE* COPYING*` finds nothing; `README.md:254` still says "The app's own code has no license file yet. Add one before publishing the source." No author/copyright appears in `index.html` or `404.html`; all 53 commits are authored `Claude <noreply@anthropic.com>`. Default is all-rights-reserved while the app is explicitly built for embedding and the remote (`github.com/Platteration/art-project`) may be public. The owner must choose the license and the name/pseudonym; do not pick MIT "because spectral.js is MIT" (that notice only obliges keeping itself). A root `LICENSE` is served by the configs (not in any deny list), which is what a license needs.

### F06 — The checkout is the publish directory (Low, owner decision)
`.git/` (3.7 MB, remote URL to the GitHub handle) sits beside `index.html`. The pass does what files can: `.htaccess:23` `RewriteRule (^|/)\.(?!well-known/) - [R=404,L]`, `deploy/nginx.conf:52` `location ~ /\.(?!well-known/) { return 404; }`, `README.md:144-146` (dev server now `--bind 127.0.0.1` and marked never-publish), `README.md:155-156` ("Publish only the runtime files… Never point a web server at a git checkout"), checklist curl for `/.git/HEAD` (`README.md:184`). History is clean, so today's exposure is source + handle, but `/.git/HEAD` is among the most probed paths and is literally "the back end instead of the GUI".
**Owner action:** deploy an export, not the checkout. Cleanest: add `export-ignore` lines to `.gitattributes` for `README.md`, `deploy/`, dotfiles, `fonts/README.md`, so `git archive HEAD | tar -x -C /var/www/...` emits exactly the runtime set; keep the host config the target needs (`.htaccess` for Apache, `_headers`/`_redirects` for Netlify). Minor: `_redirects` itself is not in the Apache (`.htaccess:25`) or nginx (`:54`) deny lists; harmless but inconsistent.

### F07 — Directory listings (Low → Fixed where configurable)
Original README's `python3 -m http.server 8000` returned `200 "Directory listing for /js/"`. Now: `Options -Indexes` + `ErrorDocument 404/403 /404.html` (`.htaccess:4,7-8`); `autoindex off`, `error_page 404 /404.html`, `error_page 403 =404 /404.html`, `try_files $uri $uri/ =404` (`deploy/nginx.conf:43,47-49,57`); Netlify/CF Pages/GitHub Pages/Vercel 404 bare directories natively. Checklist greps `/js/` for "Page not found" (`README.md:187`, matching `404.html:10`).
**Leftover:** on Apache the status for `/js/` stays 403 with the 404 body (ErrorDocument does not change the code); either document that or add `RewriteRule ^(js|img|fonts)/?$ - [R=404,L]`. Optional belt-and-braces: a stub `index.html` in `js/`, `img/`, `img/help/`, `fonts/` using `<meta http-equiv="refresh" content="0;url=../">` (relative, script-free, so CSP- and sub-path-safe).

### F09 — Unisolated start-up chain (Low, not fixed)
`window.Studio` is assigned at `js/app.js:2549` after ~2,500 lines of synchronous wiring; dependent modules dereference it unguarded at module top level: `js/game.js:1614`, `js/painting.js:733`, `js/battle.js:444`, `js/loomis.js:480`; only `js/palette.js:430` guards. Worse, `js/painting.js:733` runs before `window.PaintStudio = …` at `:742`, so an app.js throw also leaves `PaintStudio` undefined and `js/loomis.js:313,475` (`PaintStudio.pin(root)`) throws on every Loomis layout. Mitigations in the pass: `guard.js:76-84` adds `load-failed` (standing note, `styles.css:1668`) for a failed `<script>`/stylesheet; `safely()` (`js/app.js:2570-2572`) wraps `restoreDrawers/restoreSmoothing/renderPalette/loadCanvasSize`. Not wrapped: `setMode`, `updateToolbar`, `updateOutputs`, `prepareAndRun`, hash routing. A runtime throw only yields the 6 s toast (`guard.js:61`).
**Fix:** `if (!window.Studio) { StudioGuard.report(...); return; }` at the top of each dependent IIFE; move `window.PaintStudio` above `:733`; do not wrap the non-storage steps in the same `safely()` since it reports `{ saved: true }` and offers the data-destroying reset (`guard.js:66-70`). Trap: `index.html:2` ships `class="no-js"` and only `guard.js:9` removes it, so if `js/guard.js` alone fails to load, the app runs but CSS hides every control under a note saying it has not started; have `start()` also remove `no-js`.

### F10 — 404.html under a sub-path (Low, owner decision)
`404.html:11-14` link `/favicon.ico`, `/favicon.svg`, `/apple-touch-icon.png`, `/styles.css`; `:21-22` link `/`, `/#paint` … `/#help` (ten root-absolute references, not the "four" `README.md:175` says). Its meta CSP (`:6`) is `style-src 'self'` with no inline styles, so on `user.github.io/art-project/` it renders unstyled with a button that leaves the site. At a domain root all of this works, and it is far better than the host's stock error page the original had. Relative paths cannot fix it (Apache/nginx `error_page` serve it at the requested URL), and `<base href>` is blocked by `base-uri 'none'` in both the meta and the header CSPs.
**If a sub-path deploy is chosen:** inline the ~6 rules from `styles.css:1658-1663` plus the theme tokens in a `<style>` allowed by `style-src 'sha256-…'` in **both** the page meta and the header CSPs (`.htaccess:35-36` applies to every `.html`), drop the icon links, and prefix the anchors at deploy time. Fix the "four links" wording either way.

### F11 — No cache-busting (Low, mitigated)
Bare `styles.css`, `js/guard.js` (`index.html:19-20`), ten `js/*.js` (`:1118-1127`), `/styles.css` (`404.html:14`); `grep '?v='` empty. Modules are load-order coupled (F09), so one stale script among eleven breaks boot. Mitigation: `Cache-Control: no-cache` for HTML/CSS/JS in `_headers:15`, `.htaccess:35-41`, `deploy/nginx.conf:7-8`, explained at `README.md:171`. Residual: GitHub Pages (fixed `max-age=600`) and any CDN that ignores origin headers. If adding `?v=<short sha>`, rewrite all twelve references including `js/guard.js`, and only switch CSS/JS to `immutable` once the bump is automated; a Cloudflare "ignore query string" rule defeats `?v=` entirely.

### F12 — Best scores keyed by photo file name (Low, owner decision)
`js/app.js:2559` `sourceKey: () => \`${state.baseName}:${w}x${h}\``, `baseName` from `file.name` (`:463`); `js/game.js:287` builds `bestKey` from it and `:1249-1251` persists under `portrait-value-studio.gameBest` with no pruning. On a shared machine `mum-chemo-2024:1200x1600|medium|zorn` sits in localStorage indefinitely (readable only via devtools). Battle is **not** affected: `js/battle.js:167` keys by `paletteId:count:mode`. The pass disclosed it (`README.md:199`, Help `index.html:1063-1065`) and the Forget button clears it. If changing: add a separate `sourceId` (hash of a 32×32 downsample) rather than replacing `baseName`, which is also the download file name (`js/app.js:599`) and the "Painting from <name>" label (`js/game.js:308`); `${w}x${h}` alone would merge bests across same-camera photos; cap `gameBest` to ~50 keys.

### F13 — Silent Studio autosave (Low, not fixed)
`saveSoon()` (`js/painting.js:393`) fires from stroke end, undo, clear, rotate and ground/wash changes; `pagehide` (`:429`) saves synchronously; `restore()` (`:408-428`) runs unconditionally and toasts "Your painting is back from last time" (`:730`). The reference photo is never stored. Disclosure exists in Help (`index.html:1058,1063-1065`) and README (`:192-200`); the forget race is closed (`:719` sets `forgetting`, read at `:393-396`). The next user on a classroom machine still sees the previous user's traced portrait. Cheapest fix: a one-time toast on first Studio open and a mention of Forget in the Clear-the-paper confirmation. An opt-out toggle must not do `hasDb = false` (`const` at `:372`); persist a `keep` flag under the prefix and reuse the `forgetting` path.

### F18 — No security contact (Low, owner decision)
No `SECURITY.md`, no `.well-known/security.txt`, zero `<a>` elements in `index.html`, no mailto or repo link anywhere visible. Configs already exempt `/.well-known/` (`.htaccess:23`, `deploy/nginx.conf:52`). RFC 9116 needs a real `Contact:` and `Expires:` (≤ 1 year) that only the owner can supply; add `.well-known/` to the runtime-file list at `README.md:156` and a renewal reminder to the checklist. For an in-page link prefer plain text/mailto over `target="_blank"` (silently does nothing in a sandbox without `allow-popups`).

### F19 — `.gitattributes` (Low → Fixed)
Present with `* text=auto eol=lf`, `*.jpg/*.jpeg/*.png/*.ico/*.woff2 binary`, `*.svg text`, `fonts/* linguist-vendored`. Index is LF-normalised. **Leftover:** `fonts/LICENSE-ibm-plex.txt` still has 93 CR bytes on disk (index copy is LF); `git checkout -- fonts/LICENSE-ibm-plex.txt` once, or add `fonts/LICENSE-*.txt -text` if byte-identity with IBM's release matters. Consider `*.webp *.gif *.ttf *.otf binary` for future assets.

### F20 — Share/install metadata (Low, needs public URL)
`index.html:8-18` has description, referrer, theme-color ×2, og:type/title/description, `twitter:card summary`, three icon links. Absent: manifest, og:image/og:url, canonical, sitemap, `apple-mobile-web-app-*`. When adding a manifest, add `manifest-src 'self'` to **all four** CSP copies (`default-src 'none'` blocks it) and the README table; avoid `display: standalone` without extending `downloadsMayBeBlocked` (`js/app.js:177-186`) with `matchMedia('(display-mode: standalone)')`, since iOS standalone has historically failed silent on blob downloads and keeps separate storage from Safari. Apache needs `AddType application/manifest+json .webmanifest` in `.htaccess:10-14`. canonical/og:url/sitemap wait for the domain.

### F08 — Repo files served as pages (Info → Fixed where possible)
`_redirects:3-8` 404s `/README.md`, `/fonts/README.md`, `/deploy/*`, `/_headers`, `/_redirects`, `/.htaccess` on Netlify; `README.md:156` now scopes the claim correctly. Cloudflare Pages ignores 404 rules (stated at `_redirects:2`) and GitHub Pages cannot block `README.md`/`deploy/`; the only fix there is publishing an export (F06). Do **not** add `.nojekyll` on GitHub Pages: Jekyll currently drops `_headers`, `_redirects` and `.htaccess` for free. Minor: `_redirects` does not list `.gitignore`, `.gitattributes`, `.editorconfig`.

### F14 — Sizeless SVG (Info → Fixed)
`js/app.js:447-452` rejects images under 16 px with a 5 s toast; `:455-458` carries the HEIC hint. Security was already clean (file only ever becomes `new Image().src` as a `blob:` URL, `:445-459`; no parser sinks). `accept="image/*"` is correctly left alone (narrowing would hide HEIC on Safari).

### F15 — `img-src data:` (Info → Fixed)
`savePng` (`js/app.js:189-201`) now reuses the PNG blob: `saveImgUrl = URL.createObjectURL(blob); els.saveImg.src = saveImgUrl` (`:195-197`, revoke-before-reassign), revoked on the dialog's `close` (`:210`). `grep toDataURL` over `js/` is empty; all five CSP copies read `img-src 'self' blob:`.

### F16 — Trusted Types (Info → Fixed)
`grep innerHTML js/ index.html` = 0; 20 `replaceChildren()` calls; swatches/chips/paint dots built with `createElement` (e.g. `js/battle.js:243-255`). `require-trusted-types-for 'script'; trusted-types 'none'` is in `index.html:6`, `_headers:9`, `.htaccess:36`, `deploy/nginx.conf:63`, `README.md:164` (SHA-1 of all five policy strings identical: `541c1ba4`). Any future `innerHTML` string or dynamic `<script>`/Worker throws in Chromium rather than becoming an XSS sink; `README.md:164` says so.

### F17 — Open `frame-ancestors` (Info, owner decision)
The frame walk at `js/app.js:177-186` and the save-by-hand dialog exist precisely for sandboxed embeds. The omission is documented in `_headers:4-6`, `.htaccess:34`, `deploy/nginx.conf:60-62`, `README.md:173`, each with the append recipe and "do not add X-Frame-Options". Clickjacking targets are only the app's own controls, and both destructive ones are two-tap. Undocumented residual: storage is partitioned inside a cross-origin embed, so a painting saved there is not the one seen on the site; embedders need `allow="clipboard-write; web-share"` on their `<iframe>`. One Help/README line each would close it. Keep any future allow-list header-only (ignored in `<meta>`), and remember `'self' + hosts` breaks opaque-origin sandboxes.

### F21 — `paintChoice` whitelist (Info → Fixed)
`js/palette.js:62-64`: `source` forced to `preset|mine`, `preset` type-checked, `max` integer-clamped to 3–10 (matches `#paintMax`). An unknown `preset` id is tolerated by every consumer (`showPreset` `.find`, `presetName`, `current()`); optional one-liner to reset it against `Paints.PRESETS`.

### F22 — Referrer-Policy (Info, owner decision)
`strict-origin-when-cross-origin` in `index.html:9`, `_headers:11`, `.htaccess:30`, `deploy/nginx.conf:65`, `README.md:166`; `404.html` has no referrer meta. Zero cross-origin requests exist, so exposure is nil; `no-referrer` is a defensible preference for an origin whose name says "portrait". If switched, change all five together and add the meta to `404.html`.

### F23 / F24 / F25 — Repo hygiene (Info → Fixed)
`.gitignore:15-18` adds `*.bak *.orig .cache/ .claude/settings.local.json`; `.editorconfig` matches the codebase (2-space, LF, UTF-8); `index.html:1116-1117` documents the script dependency order. Caution on `.editorconfig`: `trim_trailing_whitespace`/`eol=lf` apply to `fonts/LICENSE-*.txt` and `deploy/nginx.conf` (4-space); add `[deploy/nginx.conf] indent_size = 4` and a `[fonts/LICENSE-*.txt]` exemption if those are ever edited. Do not move `js/guard.js` to `defer`: it must run before first paint (`guard.js:9`) and before the other tags are fetched (`:76-84`).

### F26 — Main-thread processing (Info, design)
`process()` (`js/processing.js:650+`) runs zone split, chamfer passes, merges, k-means and dominant colours synchronously; `run()` calls it after a 90 ms debounce with the busy indicator already shown (`js/app.js:261-269`). 150–700 ms per slider step at 900–1400 px. Time-slicing already exists (`js/app.js:317-321`, `js/game.js:379-383`). A Worker needs the Trusted Types change described under F03 and four async callers (`app.js:269`, `app.js:2246-2247`, `game.js:141-143`, `painting.js:453-454`); slicing `process()` at its stage boundaries is the lower-risk route.

### F27 — Immutable fonts (Info, convention)
`_headers:19-20`, `.htaccess:42-43`, `deploy/nginx.conf:9`: a year, `immutable`, under unhashed names. The rename-on-change rule is stated in `_headers:17`, `deploy/nginx.conf:6` and `fonts/README.md`; `styles.css` itself is `no-cache`, so a renamed file propagates on the next load. Standard practice; one verifier would refute it outright. No change recommended.

### F28 — Help screenshots (Info)
23 × 786×1520 baseline JPEG, 2,050,429 bytes, no EXIF, 472-byte ICC; all `loading="lazy"` (23 of 23), cached a week. Better than a codec change: add `width="786" height="1520"` to the tags to stop layout shift, and downscale sources to ~600 px (they render at ≤190 px). Do not rewrite history for 2.85 MiB of pack.

### F29 — Plex Mono faux bold (Info, pre-existing)
Shipped weights: 400 and 500 (`styles.css:21-49`); 15 rules use `600 … var(--mono)` and 4 use 700; canvas text at `js/app.js:1071,1476` asks for 600. Not a regression (the original Google Fonts URL requested `wght@400;500` too). Either ship 600 (+700 or collapse) latin + latin-ext woff2 with @font-face rules and a `fonts/README.md` row, or change the rules to 500. `document.fonts.ready` gates only `painting.js:734`; `makeCard`/`savePng` do not wait, but by export time fonts are long loaded.

### F39 — spectral.js notice (Info)
`js/mixing.js:27-54` is a complete MIT notice in a plain `/*` block, delivered to every browser via the classic `<script>` (`index.html:1119`). Change `/*` → `/*!` at `:27` so any future minifier keeps it; this matters more than it looks because the configs 404 `README.md`, making the comment the only copy that reaches "all copies". The earlier duplicate README credit is already gone (single credit at `README.md:251`).

### F40 — OFL redistribution (Info, verified clean)
`fonts/LICENSE-ibm-plex.txt:1` `Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"`; Bricolage license names its Project Authors; both full texts sit beside the eight woff2 files and remain servable (only `fonts/README.md` is 404'd). Subsets are technically Modified Versions under OFL §3; this is universal practice and the exposure is nil. Keep `LICENSE-*.txt` out of every deny list.

### F42 — External links (Info)
No `<a>` in `index.html`, no `target=`, `window.open` or `javascript:` anywhere; `404.html` anchors are same-origin. The eight outbound URLs are `README.md:251,256`, and the README is itself 404'd on the live site. Click them once before launch; the sandbox proxy blocked liveness checks. COOP `same-origin` already severs `window.opener`.

### F43 — Shared origin (Info, owner decision)
Every key is prefixed `portrait-value-studio.` and the DB is `portrait-value-studio` (`js/guard.js:20-21`), but localStorage/IndexedDB are per-origin: on `user.github.io/art-project/` every other project page can read the painting blobs and write values the validation now tolerates. `README.md` Publishing never mentions origin choice. Prefer a dedicated domain/subdomain; otherwise the validation + Forget button make the worst case a one-click recovery.

## 4. Decisions for the owner

1. **Which host config applies.** `_headers` + `_redirects` (Netlify; CF Pages reads `_headers` but ignores 404 redirects), `.htaccess` (Apache, needs `AllowOverride FileInfo Options` and mod_rewrite/mod_headers), `deploy/nginx.conf` (set `server_name`, `root`, cert paths at `:24,32,36,39-40`). GitHub Pages: only the meta CSP applies; enable "Enforce HTTPS"; no HSTS/COOP/nosniff/Permissions-Policy possible; README.md and deploy/ are public there.
2. **Publish an export, not the checkout** (F06). Decide between `git archive` with `export-ignore` attributes or a `site/` publish folder.
3. **frame-ancestors** (F17): keep open (current, documented) or append `; frame-ancestors 'self' https://…` to the three header configs only. Add the storage-partitioning and `allow=` notes to Help/README either way.
4. **LICENSE and copyright holder** (F05): choose the license and the name/pseudonym; then rewrite `README.md:254` and optionally add a one-line comment in `index.html`.
5. **Security contact** (F18): a real mailto/https for `.well-known/security.txt` and a short `SECURITY.md`; set `Expires:` within a year.
6. **Best-score keying** (F12): leave as disclosed, or add a content-hash `sourceId` and cap `gameBest`.
7. **404 under a sub-path** (F10): deploy at a domain root (current assumption) or make `404.html` self-contained with CSP hashes in page and headers.
8. **Dedicated origin** (F43) and **Referrer-Policy `no-referrer`** (F22): preferences; both low stakes.
9. **Public URL dependents** (F20): canonical, og:url/og:image, manifest (with `manifest-src 'self'` in four CSP copies), sitemap.

## 5. Refuted / not acted on

**5a. Partially refuted by verifiers (evidence stale against the current tree; substance recorded above):**
- F14 — the sizeless-SVG defect was already fixed at `js/app.js:447-452` when verified (1 of 3 refuted).
- F15 — `toDataURL` and `data:` were already gone when verified (1 of 3 refuted).
- F16 — `innerHTML` was already zero and Trusted Types already enforced when verified (1 of 3 refuted).
- F25 — the "no HTML comment" claim was false; `index.html:1116-1117` has it (1 of 3 refuted).
- F27 — one verifier refuted: immutable + rename-on-change is the standard, documented convention; both proposed fixes make things slightly worse.
- F08 — "no `_redirects` exists" and the README wording claim were stale; both already corrected.
- F39 — "README credits it twice / delete line 256" is wrong: `README.md:256` is the palette-sources list; do not delete it.
- F12 — the `battleBest` half is wrong: `js/battle.js:167` carries no file name.
- F02/F21/F23 — evidence described an intermediate snapshot; all three already applied in `bc71eaa`.

**5b. Resolved in `bc71eaa` and verified (not adversarially re-verified):**
- F30 Google Fonts removed; eight `@font-face` rules at `styles.css:4-66`, `font-display: swap`; the only external URL in any served file is the spectral.js credit comment (`js/mixing.js:31`).
- F31 Strict CSP shipped; `style="` count in `index.html` = 0 (colours at `styles.css:550-554`); no `innerHTML`, eval, inline handlers, `<style>`, `<base>`, `<form>`, `<iframe>`.
- F32 HTTPS redirect (`.htaccess:19-21`, `deploy/nginx.conf:21-26`), HSTS, nosniff + `AddType`, Permissions-Policy, COOP, Referrer-Policy, Cache-Control, `ServerSignature Off`/`server_tokens off`, 404 wiring; README Publishing section (`README.md:150-190`). Suggestion left open: add `web-share=(self)` to Permissions-Policy.
- F33 Shape-checking `load()` in `palette.js:44-54`, `game.js:83-92`, `battle.js:28`, `painting.js:26`; `readPalette` 0–255 integers (`app.js:921-930`); mode whitelist (`:2577`); `savedLevel` against `LEVELS` and null-safe `level()` (`game.js:284,1593`); `paintMixes` finite 0–100 (`painting.js:711`); IndexedDB record validation (`painting.js:408-428`); `restore().catch(report)` (`:717`); `safely()` (`app.js:2570-2572`). Open nit: `dbPut` lacks `onabort`, so a hung transaction could leave `saving` true for the visit.
- F34 guard.js: reset offered only for `{ saved: true }` (`guard.js:66-70`), two-tap honest label (`:45-57`), clickable (`styles.css:1675`), forget/autosave race closed (`guard.js:26`, `painting.js:719`), stylesheet-only link check (`guard.js:80`), standing `load-failed` note (`styles.css:1668`), old-browser note (`guard.js:13-14`, `index.html:23`), `openDialog()` fallback (`app.js:204-206`, `palette.js:430`), `<html class="no-js">` showing the guide only (`styles.css:1671-1673`).
- F35 `dragover` always `preventDefault` (`app.js:524`) with a URL-drop hint (`:533-536`); `toast(msg, ms)` (`:152`); null-blob toast (`:191`); `targetsFor` try/catch (`game.js:372-376`).
- F36 "Photos stay on your device. Nothing is uploaded." at `index.html:30`; Help "Your work stays on this device" + Forget (`:1063-1065`); README Privacy inventory (`:192-200`).
- F37 DOM sinks verified clean: file names reach the DOM only via `textContent`/`alt`/`download`; URL consumption is six strict `location.hash` comparisons (`app.js:2589-2594`); no `location.search`, `postMessage`, `window.name`, `document.referrer`.
- F38 Complete storage/exit inventory: 23 prefixed localStorage keys, one IndexedDB record (paper/sketch blobs, no photo), exits are PNG download (`app.js:163-171`), `navigator.share` on tap only (`game.js:1477-1478`), clipboard hex text; no cookies, sessionStorage, Service Worker.
- F41 Help screenshots show only the procedurally painted sample head; no EXIF/XMP/GPS in any of the 23 files.

**5c. Not acted on by design:** F26 (main-thread processing), F27 (immutable fonts), F29 (pre-existing synthetic bold), F42 (manual link check), F43 (origin is a hosting choice).

## 6. Verification performed

**By the developer (headless Chromium via Playwright against a Node static server applying `_headers`):** full drive of every tab (load photo, all drawers, Advanced mode, Loomis, Help, Studio stroke, Paint-by-numbers start, Value battle start + answer, Save PNG, all six hash routes) with 0 CSP/Trusted Types violations, 0 console errors, 0 failed requests — top-level, inside a same-origin sandboxed iframe (`allow-scripts allow-same-origin allow-modals`), and inside an opaque-origin sandbox (`allow-scripts allow-modals`: fonts load via CORS, save dialog opens with a blob preview); computed styles of the rebuilt swatches/chips/paint dots match the originals; corrupt-storage run (all 23 keys wrong-typed + malformed IndexedDB record) boots clean, every tab opens, a battle starts, Forget clears every key and the painting; JavaScript-off and blocked-script/blocked-stylesheet runs show the note and the guide; the two-tap reset in the safety-net toast is clickable and clears storage then reloads; dropping a URL does not navigate; the game's Start button enables (a first refactor broke this and the test caught it); curl: `/` 200 with all headers, `/js/` and `/nonexistent` 404 with the 404 page, `/.git/HEAD` 404, fonts served as `font/woff2` with the immutable header, no external requests on load; favicon.ico/apple-touch-icon and the 404 page render.

**By the verifiers (three lenses per finding, against HEAD and `git show b86e250:…`):** reproduction of each original defect, line-by-line confirmation of each fix, Node 22 timing of `process()`/`autoThresholds` (900 px 130–300 ms cold, 1400 px 400–450 ms), JPEG marker parse of all 23 screenshots, `git check-attr`/`git ls-files --eol` normalisation checks, `git archive HEAD^` served with python http.server to reproduce listings and README exposure.

**By this report:** `git status` clean at `bc71eaa`; `git tag` empty; the five CSP policy strings are byte-identical (SHA-1 prefix `541c1ba4` ×5); zero hits in served files for `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval(`, `new Function`, `srcdoc`, `DOMParser`, `new Worker`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `location.search`, `postMessage`, `window.open`, `target=`, `javascript:`, `toDataURL`, `setAttribute('style`, `cssText`, `document.cookie`, `sessionStorage`, `serviceWorker`; 20 `replaceChildren()`; the only `.src =` assignments are three `blob:` URLs (`app.js:197,459`, `painting.js:406`); `style="` and `<a` counts in `index.html` are 0; the only external URL in served files is `js/mixing.js:31`; all 38 asset references in `index.html`, all eight font URLs in `styles.css` and all four root-absolute assets in `404.html` resolve to files on disk; 23/23 help images `loading="lazy"`; `fonts/*.woff2` total 240,676 bytes; `img/help` total 2,050,429 bytes; `fonts/LICENSE-ibm-plex.txt` has 93 CR bytes on disk; `.git` 3.7 MB; 53 commits, single author; LICENSE, SECURITY.md, `.well-known`, manifest, sitemap, `.nojekyll` all absent; `b86e250:index.html` lines 7–9 load Google Fonts and have 0 hits for CSP/noscript/no-js/favicon/guard; `b86e250` has 24 `innerHTML` sites, 5 `style=` attributes, an unvalidated `load()` and a `readPalette` checking only `Number.isInteger(c.r)`.

## 7. Launch checklist

Tick after deploy, with `SITE` the https host:

- [ ] `bc71eaa` (or its descendant) is merged to the branch the host builds, tagged, and the publish directory is an export of runtime files only (`index.html 404.html favicon.ico favicon.svg apple-touch-icon.png robots.txt styles.css js/ img/ fonts/` + the host's config). `git status` clean before deploying.
- [ ] `curl -sI http://SITE/ | head -1` → 301 to https.
- [ ] `curl -sI https://SITE/ | grep -iE 'content-security|strict-transport|nosniff|referrer|permissions|opener|cache-control'` → all seven present; CSP contains `require-trusted-types-for 'script'` and **no** `frame-ancestors`/`X-Frame-Options` (unless you chose otherwise).
- [ ] `curl -sI https://SITE/.git/HEAD | head -1` → 404. Also `/.gitignore`, `/README.md`, `/deploy/nginx.conf`, `/_headers`, `/fonts/README.md` → 404 (GitHub Pages/CF Pages: README.md and deploy/ will be 200 unless you published an export).
- [ ] `curl -s https://SITE/js/ | grep -c 'Page not found'` → 1 (check `/img/`, `/img/help/`, `/fonts/` too). On Apache the status may read 403 with the 404 body; that is expected.
- [ ] `curl -sI https://SITE/nonexistent | head -1` → 404, and the body is the styled page (open it in a browser: styled, icon present, "Open Portrait Value Studio" stays on your site).
- [ ] `curl -sI https://SITE/fonts/ibm-plex-sans-latin.woff2 | grep -iE 'content-type|cache-control|access-control'` → `font/woff2`, `max-age=31536000, immutable`, `Access-Control-Allow-Origin: *`.
- [ ] `curl -sI https://SITE/fonts/LICENSE-ibm-plex.txt | head -1` → 200 (the OFL requires it to ship).
- [ ] In the browser, open every tab (Study, Studio, Paint by numbers, Value battle, Loomis, How to use) and every hash route; DevTools console shows **no** `Content Security Policy` or `TrustedHTML`/`TrustedScriptURL` lines and no errors.
- [ ] DevTools Network: only `SITE` is contacted; all three font families load (`document.fonts.status === 'loaded'`); no 404 for `/favicon.ico`.
- [ ] Load a photo (file picker, drag-drop, paste); drop a URL/text from another tab — the page must not navigate.
- [ ] Save PNG from the Study tab and the Studio: a download arrives top-level; inside a cross-origin `<iframe sandbox="allow-scripts allow-modals">` on another site the save dialog opens with a visible preview and the fonts render (not system fallback).
- [ ] Turn JavaScript off (or block `js/app.js`) and reload: the note and the illustrated guide show, no dead controls.
- [ ] How to use → "Forget my work on this device" twice: page reloads with default settings, empty palette, no restored painting, and `localStorage` has no `portrait-value-studio.` keys.
- [ ] Share a link in a chat client once to see the card (text-only until og:image exists); click the eight README source links once.
- [ ] Put `.well-known/security.txt`'s `Expires:` date in your calendar if you added one.

## 8. Follow-up after this report

Done in the commit that adds this file, closing leftovers the report lists above (line numbers in sections 2 and 3 refer to `bc71eaa` and may have shifted by a few lines):

- **F03 — Fixed.** `prepareAndRun()` in `js/app.js` now paints the "Updating…" indicator first and runs the preparation (decode, Lab conversion, auto split) two animation frames later for a photo the visitor loads or a Working-size change; a newer photo arriving in between wins. Start-up still prepares at once, so the sample study and the hash routes find the data ready. Checked in headless Chromium: the indicator is visible in the first frame after the file is handed over.
- **F09 trap — Fixed.** `js/app.js` also removes the `no-js` class, so a page where only `js/guard.js` failed to load shows its controls instead of the "has not started" note over a hidden interface.
- **F07 leftover — Fixed.** `.htaccess` answers a bare folder (`/js/`, `/img/`, `/fonts/`) with status 404, not 403, via a `RewriteCond %{REQUEST_FILENAME} -d` rule.
- **F08 minor — Fixed.** `_redirects` now also covers `.gitignore`, `.gitattributes` and `.editorconfig`; `_redirects` itself is in the Apache and nginx deny lists.
- **F33 nit — Fixed.** The IndexedDB helpers in `js/painting.js` reject on `onabort`, so a hung transaction cannot leave the autosave flag stuck for the visit.
- **F39 — Fixed.** The spectral.js MIT notice in `js/mixing.js` starts with `/*!`, which minifiers keep.
- **F19 leftover — Fixed.** `fonts/LICENSE-ibm-plex.txt` is LF on disk as well as in the index.
- **F23 caution — Fixed.** `.editorconfig` exempts `fonts/LICENSE-*.txt` and sets 4-space indentation for `deploy/nginx.conf`.
- **F17 residual, F10 and F01 wording — Fixed in README.** A note for embedders (`allow="clipboard-write"`, separate storage inside an embed), the 404 page's root-absolute paths described correctly, and "deploy from a clean, committed tree; `fonts/` and `js/guard.js` are runtime files".

Decided by the owner and done in the next commit (`367fbc0` and after):

- **F05 — Fixed.** `LICENSE` is the MIT License, copyright (c) 2026 Platteration; a notice at the top of `index.html` and a line in the README. The three configs serve `/LICENSE` as text.
- **F18 — Fixed.** `SECURITY.md` and `.well-known/security.txt` point reports at the repository's GitHub issues (`Expires` 2027-10-01; the README says when to renew it and how GitHub Pages serves a dot-folder).
- **F17 — Decided.** Embedding stays open to any site. The Help tab now tells an embedded visitor that settings and the saved painting are kept apart there, and the README tells embedders about `allow="clipboard-write"`.
- **F06 — Fixed.** `.gitattributes` marks `README.md`, `SECURITY.md`, `docs/`, `deploy/`, `fonts/README.md` and the editor and git dotfiles `export-ignore`, so `git archive HEAD` yields the runtime files plus the host configs; the README shows the command.
- **F20 — Partly fixed.** `manifest.json` (display `browser`, icons at 192 and 512 px rendered from the favicon), its link tag, `manifest-src 'self'` in every copy of the policy, and a 1200 × 630 share image at `img/og.jpg`. The canonical link, `og:url`, the absolute `og:image` address and `sitemap.xml` wait for the public address; the README lists the exact lines to add.

Still open, as decisions for the owner (section 4): F04 (huge-photo guard), F09 (per-module guards), F10 (sub-path deploy), F11 (hashed asset names), F12 (best-score keys), F13 (first-use autosave notice), F20 (the URL-dependent part), F22, F26, F28, F29, F42, F43.
