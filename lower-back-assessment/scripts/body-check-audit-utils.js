"use strict";

function combinations(values, minSize = 1, maxSize = values.length) {
  const output = [];
  const visit = (start, picked) => {
    if (picked.length >= minSize && picked.length <= maxSize) output.push([...picked]);
    if (picked.length === maxSize) return;
    for (let index = start; index < values.length; index += 1) {
      picked.push(values[index]);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return output;
}

function pairwise(values) {
  const output = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      output.push([values[left], values[right]]);
    }
  }
  return output;
}

function percent(value, total, digits = 4) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(digits));
}

function sortedSignature(values) {
  return [...new Set(values || [])].sort((a, b) => String(a).localeCompare(String(b), "ja")).join("|");
}

function orderedSignature(values) {
  return (values || []).join("|");
}

function compareCompact(left, right) {
  return {
    top1: left.top1 !== right.top1,
    top3: left.top3 !== right.top3,
    candidateSet: left.candidateSet !== right.candidateSet,
    candidateCount: left.candidateCount !== right.candidateCount
  };
}

function emptyComparisonCounts() {
  return { comparisons: 0, top1: 0, top3: 0, candidateSet: 0, candidateCount: 0 };
}

function addComparison(counts, left, right) {
  const changed = compareCompact(left, right);
  counts.comparisons += 1;
  Object.entries(changed).forEach(([key, value]) => {
    if (value) counts[key] += 1;
  });
  return counts;
}

function comparisonRates(counts) {
  return {
    comparisons: counts.comparisons,
    top1ChangeRate: percent(counts.top1, counts.comparisons),
    top3ChangeRate: percent(counts.top3, counts.comparisons),
    candidateSetChangeRate: percent(counts.candidateSet, counts.comparisons),
    candidateCountChangeRate: percent(counts.candidateCount, counts.comparisons)
  };
}

function incrementMap(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function mapEntriesByCount(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || String(left.key).localeCompare(String(right.key), "ja"));
}

function markdownTable(headers, rows) {
  const clean = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  return [
    `| ${headers.map(clean).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(clean).join(" | ")} |`)
  ].join("\n");
}

module.exports = {
  addComparison,
  combinations,
  comparisonRates,
  emptyComparisonCounts,
  incrementMap,
  mapEntriesByCount,
  markdownTable,
  orderedSignature,
  pairwise,
  percent,
  sortedSignature
};
