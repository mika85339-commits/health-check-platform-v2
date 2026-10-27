const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const review = require('./acquisition-review.cjs');
const { normalizeSanityArticle } = require('./sanity-article-mapper');
const { articleHtml } = require('./sanity-site-assets');
const data = review.data();
assert.equal(data.proposals.length, 3);
assert.equal(new Set(data.proposals.map(p=>p.id)).size, 3);
for (const proposal of data.proposals) {
  const before = data.baselines.find(p=>p._id===proposal.id);
  const preserved = JSON.stringify(before);
  const after = review.apply(before, proposal);
  assert.equal(JSON.stringify(before), preserved, 'Review must not mutate input.');
  assert.throws(()=>review.apply({...before,_rev:'changed'},proposal),/Re-review/);
  assert.throws(()=>review.apply(before,{...proposal,set:{'seo.noIndex':true}}),/Unreviewed/);
  for (const field of ['_id','_rev','slug','publishedAt','updatedAt','references','evidenceClaims','clinicalSummary','reviewer','diagnosisGuide','relatedPosts','faqs']) assert.deepEqual(after[field],before[field],field+' must remain unchanged.');
  for (const block of before.body.filter(b=>!/^h[234]$/.test(b.style))) assert.deepEqual(after.body.find(b=>b._key===block._key),block,'Clinical paragraphs must remain unchanged.');
  for (const block of before.body) assert(after.body.some(b=>b._key===block._key),'No original block may be removed.');
  const mapped = normalizeSanityArticle(after,{projectId:'69w0i1ba',dataset:'production'}).article;
  assert(mapped);
  const shell = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const html=articleHtml(mapped,shell,[mapped]);
  assert(html.includes(proposal.set.title));
  assert(html.includes(proposal.set['seo.description']));
  assert(html.includes('rel="canonical"'));
  const schemas = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>JSON.parse(m[1]));
  assert.equal(schemas.find(x=>x['@type']==='Article').headline, proposal.set.title);
  assert.equal(schemas.find(x=>x['@type']==='Article').datePublished, before.publishedAt);
  for (const link of proposal.links) assert(html.includes('href="'+link.href+'"'));
  assert(!/<script[^>]*>[^<]*location\.replace/.test(html));
  assert(mapped.references.length >= 3);
}
assert.throws(()=>review.previewPosts([],{CONTEXT:'production',HCL_SAFE_PREVIEW:'true'}),/preview only/);
assert.throws(()=>review.previewPosts([],{}),/preview only/);
const untouched={_id:'not-selected',title:'Untouched'};
assert.strictEqual(review.previewPosts([untouched],{HCL_SAFE_PREVIEW:'true'})[0],untouched);
assert(!fs.existsSync(path.join(__dirname,'../dist/content/acquisition-review')),'Editorial sources must not be published.');
console.log('Three-page editorial review checks passed: revisions, clinical text, references, URLs, CTA and production exclusion.');

// Publication payload must preserve raw source blocks, without read-model asset:null fields.
const sources = require('../content/acquisition-review/source-documents.json').documents;
const specs = require('../content/acquisition-review/proposed-patches.json').mutations;
for (const item of specs) {
 const proposal = data.proposals.find(p=>p.id===item.patch.id);
 const original = sources.find(p=>p._id===item.patch.id);
 assert.equal(item.patch.ifRevisionID, original._rev);
 assert.deepEqual(item.patch.set.body, review.apply(original,proposal).body);
 for (const block of original.body.filter(b=>!/^h[234]$/.test(b.style))) assert.deepEqual(item.patch.set.body.find(b=>b._key===block._key),block);
 assert(!JSON.stringify(item.patch.set.body).includes('"asset":null'));
 assert.deepEqual(Object.keys(item.patch.set).sort(),[...Object.keys(proposal.set),'body'].sort());
}
console.log('Raw Sanity publication payload matches reviewed revisions and preserves unmodified body attributes.');
