const fs = require('node:fs');
const path = require('node:path');
// Offline proposals only: no CMS client, token, mutation or publication.
function data() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../content/acquisition-review/three-pages.json'), 'utf8'));
}
function setAt(object, field, value) {
  const keys = field.split('.');
  let target = object;
  for (const key of keys.slice(0, -1)) target = target[key] ||= {};
  target[keys.at(-1)] = structuredClone(value);
}
function apply(post, proposal) {
  if (post._id !== proposal.id || post._rev !== proposal.ifRevisionID) throw new Error('Review baseline changed. Re-review required.');
  const result = structuredClone(post);
  for (const [field, value] of Object.entries(proposal.set)) {
    if (!/^(title|excerpt|summary|seo\.(title|description|ogTitle|ogDescription)|articleGuide\.(readerQuestion|answer))$/.test(field)) throw new Error('Unreviewed field.');
    setAt(result, field, value);
  }
  for (const [key, text] of Object.entries(proposal.headings || {})) {
    const block = result.body.find(b => b._key === key);
    if (!block || !/^h[234]$/.test(block.style)) throw new Error('Heading baseline changed.');
    block.children = [{ _type:'span', _key:key+'-text', text, marks:[] }];
  }
  if (proposal.moveSectionFirst) {
    const start = result.body.findIndex(b => b._key === proposal.moveSectionFirst);
    if (start < 0) throw new Error('Missing reviewed section.');
    let end = start + 1;
    while (end < result.body.length && result.body[end].style !== 'h2') end++;
    result.body.unshift(...result.body.splice(start, end-start));
  }
  const anchor = result.body.findIndex(b => b._key === proposal.linksAfter);
  if (anchor < 0) throw new Error('Missing safe navigation insertion point.');
  result.body.splice(anchor+1, 0,
    {_type:'block', _key:'acquisition-reading-heading', style:'h2', markDefs:[], children:[{_type:'span',_key:'reading-title',marks:[],text:'関連する記事・セルフチェック'}]},
    ...proposal.links.map((link, i)=>({_type:'block',_key:'acquisition-link-'+i,style:'normal',
      markDefs:[{_type:'link',_key:'link-'+i,href:link.href}],
      children:[{_type:'span',_key:'text-'+i,text:link.label,marks:['link-'+i]}]})));
  return result;
}
function previewPosts(posts, env) {
  if (env.HCL_SAFE_PREVIEW !== 'true' || env.CONTEXT === 'production') throw new Error('Editorial review is preview only.');
  const review = data();
  return posts.map(post => {
    const proposal = review.proposals.find(p => p.id === post._id);
    if (!proposal) return post;
    return apply(review.baselines.find(p => p._id === post._id), proposal);
  });
}
module.exports = { data, apply, previewPosts };
