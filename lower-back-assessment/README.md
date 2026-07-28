# Health Check Lab

## Build-time Sanity article export

Health Check Lab keeps the existing JSON health library in `content/truth-check` and can also export published Hariplus CMS articles from Sanity during the build.

The Sanity export is build-time only. The browser does not receive a Sanity token, and existing health-library pages are not switched to Sanity by this step.

### Environment variables

Set these in Netlify Environment variables when enabling the Sanity export in production:

```env
SANITY_PROJECT_ID=69w0i1ba
SANITY_DATASET=production
SANITY_API_VERSION=2026-07-15
SANITY_READ_TOKEN=only-if-the-dataset-requires-authenticated-read-access
```

Notes:

- `SANITY_READ_TOKEN` is optional for public datasets.
- Do not expose `SANITY_READ_TOKEN` to client-side JavaScript.
- Do not commit `.env` files or token values to Git.
- Use a read-only token if a token is required.
- The build writes Sanity article JSON to `dist/data/sanity-articles/`.
- Existing JSON articles under `content/truth-check` are not deleted or overwritten.

### Scripts

```bash
npm run sanity:test
npm run sanity:export
npm run build
```

`npm run build` runs the existing static build and then exports published Sanity `post` documents into a separate `dist/data/sanity-articles` directory.
