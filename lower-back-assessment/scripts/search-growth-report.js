const fs = require("fs");
const path = require("path");
const { collectAvailableLiveReport } = require("./weekly-analytics-sources");
async function main() {
  const report = await collectAvailableLiveReport({ weekCount: 3 });
  const target = path.resolve(
    __dirname,
    "../reports/search-growth-report.json",
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  const growth = report.growth_opportunities;
  console.log(
    JSON.stringify(
      {
        generated_at: report.generated_at,
        sources: report.source_audit.sources,
        growth_opportunities: growth,
      },
      null,
      2,
    ),
  );
  if (
    !["real"].includes(report.source_audit.sources.ga4?.state) ||
    !["real"].includes(report.source_audit.sources.search_console?.state)
  )
    console.error(
      "::warning::Search growth data is incomplete; do not treat missing values as zero.",
    );
}
if (require.main === module)
  main().catch(() => {
    console.error("Search growth report failed; provider details suppressed.");
    process.exitCode = 1;
  });
module.exports = { main };
