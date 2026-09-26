import { generateCompletedWeekSnapshot, listSnapshots } from "../netlify/lib/weekly-analytics-store.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const write = args.has("--write");
const verify = args.has("--verify-idempotency");

if (!dryRun && !write && !verify) {
  throw new Error("Use --dry-run, --write, or --verify-idempotency.");
}

const first = await generateCompletedWeekSnapshot({ dryRun });
if (verify) {
  if (!first.stored) throw new Error("Idempotency verification requires a stored snapshot.");
  await generateCompletedWeekSnapshot();
  const rows = await listSnapshots({ weekStart: first.snapshot.week_start, limit: 8 });
  if (rows.length !== 1) throw new Error(`Expected one snapshot row, found ${rows.length}.`);
}

console.log(JSON.stringify({
  ok: true,
  mode: dryRun ? "dry-run" : verify ? "write-and-idempotency-check" : "write",
  stored: first.stored,
  week_start: first.snapshot.week_start,
  week_end: first.snapshot.week_end,
  data_state: first.snapshot.data_state,
  schema_version: first.snapshot.schema_version
}, null, 2));
