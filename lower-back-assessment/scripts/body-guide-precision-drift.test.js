const assert = require("assert");
const { precisionGuideData, readGuides } = require("./body-guide-assets");

const guides = readGuides();
assert.strictEqual(guides.length, 5);
assert.strictEqual(new Set(guides.map((guide) => guide.hero)).size, guides.length, "Guide H1s must be distinct.");
assert.strictEqual(new Set(guides.map((guide) => guide.title)).size, guides.length, "Guide titles must be distinct.");
assert.strictEqual(new Set(guides.map((guide) => guide.description)).size, guides.length, "Guide descriptions must be distinct.");
["lead", "locationIntro", "movementIntro", "evidenceIntro"].forEach((field) => {
  assert.strictEqual(new Set(guides.map((guide) => guide[field])).size, guides.length, `${field} must be part-specific.`);
});
assert.strictEqual(new Set(guides.flatMap((guide) => guide.faqs.map(({ question }) => question))).size, 15, "FAQ questions must be part-specific.");

let checkedExamples = 0;
guides.forEach((guide) => {
  const precision = precisionGuideData(guide);
  const locationIds = precision.locations.map(([id]) => id);
  const movementIds = precision.movements.map(([id]) => id);
  const candidateIds = precision.muscles.map(({ id }) => id);
  assert.deepStrictEqual(guide.locationIds, locationIds, `${guide.slug}: location options differ from precision runtime.`);
  assert.deepStrictEqual(guide.movementIds, movementIds, `${guide.slug}: movement options differ from precision runtime.`);
  assert(guide.examples.length >= 2 && guide.examples.length <= 4, `${guide.slug}: expected 2-4 verified examples.`);
  assert.strictEqual(guide.faqs.length, 3, `${guide.slug}: expected three visible FAQs.`);

  guide.examples.forEach((example) => {
    assert(locationIds.includes(example.locationId), `${guide.slug}: unknown example location.`);
    assert(movementIds.includes(example.movementId), `${guide.slug}: unknown example movement.`);
    example.candidateIds.forEach((id) => assert(candidateIds.includes(id), `${guide.slug}: unknown candidate ${id}.`));
    const result = precision.rank({
      painLocation: example.locationId,
      location: example.locationId,
      side: example.side,
      situations: [example.movementId],
      movements: [example.movementId]
    });
    assert.strictEqual(result.status, example.status, `${guide.slug}: example status drift.`);
    const visible = new Set((result.candidates || []).map((candidate) => candidate.muscleId));
    example.candidateIds.forEach((id) => assert(visible.has(id), `${guide.slug}: ${id} is not displayed by precision runtime.`));
    checkedExamples += 1;
  });
});

console.log(`Body guide precision drift tests passed: ${guides.length} guides, ${checkedExamples} runtime examples.`);
