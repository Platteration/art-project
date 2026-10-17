# Tests

Playwright drives the real site in headless Chromium, served from a loopback server that sends the
same Content-Security-Policy and Permissions-Policy headers every host sends (`tests/serve.mjs`), so what
passes here is what a visitor gets. Chromium runs with a fake camera whose permission is granted
(`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`), for Trace onto paper. Nothing here is part of the published site: `git archive` leaves `tests/`,
`package.json` and `node_modules/` out, and the host configs refuse them.

```sh
npm install                      # once: Playwright and axe-core (Chromium: npx playwright install chromium)
npm run check                    # scripts/check-policy.mjs, then every case
node tests/run.mjs --only smoke  # one case
node tests/run.mjs --root /tmp/export   # the same cases against an export (git archive HEAD | tar -x -C /tmp/export)
node tests/serve.mjs             # serve the checkout for playtesting by hand, on a free loopback port
```

A case is a file in `tests/cases/` that exports `default async (t, site) => {}`. `t` collects checks
(`t.check(ok, title, detail)`), findings (`t.finding({ title, severity, steps, expected, actual })`:
a defect or an edge case the site does not handle, written so someone can reproduce it) and notes.
`site` is `{ base, browser, root }`. The helpers in `tests/lib.mjs` open pages that record every page
error, console error, policy violation and request off the site (`openPage`, then `clean(t, page, label)`
turns those into checks), open tabs the way a visitor does (`tab`), make and load photos (`makeImage`,
`loadPhoto`, `dropFiles`, `dropText`, `pasteFile`), draw (`stroke`, `inked`), seed hostile saved state
(`openPage(site, { storage })`), block scripts (`block`, `notFound`), embed the app in another origin's
sandboxed frame (`sandbox`), take screenshots into the git-ignored `tests/screens/` and run axe-core.

Every case must leave the page with no error and no violation at every step (`clean`), on a
1400 × 900 window and a 390 × 844 one where the layout differs, and must not depend on timing it
cannot wait for (use `waitForFunction`, not fixed sleeps, wherever a condition exists).
