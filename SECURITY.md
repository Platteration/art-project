# Security status

The October 2026 repository and local-environment review found no confirmed critical or high-severity vulnerability, credential leak, or applicable active dependency advisory.

The current code hardens browser-only state and image handling:

- Three.js r128 is protected with a SHA-384 integrity attribute.
- Image imports are size-bounded, verified readable before replacing a current study, and cannot let an older decode replace a newer selection.
- Comparison waits for a study result from the current reference.
- Browser-stored preferences, mixes, canvas settings, artwork records, PNG layers, and dimensions are validated before use.
- Failed artwork restoration preserves the original record and pauses autosave with Save PNG recovery guidance.
- Autosave snapshots image layers and their metadata together, and a failed write stays visible until a later save succeeds.

Validation run after rebasing these changes onto `master`:

- 50 malformed preference, artwork, and image-import regression cases passed.
- Study, Studio, Paint by numbers, and Value battle browser workflows passed with no page errors.
- The local restricted server passed public-asset, header, path, Host, and write-method checks.
- JavaScript syntax and Git whitespace checks passed.

The scope did not include a deployed site or production hosting. Chromium in this environment still rejects the platform proxy certificate for the external Three.js and font requests, so the CDN-dependent 3D workflow is not marked as browser-verified. No certificate trust change or TLS bypass was used.
