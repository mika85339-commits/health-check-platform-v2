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

Truth-check content management:
- Topic management file: content/truth-check/topics.json
- Topic status values: unused, used
- Article directory: content/truth-check/articles/
- Article index: content/truth-check/articles/index.json
- Article format: JSON
- Article page lookup: /health-library/[slug] loads content/truth-check/articles/[slug].json
- Missing slug behavior: the app shows an article-not-found message and a link back to /health-library

How to add an article:
1. Create content/truth-check/articles/[slug].json.
2. Add the slug to content/truth-check/articles/index.json.
3. If it is a future truth-check theme, add or update the topic in content/truth-check/topics.json.
4. Use topic status unused before writing the article, and used after the theme has been handled.
5. Keep article status as draft until it is ready to publish.

Netlify content loading:
- The build command is node scripts/netlify-build.js.
- The publish directory is dist.
- scripts/netlify-build.js copies content/ into dist/content.
- The browser reads article JSON from /content/truth-check/ at runtime.

Automation commands:
- npm run content:add -- --title="記事タイトル" --category="SNS健康情報"
- npm run content:generate-social -- --slug="topic-slug"
- npm run content:generate-social -- --slug="topic-slug" --template
- npm run content:validate
- npm run topics:validate
- npm run build
- npm run release

Automated checks and generated files:
- JSON syntax and required field validation
- duplicate slug and duplicate title checks
- draft / published status handling
- published-only production article index
- category list generation
- related article generation
- sitemap.xml generation
- robots.txt generation
- article HTML metadata generation for published articles
- Article structured data
- Breadcrumb structured data
- dist file presence checks in release

Truth-check topic status:
- 100 truth-check topics are registered.
- All topics start as unused.
- Change a topic to used after it has been handled as an article.
- unused topics are management data only and are not shown as published articles.

Article and social content generation:
- One truth-check topic can be expanded into a library article, reel title, 30-second reel script, Instagram caption, and YouTube Shorts description.
- The management script is scripts/content-generate-social.js.
- Monthly operation is designed around about 10 themes.
- Generated content starts as generationStatus draft and article status draft.
- Use OPENAI_API_KEY from the environment when AI generation is needed.
- Do not commit .env files or API keys.
- OPENAI_MODEL can be set when a different model is needed.
- Generated medical content must be reviewed by a human before publishing.
- References must not be fabricated. If evidence is weak or unconfirmed, the article should say so.

Anonymous muscle diagnosis analytics:
- BodyCheck records anonymous usage events for the full-body muscle self-check, from neck to ankle.
- Events: diagnosis_started, step_viewed, option_selected, diagnosis_completed, ai_explanation_clicked, diagnosis_abandoned.
- The client sends events to netlify/functions/track-diagnosis-event.js.
- The default persistent storage is Supabase table muscle_diagnosis_events.
- SQL setup file: supabase-muscle-diagnosis-analytics.sql.
- diagnosisVersion is stored as bodycheck-v2.1 so future logic changes can be compared.
- Stored analytics fields are limited to anonymousSessionId, diagnosisRunId, eventName, timestamp, currentStep, selectedRegion, selectedDetails, movements, timing, painType, results, topMuscle, usedAiExplanation, and diagnosisVersion.
- The site does not store names, email addresses, phone numbers, addresses, SNS accounts, or free-text personal information for this analytics flow.
- If analytics storage fails, the diagnosis flow continues normally.
- Local development check: open DevTools Network and filter track-diagnosis-event, or run Netlify dev and check function logs.
- Production setup requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.
- Optional table override: MUSCLE_DIAGNOSIS_EVENTS_TABLE.
- If these environment variables are missing, events are accepted by the function but only logged on the server.
- The analytics flow does not use a third-party tracking service or ad cookie, but it does keep an anonymous session ID in localStorage. Add this to the public privacy notice before wide release.

Medical content rule:
- New articles are generated as draft.
- Placeholder text and empty references produce warnings before publication.
- Medical wording, evidence quality, and references must be reviewed by a human before setting status to published.

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
