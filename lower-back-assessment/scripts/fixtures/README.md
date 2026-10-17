# Public article fixtures for safe previews

`preview-public-articles.json.gz` (gzip-compressed JSON) is a fixed, unauthenticated public Sanity query snapshot, restricted to the 33 slugs present in the production site's public `/data/sanity-articles/index.json` at capture time. It contains published articles only. No token or private draft is used. Capture time and source are recorded inside the fixture. This is test content, not a live source or a CMS synchronization mechanism.

Only `netlify-safe-build.js`'s isolated preview path installs the snapshot, through the existing Sanity exporter/mapper/renderers. The network blocker remains enabled. HTML generation, including a legacy-format test page, completes **before** noindex/CSP/disabled analytics sealing. Production builds never read or copy the fixtures or browser test controls.

There are no published legacy source articles. `/health-library/preview-legacy-shoulder/` exercises the existing legacy renderer with the public shoulder article's title/excerpt. It is a format fixture, not an additional published article. It has no invented medical claims or references. All pages display the preview fixture notice; `_meta.json`, `site-config.json` and `/preview-fixture.json` identify fixture data explicitly.

On a safe preview, `?preview-json-delay=5000` enables a 5-second delay per same-origin JSON request. The setting persists in that preview origin's session storage across document navigation. `?preview-json-delay=0` disables it. This changes neither routes nor production analytics. DOM attributes on `<html>` report delay/pending counts and whether an article ever contained the home article heading. Test with the exact deployed preview, on desktop and mobile, while JSON is pending and after rendering settles.

Do not enable Sanity credentials or external build/runtime network access to refresh these fixtures. Refresh manually from public endpoints after review when needed. Never interpret preview counts as live analytics or publishing status.
