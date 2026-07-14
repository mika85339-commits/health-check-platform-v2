Health Check Lab deploy guide

2026-07-14 update:
The site structure now uses three main pillars.

- Body self-check: /body-check
- Health information search: /health-check
- Health information library: /health-library

The top page shows three cards for these features.
Existing body check, health content check, community, about, and FAQ features remain available.

Health information library structure:
- List page: /health-library
- Article page pattern: /health-library/[slug]
- List features: search, category filter, article cards, judgement labels
- Categories: stretch, posture/pelvis, fascia/trigger point, exercise, pain/nerve, acupuncture/treatment, SNS health information
- Judgement labels: correct, partially correct, weak evidence
- Article template sections:
  1. Judgement
  2. Conclusion
  3. Common SNS claims
  4. Why it is said
  5. Current research
  6. Common misunderstandings
  7. How to think about it
  8. Acupuncturist view
  9. FAQ
  10. Summary
  11. References
- Author / supervisor block: Hariplus Acupuncture Clinic, Acupuncturist

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
