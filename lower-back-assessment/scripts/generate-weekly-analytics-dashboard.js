const fs = require("fs");
const path = require("path");
const { buildWeeklyReport, loadFixture } = require("./weekly-analytics");
const { collectAvailableLiveReport } = require("./weekly-analytics-sources");

const root = path.resolve(__dirname, "..");
const fixturePath = path.join(__dirname, "fixtures", "weekly-analytics.json");
const outputPath = path.join(root, "admin", "weekly-analytics", "data", "weekly-analytics.json");

function generateDashboardFixture() {
  const report = buildWeeklyReport(loadFixture(fixturePath));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { outputPath, report };
}

async function generateDashboardLive(options = {}) {
  const report = await collectAvailableLiveReport(options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { outputPath, report };
}

if (require.main === module) {
  const live = process.argv.includes("--live");
  const asOfIndex = process.argv.indexOf("--as-of");
  const asOf = asOfIndex >= 0 ? process.argv[asOfIndex + 1] : undefined;
  Promise.resolve(live ? generateDashboardLive({ asOf }) : generateDashboardFixture())
    .then((result) => {
      const label = live ? "source-aware live report" : "fixture";
      console.log(`Local weekly analytics dashboard ${label} written to ${result.outputPath}`);
    })
    .catch((error) => {
      console.error(`Weekly analytics dashboard generation failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { generateDashboardFixture, generateDashboardLive, outputPath };
