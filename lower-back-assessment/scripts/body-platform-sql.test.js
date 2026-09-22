const assert = require("assert");
const fs = require("fs");
const path = require("path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase-body-platform.sql"), "utf8");
const requiredColumns = [
  "diagnosis_id", "anonymous_session_id", "anonymous_device_id", "diagnosis_version",
  "diagnosis_date", "body_part", "joint_name", "left_right", "symptom_score",
  "symptom_duration", "symptom_timing", "movements", "candidate_muscles",
  "age_band", "sex", "region", "life_impact", "referral_source", "repeat_visit"
];

requiredColumns.forEach((column) => assert.match(sql, new RegExp("\\b" + column + "\\b"), "missing " + column));
assert.match(sql, /diagnosis_id text primary key/i);
assert.match(sql, /enable row level security/i);
assert.match(sql, /revoke all on public\.anonymous_diagnosis_records from public, anon, authenticated/i);
assert.match(sql, /anonymous_diagnosis_daily_rollups/i);
assert.match(sql, /after insert or update or delete/i);
assert.match(sql, /greatest\(coalesce\(p_min_cell_size, 10\), 10\)/i);
assert.match(sql, /grant execute on function public\.health_check_lab_insights[^;]+to service_role/is);
assert.doesNotMatch(sql, /grant\s+(insert|update|delete|select|all)[^;]+\s+to\s+(anon|authenticated)/i);
console.log("Anonymous diagnosis SQL contract checks passed.");
