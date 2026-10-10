# Fonts

The site's three typefaces, served from this folder so that no visitor data goes to a font CDN and the page renders without a third-party connection.

| Family | Files | License |
| --- | --- | --- |
| Bricolage Grotesque (variable, weights 500–700, optical size) | `bricolage-grotesque-latin.woff2`, `bricolage-grotesque-latin-ext.woff2` | SIL Open Font License 1.1, `LICENSE-bricolage-grotesque.txt` |
| IBM Plex Sans (variable, weights 400–600) | `ibm-plex-sans-latin.woff2`, `ibm-plex-sans-latin-ext.woff2` | SIL Open Font License 1.1, `LICENSE-ibm-plex.txt` |
| IBM Plex Mono (400, 500, 600 and 700) | `ibm-plex-mono-latin-{400,500,600,700}.woff2`, `ibm-plex-mono-latin-ext-{400,500,600,700}.woff2` | SIL Open Font License 1.1, `LICENSE-ibm-plex.txt` |

The files are the latin and latin-ext subsets as built by Google Fonts (Bricolage Grotesque v9, IBM Plex Sans v23, IBM Plex Mono v20). The `@font-face` rules that load them are at the top of `../styles.css`. Font files never change in place: to update one, add the new file under a new name and point the rule at it, so long cache lifetimes stay safe.
