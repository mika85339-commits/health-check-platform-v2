const fs = require("fs");
const path = require("path");
const { auditEnvironment, buildWeeklyReport, loadFixture } = require("./weekly-analytics");
const { collectAvailableLiveReport, collectLiveReport, configFromEnvironment } = require("./weekly-analytics-sources");

const DEFAULT_FIXTURE = path.join(__dirname, "fixtures", "weekly-analytics.json");

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const candidate = args[index + 1];
  return candidate && !candidate.startsWith("--") ? candidate : null;
}

function summary(report) {
  const latest = report.weeks.at(-1);
  return {
    schema_version: report.schema_version,
    mode: report.source_audit?.mode || "unknown",
    report_timezone: report.report_timezone,
    week_count: report.weeks.length,
    first_week: report.weeks[0]?.week,
    latest_week: latest?.week,
    latest_metrics: latest ? {
      users: latest.ga4.users,
      sessions: latest.ga4.sessions,
      views: latest.ga4.views,
      organic_search_sessions: latest.ga4.organic_search_sessions,
      search_console_impressions: latest.search_console.impressions,
      search_console_clicks: latest.search_console.clicks,
      diagnosis_start_events: latest.diagnosis.start_events,
      diagnosis_start_unique: latest.diagnosis.start_unique_sessions,
      diagnosis_start_unique_users: latest.diagnosis.start_unique_users,
      diagnosis_complete_events: latest.diagnosis.complete_events,
      diagnosis_complete_unique: latest.diagnosis.complete_unique_sessions,
      diagnosis_complete_unique_users: latest.diagnosis.complete_unique_users,
      diagnosis_event_completion_rate: latest.diagnosis.event_completion_rate,
      diagnosis_unique_completion_rate: latest.diagnosis.unique_completion_rate,
      sponsor_impressions: latest.sponsor.impressions,
      sponsor_clicks: latest.sponsor.clicks,
      sponsor_ctr: latest.sponsor.ctr,
      excluded_admin_tests: latest.sponsor.excluded_admin_tests
    } : null,
    article_count: latest?.articles?.length || 0
  };
}

function configurationAudit(env = process.env) {
  const audit = auditEnvironment(env);
  const config = configFromEnvironment(env);
  return {
    mode: "configuration_audit",
    ready_for_live_read: audit.ready,
    present: audit.fields,
    missing: audit.missing,
    non_secret_configuration: {
      ga4_property_id: config.ga4PropertyId || null,
      ga4_host_name: config.ga4HostName || null,
      gsc_site_url: config.gscSiteUrl || null,
      site_origin: config.siteOrigin,
      diagnosis_events_table: config.diagnosisEventsTable,
      anonymous_records_table: config.anonymousRecordsTable,
      google_credentials_source: env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64
        ? "base64_environment_variable"
        : env.GOOGLE_APPLICATION_CREDENTIALS
          ? "credentials_file"
          : null
    }
  };
}

async function main(args = process.argv.slice(2)) {
  if (args.includes("--audit-config")) {
    console.log(JSON.stringify(configurationAudit(), null, 2));
    return;
  }

  const live = args.includes("--live");
  const availableLive = args.includes("--live-available");
  const fixturePath = argumentValue(args, "--fixture") || DEFAULT_FIXTURE;
  const asOf = argumentValue(args, "--as-of");
  const report = live
    ? await collectLiveReport({ asOf: asOf || undefined })
    : availableLive
      ? await collectAvailableLiveReport({ asOf: asOf || undefined })
      : buildWeeklyReport(loadFixture(fixturePath));

  const output = args.includes("--summary") ? summary(report) : report;
  const outputPath = argumentValue(args, "--out");
  if (outputPath) {
    const absolute = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    console.log(`Weekly analytics output written to ${absolute}`);
    return;
  }
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Weekly analytics failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { configurationAudit, main, summary };
