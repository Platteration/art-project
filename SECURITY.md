# Security

Portrait Value Studio is a static, client-only web app: no server code, no accounts, no network requests after the page's own files load. Photos, paintings and scores stay in the visitor's browser.

## Reporting a problem

Please open an issue at <https://github.com/Platteration/art-project/issues>. If the problem exposes other people's data or lets a page run code it should not, say so in the title so it is looked at first. There is no bug bounty; fixes land in this repository and reach the site at its next deployment.

## In scope

- Anything that lets a photo, painting or score leave the visitor's device.
- A way to run script or load a resource the Content Security Policy should forbid.
- A saved value in browser storage that breaks the page for the next visit.
- Hosting settings in `_headers`, `.htaccess` or `deploy/nginx.conf` that are wrong or incomplete.

## Out of scope

- Clickjacking of the app's own controls: the app is meant to be embedded, and the two destructive actions need two taps.
- Issues in the third-party fonts or the spectral.js data beyond how this site serves them.

`/.well-known/security.txt` carries the same contact. Its `Expires` date is reviewed yearly.
