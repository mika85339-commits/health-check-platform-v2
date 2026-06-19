Health Check Lab deploy guide

1. Simple Netlify drag-and-drop upload

Use:
outputs/health-check-lab-drop-upload.zip

This ZIP contains only static files.
It should not trigger a Netlify build.
It is the safest option when the Netlify dashboard shows Building failed.

Note:
OpenAI API functions are not included in this ZIP.
The site will publish, but AI analysis will not run.

2. OpenAI API version

Use:
outputs/health-check-lab-openai-source.zip

This package contains:
- netlify/functions/analyze-body-check.js
- netlify/functions/analyze-health-content.js
- netlify.toml
- package.json

Deploy this version with GitHub connection or Netlify CLI.
Do not use drag-and-drop upload for this version.

Required Netlify environment variable:
OPENAI_API_KEY

3. Supabase

If community aggregation is needed, run:
supabase-community-insights.sql

in the Supabase SQL editor.
